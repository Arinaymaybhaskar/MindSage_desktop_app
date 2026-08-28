import fs from "node:fs";
import path from "node:path";
import { zip } from "zip-a-folder";
import { db } from "./connection.js";
import os from "node:os";

/**
 * Creates a comprehensive ZIP archive of all user data, handling cases where some data tables may be empty.
 * The archive includes:
 * 1. A single `data.json` file in the root with all text-based data.
 * 2. A `structured` folder containing the same data split into multiple organized JSON files and folders.
 * 3. `images` and `audio` folders for all media assets, with paths correctly referenced by both data structures.
 *
 * @param {number} userId The ID of the user to export data for.
 * @param {string} destinationPath The full file path where the ZIP archive should be saved (e.g., 'C:\\Users\\user\\Documents\\export.zip').
 * @returns {Promise<string>} A promise that resolves with the path to the created ZIP file.
 */
export async function exportEverything(userId, destinationPath) {
  let tempDir = "";

  try {
    if (!destinationPath) {
      throw new Error("A destination file path is required.");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const exportFolderName = `MindSage_Export_${timestamp}`;
    tempDir = path.join(
      fs.existsSync("/tmp") ? "/tmp" : os.tmpdir(),
      exportFolderName,
    );

    // -- 0. Create base and structured directories --
    const rootImagesPath = path.join(tempDir, "images");
    const rootAudioPath = path.join(tempDir, "audio");
    const structuredDirPath = path.join(tempDir, "structured");
    const structuredDataPath = path.join(structuredDirPath, "data");

    fs.mkdirSync(rootImagesPath, { recursive: true });
    fs.mkdirSync(rootAudioPath, { recursive: true });
    fs.mkdirSync(structuredDataPath, { recursive: true });

    // Helper function to create a directory if it doesn't exist
    const ensureDirExists = (dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    };

    // -- 1. Query all necessary data for the user --
    const userQuery = db.prepare(
      "SELECT id, username, email, full_name, timezone, profile_picture, created_at FROM users WHERE id = ?",
    );
    const userSettingsQuery = db.prepare(
      "SELECT * FROM user_settings WHERE user_id = ?",
    );
    const journalEntriesQuery = db.prepare(
      "SELECT * FROM journal_entries WHERE user_id = ? ORDER BY created_at DESC",
    );
    const tagsQuery = db.prepare("SELECT * FROM tags WHERE user_id = ?");
    const journalEntryTagsQuery = db.prepare(
      "SELECT * FROM journal_entry_tags WHERE journal_entry_id IN (SELECT id FROM journal_entries WHERE user_id = ?)",
    );
    const journalAnalysisQuery = db.prepare(
      "SELECT * FROM journal_analysis WHERE journal_id IN (SELECT id FROM journal_entries WHERE user_id = ?)",
    );
    const notificationsQuery = db.prepare(
      "SELECT * FROM notifications WHERE user_id = ?",
    );
    const journalSummariesQuery = db.prepare(
      "SELECT * FROM journal_summaries WHERE user_id = ?",
    );
    const aiInsightsQuery = db.prepare(
      "SELECT * FROM ai_insights WHERE user_id = ?",
    );
    const aiInterventionsQuery = db.prepare(
      "SELECT * FROM ai_interventions WHERE user_id = ?",
    );
    const aiNudgesQuery = db.prepare(
      "SELECT * FROM ai_nudges WHERE user_id = ?",
    );
    const userEmotionPatternsQuery = db.prepare(
      "SELECT * FROM user_emotion_patterns WHERE user_id = ?",
    );
    const categoriesQuery = db.prepare(
      "SELECT * FROM categories WHERE user_id = ?",
    );
    const goalsQuery = db.prepare("SELECT * FROM goals WHERE user_id = ?");
    const progressLogsQuery = db.prepare(
      "SELECT * FROM progress_logs WHERE goal_id IN (SELECT id FROM goals WHERE user_id = ?)",
    );
    const chatsQuery = db.prepare(
      "SELECT * FROM chats WHERE user_id = ? ORDER BY created_at DESC",
    );
    const messagesQuery = db.prepare(
      "SELECT * FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)",
    );
    const filesQuery = db.prepare(
      "SELECT * FROM files WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?)",
    );
    const messageSourcesQuery = db.prepare(
      "SELECT * FROM message_sources WHERE message_id IN (SELECT id FROM messages WHERE chat_id IN (SELECT id FROM chats WHERE user_id = ?))",
    );

    // -- 2. Collect all data from the database into a single object --
    const sourceData = {
      user: userQuery.get(userId),
      settings: userSettingsQuery.get(userId),
      journal_entries: journalEntriesQuery.all(userId),
      tags: tagsQuery.all(userId),
      journal_entry_tags: journalEntryTagsQuery.all(userId),
      journal_analysis: journalAnalysisQuery.all(userId),
      notifications: notificationsQuery.all(userId),
      journal_summaries: journalSummariesQuery.all(userId),
      ai_insights: aiInsightsQuery.all(userId),
      ai_interventions: aiInterventionsQuery.all(userId),
      ai_nudges: aiNudgesQuery.all(userId),
      user_emotion_patterns: userEmotionPatternsQuery.all(userId),
      categories: categoriesQuery.all(userId),
      goals: goalsQuery.all(userId),
      progress_logs: progressLogsQuery.all(userId),
      chats: chatsQuery.all(userId),
      messages: messagesQuery.all(userId),
      files: filesQuery.all(userId),
      message_sources: messageSourcesQuery.all(userId),
    };

    const flatData = JSON.parse(JSON.stringify(sourceData));
    const structuredData = JSON.parse(JSON.stringify(sourceData));

    // -- 3. Copy binary assets and update paths in both data objects --
    const copyAsset = (sourcePath, destDir, destFilename) => {
      if (sourcePath && fs.existsSync(sourcePath)) {
        try {
          ensureDirExists(destDir);
          fs.copyFileSync(sourcePath, path.join(destDir, destFilename));
        } catch (error) {
          console.error(`Failed to copy asset: ${sourcePath}`, error);
        }
      } else if (sourcePath) {
        // Log a warning if the source file doesn't exist to make debugging easier.
        console.warn(
          `Asset source file not found, skipping copy: ${sourcePath}`,
        );
      }
    };

    if (sourceData.user && sourceData.user.profile_picture) {
      const baseFilename = path.basename(sourceData.user.profile_picture);
      const sourcePath = sourceData.user.profile_picture; // Use absolute path from DB
      copyAsset(sourcePath, rootImagesPath, baseFilename);
      flatData.user.profile_picture = path
        .join("images", baseFilename)
        .replace(/\\/g, "/");
      structuredData.user.profile_picture = path
        .join("..", "..", "..", "images", baseFilename)
        .replace(/\\/g, "/");
    }

    sourceData.journal_entries.forEach((entry, index) => {
      if (entry.image_key) {
        const baseFilename = path.basename(entry.image_key);
        const sourcePath = entry.image_key; // Use absolute path from DB
        copyAsset(sourcePath, rootImagesPath, baseFilename);
        flatData.journal_entries[index].image_key = path
          .join("images", baseFilename)
          .replace(/\\/g, "/");
        structuredData.journal_entries[index].image_key = path
          .join("..", "..", "..", "images", baseFilename)
          .replace(/\\/g, "/");
      }
      if (entry.audio_key) {
        const baseFilename = path.basename(entry.audio_key);
        const sourcePath = entry.audio_key; // Use absolute path from DB
        copyAsset(sourcePath, rootAudioPath, baseFilename);
        flatData.journal_entries[index].audio_key = path
          .join("audio", baseFilename)
          .replace(/\\/g, "/");
        structuredData.journal_entries[index].audio_key = path
          .join("..", "..", "..", "audio", baseFilename)
          .replace(/\\/g, "/");
      }
    });

    sourceData.files.forEach((file, index) => {
      const destFolder = file.file_type === "image" ? "images" : "audio";
      const rootDestPath =
        destFolder === "images" ? rootImagesPath : rootAudioPath;
      const baseFilename = path.basename(file.file_path);
      const sourcePath = file.file_path; // Use absolute path from DB
      copyAsset(sourcePath, rootDestPath, baseFilename);
      flatData.files[index].file_path = path
        .join(destFolder, baseFilename)
        .replace(/\\/g, "/");
      structuredData.files[index].file_path = path
        .join("..", "..", "..", destFolder, baseFilename)
        .replace(/\\/g, "/");
    });

    // -- 4. Write all data to files --
    const writeJsonFile = (filePath, data) => {
      if (data !== null && data !== undefined) {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      }
    };

    const metadata = {
      exported_at: new Date().toISOString(),
      app_version: "1.0.0",
      data_schema_version: "1.3.0-combined",
    };

    flatData.metadata = metadata;
    writeJsonFile(path.join(tempDir, "data.json"), flatData);
    writeJsonFile(path.join(structuredDirPath, "metadata.json"), metadata);

    const dataMap = {
      "user/profile.json": structuredData.user,
      "user/settings.json": structuredData.settings,
      "user/notifications.json": structuredData.notifications,
      "journal/entries.json": structuredData.journal_entries,
      "journal/tags.json": structuredData.tags,
      "journal/entry_tags.json": structuredData.journal_entry_tags,
      "journal/analysis.json": structuredData.journal_analysis,
      "journal/summaries.json": structuredData.journal_summaries,
      "goals/goals.json": structuredData.goals,
      "goals/progress_logs.json": structuredData.progress_logs,
      "chats/chats.json": structuredData.chats,
      "chats/messages.json": structuredData.messages,
      "chats/files.json": structuredData.files,
      "chats/message_sources.json": structuredData.message_sources,
      "general/categories.json": structuredData.categories,
      "ai/insights.json": structuredData.ai_insights,
      "ai/interventions.json": structuredData.ai_interventions,
      "ai/nudges.json": structuredData.ai_nudges,
      "ai/emotion_patterns.json": structuredData.user_emotion_patterns,
    };

    for (const [filename, data] of Object.entries(dataMap)) {
      const fullPath = path.join(structuredDataPath, filename);
      ensureDirExists(path.dirname(fullPath));
      writeJsonFile(fullPath, data);
    }

    // -- 5. Create the final ZIP archive --
    ensureDirExists(path.dirname(destinationPath));
    await zip(tempDir, destinationPath);

    // -- 6. Cleanup the temporary directory --
    fs.rmSync(tempDir, { recursive: true, force: true });

    console.log(`Combined data exported successfully to: ${destinationPath}`);
    return destinationPath;
  } catch (error) {
    console.error("Error during combined data export:", error);
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    throw error;
  }
}
