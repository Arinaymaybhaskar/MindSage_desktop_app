// electron/workers/qdrantWorker.js
import { parentPort } from "worker_threads";
import { db } from "./db/connection.js";
import { eventBus } from "./eventBus.js";

// Function to generate embeddings using Ollama
async function generateEmbedding(text) {
    try {
        const response = await fetch('http://localhost:11434/api/embeddings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'nomic-embed-text:v1.5',
                prompt: text
            })
        });

        if (!response.ok) {
            throw new Error(`Ollama embedding API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Error generating embedding:', error);
        throw error;
    }
}

// Function to upsert to Qdrant
async function upsertToQdrant(journal, embedding) {
    try {
        const baseUrl = `http://127.0.0.1:${process.env.QDRANT_HTTP_PORT || 6333}`;
        const client = new (await import('@qdrant/js-client-rest')).QdrantClient({ url: baseUrl });

        const point = {
            id: journal.id,
            vectors: {
                text_embedding: embedding
            },
            payload: {
                user_id: journal.user_id,
                source_type: 'journal',
                source_id: journal.id,
                title: journal.title || '',
                content: journal.content || '',
                mood_score: journal.mood_score || null,
                mood_tags: journal.mood_tags || [],
                category_name: journal.category_name || '',
                created_at: journal.created_at,
                updated_at: journal.updated_at
            }
        };

        await client.upsert('mind_entries', { points: [point] });
        parentPort?.postMessage(`Successfully upserted journal ${journal.id} to Qdrant`);

        return true;
    } catch (error) {
        console.error('Error upserting to Qdrant:', error);
        throw error;
    }
}

async function processJournal(journal) {
    try {
        parentPort?.postMessage(`Processing journal ID: ${journal.id}`);

        // Generate embedding from journal content
        const textToEmbed = journal.title ? `${journal.title} ${journal.content}` : journal.content;
        parentPort?.postMessage(`Generating embedding for journal ${journal.id}...`);

        const embedding = await generateEmbedding(textToEmbed);
        parentPort?.postMessage(`Embedding generated for journal ${journal.id}, length: ${embedding.length}`);

        // Upsert to Qdrant
        await upsertToQdrant(journal, embedding);

        // Update database to mark as synced
        const updateStmt = db.prepare(
            `UPDATE journal_entries SET synced_to_qdrant = 'success' WHERE id = ?`
        );
        updateStmt.run(journal.id);

        parentPort?.postMessage(`Journal ${journal.id} processed and synced successfully`);

    } catch (error) {
        parentPort?.postMessage(`Error processing journal ID: ${journal.id} - ${error.message}`);
        console.error("Error in processJournal:", error);

        // Mark as failed in database
        const updateStmt = db.prepare(
            `UPDATE journal_entries SET synced_to_qdrant = 'failed' WHERE id = ?`
        );
        updateStmt.run(journal.id);
    }
}

// Event-based processing instead of polling
eventBus.on("journal:created", async ({ entry }) => {
    parentPort?.postMessage(`Received journal:created event for journal ${entry.id}`);

    // Mark as pending in database first
    const updateStmt = db.prepare(
        `UPDATE journal_entries SET synced_to_qdrant = 'pending' WHERE id = ?`
    );
    updateStmt.run(entry.id);

    // Process the journal immediately
    await processJournal(entry);
});

// Event for manual sync requests
eventBus.on("journal:sync-requested", async ({ journalId }) => {
    parentPort?.postMessage(`Received manual sync request for journal ${journalId}`);

    const journal = db.prepare(
        `SELECT * FROM journal_entries WHERE id = ?`
    ).get(journalId);

    if (journal) {
        await processJournal(journal);
    } else {
        parentPort?.postMessage(`Journal ${journalId} not found`);
    }
});

// Event for bulk sync requests
eventBus.on("journal:bulk-sync-requested", async () => {
    parentPort?.postMessage("Received bulk sync request");

    const pendingJournals = db.prepare(
        `SELECT * FROM journal_entries WHERE synced_to_qdrant IN ('pending', 'failed') ORDER BY created_at DESC`
    ).all();

    parentPort?.postMessage(`Found ${pendingJournals.length} journals to sync`);

    for (const journal of pendingJournals) {
        try {
            await processJournal(journal);
        } catch (error) {
            parentPort?.postMessage(`Error processing journal ${journal.id}: ${error.message}`);
        }
    }

    parentPort?.postMessage("Bulk sync completed");
});

// Keep the worker alive and listen for events
parentPort?.postMessage("Qdrant worker started with event-based architecture.");

// Optional: Keep a heartbeat to ensure the worker stays alive
setInterval(() => {
    parentPort?.postMessage("Qdrant worker heartbeat");
}, 60000); // Every minute
