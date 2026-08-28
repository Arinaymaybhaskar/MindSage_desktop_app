import { app, shell, nativeImage } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import localDB from "../db/index.js";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

export async function getImageBase64(imagePath) {
  try {
    const data = fs.readFileSync(imagePath);
    const base64 = data.toString("base64");
    const mimeType = getMimeType(imagePath); // you can use 'mime-types' package
    return `data:${mimeType};base64,${base64}`;
  } catch (err) {
    console.error("Error loading image:", err);
    return null;
  }
}

/**
 * A small JPEG for grid views, generated once and cached on disk.
 *
 * Grids used to render `media:get-image`, which base64-encodes the original
 * file: a page showing every photo in the journal shipped tens of megabytes of
 * data URLs across IPC and held them all in renderer memory. A 480px JPEG is
 * roughly two orders of magnitude smaller and indistinguishable at tile size.
 *
 * Uses Electron's own `nativeImage` rather than an image library on purpose -
 * sharp and friends are native modules, and this project rebuilds native
 * modules against Electron's ABI on every install.
 *
 * The full-resolution image is still what `media:get-image` returns, so opening
 * an entry shows the real photograph.
 */
export async function getThumbnailBase64(imagePath, maxWidth = 480) {
  try {
    if (!imagePath || !fs.existsSync(imagePath)) return null;

    // Key the cache on path, size and mtime, so replacing a photo in place
    // does not keep serving the thumbnail of the old one.
    const { mtimeMs, size } = fs.statSync(imagePath);
    const key = crypto
      .createHash("sha1")
      .update(`${imagePath}|${maxWidth}|${mtimeMs}|${size}`)
      .digest("hex");

    const cacheDir = path.join(app.getPath("userData"), "media", "thumbs");
    fs.mkdirSync(cacheDir, { recursive: true });
    const cachePath = path.join(cacheDir, `${key}.jpg`);

    if (fs.existsSync(cachePath)) {
      return `data:image/jpeg;base64,${fs.readFileSync(cachePath).toString("base64")}`;
    }

    const image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) return getImageBase64(imagePath);

    const { width } = image.getSize();
    // Never upscale: a photo already smaller than the tile gains nothing and
    // would only get softer.
    const resized =
      width > maxWidth
        ? image.resize({ width: maxWidth, quality: "good" })
        : image;
    const buffer = resized.toJPEG(72);

    fs.writeFileSync(cachePath, buffer);
    return `data:image/jpeg;base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("Error creating thumbnail:", err);
    // Fall back to the original rather than showing a hole in the grid.
    return getImageBase64(imagePath);
  }
}

export async function getPdfBase64(pdfPath) {
  try {
    const data = fs.readFileSync(pdfPath);
    const base64 = data.toString("base64");
    return `data:application/pdf;base64,${base64}`;
  } catch (err) {
    console.error("Error loading pdf:", err);
    return null;
  }
}

async function convertWebmToWav(webmBuffer, wavPath) {
  return new Promise((resolve, reject) => {
    // Save a temporary WebM file
    const tempWebm = wavPath.replace(/\.wav$/, `-${Date.now()}.webm`);
    fs.writeFileSync(tempWebm, webmBuffer);

    const ffmpeg = spawn(ffmpegPath, [
      "-y", // overwrite output if exists
      "-i",
      tempWebm,
      "-ar",
      "16000", // optional: resample to 16kHz
      "-ac",
      "1", // mono
      wavPath,
    ]);

    ffmpeg.stderr.on("data", (data) => console.log(data.toString()));

    ffmpeg.on("close", (code) => {
      fs.unlinkSync(tempWebm); // cleanup temp file
      if (code === 0) resolve(wavPath);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });
}

function getMimeType(filePath) {
  const ext = filePath.split(".").pop();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "application/octet-stream";
}

export async function getAudioBase64(audioPath) {
  try {
    const fileBuffer = fs.readFileSync(audioPath);
    const base64 = fileBuffer.toString("base64");
    return `data:audio/webm;base64,${base64}`;
  } catch (err) {
    console.error("Error reading file:", err);
    return null;
  }
}

export const handleSaveMedia = async (
  event,
  { journalId, mediaType, arrayBuffer, filename },
) => {
  try {
    const buffer = Buffer.from(arrayBuffer);
    const mediaDir = path.join(
      app.getPath("userData"),
      "media",
      "journals",
      String(journalId),
    );
    fs.mkdirSync(mediaDir, { recursive: true });

    if (mediaType === "image") {
      // Save image directly
      const uniqueFilename = `${Date.now()}-${filename}`;
      const destPath = path.join(mediaDir, uniqueFilename);
      fs.writeFileSync(destPath, buffer);

      const success = localDB.linkMediaToJournal(
        journalId,
        destPath,
        mediaType,
      );
      if (!success) throw new Error("Failed to link media in DB.");

      return { success: true, key: destPath };
    }

    if (mediaType === "audio") {
      // Save raw WebM
      const webmName = `${Date.now()}-${filename.replace(/\..+$/, ".webm")}`;
      const webmPath = path.join(mediaDir, webmName);
      fs.writeFileSync(webmPath, buffer);

      // Convert to WAV
      const wavName = `${Date.now()}-${filename.replace(/\..+$/, ".wav")}`;
      const wavPath = path.join(mediaDir, wavName);
      await convertWebmToWav(buffer, wavPath);

      // Link WAV to journal
      const success = localDB.linkMediaToJournal(journalId, wavPath, mediaType);
      if (!success) throw new Error("Failed to link media in DB.");

      return { success: true, key: wavPath };
    }

    throw new Error("Unknown mediaType");
  } catch (err) {
    console.error(err);
    return { success: false, message: String(err) };
  }
};

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
export async function handleSaveProfileImage(
  event,
  { arrayBuffer, filename, userId },
) {
  try {
    const buffer = Buffer.from(arrayBuffer);
    const mediaDir = path.join(app.getPath("userData"), "media", "profile");
    fs.mkdirSync(mediaDir, { recursive: true });

    const uniqueFilename = `${Date.now()}-${filename}`;
    const destPath = path.join(mediaDir, uniqueFilename);

    fs.writeFileSync(destPath, buffer);

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
              `UPDATE users SET profile_picture = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            )
            .run(destPath, userId);
        } else {
          console.warn(
            "localDB has no known updateUser helper; caller should update users table separately.",
          );
        }
      } catch (dbErr) {
        console.error(
          "Failed to persist profile_picture to users table:",
          dbErr,
        );
      }
    }

    return { success: true, path: destPath };
  } catch (err) {
    console.error("Error saving profile image:", err);
    return { success: false, message: String(err) };
  }
}

export const handleSaveChatMedia = async (
  event,
  { messageId, chatId, filetype, arrayBuffer, filename },
) => {
  try {
    const buffer = Buffer.from(arrayBuffer);
    const mediaDir = path.join(
      app.getPath("userData"),
      "media",
      "chats",
      String(messageId),
      String(chatId),
    );
    fs.mkdirSync(mediaDir, { recursive: true });
    const ext =
      path.extname(filename) ||
      (filetype === "image" ? ".png" : filetype === "pdf" ? ".pdf" : "");
    const base = path.basename(filename, ext);
    const uniqueFilename = `${Date.now()}-${base}${ext}`;
    const destPath = path.join(mediaDir, uniqueFilename);
    fs.writeFileSync(destPath, buffer);
    return { success: true, key: destPath };
  } catch (err) {
    console.error(err);
    return { success: false, message: String(err) };
  }
};
