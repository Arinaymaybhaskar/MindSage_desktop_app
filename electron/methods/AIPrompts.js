// Single source of truth for the mood taxonomy. Used both to build the prompt
// and to validate/sanitize whatever the model returns, so the two can't drift.
export const MOOD_TAG_GROUPS = {
  Happy: ["Playful", "Content", "Interested", "Proud", "Accepted", "Powerful", "Peaceful", "Trusting", "Optimistic"],
  Sad: ["Lonely", "Vulnerable", "Despair", "Guilty", "Depressed", "Hurt"],
  Angry: ["LetDown", "Humiliated", "Bitter", "Mad", "Aggressive", "Frustrated", "Distant", "Critical"],
  Fearful: ["Scared", "Anxious", "Insecure", "Weak", "Rejected", "Threatened"],
  Bad: ["Bored", "Busy", "Stressed", "Tired"],
  Surprised: ["Startled", "Confused", "Amazed", "Excited"],
  Disgusted: ["Disapproving", "Disappointed", "Awful", "Repelled"],
};

// Lowercased tag -> canonical tag, for case-insensitive matching.
const CANONICAL_MOOD_TAGS = new Map(
  Object.values(MOOD_TAG_GROUPS).flat().map((t) => [t.toLowerCase(), t]),
);

/** Coerce an AI mood score to an integer in [1, 5], or null if unusable. */
export function clampMoodScore(score) {
  const n = Math.round(Number(score));
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(1, n));
}

/**
 * Keep only tags that are in the taxonomy (case-insensitive), de-duplicated and
 * capped at 5. Anything the model invented or a category name is dropped.
 */
export function sanitizeMoodTags(tags) {
  if (!Array.isArray(tags)) return [];
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const canonical = CANONICAL_MOOD_TAGS.get(raw.trim().toLowerCase());
    if (canonical && !out.includes(canonical)) out.push(canonical);
    if (out.length === 5) break;
  }
  return out;
}

/**
 * Parse + validate the AI metadata response. Returns a sanitized
 * { title, mood_score, mood_tags } object, or null when the output is unusable
 * (so callers can mark the entry failed instead of silently writing garbage).
 */
export function parseJournalMetadata(rawResponse) {
  if (!rawResponse) return null;
  let parsed;
  try {
    if (typeof rawResponse === "object") {
      parsed = rawResponse;
    } else {
      // Tolerate models that wrap JSON in prose or ```json fences.
      const match = String(rawResponse).match(/\{[\s\S]*\}/);
      if (!match) return null;
      parsed = JSON.parse(match[0]);
    }
  } catch {
    return null;
  }

  const title = typeof parsed.title === "string" ? parsed.title.trim() : "";
  const mood_score = clampMoodScore(parsed.mood_score);
  const mood_tags = sanitizeMoodTags(parsed.mood_tags);

  // Require at least a title and a mood score to consider it usable.
  if (!title || mood_score == null) return null;
  return { title, mood_score, mood_tags };
}

export function getAutoPopulateValues(content) {
  // Constructs the prompt asking the model to analyze a journal entry and
  // return a structured JSON object with a title, mood score, and tags.
  // Callers send this with Ollama's `format: "json"` so the output is always
  // valid JSON; parseJournalMetadata then validates the shape.
  const moodTagsJson = JSON.stringify(MOOD_TAG_GROUPS, null, 2);
  const prompt = `
You are an expert AI assistant specializing in emotional analysis and sentiment extraction from text. Analyze the user's journal entry and return ONLY a JSON object.

**Instructions:**

1.  **Read and Analyze:** Carefully read the journal entry provided at the end of this prompt.
2.  **Create a Title:** Generate a concise, evocative title (3 to 7 words) capturing the main theme or feeling.
3.  **Assign a Mood Score:** An integer from 1 to 5:
    * \`1\`: Extremely Negative (despair, grief, intense anger)
    * \`2\`: Negative (sadness, frustration, anxiety)
    * \`3\`: Neutral or Mixed Feelings
    * \`4\`: Positive (content, hopeful, peaceful)
    * \`5\`: Extremely Positive (joyful, inspired, triumphant)
4.  **Select Mood Tags:** Choose 1 to 5 of the most relevant tags. You **MUST** copy tags verbatim from the specific moods listed below (e.g., "Playful", "Lonely", "Frustrated"). Do **not** use the top-level category names (e.g., "Happy", "Sad") and do **not** invent new tags.
5.  **Output:** Return a single valid JSON object with exactly the keys \`title\` (string), \`mood_score\` (integer 1-5), and \`mood_tags\` (array of strings). No prose, no markdown, no text outside the JSON.

### Allowed Mood Tags (choose only from the specific values):

${moodTagsJson}

### Required JSON shape:

{
  "title": "A Creative and Representative Title",
  "mood_score": 3,
  "mood_tags": ["RelevantTag1", "RelevantTag2"]
}

### Journal Content to Analyze:

${content}
  `;

  return prompt;
}

export function AISummaryPrompt(entry) {
  const prompt = `You are a summarization engine. Write a 2-4 sentence summary of the journal entry below, capturing the main feelings, events, and key takeaways, written in the third person.

Rules:
- Output ONLY the summary text. No preamble, no headings, no labels, no markdown.
- Do NOT address the user, ask questions, or request clarification or more context.
- Do NOT comment on the quality, length, or repetitiveness of the entry.
- If the entry does not contain enough meaningful content to summarize, output exactly this single word and nothing else: UNSUMMARIZABLE

Journal Entry:
${entry}

Summary:`;
  return prompt;
}

// Phrases that signal the model refused / produced meta-commentary instead of a
// real summary. These are multi-word so they won't false-positive on a genuine
// third-person summary of an entry.
const SUMMARY_REFUSAL_PATTERNS = [
  /provide (more|additional) (context|information|detail)/i,
  /could you (please )?(provide|clarify|specify|elaborate)/i,
  /clarify what you/i,
  /i('| wi)ll do my best to (assist|help)/i,
  /how can i (help|assist)/i,
  /\bas an ai\b/i,
  /i('m| am)( just| only)? an ai/i,
  /no (relevant|meaningful|useful) (information|content|context)/i,
  /(does not|doesn't|do not|don't) (provide|contain) any (useful|relevant|meaningful)/i,
  /it (appears|seems)( that)? you (have )?(provided|entered|written)/i,
  /repetition of (a|the) (sentence|phrase|word|line)/i,
  /what would you like (me|to|us)/i,
  /let me know if you/i,
  /feel free to (ask|provide|share|clarify)/i,
  /unable to (summarize|generate|produce|create)/i,
  /(can ?not|cannot|can't) (summarize|generate|produce|create) a summary/i,
];

// Benign leading preamble the model sometimes adds despite instructions.
const SUMMARY_PREAMBLE = /^(sure[,!.]?\s*)?(here('s| is)|below is)[^:]{0,60}:\s*/i;

/**
 * Validate + clean a raw summary response. Returns the cleaned summary text, or
 * null if the model refused, produced meta-commentary, emitted the
 * UNSUMMARIZABLE sentinel, or returned something too short to be a summary, in
 * which case the caller should mark the summary failed rather than store junk.
 */
export function sanitizeSummary(raw) {
  if (typeof raw !== "string") return null;
  let text = raw.trim();
  // Strip surrounding markdown fences and a benign "Here is a summary:" lead-in.
  text = text.replace(/^```[a-z]*\s*/i, "").replace(/```$/, "").trim();
  text = text.replace(SUMMARY_PREAMBLE, "").trim();

  if (!text) return null;
  if (/^unsummari[sz]able\b/i.test(text)) return null;
  if (text.length < 20) return null; // too short to be a real summary
  if (SUMMARY_REFUSAL_PATTERNS.some((re) => re.test(text))) return null;
  return text;
}

// Minimum words an entry needs before an AI summary is worthwhile. Below this,
// a 3-5 sentence summary would be longer than the entry itself and the model
// tends to pad, echo, or hallucinate, which read as summary "failures".
export const MIN_SUMMARY_WORDS = 25;

/** Count whitespace-delimited words in a string. */
export function countWords(text) {
  if (!text || typeof text !== "string") return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Whether an entry has enough content to be worth summarizing. */
export function isSummarizable(content) {
  return countWords(content) >= MIN_SUMMARY_WORDS;
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

