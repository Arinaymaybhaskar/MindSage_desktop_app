import express from "express";
import pool from "../db.js";
import authenticateToken from "../middleware/authenticate.js";
import { checkCronAuth } from "../middleware/checkCronAuth.js";
import bcrypt from 'bcryptjs';

const router = express.Router();

// Get current user info
router.get("/me", authenticateToken, async (req, res) => {
  try {
    const id = req.user.id || req.user.userId; // Handle both user.id and user.userId
    const username = req.user.username;
    
    const result = await pool.query(
      "SELECT username, email, created_at, full_name, timezone FROM users WHERE id = $1 AND username = $2",
      [id, username]
    );

    // get no of entries this month
    const entriesThisMonth = await pool.query(
      `SELECT COUNT(*) FROM journal_entries 
       WHERE user_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE
      )`,
      [req.user.id]
    );

    // get last journal entry date
    const lastEntry = await pool.query(
      `SELECT created_at FROM journal_entries
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user.id]
    );

    const getstreaks = await pool.query(
      `SELECT COUNT(*) FROM user_streaks
        WHERE user_id = $1`,
      [req.user.id]
    );

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    const entriesCount = parseInt(entriesThisMonth.rows[0].count, 10);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result.rows[0];
    user.entriesCount = entriesCount; // Add entries count to user object
    user.lastEntryDate = lastEntry.rows.length > 0 ? lastEntry.rows[0].created_at : null; // Add last entry date
    res.json(user);
  } catch (err) {
    console.error("Error fetching user:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user profile
router.put("/me", authenticateToken, async (req, res) => {
  const { username, email } = req.body;
  try {
    await pool.query("UPDATE users SET username = $1, email = $2 WHERE id = $3", [username, email, req.user.id]);
    res.send("User profile updated");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

// get all users
router.get("/", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id FROM users`);
    const userIds = rows.map(row => row.id);
    res.json({ userIds });
  } catch (err) {
    console.error("Failed to fetch user IDs:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// users with no journals today
router.get("/no-journal-today", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM journal_entries
        WHERE created_at::date = CURRENT_DATE
      )
    `);

    res.json(rows.map((r) => r.id));
  } catch (err) {
    console.error("❌ Error fetching inactive users:", err.message);
    res.status(500).json({ error: "Failed to check user activity" });
  }
});

// users who haven't written a journal in last 3 days
router.get("/inactive-3-days", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id AS user_id
      FROM users
      WHERE id NOT IN (
        SELECT DISTINCT user_id
        FROM journal_entries
        WHERE created_at::date >= CURRENT_DATE - INTERVAL '3 days'
      );
    `);
    res.json(rows.map((r) => r.user_id));
  }
  catch (err) {
    console.error("Error fetching inactive users:", err.message);
    res.status(500).json({ error: "Failed to fetch inactive users" });
  }
})

// users who have consistently written a journal in last 3 days
router.get("/consistent-3-days", checkCronAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT user_id
      FROM (
        SELECT user_id, COUNT(DISTINCT created_at::date) AS days_written
        FROM journal_entries
        WHERE created_at::date >= CURRENT_DATE - INTERVAL '2 days'
        GROUP BY user_id
      ) AS recent
      WHERE days_written = 3;
    `);

    res.json(rows.map((r) => r.user_id));
  } catch (err) {
    console.error("Error fetching consistent users:", err.message);
    res.status(500).json({ error: "Failed to fetch consistent users" });
  }
});

// user's monthly recap
router.get("/monthly-summary/:id", checkCronAuth, async (req, res) => {
  try {
    const currentMonth = new Date().getMonth(); // 0 = Jan
    const lastMonthStart = new Date(new Date().getFullYear(), currentMonth - 1, 1);
    const lastMonthEnd = new Date(new Date().getFullYear(), currentMonth, 0);
    const {rows} = await pool.query(`
        SELECT user_id,
             COUNT(*) as entry_count,
             ROUND(AVG(mood_score)) as avg_mood
      FROM journal_entries
      WHERE created_at BETWEEN $1 AND $2
      GROUP BY user_id
    `,[lastMonthStart, lastMonthEnd])

      res.status(200).json({data: rows})
  }
  catch(err){
    res.status(500).json({err})
  }
})

// get user settings
router.get("/me/settings", authenticateToken, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM user_settings WHERE user_id = $1", [req.user.id]);
    res.json(rows[0]);
  } catch (err) {
    console.error("Error fetching user settings:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user settings
router.put("/me/settings", authenticateToken, async (req, res) => {
  const allowedFields = [
    "dark_mode", "font_size", "auto_save_interval", "speech_language", "biometric_lock",
    "send_to_ai", "journal_reminder", "challenge_alert", "check_in_frequency", "ai_tone",
    "breathing_reminder", "daily_challenge_type", "auto_summarize", "ai_tags", "insight_tone",
    "enable_ai_image", "enable_voice_mood", "enable_smart_prompts", "auto_save_timer",
    "journal_streaks", "weekly_summary_email", "journaling_goal", "custom_colors", 
    "selected_theme", "use_custom_colors"
  ];
  // convert camelCase to snake_case for database compatibility
  const snakeCaseFields = allowedFields.map(field => field.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase());
  

  const updates = [];
  const values = [];
  let idx = 1;
  snakeCaseFields.forEach(field => {
    if (req.body.hasOwnProperty(field)) {
      updates.push(`${field} = $${idx++}`);
      values.push(req.body[field]);
    }
  });
  values.push(req.user.id);

  if (updates.length === 0) {
    return res.status(400).send("No valid settings provided");
  }
  try {
     await pool.query(
      `UPDATE user_settings SET ${updates.join(", ")} WHERE user_id = $${idx}`,
      values
    );
    const settingsResult = await pool.query(
      "SELECT * FROM user_settings WHERE user_id = $1",
      [req.user.id]
    );
    res.send(settingsResult.rows[0]);
  } catch (err) {
    console.error("Error updating user settings:", err);
    res.status(500).send("Internal server error");
  }
});

// Delete User account
router.delete("/me", authenticateToken, async (req, res) => {
  const password_hash = await pool.query("SELECT password_hash FROM users WHERE id = $1", [req.user.id])
    .then(result => result.rows[0].password_hash);
  const { password } = req.body;
  const match = await bcrypt.compare(password, password_hash);
  if (!match) {
    return res.status(403).send("Incorrect password");
  }
  try {
    await pool.query("DELETE FROM users WHERE id = $1", [req.user.id]);
    res.status(200).send("User account deleted successfully");
  } catch (err) {
    console.error("Error deleting user account:", err);
    res.status(500).send("Internal server error");
  }
});

// change password
router.put("/me/change-password", authenticateToken, async (req, res) => {
  const { old_password, new_password } = req.body;
  try {
    const result = await pool.query("SELECT * FROM users WHERE id = $1", [req.user.id]);
    const user = result.rows[0];
    if (!user) return res.status(404).send("User not found");

    const match = await bcrypt.compare(old_password, user.password_hash);
    if (!match) return res.status(403).send("Incorrect current password");

    const hashedNewPassword = await bcrypt.hash(new_password, 10);
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashedNewPassword, req.user.id]);
    res.send("Password updated successfully");
  } catch (err) {
    console.error(err);
    res.status(500).send("Server error");
  }
});

export default router;