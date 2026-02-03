import axios from "axios";
import { z } from "zod";
// import { zodToJsonSchema } from "zod-to-json-schema";

const AI_CORE_URL = process.env.AI_CORE_URL || "http://localhost:3000/api";

// --- ZOD SCHEMA DEFINITION ---
// We keep this schema to validate the AI's output on our end.
const PlanStepSchema = z.object({
    step: z.number().describe("The step number, starting from 1."),
    name: z.string().optional().describe("A variable name to store the result of this step."),
    tool: z.enum([
        "vector_search",
        "get_all_entries",
        "retrieve_challenge_data",
        "conversational_reply"
    ]).describe("The name of the tool to use for this step."),
    parameters: z.record(z.any()).describe("An object of parameters for the tool.")
});

const PlanSchema = z.object({
    plan: z.array(PlanStepSchema).describe("The array of steps to execute.")
});


// --- SIMPLIFIED PROMPT ---
const createPlannerPrompt = (userQuery) => {
    // This prompt is much simpler and clearer for the AI.
    return `You are an expert query planner for a journaling app. Your task is to analyze the user's question and create a step-by-step JSON plan to answer it.

You must choose one or more of the following tools: "vector_search", "get_all_entries", "retrieve_challenge_data", "conversational_reply".
In parameters, you must include a query which contains the search query, and a date filter to limit the search to a specific time period.
Format for parameters (only this format is allowed): { "query": "query", "date_filter": {"from": ISO 8601 timestamp, "to": ISO 8601 timestamp} }
For reference current date and time is: ${new Date().toISOString()}

If you can't find the answer, you must use the "conversational_reply" tool to ask the user for more information.

If you are using vector search, you must not send dateFilters, and you must not use the "get_all_entries" tool.
If you are using the "conversational_reply" tool, you must not use the "vector_search" tool.
If you are using the "get_all_entries" tool, you must not use the "vector_search" tool.

--- EXAMPLES ---
User Question: "How was I last year compared to now?"
Plan:
{
  "plan": [
    { "step": 1, "name": "past_context", "tool": "vector_search", "parameters": { "query": "my general mood and feelings" } },
    { "step": 2, "name": "present_context", "tool": "vector_search", "parameters": { "query": "my general mood and feelings" } }
  ]
}
User Question: "How was I last december?"
Plan:
{
  "plan": [
    { "step": 1, "name": "past_context", "tool": "get_all_entries", "parameters": {date_filter: { "from": "2023-12-01T00:00:00.000Z", "to": "2023-12-31T23:59:59.999Z" } },
  ]
}

User Question: "Cool, thanks"
Plan:
{
  "plan": [
    { "step": 1, "tool": "conversational_reply", "parameters": {} }
  ]
}
---

Now, create a JSON plan for the following user question. Return ONLY the valid JSON object.

User Question: "${userQuery}"
`;
};

const createPlan = async (userQuery) => {
    const prompt = createPlannerPrompt(userQuery);
    try {
        const response = await axios.post(`${AI_CORE_URL}/chat`, {
            query: prompt,
            provider: 'ollama',
            format: 'json' // This still tells Ollama to guarantee JSON output
        });
        

        let planObject;
        try {
            planObject = JSON.parse(response.data);
        } catch (parseError) {
            console.error("[Planner] Failed to parse JSON from AI response.", parseError);
            throw new Error("The AI planner returned invalid JSON.");
        }

        // Validate the parsed object against our Zod schema.
        PlanSchema.parse(planObject);

        return planObject;
    } catch (error) {
        // Check if it's a Zod error and log it specifically
        if (error instanceof z.ZodError) {
            console.error("[Planner] Zod validation failed:", error.errors);
        } else {
            console.error("[Planner] Failed to create or validate a plan:", error);
        }
        throw new Error("The AI planner failed to create a valid plan.");
    }
};

export { createPlan };
