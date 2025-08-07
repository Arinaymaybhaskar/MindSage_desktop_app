import express from "express";
import pool from "../db.js";
import authenticateToken from "../middleware/authenticate.js";
import { checkCronAuth } from "../middleware/checkCronAuth.js";

const router = express.Router();
/*
    Notification type: 
        -> insight
        -> reminder
        -> mood_drop
*/

// Post notification for a particular user
router.post("/:id", checkCronAuth, async (req, res) => {
  try {
    const { title, body, type } = req.body;
    const userId = req.params.id;
    await pool.query(
      "INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)",
      [userId, title, body, type]
    );
    res.status(201).json({message: `notification sent to user id: ${userId}`});
  }
  catch (err) {
    res.status(500).send(err);
  }
})

// POST /notifications
router.post("/", checkCronAuth, async (req, res) => {
  try {
    const { title, body, type, user_id } = req.body;

    let targetUsers;

    if (Array.isArray(userid) && userid.length > 0) {
      // Use the provided list of user IDs
      targetUsers = userids.map(id => ({ id }));
    } else {
      // Fetch all user IDs from the database
      const allUsers = await pool.query("SELECT id FROM users");
      targetUsers = allUsers.rows;
    }

    const insertPromises = targetUsers.map((user) => {
      console.log("Notification for user:", user.id);
      return pool.query(
        "INSERT INTO notifications (user_id, title, body, type) VALUES ($1, $2, $3, $4)",
        [user.id, title, body, type]
      );
    });

    await Promise.all(insertPromises);

    res.status(201).json({ message: "Notifications created successfully" });
  } catch (error) {
    console.error("🚨 Error creating notifications:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});



// GET /notifications
router.get("/", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC",
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error fetching notifications:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /notifications/:id/read
router.put("/:id/read", authenticateToken, async (req, res) => {
  await pool.query(
    "UPDATE notifications SET read = TRUE WHERE id = $1 AND user_id = $2",
    [req.params.id, req.user.id]
  );
  res.json({ message: "Marked as read" });
});

router.put("/read-all", authenticateToken, async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET "read" = TRUE WHERE user_id = $1',
      [req.user.id]
    );

    res.json({
      message: "All notifications marked as read",
    });
  } catch (err) {
    console.error("Error setting all to read:", err.message); // Fixed console.err
    res.status(500).json({
      error: "Failed to mark notifications as read",
    });
  }
});

export default router;