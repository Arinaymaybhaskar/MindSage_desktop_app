import { db } from './connection.js';

/**
 * Associates a local file path with a journal entry.
 * In a real app, you might have a dedicated media table, but for simplicity,
 * we'll add the key directly to the journal_entries table.
 * @param {number} journalId - The ID of the journal entry.
 * @param {string} mediaKey - The local file path to the saved media.
 * @param {'image' | 'audio'} mediaType - The type of media being saved.
 */
export function linkMediaToJournal(journalId, mediaKey, mediaType) {
    try {
        let column;
        if (mediaType === 'image') {
            column = 'image_key';
        } else if (mediaType === 'audio') {
            column = 'audio_key';
        } else {
            throw new Error("Invalid media type specified.");
        }

        // Use a dynamic column name safely.
        // Note: This is safe only because we strictly control the column name above.
        const stmt = db.prepare(`
        UPDATE journal_entries 
        SET ${column} = @mediaKey 
        WHERE id = @journalId
    `);

        const result = stmt.run({ mediaKey, journalId });
        return result.changes > 0;
    } catch (error) {
        console.log(error)
    }
}
