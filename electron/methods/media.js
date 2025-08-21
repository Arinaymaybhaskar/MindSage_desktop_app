import { app } from 'electron';
import fs from 'node:fs'
import path from 'node:path'
import localDB from '../db';

export async function getImageBase64(imagePath) {
  try {
    const data = fs.readFileSync(imagePath);
    const base64 = data.toString('base64');
    const mimeType = getMimeType(imagePath); // you can use 'mime-types' package
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error('Error loading image:', err);
    return null;
  }
}

function getMimeType(filePath) {
  const ext = filePath.split('.').pop();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  return 'application/octet-stream';
}

export async function getAudioBase64(audioPath) {
  try {
    const fileBuffer = fs.readFileSync(audioPath);
    const base64 = fileBuffer.toString('base64');
    return `data:audio/webm;base64,${base64}`;
  } catch (err) {
    console.error('Error reading file:', err);
    return null;
  }
}

export const handleSaveMedia = async (event, { journalId, mediaType, arrayBuffer, filename }) => {
  try {
    console.log("Received arrayBuffer:", arrayBuffer); // ✅ Should now log correctly

    const buffer = Buffer.from(arrayBuffer);
    const mediaDir = path.join(app.getPath("userData"), "media", String(journalId));
    fs.mkdirSync(mediaDir, { recursive: true });
    console.log(filename, "original name");
    const name = `audio-${Date.now()}.webm`
    const uniqueFilename = `${Date.now()}-${mediaType === "image" ? filename : name
      }`;
    console.log(uniqueFilename, "unique filename")
    const destPath = path.join(mediaDir, uniqueFilename);

    fs.writeFileSync(destPath, buffer);


    const success = localDB.linkMediaToJournal(journalId, destPath, mediaType);
    if (!success) throw new Error("Failed to link media to journal entry in the database.");

    console.log(`Media saved at: ${destPath}`);
    return { success: true, key: destPath };
  } catch (err) {
    console.error(err);
    return { success: false, message: err.message };
  }
}

/**
 * Handles opening a local file path in the system's default application.
 */
export async function handleOpenMedia(event, filePath) {
  try {
    // Check if the file exists before trying to open it
    if (!fs.existsSync(filePath)) {
      throw new Error("File not found at the specified path.");
    }
    // shell.openPath is the recommended and safest way to open local files
    await shell.openPath(filePath);
    return { success: true };
  } catch (error) {
    console.error(`Failed to open media file: ${filePath}`, error);
    throw error;
  }
}

// NEW: save profile image without attempting to link to journal DB
export async function handleSaveProfileImage(event, { arrayBuffer, filename, userId }) {
  try {
    const buffer = Buffer.from(arrayBuffer);
    const mediaDir = path.join(app.getPath("userData"), "media", "profile");
    fs.mkdirSync(mediaDir, { recursive: true });

    const uniqueFilename = `${Date.now()}-${filename}`;
    const destPath = path.join(mediaDir, uniqueFilename);

    fs.writeFileSync(destPath, buffer);

    console.log(`Profile image saved at: ${destPath}`);

    // If caller provided a userId, persist the profile_picture path to users table.
    if (userId) {
      try {
        if (typeof localDB.updateUser === "function") {
          // If localDB offers a helper, use it
          await localDB.updateUser(userId, { profile_picture: destPath });
        } else if (localDB.db && typeof localDB.db.prepare === "function") {
          // Fallback to raw SQL (works for many sqlite wrappers)
          localDB.db
            .prepare(
              `UPDATE users SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
            )
            .run(destPath, userId);
        } else {
          console.warn(
            "localDB has no known updateUser helper — caller should update users table separately."
          );
        }
      } catch (dbErr) {
        console.error("Failed to persist profile_picture to users table:", dbErr);
      }
    }

    return { success: true, path: destPath };
  } catch (err) {
    console.error("Error saving profile image:", err);
    return { success: false, message: String(err) };
  }
}