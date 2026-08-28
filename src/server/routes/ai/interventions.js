import express from "express";
import authenticateToken from "../../middleware/authenticate.js";
import pool from "../../db.js";
const router = express.Router();

// GET /interventions - Get all interventions for authenticated user
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ai_interventions WHERE user_id = $1 ORDER BY recommended_at DESC`,
      [req.user.id],
    );
    res.status(200).json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /interventions/:id - Get a specific intervention
router.get("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ai_interventions WHERE id = $1 AND user_id = $2`,
      [req.params.id, req.user.id],
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Intervention not found" });
    }
    res.status(200).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /interventions - Create a new intervention
router.post("/", authenticateToken, async (req, res) => {
  const {
    insight_id,
    title,
    description,
    type,
    recommended_at,
    status,
    completed_at,
  } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO ai_interventions (
        user_id, insight_id, title, description, type,
        recommended_at, status, completed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        req.user.id,
        insight_id || null,
        title,
        description || null,
        type,
        recommended_at || new Date(),
        status || "suggested",
        completed_at || null,
      ],
    );
    res.status(201).json({ interventionId: result.rows[0].id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /interventions/:id - Update an existing intervention
router.put("/:id", authenticateToken, async (req, res) => {
  const { title, description, type, status, completed_at } = req.body;

  try {
    const result = await pool.query(
      `UPDATE ai_interventions
       SET title = $1,
           description = $2,
           type = $3,
           status = $4,
           completed_at = $5
       WHERE id = $6 AND user_id = $7
       RETURNING *`,
      [
        title,
        description,
        type,
        status,
        completed_at,
        req.params.id,
        req.user.id,
      ],
    );

    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Intervention not found or unauthorized" });
    }

    res
      .status(200)
      .json({ message: "Updated successfully", intervention: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /interventions/:id - Delete an intervention
router.delete("/:id", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM ai_interventions WHERE id = $1 AND user_id = $2 RETURNING *`,
      [req.params.id, req.user.id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "Intervention not found or unauthorized" });
    }
    res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
