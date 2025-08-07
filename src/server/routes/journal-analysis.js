import express from "express";
import authenticateToken from "../middleware/authenticate.js";
import pool from "../db.js";

const router = express.Router();

// GET /journal-analysis/:journalId
router.get("/:id", authenticateToken, async (req, res) => {
    const id = req.params.id;
    try{
        const result = await pool.query(`
            SELECT * FROM journal_analysis WHERE journal_id = $1;
            `, [id])
        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({error: err});
    }
})

// POST /journal-analysis
router.post("/", authenticateToken, async (req, res) => {
    const {journal_id, sentiment, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at} = req.body
    try{
        const result = await pool.query(`
            INSERT INTO journal_analysis 
            (journal_id, sentiment, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id
            `, [journal_id, sentiment, mood, topics, recurring_thoughts, cognitive_distortions, suggested_therapy_technique, analyzed_at])
        console.log(result)
        const analysisId = result.rows[0].id;
        res.status(200).json({analysisId});
    } catch (err) {
        res.status(500).json({error: err});
    }
})

// DELETE /journal-analysis/:journalId
router.delete("/:id", authenticateToken, async (req, res) => {
    const id = req.params.id;
    try {
        const result = await pool.query(
            `DELETE FROM journal_analysis WHERE id = $1 RETURNING *;`,
            [id]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Analysis not found" });
        }
        res.status(200).json({ message: "Deleted successfully" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /user/:userId/journal-analyses
router.get("/user/:userId", authenticateToken, async (req, res) => {
    const { userId } = req.params;
    try {
        const result = await pool.query(`
            SELECT ja.*
            FROM journal_analysis ja
            JOIN journal_entries j ON ja.journal_id = j.id
            WHERE j.user_id = $1
            ORDER BY ja.analyzed_at DESC;
        `, [userId]);

        res.status(200).json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;

