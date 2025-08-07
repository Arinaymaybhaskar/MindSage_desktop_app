import express from "express";
import authenticateToken from "../../middleware/authenticate.js";
import pool from "../../db.js"; // Adjust path if needed

const router = express.Router();
// GET /insights/types - Get all types of insights for a user
router.get("/types", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT DISTINCT pattern_type FROM ai_insights WHERE user_id = $1`,
      [userId]
    );

    const types = result.rows.map((row) => row.pattern_type);

    res.status(200).json({ types });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /insights - Get all insights for the authenticated user
router.get("/", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const result = await pool.query(
            "SELECT * FROM ai_insights WHERE user_id = $1 ORDER BY detected_at DESC",
            [userId]
        );
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /insights/:id - Get a single insight by its ID
router.get("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            "SELECT * FROM ai_insights WHERE id = $1 AND user_id = $2",
            [id, req.user.id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insight not found" });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /insights - Create a new insight
router.post("/", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            pattern_type,
            pattern_description,
            recurring_day,
            source_journal_ids
        } = req.body;

        const result = await pool.query(
            `INSERT INTO ai_insights 
            (user_id, pattern_type, pattern_description, recurring_day, source_journal_ids)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *`,
            [userId, pattern_type, pattern_description, recurring_day, source_journal_ids]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /insights/:id - Update an existing insight
router.put("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const {
            pattern_type,
            pattern_description,
            recurring_day,
            source_journal_ids
        } = req.body;

        const result = await pool.query(
            `UPDATE ai_insights SET 
            pattern_type = $1,
            pattern_description = $2,
            recurring_day = $3,
            source_journal_ids = $4
            WHERE id = $5 AND user_id = $6
            RETURNING *`,
            [pattern_type, pattern_description, recurring_day, source_journal_ids, id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insight not found or unauthorized" });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /insights/:id - Delete an insight
router.delete("/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const result = await pool.query(
            "DELETE FROM ai_insights WHERE id = $1 AND user_id = $2 RETURNING *",
            [id, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Insight not found or unauthorized" });
        }

        res.status(204).send();
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /insights/by-type/:type - Get all insights of a specific pattern type
router.get("/by-type/:type", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { type } = req.params;

        const result = await pool.query(
            "SELECT * FROM ai_insights WHERE user_id = $1 AND pattern_type ILIKE $2",
            [userId, type]
        );

        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});


export default router;
