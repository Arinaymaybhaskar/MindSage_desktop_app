import { createPlan } from "./planner.js";
import * as toolKit from "./tools.js";
import axios from "axios";

const AI_CORE_URL = process.env.AI_CORE_URL || "http://localhost:3000/api";

const handleQuery = async (userQuery, userId) => {
    const plan = await createPlan(userQuery);

    // --- NEW LOGIC ---
    // Check if the plan is a simple conversational reply.
    if (plan.plan[0]?.tool === 'conversational_reply') {

        // Create a much simpler prompt for a short response.
        const conversationalPrompt = `You are MindSage, a personalized AI reflection. The user just said: "${userQuery}". Respond with a brief, natural, and affirming acknowledgement and nothing else.
        Please respond in a conversational tone, and end with a brief, natural, and affirming acknowledgement. Do not include any other text or instructions.`;
        
        const finalResponse = await axios.post(`${AI_CORE_URL}/chat`, {
            query: conversationalPrompt,
            provider: 'ollama'
        });
        return finalResponse.data;
    }
    // --- END NEW LOGIC ---


    // --- Existing logic for complex queries ---
    const toolResults = {};
    for (const step of plan.plan) {
        if (toolKit[step.tool]) {
            const result = await toolKit[step.tool](step.parameters, userId);
            const resultKey = step.name || `step_${step.step}_result`;
            toolResults[resultKey] = result;
        } else {
            console.warn(`[Agent] Unknown tool: ${step.tool}`);
        }
    }

    const foundArray = Object.values(toolResults).find(value => Array.isArray(value))
    if(foundArray.length === 0) {
        const conversationalPrompt = `You are MindSage, a personalized AI reflection. The user just said: "${userQuery}". Respond with a brief, natural, and affirming acknowledgement and nothing else.
        Please respond in a conversational tone, and end with a brief, natural, and affirming acknowledgement. Do not include any other text or instructions. You don't know the answer you just have to acknowledge the conversation and end with a brief, natural, and affirming .`;
        
        const finalResponse = await axios.post(`${AI_CORE_URL}/chat`, {
            query: conversationalPrompt,
            provider: 'ollama'
        });
        return finalResponse.data;
    };
    const finalContext = Object.entries(toolResults)
        .map(([value]) => `${JSON.stringify(value, null, 2)}`)
        .join("\n\n");


    const finalResponse = await axios.post(`${AI_CORE_URL}/rag`, {
        query: userQuery,
        context: finalContext,
        provider: 'ollama'
    });

    return finalResponse.data;
};

export { handleQuery };
