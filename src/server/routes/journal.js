import express from "express";
import pool from "../db.js";
import authenticateToken from "../middleware/authenticate.js";
import Sentiment from "sentiment";
import { generateUploadUrl, s3 } from "../utils/s3.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import axios from "axios";
import { handleQuery } from "../service/agentService.js";

const router = express.Router();
const sentiment = new Sentiment();
const AI_CORE_URL = process.env.AI_CORE_URL || "http://localhost:3000/api";
// to analyse the sentiment of the text
const analyzeSentiment = (text) => {
  const result = sentiment.analyze(text);
  const score = Math.max(-1, Math.min(1, result.score / 10));
  return score;
};

// --- NEW: AI Chat Endpoint ---
// This route forwards a user's query to the AI Core service's RAG pipeline.
router.post("/chat", authenticateToken, async (req, res) => {
  const { query } = req.body;
  const userId = req.user.id; // Get user ID from authentication middleware

  if (!query) {
    return res.status(400).json({ error: "Missing required field: query" });
  }

  try {
    const answer = await handleQuery(query, userId);
    res.status(200).json({ answer }); // The agent returns the final answer directly
  } catch (err) {
    console.error("[Chat Route] Error during agent execution:", err);
    res.status(500).send("An error occurred while processing your request.");
  }
});

// to post a journal
// MODIFIED: Now calls the AI Core service to create an embedding.
router.post("/", authenticateToken, async (req, res) => {
  const { title, content, mood_score, mood_tags, provider, created_at } =
    req.body;
  try {
    // Step 1: Analyze sentiment
    const sentiment_score = analyzeSentiment(content);

    // Step 2: Save the entry to your main PostgreSQL database
    const result = await pool.query(
      `INSERT INTO journal_entries 
       (user_id, title, content, mood_score, sentiment_score, mood_tags, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, NOW()))
       RETURNING id, created_at`,
      [
        req.user.id,
        title,
        content,
        mood_score,
        sentiment_score,
        mood_tags,
        created_at,
      ],
    );

    const journalId = result.rows[0].id;

    // Step 3: Asynchronously call the AI Core to create and store the vector embedding
    // We don't wait for this to finish to keep the API response fast.
    axios
      .post(`${AI_CORE_URL}/upsert`, {
        document: content,
        metadata: {
          user_id: req.user.id,
          journal_id: journalId, // Use the primary DB ID for linking
          date: result.rows[0].created_at.toISOString().split("T")[0],
          mood_score,
          mood_tags,
          full_title: title,
        },
        provider,
      })
      .catch((err) => {
        // Log the error, but don't fail the main request.
        // In production, you'd add this to a retry queue.
        console.error(
          `[AI Core] Failed to upsert journal_id ${journalId}:`,
          err.response ? err.response.data : err.message,
        );
      });

    res.status(201).json({ journalId, userId: req.user.id });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error saving journal entry");
  }
});

// fetch last 3 journals
router.get("/recent", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3",
      [req.user.id],
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching recent entries");
  }
});

// to upload an image
router.get("/upload", authenticateToken, async (req, res) => {
  const fileType = req.query.type;
  const postId = req.query.postId;

  if (!fileType) return res.status(400).json({ error: "Missing file type" });

  try {
    const result = await generateUploadUrl(
      req.user.id,
      postId,
      fileType,
      posts,
    );
    res.json(result);
  } catch (err) {
    console.error(`[API] ❌ Error generating signed URL`, err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

// get imagekey from the database and the signedurl
router.get("/media/:key", authenticateToken, async (req, res) => {
  const key = decodeURIComponent(req.params.key);
  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 60 }); // 60 seconds
    res.json({ url: signedUrl });
  } catch (err) {
    console.error("❌ Failed to get signed URL", err);
    res.status(500).json({ error: "Could not generate image URL" });
  }
});

// to get all journals
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM journal_entries WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id],
    );
    res.json(
      result.rows.map((row) => {
        return {
          ...row,
          mood_tags: JSON.stringify(row.mood_tags),
        };
      }),
    );
  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching entries");
  }
});

// to get a single journal
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM journal_entries WHERE id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    if (result.rows.length === 0)
      return res.status(404).json({ error: "Not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// GET /journal?range=7 or 30
router.get("/mood_score/:id", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const rangeStr = req.params.id;
  const range = Number.isInteger(+rangeStr) ? parseInt(rangeStr) : 7;

  try {
    const result = await pool.query(
      `SELECT mood_score, created_at
       FROM journal_entries
       WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '${range} days'
       ORDER BY created_at ASC`,
      [userId],
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching journal data:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// to update a journal
// MODIFIED: Now calls the AI Core service to update the embedding.
router.put("/:id", authenticateToken, async (req, res) => {
  const journalId = req.params.id;
  const { title, content, mood_score, mood_tags, provider, created_at } =
    req.body;

  try {
    // Step 1: Analyze new sentiment
    const sentiment_score = analyzeSentiment(content);

    // Step 2: Update the entry in your main PostgreSQL database
    const result = await pool.query(
      `UPDATE journal_entries SET 
         title = $1, content = $2, mood_score = $3, sentiment_score = $4, mood_tags = $5, created_at = COALESCE($8, created_at)
       WHERE id = $6 AND user_id = $7 RETURNING *`,
      [
        title,
        content,
        mood_score,
        sentiment_score,
        mood_tags,
        journalId,
        req.user.id,
        created_at,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    // Step 3: Asynchronously call the AI Core to update the vector embedding
    // NOTE: This assumes your AI Core's /edit endpoint can find the entry by journal_id.
    axios
      .put(`${AI_CORE_URL}/edit/${journalId}`, {
        document: content,
        metadata: {
          user_id: req.user.id,
          journal_id: journalId,
          date: result.rows[0].created_at.toISOString().split("T")[0],
          mood_score,
          mood_tags,
          full_title: title,
        },
        provider,
      })
      .catch((err) => {
        console.error(
          `[AI Core] Failed to update journal_id ${journalId}:`,
          err.response ? err.response.data : err.message,
        );
      });

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err });
  }
});

// to delete a journal
// MODIFIED: Now calls the AI Core service to delete the embedding.
router.delete("/:id", authenticateToken, async (req, res) => {
  const journalId = req.params.id;
  try {
    // Step 1: Delete from your main PostgreSQL database

    const result = await pool.query(
      "DELETE FROM journal_analysis WHERE journal_id = $1 RETURNING *",
      [journalId],
    );

    const result2 = await pool.query(
      "DELETE FROM journal_entries WHERE id = $1 AND user_id = $2 RETURNING *",
      [journalId, req.user.id],
    );

    if (result2.rows.length === 0) {
      return res.status(404).json({ error: "Journal entry not found" });
    }

    // Step 2: Asynchronously call the AI Core to delete the vector embedding
    // NOTE: This assumes your AI Core's /delete endpoint can find the entry by journal_id.
    axios.delete(`${AI_CORE_URL}/delete/${journalId}`).catch((err) => {
      console.error(
        `[AI Core] Failed to delete journal_id ${journalId}:`,
        err.response ? err.response.data : err.message,
      );
    });

    res.sendStatus(204);
  } catch (err) {
    console.log(err, "Error");
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
