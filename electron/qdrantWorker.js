// electron/workers/qdrantWorker.js
import { parentPort } from "worker_threads";
import { db } from "./db/connection.js";
import { eventBus } from "./eventBus.js";

// Function to test Qdrant connection
async function testQdrantConnection(baseUrl) {
    try {
        const response = await fetch(`${baseUrl}/collections`);
        if (response.ok) {
            const collections = await response.json();
            return true;
        } else {
            console.error(`[QDRANT-WORKER] Qdrant connection failed: ${response.status} ${response.statusText}`);
            return false;
        }
    } catch (error) {
        console.error(`[QDRANT-WORKER] Qdrant connection error:`, error.message);
        return false;
    }
}

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

// Function to update only the payload in Qdrant (without changing the vector)
async function updateQdrantPayload(journal) {
    try {
        const baseUrl = `http://127.0.0.1:${process.env.QDRANT_HTTP_PORT || 6333}`;
        
        // Test connection first
        const connectionOk = await testQdrantConnection(baseUrl);
        if (!connectionOk) {
            throw new Error(`Cannot connect to Qdrant at ${baseUrl}`);
        }
        
        const client = new (await import('@qdrant/js-client-rest')).QdrantClient({ url: baseUrl });

        const payload = {
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
        };
        
        try {
            const existingPoint = await client.retrieve('mind_entries', {
                ids: [journal.id]
            });
            
            if (existingPoint && existingPoint.length > 0) {
                await client.setPayload('mind_entries', {
                    payload,
                    points: [journal.id]
                });
            } else {
                // Generate embedding for the content
                const textToEmbed = journal.title ? `${journal.title} ${journal.content}` : journal.content;
                const embedding = await generateEmbedding(textToEmbed);
                
                // Create the point with vector and payload
                await client.upsert('mind_entries', {
                    points: [{
                        id: journal.id,
                        vectors: {
                            text_embedding: embedding
                        },
                        payload
                    }]
                });
            }
        } catch (checkError) {
            throw checkError;
        }
        
        parentPort?.postMessage(`Successfully updated payload for journal ${journal.id} in Qdrant`);
        return true;
    } catch (error) {
        console.error(`[QDRANT-WORKER] Error updating Qdrant payload for journal ${journal.id}:`, error);
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
    const updateStmt = db.prepare(
        `UPDATE journal_entries SET synced_to_qdrant = 'pending' WHERE id = ?`
    );
    updateStmt.run(entry.id);

    await processJournal(entry);
});

// Listen for messages from main process
parentPort?.on('message', async (message) => {
    console.log('Worker: Received message from main process:', message);
    
    if (message.type === 'journal:sync-requested') {
        const { journalId } = message.data;
        parentPort?.postMessage(`Received manual sync request for journal ${journalId}`);
        console.log(`Worker: Received manual sync request for journal ${journalId}`);

        const journal = db.prepare(
            `SELECT * FROM journal_entries WHERE id = ?`
        ).get(journalId);

        if (journal) {
            parentPort?.postMessage(`Found journal ${journalId} in database, processing...`);
            console.log(`Worker: Found journal ${journalId} in database, processing...`);
            await processJournal(journal);
        } else {
            parentPort?.postMessage(`Journal ${journalId} not found`);
            console.log(`Worker: Journal ${journalId} not found in database`);
        }
    } else if (message.type === 'journal:bulk-sync-requested') {
        parentPort?.postMessage("Received bulk sync request");
        console.log("Worker: Received bulk sync request");

        const pendingJournals = db.prepare(
            `SELECT * FROM journal_entries WHERE synced_to_qdrant IN ('pending', 'failed') ORDER BY created_at DESC`
        ).all();

        parentPort?.postMessage(`Found ${pendingJournals.length} journals to sync`);
        console.log(`Worker: Found ${pendingJournals.length} journals to sync`);

        for (const journal of pendingJournals) {
            try {
                await processJournal(journal);
            } catch (error) {
                parentPort?.postMessage(`Error processing journal ${journal.id}: ${error.message}`);
                console.log(`Worker: Error processing journal ${journal.id}: ${error.message}`);
            }
        }

        parentPort?.postMessage("Bulk sync completed");
        console.log("Worker: Bulk sync completed");
    } else if (message.type === 'journal:qdrant-update-needed') {
        const { entry } = message.data;
        parentPort?.postMessage(`Received journal:qdrant-update-needed message for journal ${entry.id}`);
        
        try {
            // Update only the payload in Qdrant with the new fields
            await updateQdrantPayload(entry);
            parentPort?.postMessage(`Successfully updated Qdrant payload for journal ${entry.id}`);
        } catch (error) {
            parentPort?.postMessage(`Error updating Qdrant payload for journal ${entry.id}: ${error.message}`);
        }
    }
});

// Keep the old eventBus listener for backward compatibility (in case other parts use it)
eventBus.on("journal:sync-requested", async ({ journalId }) => {
    parentPort?.postMessage(`Received manual sync request for journal ${journalId}`);
    console.log(`Worker: Received manual sync request for journal ${journalId}`);

    const journal = db.prepare(
        `SELECT * FROM journal_entries WHERE id = ?`
    ).get(journalId);

    if (journal) {
        parentPort?.postMessage(`Found journal ${journalId} in database, processing...`);
        console.log(`Worker: Found journal ${journalId} in database, processing...`);
        await processJournal(journal);
    } else {
        parentPort?.postMessage(`Journal ${journalId} not found`);
        console.log(`Worker: Journal ${journalId} not found in database`);
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
console.log("Qdrant worker started with event-based architecture.");
console.log("Worker: EventBus listeners registered:", {
    "journal:created": eventBus.listenerCount("journal:created"),
    "journal:sync-requested": eventBus.listenerCount("journal:sync-requested"),
    "journal:bulk-sync-requested": eventBus.listenerCount("journal:bulk-sync-requested")
});

// Optional: Keep a heartbeat to ensure the worker stays alive
setInterval(() => {
    parentPort?.postMessage("Qdrant worker heartbeat");
}, 60000); // Every minute
