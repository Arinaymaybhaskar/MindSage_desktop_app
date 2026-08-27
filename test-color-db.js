// Simple test script to verify color database migration
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Use a test database
const testDbPath = path.join(__dirname, "test-color.db");
const db = new Database(testDbPath);

console.log("Testing color database migration...");

try {
  // Create a minimal user_settings table
  db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
            user_id INTEGER PRIMARY KEY,
            dark_mode INTEGER DEFAULT 0,
            font_size TEXT DEFAULT 'medium'
        );
    `);

  // Insert a test user
  db.prepare("INSERT OR IGNORE INTO user_settings (user_id) VALUES (1)").run();

  // Check current columns
  const beforeInfo = db.prepare(`PRAGMA table_info(user_settings)`).all();
  console.log(
    "Columns before migration:",
    beforeInfo.map((col) => col.name),
  );

  // Run the migration
  const userSettingsInfo = db.prepare(`PRAGMA table_info(user_settings)`).all();
  const hasCustomColors = userSettingsInfo.some(
    (col) => col.name === "custom_colors",
  );
  const hasSelectedTheme = userSettingsInfo.some(
    (col) => col.name === "selected_theme",
  );
  const hasUseCustomColors = userSettingsInfo.some(
    (col) => col.name === "use_custom_colors",
  );

  if (!hasCustomColors) {
    db.prepare(`ALTER TABLE user_settings ADD COLUMN custom_colors TEXT`).run();
    console.log("Added custom_colors column");
  }
  if (!hasSelectedTheme) {
    db.prepare(
      `ALTER TABLE user_settings ADD COLUMN selected_theme TEXT DEFAULT 'Default'`,
    ).run();
    console.log("Added selected_theme column");
  }
  if (!hasUseCustomColors) {
    db.prepare(
      `ALTER TABLE user_settings ADD COLUMN use_custom_colors INTEGER DEFAULT 0`,
    ).run();
    console.log("Added use_custom_colors column");
  }

  // Check columns after migration
  const afterInfo = db.prepare(`PRAGMA table_info(user_settings)`).all();
  console.log(
    "Columns after migration:",
    afterInfo.map((col) => col.name),
  );

  // Test inserting color data
  const testColors = {
    light1: "hsl(232, 33%, 75%)",
    light2: "hsl(191, 26%, 82%)",
    light3: "hsl(120, 24%, 87%)",
    light4: "hsl(68, 48%, 90%)",
    dark1: "hsl(235, 17%, 25%)",
    dark2: "hsl(202, 25%, 27%)",
    dark3: "hsl(193, 21%, 40%)",
    dark4: "hsl(136, 17%, 55%)",
  };

  const updateStmt = db.prepare(`
        UPDATE user_settings 
        SET custom_colors = ?, selected_theme = ?, use_custom_colors = ?
        WHERE user_id = ?
    `);

  updateStmt.run(JSON.stringify(testColors), "Test Theme", 1, 1);
  console.log("Successfully inserted test color data");

  // Test reading the data
  const result = db
    .prepare("SELECT * FROM user_settings WHERE user_id = 1")
    .get();
  console.log("Retrieved data:", {
    custom_colors: result.custom_colors ? "Present" : "Missing",
    selected_theme: result.selected_theme,
    use_custom_colors: result.use_custom_colors,
  });

  console.log("✅ Color database migration test passed!");
} catch (error) {
  console.error("❌ Color database migration test failed:", error);
} finally {
  db.close();
  // Clean up test database
  fs.unlinkSync(testDbPath);
}
