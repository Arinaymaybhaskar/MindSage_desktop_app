import { db } from './connection.js';
import path from "node:path";
import fs from "node:fs";

/**
 * Main dashboard data
 */
export function getDashboardData(userId) {
    // 1. User details from stats function
    const userStats = db.prepare(`
        SELECT
            COUNT(id) as entryCount,
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
          AND created_at >= date('now', '-7 days')
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

    // 4. Random image paths (not full images)
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
            // We only return the path; the frontend will resolve it
            return path.resolve(imgPath);
        });

    // 5. Pinned goals
    const pinnedGoals = db.prepare(`
        SELECT *
        FROM goals
        WHERE user_id = ? AND is_pinned = 1
    `).all(userId);

    return {
        userDetails: {
            ...userStats,
            // You might want to fetch user.full_name separately if needed here
        },
        dailyScores,
        recentJournals,
        images: resolvedImages, // Now returns paths
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
          AND created_at >= date('now', '-30 days')
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

/**
 * Retrieves a comprehensive set of statistics for a given user.
 * @param {number} userId The ID of the user.
 * @returns {object} An object containing various user statistics.
 */
export function getUserStats(userId) {
    if (userId === undefined || userId === null) {
        throw new Error("A valid userId must be provided to getUserStats.");
    }

    // 1. Total Journal Entries
    const { totalEntries } = db.prepare(
        `SELECT COUNT(id) as totalEntries FROM journal_entries WHERE user_id = ? AND is_deleted = 0`
    ).get(userId);

    // 2. Total Word Count
    const { totalWords } = db.prepare(`
        SELECT SUM(
            CASE
                WHEN content IS NULL OR TRIM(content) = '' THEN 0
                ELSE LENGTH(TRIM(content)) - LENGTH(REPLACE(TRIM(content), ' ', '')) + 1
            END
        ) as totalWords
        FROM journal_entries
        WHERE user_id = ? AND is_deleted = 0
    `).get(userId);

    // 3. First & Last Entry Dates
    const entryDates = db.prepare(
        `SELECT MIN(created_at) as firstEntry, MAX(created_at) as lastEntry FROM journal_entries WHERE user_id = ? AND is_deleted = 0`
    ).get(userId);

    // 4. Longest Journaling Streak
    const { longestStreak } = db.prepare(`
        WITH DayStreaks AS (
            SELECT
                DATE(created_at) as entry_date,
                DATE(created_at, '-' || (ROW_NUMBER() OVER (ORDER BY DATE(created_at))) || ' days') as streak_group
            FROM (SELECT DISTINCT DATE(created_at) as created_at FROM journal_entries WHERE user_id = ? AND is_deleted = 0)
        )
        SELECT COUNT(*) as longestStreak
        FROM DayStreaks
        GROUP BY streak_group
        ORDER BY longestStreak DESC
        LIMIT 1;
    `).get(userId) || { longestStreak: 0 };

    // 5. Average Mood Score
    const { averageMood } = db.prepare(
        `SELECT AVG(mood_score) as averageMood FROM journal_entries WHERE user_id = ? AND is_deleted = 0 AND mood_score IS NOT NULL`
    ).get(userId);

    // 6. Goal Stats
    const goalStats = db.prepare(`
        SELECT
            COUNT(id) as totalGoals,
            SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) as completedGoals,
            SUM(CASE WHEN is_completed = 0 THEN 1 ELSE 0 END) as activeGoals
        FROM goals
        WHERE user_id = ?
    `).get(userId);

    // 7. Most Used Tag
    const mostUsedTag = db.prepare(`
        SELECT t.name
        FROM journal_entry_tags jet
        JOIN tags t ON jet.tag_id = t.id
        WHERE t.user_id = ?
        GROUP BY t.name
        ORDER BY COUNT(jet.tag_id) DESC
        LIMIT 1
    `).get(userId);

    /**
 * Calculates the average number of journal entries for each day of the week
 * across the user's entire journaling history.
 * @param {number} userId The ID of the user.
 * @returns {Array<object>} An array of objects, e.g., [{ day: 'Monday', average: 1.75 }, ...]
 */
    function getAverageEntriesPerDayOfWeek(userId) {
        const stmt = db.prepare(`
        WITH UserTimeSpan AS (
            SELECT
                MAX(1.0, (JULIANDAY('now', 'localtime') - JULIANDAY(MIN(created_at))) / 7.0) AS total_weeks
            FROM
                journal_entries
            WHERE
                user_id = ? AND is_deleted = 0
        ),
        Days AS (
            SELECT 'Sunday' AS day, '0' AS w UNION ALL
            SELECT 'Monday', '1' UNION ALL
            SELECT 'Tuesday', '2' UNION ALL
            SELECT 'Wednesday', '3' UNION ALL
            SELECT 'Thursday', '4' UNION ALL
            SELECT 'Friday', '5' UNION ALL
            SELECT 'Saturday', '6'
        ),
        EntryCounts AS (
            SELECT
                STRFTIME('%w', created_at) AS w,
                COUNT(*) AS count
            FROM
                journal_entries
            WHERE
                user_id = ? AND is_deleted = 0
            GROUP BY
                w
        )
        SELECT
            d.day,
            ROUND(
                COALESCE(e.count, 0) / (SELECT total_weeks FROM UserTimeSpan),
                2
            ) AS average
        FROM
            Days d
        LEFT JOIN
            EntryCounts e ON d.w = e.w
        ORDER BY
            d.w;
    `);

        return stmt.all(userId, userId);
    }

    const averageEntriesPerDayOfWeek = getAverageEntriesPerDayOfWeek(userId);

    return {
        totalEntries: totalEntries || 0,
        totalWords: totalWords || 0,
        firstEntry: entryDates?.firstEntry || null,
        lastEntry: entryDates?.lastEntry || null,
        longestStreak: longestStreak || 0,
        averageMood: averageMood ? Number(averageMood.toFixed(2)) : 0, // Round to 2 decimal places
        totalGoals: goalStats?.totalGoals || 0,
        completedGoals: goalStats?.completedGoals || 0,
        activeGoals: goalStats?.activeGoals || 0,
        mostUsedTag: mostUsedTag?.name || 'N/A',
        averageEntriesPerDayOfWeek: averageEntriesPerDayOfWeek || [],
    };
}