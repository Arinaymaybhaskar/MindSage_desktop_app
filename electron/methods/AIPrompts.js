export function getAutoPopulateValues(content) {
  // This function constructs a detailed prompt for an AI model.
  // It asks the AI to analyze the provided 'content' (a journal entry)
  // and return a structured JSON object with a title, mood score, and relevant tags.
  const prompt = `
You are an expert AI assistant specializing in emotional analysis and sentiment extraction from text. Your task is to analyze a user's journal entry and provide a structured JSON output.

**Instructions:**

1.  **Read and Analyze:** Carefully read the journal entry provided at the end of this prompt.
2.  **Create a Title:** Generate a concise, yet evocative title (between 3 and 7 words) that captures the main theme or feeling of the entry.
3.  **Assign a Mood Score:** Assign an overall mood score on a scale of 1 to 5, where:
    * \`1\`: Extremely Negative (e.g., despair, grief, intense anger)
    * \`2\`: Negative (e.g., sadness, frustration, anxiety)
    * \`3\`: Neutral or Mixed Feelings (e.g., confused, surprised, a mix of good and bad)
    * \`4\`: Positive (e.g., content, hopeful, peaceful)
    * \`5\`: Extremely Positive (e.g., joyful, inspired, powerful, triumphant)
4.  **Select Mood Tags:** From the \`moodTags\` structure provided below, select between 1 and 5 of the most relevant mood tags.
    * **IMPORTANT:** You **MUST** choose only from the list of specific moods (e.g., "Playful", "Lonely", "Frustrated"). Do not use the top-level category names (e.g., "Happy", "Sad").
5.  **Format Output:** Your entire response must be a single, valid JSON object matching the \`Required JSON Output Structure\` exactly. Do not include any explanations, greetings, or text outside of the JSON structure.

---

### **Mood Tags (Use for selecting tags):**

\`\`\`json
{
  "Happy": [
    "Playful", "Content", "Interested", "Proud", "Accepted", "Powerful", "Peaceful", "Trusting", "Optimistic"
  ],
  "Sad": [
    "Lonely", "Vulnerable", "Despair", "Guilty", "Depressed", "Hurt"
  ],
  "Angry": [
    "LetDown", "Humiliated", "Bitter", "Mad", "Aggressive", "Frustrated", "Distant", "Critical"
  ],
  "Fearful": [
    "Scared", "Anxious", "Insecure", "Weak", "Rejected", "Threatened"
  ],
  "Bad": [
    "Bored", "Busy", "Stressed", "Tired"
  ],
  "Surprised": [
    "Startled", "Confused", "Amazed", "Excited"
  ],
  "Disgusted": [
    "Disapproving", "Disappointed", "Awful", "Repelled"
  ]
}
\`\`\`

---

### **Required JSON Output Structure:**

\`\`\`json
{
  "title": "A Creative and Representative Title",
  "mood_score": 3,
  "mood_tags": ["RelevantTag1", "RelevantTag2"]
}
\`\`\`

---

### **Journal Content to Analyze:**

${content}
  `;

  // The final prompt string is returned, ready to be sent to the AI.
  return prompt;
};

export function AISummaryPrompt(entry) {
  const prompt = `
  Summarize the following journal entry in 3-5 sentences, capturing the main feelings, events, and key takeaways.
Journal Entry:
  ${entry}
`
  return prompt;
}


// --- 1. Format journal context ---
export function formatContext(context = []) {
  if (!context || context.length === 0) return "";

  return context
    .map((item, index) => {
      const p = item.payload || {};
      const type = p.source_type || "unknown";
      const title = p.title || p.goal_title || "Untitled";
      const text = p.content || p.description || "(no content provided)";
      const mood =
        p.mood_score !== null && p.mood_score !== undefined
          ? `Mood Score: ${p.mood_score}`
          : "";
      const created = p.created_at
        ? new Date(p.created_at).toISOString().split("T")[0]
        : "";

      return `${index + 1}. [${type.toUpperCase()}] ${title} (${created})
${text}
${mood}
Relevance Score: ${item.score?.toFixed?.(3) ?? "N/A"}
`;
    })
    .join("\n");
}

// --- 2. Respond with context ---
export function respondWithContext(entry, context) {
  // REVISED instruction block for clarity and perspective control.
  const followUpInstruction = `
- Include a "suggested_user_prompt" the user can copy/paste and send to the AI next.
- This prompt MUST be written from the USER'S PERSPECTIVE, as a command or question directed AT the AI. It can reference themes from past entries.
- CRITICAL: Do NOT write a question for the user to answer. Write a prompt for the user to SEND.
- Correct Example (from user to AI): "Based on my past entries, what is the biggest obstacle I seem to face when starting new projects?"
- Incorrect Example (from AI to user): "What do you think is your biggest obstacle when starting new projects?"`;

  const formattedEntries = formatContext(context);

  const prompt = `
You are MindSage, an AI journaling assistant that helps users reflect, gain insights, and find emotional or cognitive clarity through their journal entries.

You will be given:
1. A user query (what the user is currently asking or thinking about).
2. Several most relevant past journal entries (these provide emotional and contextual background).

Your job:
- Understand the core meaning of the query.
- Carefully analyze the past entries for emotional patterns, recurring themes, goals, or mindset shifts related to the query.
- Generate a thoughtful, context-aware, and psychologically insightful response (2–3 sentences maximum).
${followUpInstruction}
- Respond strictly in JSON with the following keys:
  {
    "response": "<Your context-aware response as MindSage>",
    "suggested_user_prompt": "<The next prompt for the user to send to you, written from their perspective>"
  }

---

User Query:
"${entry}"

Relevant Journal Entries:
${formattedEntries}

---

MindSage Response (JSON):
`;

  return prompt;
}

// --- 3. Respond without context ---
export function respondWithoutContext(entry) {
  // REVISED instruction block for clarity and perspective control.
  const followUpInstruction = `
- Include a "suggested_user_prompt" the user can copy/paste and send to the AI next.
- This prompt MUST be written from the USER'S PERSPECTIVE, as a command or question directed AT the AI.
- CRITICAL: Do NOT write a question for the user to answer. Write a prompt for the user to SEND.
- Correct Example (from user to AI): "Based on my last entry, help me create a short affirmation."
- Incorrect Example (from AI to user): "What kind of affirmation would feel meaningful to you right now?"`;

  const prompt = `
You are MindSage, an AI journaling assistant that helps users reflect, gain insights, and find emotional or cognitive clarity through their journal entries.

You will be given a user query (what the user is currently asking or thinking about).

Your job:
- Understand the core meaning of the query.
- Generate a thoughtful and reflective response (2–3 sentences maximum).
${followUpInstruction}
- Do NOT make assumptions about the user's past entries.
- Respond strictly in JSON with the following keys:
  {
    "response": "<Your thoughtful response as MindSage>",
    "suggested_user_prompt": "<The next prompt for the user to send to you, written from their perspective>"
  }

---

User Query:
"${entry}"

MindSage Response (JSON):
`;

  return prompt;
}


export function generateContextTimeAndBaseQueryPrompt(userQuery, currentTimeISO) {
  console.log(currentTimeISO, "current time")
  return `
You are MindSage, an AI journaling assistant that analyzes user queries to determine search requirements.

Your tasks:
1. Decide if the query requires past journal entries for context.
2. Decide if the query should be restricted to a specific time range.
3. If a time filter is required, provide "time_filter_from" and "time_filter_to" in ISO 8601 format using the provided current time as reference.
4. Extract the "base_query" for semantic search by removing temporal references (e.g., "last week", "yesterday", "in October") but keep the core meaning.
5. Provide optional notes explaining your reasoning.

Always respond in **strict JSON** with the following keys:

{
  "requires_context": <true|false>,
  "requires_time_filter": <true|false>,
  "time_filter_from": "<ISO string or null>",
  "time_filter_to": "<ISO string or null>",
  "base_query": "<string, cleaned of temporal references>",
  "notes": "<optional short explanation>"
}

Current time reference: "${currentTimeISO}"

User Query:
"${userQuery}"

MindSage Response (JSON):
`;
}

