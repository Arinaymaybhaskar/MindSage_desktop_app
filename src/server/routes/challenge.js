import express from "express";
import pool from "../db.js";
import authenticateToken from "../middleware/authenticate.js";
import { checkCronAuth } from "../middleware/checkCronAuth.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { generateUploadUrl, s3 } from "../utils/s3.js";

const router = express.Router();

// GET /daily-challenge/today → get today's challenge
router.get("/today", authenticateToken, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM daily_challenges WHERE challenge_date = CURRENT_DATE"
  );
  if (rows.length === 0) return res.status(404).json({ error: "No challenge today" });
  res.json(rows[0]);
});

// POST /daily-challenge/accept → user accepts challenge
router.post("/accept", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const { rows } = await pool.query(
    "SELECT id FROM daily_challenges WHERE challenge_date = CURRENT_DATE"
  );
  if (rows.length === 0) return res.status(404).json({ error: "No challenge today" });

  const challengeId = rows[0].id;

  try {
    await pool.query(
      `INSERT INTO user_challenges (user_id, challenge_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [userId, challengeId]
    );
    res.json({ message: "Challenge accepted" });
  } catch (err) {
    res.status(500).json({ error: "Could not accept challenge" });
  }
});

// GET /daily-challenge/status → get user’s challenge status
router.get("/status", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  
  const { rows } = await pool.query(
    `SELECT dc.*, uc.accepted_at, uc.completed_at, uc.image_key
     FROM daily_challenges dc
     LEFT JOIN user_challenges uc
        ON dc.id = uc.challenge_id AND uc.user_id = $1
      WHERE dc.challenge_date = CURRENT_DATE`,
    [userId]
  );
  if (rows.length === 0) return res.status(404).json({ error: "No challenge today" });
  res.json(rows[0]);
}
);

// PUT /daily-challenge/complete/:id → upload image and mark completed
router.put("/complete", authenticateToken, async (req, res) => {
  const { image_key, challenge_id } = req.body;
  const userId = req.user.id;

  try {
    await pool.query(
      `UPDATE user_challenges
       SET completed_at = NOW(), image_key = $1
       WHERE user_id = $2 AND challenge_id = $3`,
      [image_key, userId, challenge_id]
    );
    res.json({ message: "Challenge completed" });
  } catch (err) {
    res.status(500).json({ error: "Failed to mark as completed" });
  }
});


// GET /daily-challenge/user → get user’s challenge history
router.get("/user", authenticateToken, async (req, res) => {
  const userId = req.user.id;
  const { rows } = await pool.query(`
    SELECT dc.*, uc.accepted_at, uc.completed_at, uc.image_key
    FROM daily_challenges dc
    LEFT JOIN user_challenges uc
      ON dc.id = uc.challenge_id AND uc.user_id = $1
    ORDER BY dc.date DESC
  `, [userId]);

  res.json(rows);
});

router.post("/create", checkCronAuth, async (req, res) => {
  const { title, description, date } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title is required" });
  }

  const challengeDate = date || new Date().toISOString().slice(0, 10); // Format: YYYY-MM-DD

  try {
    const result = await pool.query(
      `INSERT INTO daily_challenges (title, description, challenge_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (challenge_date) DO NOTHING
       RETURNING *`,
      [title, description || "", challengeDate]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({ message: "Challenge already exists for this date" });
    }

    res.status(201).json({
      message: "Challenge created successfully",
      challenge: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating challenge:", err.message);
    res.status(500).json({ error: "Failed to create challenge" });
  }
});

router.get("/upload", authenticateToken, async (req, res) => {
  const fileType = req.query.type;
  const challengeId = req.query.challengeId;
  console.log(challengeId)
  console.log(`[API] 🔐 User ID: ${req.user.id}`);
  console.log(`[API] 📁 Requested file type: ${fileType}`);

  if (!fileType) return res.status(400).json({ error: "Missing file type" });

  try {
    const result = await generateUploadUrl(req.user.id, challengeId, fileType, "challenge");
    console.log(`[API] ✅ Returning signed URL`);
    console.log(result, 'result')
    res.json(result);
  } catch (err) {
    console.error(`[API] ❌ Error generating signed URL`, err);
    res.status(500).json({ error: "Failed to generate upload URL" });
  }
});

router.get("/image-url", authenticateToken, async (req, res) => {
  const { key } = req.query;

  if (!key) return res.status(400).json({ error: "Missing image key" });

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 60 });
    res.json({ url });
  } catch (err) {
    console.error(`[API] ❌ Error generating signed URL`, err);
    res.status(500).json({ error: "Failed to generate image URL" });
  }
});

export default router;

