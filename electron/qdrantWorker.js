// electron/workers/qdrantWorker.js
import { parentPort } from "worker_threads";
import { db } from "./db/connection.js";
import { eventBus } from "./eventBus.js";
import { randomUUID } from "crypto";

// Function to test Qdrant connection
async function testQdrantConnection(baseUrl) {
  try {
    const response = await fetch(`${baseUrl}/collections`);
    if (response.ok) {
      const collections = await response.json();
      return true;
    } else {
      console.error(
        `[QDRANT-WORKER] Qdrant connection failed: ${response.status} ${response.statusText}`,
      );
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
    const response = await fetch("http://localhost:11434/api/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text:v1.5",
        prompt: text,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Ollama embedding API error: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

// Function to upsert journal entries to Qdrant
async function upsertJournalToQdrant(journal, embedding) {
  try {
    const baseUrl = `http://127.0.0.1:${process.env.QDRANT_HTTP_PORT || 6333}`;
    const client = new (await import("@qdrant/js-client-rest")).QdrantClient({
      url: baseUrl,
    });
    // Reuse the point this entry already owns. Minting a fresh UUID on every
    // call made this an insert rather than an upsert: the previous vector
    // stayed in the collection with nothing pointing at it, so a re-synced
    // entry came back twice in search - once with its current text and once
    // with whatever it said before - and the collection grew without bound.
    const qdrantId = journal.qdrant_id || randomUUID();
    const point = {
      id: qdrantId,
      vectors: {
        text_embedding: embedding,
      },
      payload: {
        user_id: journal.user_id,
        source_type: "journal",
        source_id: journal.id,
        title: journal.title || "",
        content: journal.content || "",
        mood_score: journal.mood_score || null,
        mood_tags: journal.mood_tags || [],
        category_name: journal.category_name || "",
        created_at: journal.created_at,
        updated_at: journal.updated_at,
      },
    };

    // update the qdrant id in sqlite

    await client.upsert("mind_entries", { points: [point] });
    parentPort?.postMessage(
      `Successfully upserted journal ${journal.id} to Qdrant`,
    );
    db.prepare("UPDATE journal_entries SET qdrant_id = ? WHERE id = ?").run(
      qdrantId,
      journal.id,
    );

    return true;
  } catch (error) {
    console.error("Error upserting journal to Qdrant:", error);
    throw error;
  }
}

// Function to upsert goals to Qdrant
async function upsertGoalToQdrant(goal, embedding) {
  try {
    const baseUrl = `http://127.0.0.1:${process.env.QDRANT_HTTP_PORT || 6333}`;
    const client = new (await import("@qdrant/js-client-rest")).QdrantClient({
      url: baseUrl,
    });
    // See upsertJournalToQdrant: reusing the stored id is what makes this
    // an upsert instead of an orphan-leaving insert.
    const qdrantId = goal.qdrant_id || randomUUID();
    const point = {
      id: qdrantId,
      vectors: {
        text_embedding: embedding,
      },
      payload: {
        user_id: goal.user_id,
        source_type: "goal",
        source_id: goal.id,
        title: goal.title || "",
        description: goal.description || "",
        parent_goal_title: goal.parent_goal_title || null,
        current_value: goal.current_value || 0,
        target_value: goal.target_value || 0,
        unit: goal.unit || "",
        status: goal.is_completed ? "completed" : "active",
        is_pinned: goal.is_pinned || 0,
        target_date: goal.target_date,
        completed_date: goal.completed_date,
        created_at: goal.created_at,
      },
    };
    await client.upsert("mind_entries", { points: [point] });
    parentPort?.postMessage(`Successfully upserted goal ${goal.id} to Qdrant`);
    db.prepare("UPDATE goals SET qdrant_id = ? WHERE id = ?").run(
      qdrantId,
      goal.id,
    );

    return true;
  } catch (error) {
    console.error("Error upserting goal to Qdrant:", error);
    throw error;
  }
}

// Function to upsert progress logs to Qdrant
async function upsertProgressLogToQdrant(progressLog, goalTitle, embedding) {
  try {
    const baseUrl = `http://127.0.0.1:${process.env.QDRANT_HTTP_PORT || 6333}`;
    const client = new (await import("@qdrant/js-client-rest")).QdrantClient({
      url: baseUrl,
    });
    // See upsertJournalToQdrant: reusing the stored id is what makes this
    // an upsert instead of an orphan-leaving insert.
    const qdrantId = progressLog.qdrant_id || randomUUID();
    const point = {
      id: qdrantId,
      vectors: {
        text_embedding: embedding,
      },
      payload: {
        user_id: progressLog.user_id || null, // Will be set from goal data
        source_type: "progress_log",
        source_id: progressLog.id,
        goal_id: progressLog.goal_id,
        goal_title: goalTitle || "",
        title: `Progress: ${goalTitle}`,
        description: progressLog.description || "",
        value_logged: progressLog.value || 0,
        unit: progressLog.unit || "", // Will be set from goal data
        created_at: progressLog.logged_at,
      },
    };

    await client.upsert("mind_entries", { points: [point] });
    parentPort?.postMessage(
      `Successfully upserted progress log ${progressLog.id} to Qdrant`,
    );
    db.prepare("UPDATE progress_logs SET qdrant_id = ? WHERE id = ?").run(
      qdrantId,
      progressLog.id,
    );
    return true;
  } catch (error) {
    console.error("Error upserting progress log to Qdrant:", error);
    throw error;
  }
}

// Function to update only the payload in Qdrant (without changing the vector)
async function updateQdrantPayload(entry, sourceType = "journal") {
  try {
    if (!entry.qdrant_id) {
      // No qdrant_id? Treat it like a create
      switch (sourceType) {
        case "journal":
          await upsertJournalToQdrant(entry);
          break;
        case "goal":
          await upsertGoalToQdrant(entry);
          break;
        case "progress_log":
          await upsertProgressLogToQdrant(entry);
          break;
        default:
          throw new Error(`Unknown source type: ${sourceType}`);
      }
      parentPort?.postMessage(
        `Created new Qdrant point for ${sourceType} ${entry.id}`,
      );
      return true;
    }

    const baseUrl = `http://127.0.0.1:${process.env.QDRANT_HTTP_PORT || 6333}`;

    // Test connection first
    const connectionOk = await testQdrantConnection(baseUrl);
    if (!connectionOk) {
      throw new Error(`Cannot connect to Qdrant at ${baseUrl}`);
    }

    const client = new (await import("@qdrant/js-client-rest")).QdrantClient({
      url: baseUrl,
    });

    let payload = {};
    let pointId = "";
    let textToEmbed = "";

    // Create payload based on source type
    switch (sourceType) {
      case "journal":
        pointId = entry.qdrant_id;
        textToEmbed = entry.title
          ? `${entry.title} ${entry.content}`
          : entry.content;
        payload = {
          user_id: entry.user_id,
          source_type: "journal",
          source_id: entry.id,
          title: entry.title || "",
          content: entry.content || "",
          mood_score: entry.mood_score || null,
          mood_tags: entry.mood_tags || [],
          category_name: entry.category_name || "",
          created_at: entry.created_at,
          updated_at: entry.updated_at,
        };
        break;

      case "goal":
        pointId = entry.qdrant_id;
        textToEmbed = entry.title
          ? `${entry.title} ${entry.description || ""}`
          : entry.description;
        payload = {
          user_id: entry.user_id,
          source_type: "goal",
          source_id: entry.id,
          title: entry.title || "",
          description: entry.description || "",
          parent_goal_title: entry.parent_goal_title || null,
          current_value: entry.current_value || 0,
          target_value: entry.target_value || 0,
          unit: entry.unit || "",
          status: entry.is_completed ? "completed" : "active",
          is_pinned: entry.is_pinned || 0,
          target_date: entry.target_date,
          completed_date: entry.completed_date,
          created_at: entry.created_at,
        };
        break;

      case "progress_log":
        pointId = entry.qdrant_id;
        textToEmbed = `${entry.goal_title || ""} ${entry.description || ""}`;
        payload = {
          user_id: entry.user_id || null,
          source_type: "progress_log",
          source_id: entry.id,
          goal_id: entry.goal_id,
          goal_title: entry.goal_title || "",
          title: `Progress: ${entry.goal_title || ""}`,
          description: entry.description || "",
          value_logged: entry.value || 0,
          unit: entry.unit || "",
          created_at: entry.logged_at,
        };
        break;

      default:
        throw new Error(`Unknown source type: ${sourceType}`);
    }

    try {
      const existingPoint = await client.retrieve("mind_entries", {
        ids: [pointId],
      });

      if (existingPoint && existingPoint.length > 0) {
        await client.setPayload("mind_entries", {
          payload,
          points: [pointId],
        });
      } else {
        // Generate embedding for the content
        const embedding = await generateEmbedding(textToEmbed);

        // Create the point with vector and payload
        await client.upsert("mind_entries", {
          points: [
            {
              id: pointId,
              vectors: {
                text_embedding: embedding,
              },
              payload,
            },
          ],
        });
      }
    } catch (checkError) {
      throw checkError;
    }

    parentPort?.postMessage(
      `Successfully updated payload for ${sourceType} ${entry.id} in Qdrant`,
    );
    return true;
  } catch (error) {
    console.error(
      `[QDRANT-WORKER] Error updating Qdrant payload for ${sourceType} ${entry.id}:`,
      error,
    );
    throw error;
  }
}

// Process journal entries
async function processJournal(journal) {
  try {
    parentPort?.postMessage(`Processing journal ID: ${journal.id}`);

    // Generate embedding from journal content
    const textToEmbed = journal.title
      ? `${journal.title} ${journal.content}`
      : journal.content;
    parentPort?.postMessage(
      `Generating embedding for journal ${journal.id}...`,
    );

    const embedding = await generateEmbedding(textToEmbed);
    parentPort?.postMessage(
      `Embedding generated for journal ${journal.id}, length: ${embedding.length}`,
    );

    // Upsert to Qdrant
    await upsertJournalToQdrant(journal, embedding);

    // Update database to mark as synced
    const updateStmt = db.prepare(
      `UPDATE journal_entries SET synced_to_qdrant = 'success' WHERE id = ?`,
    );
    updateStmt.run(journal.id);

    parentPort?.postMessage(
      `Journal ${journal.id} processed and synced successfully`,
    );
  } catch (error) {
    parentPort?.postMessage(
      `Error processing journal ID: ${journal.id} - ${error.message}`,
    );
    console.error("Error in processJournal:", error);

    // Mark as failed in database
    const updateStmt = db.prepare(
      `UPDATE journal_entries SET synced_to_qdrant = 'failed' WHERE id = ?`,
    );
    updateStmt.run(journal.id);
  }
}

// Process goals
async function processGoal(goal) {
  try {
    parentPort?.postMessage(`Processing goal ID: ${goal.id}`);

    // Generate embedding from goal title and description
    const textToEmbed = goal.title
      ? `${goal.title} ${goal.description || ""}`
      : goal.description;
    parentPort?.postMessage(`Generating embedding for goal ${goal.id}...`);

    const embedding = await generateEmbedding(textToEmbed);
    parentPort?.postMessage(
      `Embedding generated for goal ${goal.id}, length: ${embedding.length}`,
    );

    // Upsert to Qdrant
    await upsertGoalToQdrant(goal, embedding);

    // Update database to mark as synced (assuming you add this column)
    try {
      const updateStmt = db.prepare(
        `UPDATE goals SET synced_to_qdrant = 'success' WHERE id = ?`,
      );
      updateStmt.run(goal.id);
    } catch (dbError) {
      // Column might not exist yet, that's okay
      parentPort?.postMessage(
        `Note: Could not update synced_to_qdrant for goal ${goal.id} - column may not exist`,
      );
    }

    parentPort?.postMessage(
      `Goal ${goal.id} processed and synced successfully`,
    );
  } catch (error) {
    parentPort?.postMessage(
      `Error processing goal ID: ${goal.id} - ${error.message}`,
    );
    console.error("Error in processGoal:", error);

    // Mark as failed in database
    try {
      const updateStmt = db.prepare(
        `UPDATE goals SET synced_to_qdrant = 'failed' WHERE id = ?`,
      );
      updateStmt.run(goal.id);
    } catch (dbError) {
      // Column might not exist yet
    }
  }
}

// Process progress logs
async function processProgressLog(progressLog) {
  try {
    parentPort?.postMessage(`Processing progress log ID: ${progressLog.id}`);

    // Get goal information for context
    const goal = db
      .prepare(`SELECT title, unit, user_id FROM goals WHERE id = ?`)
      .get(progressLog.goal_id);

    const goalTitle = goal ? goal.title : "";
    const unit = goal ? goal.unit : "";
    const userId = goal ? goal.user_id : null;

    // Add missing fields to progress log
    progressLog.goal_title = goalTitle;
    progressLog.unit = unit;
    progressLog.user_id = userId;

    // Generate embedding from goal title and progress description
    const textToEmbed = `${goalTitle} ${progressLog.description || ""}`;
    parentPort?.postMessage(
      `Generating embedding for progress log ${progressLog.id}...`,
    );

    const embedding = await generateEmbedding(textToEmbed);
    parentPort?.postMessage(
      `Embedding generated for progress log ${progressLog.id}, length: ${embedding.length}`,
    );

    // Upsert to Qdrant
    await upsertProgressLogToQdrant(progressLog, goalTitle, embedding);

    // Update database to mark as synced (assuming you add this column)
    try {
      const updateStmt = db.prepare(
        `UPDATE progress_logs SET synced_to_qdrant = 'success' WHERE id = ?`,
      );
      updateStmt.run(progressLog.id);
    } catch (dbError) {
      // Column might not exist yet, that's okay
      parentPort?.postMessage(
        `Note: Could not update synced_to_qdrant for progress log ${progressLog.id} - column may not exist`,
      );
    }

    parentPort?.postMessage(
      `Progress log ${progressLog.id} processed and synced successfully`,
    );
  } catch (error) {
    parentPort?.postMessage(
      `Error processing progress log ID: ${progressLog.id} - ${error.message}`,
    );
    console.error("Error in processProgressLog:", error);

    // Mark as failed in database
    try {
      const updateStmt = db.prepare(
        `UPDATE progress_logs SET synced_to_qdrant = 'failed' WHERE id = ?`,
      );
      updateStmt.run(progressLog.id);
    } catch (dbError) {
      // Column might not exist yet
    }
  }
}

// Event-based processing for journals
eventBus.on("journal:created", async ({ entry }) => {
  parentPort?.postMessage(
    `Received journal:created event for journal ${entry.id}`,
  );
  const updateStmt = db.prepare(
    `UPDATE journal_entries SET synced_to_qdrant = 'pending' WHERE id = ?`,
  );
  updateStmt.run(entry.id);

  await processJournal(entry);
});

// Event-based processing for goals
eventBus.on("goal:created", async ({ entry }) => {
  parentPort?.postMessage(`Received goal:created event for goal ${entry.id}`);
  try {
    const updateStmt = db.prepare(
      `UPDATE goals SET synced_to_qdrant = 'pending' WHERE id = ?`,
    );
    updateStmt.run(entry.id);
  } catch (dbError) {
    // Column might not exist yet
  }

  await processGoal(entry);
});

// Event-based processing for progress logs
eventBus.on("progress_log:created", async ({ entry }) => {
  parentPort?.postMessage(
    `Received progress_log:created event for progress log ${entry.id}`,
  );
  try {
    const updateStmt = db.prepare(
      `UPDATE progress_logs SET synced_to_qdrant = 'pending' WHERE id = ?`,
    );
    updateStmt.run(entry.id);
  } catch (dbError) {
    // Column might not exist yet
  }

  await processProgressLog(entry);
});

// Listen for messages from main process
parentPort?.on("message", async (message) => {
  console.log("Worker: Received message from main process:", message);

  if (message.type === "journal:sync-requested") {
    const { journalId } = message.data;
    parentPort?.postMessage(
      `Received manual sync request for journal ${journalId}`,
    );
    console.log(
      `Worker: Received manual sync request for journal ${journalId}`,
    );

    const journal = db
      .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
      .get(journalId);

    if (journal) {
      parentPort?.postMessage(
        `Found journal ${journalId} in database, processing...`,
      );
      console.log(
        `Worker: Found journal ${journalId} in database, processing...`,
      );
      await processJournal(journal);
    } else {
      parentPort?.postMessage(`Journal ${journalId} not found`);
      console.log(`Worker: Journal ${journalId} not found in database`);
    }
  } else if (message.type === "goal:sync-requested") {
    const { goalId } = message.data;
    parentPort?.postMessage(`Received manual sync request for goal ${goalId}`);
    console.log(`Worker: Received manual sync request for goal ${goalId}`);

    const goal = db.prepare(`SELECT * FROM goals WHERE id = ?`).get(goalId);

    if (goal) {
      parentPort?.postMessage(
        `Found goal ${goalId} in database, processing...`,
      );
      console.log(`Worker: Found goal ${goalId} in database, processing...`);
      await processGoal(goal);
    } else {
      parentPort?.postMessage(`Goal ${goalId} not found`);
      console.log(`Worker: Goal ${goalId} not found in database`);
    }
  } else if (message.type === "progress_log:sync-requested") {
    const { progressLogId } = message.data;
    parentPort?.postMessage(
      `Received manual sync request for progress log ${progressLogId}`,
    );
    console.log(
      `Worker: Received manual sync request for progress log ${progressLogId}`,
    );

    const progressLog = db
      .prepare(`SELECT * FROM progress_logs WHERE id = ?`)
      .get(progressLogId);

    if (progressLog) {
      parentPort?.postMessage(
        `Found progress log ${progressLogId} in database, processing...`,
      );
      console.log(
        `Worker: Found progress log ${progressLogId} in database, processing...`,
      );
      await processProgressLog(progressLog);
    } else {
      parentPort?.postMessage(`Progress log ${progressLogId} not found`);
      console.log(
        `Worker: Progress log ${progressLogId} not found in database`,
      );
    }
  } else if (message.type === "journal:bulk-sync-requested") {
    parentPort?.postMessage("Received bulk sync request for journals");
    console.log("Worker: Received bulk sync request for journals");

    // 'not_synced' is the column DEFAULT (see electron/db/connection.js), so
    // it must be listed here. Without it, any row that never reached the
    // per-entry sync path kept the default forever and bulk sync - the only
    // repair mechanism there is - stepped straight over it, leaving the
    // entry permanently absent from semantic search.
    const pendingJournals = db
      .prepare(
        `SELECT * FROM journal_entries WHERE synced_to_qdrant IN ('not_synced', 'pending', 'failed') OR synced_to_qdrant IS NULL ORDER BY created_at DESC`,
      )
      .all();

    parentPort?.postMessage(`Found ${pendingJournals.length} journals to sync`);
    console.log(`Worker: Found ${pendingJournals.length} journals to sync`);

    for (const journal of pendingJournals) {
      try {
        await processJournal(journal);
      } catch (error) {
        parentPort?.postMessage(
          `Error processing journal ${journal.id}: ${error.message}`,
        );
        console.log(
          `Worker: Error processing journal ${journal.id}: ${error.message}`,
        );
      }
    }

    parentPort?.postMessage("Bulk sync for journals completed");
    console.log("Worker: Bulk sync for journals completed");
  } else if (message.type === "goal:bulk-sync-requested") {
    parentPort?.postMessage("Received bulk sync request for goals");
    console.log("Worker: Received bulk sync request for goals");

    const pendingGoals = db
      .prepare(`SELECT * FROM goals ORDER BY created_at DESC`)
      .all();

    parentPort?.postMessage(`Found ${pendingGoals.length} goals to sync`);
    console.log(`Worker: Found ${pendingGoals.length} goals to sync`);

    for (const goal of pendingGoals) {
      try {
        await processGoal(goal);
      } catch (error) {
        parentPort?.postMessage(
          `Error processing goal ${goal.id}: ${error.message}`,
        );
        console.log(
          `Worker: Error processing goal ${goal.id}: ${error.message}`,
        );
      }
    }

    parentPort?.postMessage("Bulk sync for goals completed");
    console.log("Worker: Bulk sync for goals completed");
  } else if (message.type === "progress_log:bulk-sync-requested") {
    parentPort?.postMessage("Received bulk sync request for progress logs");
    console.log("Worker: Received bulk sync request for progress logs");

    const pendingProgressLogs = db
      .prepare(`SELECT * FROM progress_logs ORDER BY logged_at DESC`)
      .all();

    parentPort?.postMessage(
      `Found ${pendingProgressLogs.length} progress logs to sync`,
    );
    console.log(
      `Worker: Found ${pendingProgressLogs.length} progress logs to sync`,
    );

    for (const progressLog of pendingProgressLogs) {
      try {
        await processProgressLog(progressLog);
      } catch (error) {
        parentPort?.postMessage(
          `Error processing progress log ${progressLog.id}: ${error.message}`,
        );
        console.log(
          `Worker: Error processing progress log ${progressLog.id}: ${error.message}`,
        );
      }
    }

    parentPort?.postMessage("Bulk sync for progress logs completed");
    console.log("Worker: Bulk sync for progress logs completed");
  } else if (message.type === "journal:qdrant-update-needed") {
    const { entry } = message.data;
    parentPort?.postMessage(
      `Received journal:qdrant-update-needed message for journal ${entry.id}`,
    );

    try {
      await updateQdrantPayload(entry, "journal");
      parentPort?.postMessage(
        `Successfully updated Qdrant payload for journal ${entry.id}`,
      );
    } catch (error) {
      parentPort?.postMessage(
        `Error updating Qdrant payload for journal ${entry.id}: ${error.message}`,
      );
    }
  } else if (message.type === "goal:qdrant-update-needed") {
    const { entry } = message.data;
    parentPort?.postMessage(
      `Received goal:qdrant-update-needed message for goal ${entry.id}`,
    );

    try {
      await updateQdrantPayload(entry, "goal");
      parentPort?.postMessage(
        `Successfully updated Qdrant payload for goal ${entry.id}`,
      );
    } catch (error) {
      parentPort?.postMessage(
        `Error updating Qdrant payload for goal ${entry.id}: ${error.message}`,
      );
    }
  } else if (message.type === "progress_log:qdrant-update-needed") {
    const { entry } = message.data;
    parentPort?.postMessage(
      `Received progress_log:qdrant-update-needed message for progress log ${entry.id}`,
    );

    try {
      // Add goal context to progress log
      const goal = db
        .prepare(`SELECT title, unit, user_id FROM goals WHERE id = ?`)
        .get(entry.goal_id);

      if (goal) {
        entry.goal_title = goal.title;
        entry.unit = goal.unit;
        entry.user_id = goal.user_id;
      }

      await updateQdrantPayload(entry, "progress_log");
      parentPort?.postMessage(
        `Successfully updated Qdrant payload for progress log ${entry.id}`,
      );
    } catch (error) {
      parentPort?.postMessage(
        `Error updating Qdrant payload for progress log ${entry.id}: ${error.message}`,
      );
    }
  }
});

// Keep the old eventBus listeners for backward compatibility
eventBus.on("journal:sync-requested", async ({ journalId }) => {
  parentPort?.postMessage(
    `Received manual sync request for journal ${journalId}`,
  );
  console.log(`Worker: Received manual sync request for journal ${journalId}`);

  const journal = db
    .prepare(`SELECT * FROM journal_entries WHERE id = ?`)
    .get(journalId);

  if (journal) {
    parentPort?.postMessage(
      `Found journal ${journalId} in database, processing...`,
    );
    console.log(
      `Worker: Found journal ${journalId} in database, processing...`,
    );
    await processJournal(journal);
  } else {
    parentPort?.postMessage(`Journal ${journalId} not found`);
    console.log(`Worker: Journal ${journalId} not found in database`);
  }
});

// Event for bulk sync requests
eventBus.on("journal:bulk-sync-requested", async () => {
  parentPort?.postMessage("Received bulk sync request for journals");

  const pendingJournals = db
    .prepare(
      `SELECT * FROM journal_entries WHERE synced_to_qdrant IN ('not_synced', 'pending', 'failed') OR synced_to_qdrant IS NULL ORDER BY created_at DESC`,
    )
    .all();

  parentPort?.postMessage(`Found ${pendingJournals.length} journals to sync`);

  for (const journal of pendingJournals) {
    try {
      await processJournal(journal);
    } catch (error) {
      parentPort?.postMessage(
        `Error processing journal ${journal.id}: ${error.message}`,
      );
    }
  }

  parentPort?.postMessage("Bulk sync for journals completed");
});

// Keep the worker alive and listen for events
parentPort?.postMessage(
  "Qdrant worker started with event-based architecture for journals, goals, and progress logs.",
);
console.log(
  "Qdrant worker started with event-based architecture for journals, goals, and progress logs.",
);
console.log("Worker: EventBus listeners registered:", {
  "journal:created": eventBus.listenerCount("journal:created"),
  "journal:sync-requested": eventBus.listenerCount("journal:sync-requested"),
  "journal:bulk-sync-requested": eventBus.listenerCount(
    "journal:bulk-sync-requested",
  ),
  "goal:created": eventBus.listenerCount("goal:created"),
  "goal:updated": eventBus.listenerCount("goal:updated"),
  "progress_log:created": eventBus.listenerCount("progress_log:created"),
  "progress_log:updated": eventBus.listenerCount("progress_log:updated"),
});

// Optional: Keep a heartbeat to ensure the worker stays alive
setInterval(() => {
  parentPort?.postMessage("Qdrant worker heartbeat");
}, 60000); // Every minute
