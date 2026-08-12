import axios from "axios";
import pool from "../db.js"; // if db.js is using default export, and extension is needed
const AI_CORE_URL = process.env.AI_CORE_URL || "http://localhost:3000/api";

// A collection of functions (tools) that the agent can execute.

const vector_search = async ({ query, date_filter }) => {
    // In a real implementation, you would pass the date_filter to the AI Core
    // which would then need to support it in its Qdrant query.
    // For now, we'll just pass the query.
    const response = await axios.post(`${AI_CORE_URL}/search`, {
      query,
      provider: "ollama", // This could also be dynamic
      limit: 5,
      date_filter: date_filter || "all", // This is a placeholder for now
    });
    // We return the actual document content
    return response.data.map(point => point.payload.document);
};

const get_all_entries = async ({ date_filter }, userId) => {

    const fromDate = new Date(date_filter.from);
    const toDate = new Date(date_filter.to);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        throw new Error("Invalid date_filter format. Expecting ISO 8601 timestamps.");
    }

    const result = await pool.query(
        `SELECT content FROM journal_entries 
         WHERE user_id = $1 AND created_at BETWEEN $2 AND $3
         ORDER BY created_at ASC`,
        [userId, fromDate.toISOString(), toDate.toISOString()]
    );

    return result.rows.map(row => row.content);
};

// The toolkit object maps tool names to their functions.
export const toolKit = {
    vector_search,
    get_all_entries,
};
