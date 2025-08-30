import { db } from './connection.js';
import path from "node:path";
import fs from "node:fs";

/**
 * Main dashboard data
 * - user details
 * - scores: daily (7 days), weekly (from those daily)
 * - recent journals
 * - images
 * - pinned goals
 */
export function getDashboardData(userId) {
    console.log(userId, "userId for dashboard");

    // 1. User details
    const userDetails = db.prepare(`
        SELECT 
            COUNT(*) as entryCount,
            MAX(created_at) as lastEntry
        FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0
    `).get(userId);

    // 2. Daily scores (last 7 days)
    const dailyScores = db.prepare(`
        SELECT 
            strftime('%Y-%m-%d', created_at) as day,
            AVG(mood_score) as avgMood
        FROM journal_entries
        WHERE user_id = ?
          AND is_deleted = 0
          AND created_at >= date('now', '-7 day')
        GROUP BY day
        ORDER BY day ASC
    `).all(userId);

    // 3. Recent 3 journals
    const recentJournals = db.prepare(`
        SELECT *
        FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0
        ORDER BY created_at DESC
        LIMIT 3
    `).all(userId);

    // 4. Random images
    const imageKeys = db.prepare(`
        SELECT image_key
        FROM journal_entries
        WHERE user_id = ? AND image_key IS NOT NULL AND is_deleted = 0
        ORDER BY RANDOM()
        LIMIT 10
    `).all(userId);

    const resolvedImages = imageKeys
        .map(row => row.image_key)
        .filter(Boolean)
        .map((imgPath) => {
            const absPath = path.resolve(imgPath);
            return fs.existsSync(absPath) ? absPath : null;
        })
        .filter(Boolean);

    // 5. Pinned goals
    const pinnedGoals = db.prepare(`
        SELECT *
        FROM goals
        WHERE user_id = ? AND is_pinned = 1
    `).all(userId);

    return {
        userDetails,
        dailyScores,   // last 7 days // grouped from daily
        recentJournals,
        images: resolvedImages,
        pinnedGoals
    };
}

/**
 * Daily scores for last 30 days (averaged per day)
 */
export function getMonthlyScores(userId) {
    return db.prepare(`
        SELECT 
            strftime('%Y-%m-%d', created_at) as day,
            AVG(mood_score) as avgMood
        FROM journal_entries
        WHERE user_id = ?
          AND is_deleted = 0
          AND created_at >= date('now', '-30 day')
        GROUP BY day
        ORDER BY day ASC
    `).all(userId);
}

/**
 * Daily scores for all time since account creation (averaged per day)
 */
export function getAllTimeScores(userId) {
    return db.prepare(`
        SELECT 
            strftime('%Y-%m-%d', created_at) as day,
            AVG(mood_score) as avgMood
        FROM journal_entries
        WHERE user_id = ?
          AND is_deleted = 0
        GROUP BY day
        ORDER BY day ASC
    `).all(userId);
}
