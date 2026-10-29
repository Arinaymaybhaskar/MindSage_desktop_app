import { log } from "../log.js";
import { MOOD_WORDS, moodScoreFromWord, moodWord } from "../moodWords.js";
// Single source of truth for the mood taxonomy. Used both to build the prompt
// and to validate/sanitize whatever the model returns, so the two can't drift.
export const MOOD_TAG_GROUPS = {
  Happy: [
    "Playful",
    "Content",
    "Interested",
    "Proud",
    "Accepted",
    "Powerful",
    "Peaceful",
    "Trusting",
    "Optimistic",
  ],
  Sad: ["Lonely", "Vulnerable", "Despair", "Guilty", "Depressed", "Hurt"],
  Angry: [
    "LetDown",
    "Humiliated",
    "Bitter",
    "Mad",
    "Aggressive",
    "Frustrated",
    "Distant",
    "Critical",
  ],
  Fearful: ["Scared", "Anxious", "Insecure", "Weak", "Rejected", "Threatened"],
  Bad: ["Bored", "Busy", "Stressed", "Tired"],
  Surprised: ["Startled", "Confused", "Amazed", "Excited"],
  Disgusted: ["Disapproving", "Disappointed", "Awful", "Repelled"],
};

// Lowercased tag -> canonical tag, for case-insensitive matching.
const CANONICAL_MOOD_TAGS = new Map(
  Object.values(MOOD_TAG_GROUPS)
    .flat()
    .map((t) => [t.toLowerCase(), t]),
);

/** The seven families every feeling word, built-in or the user's own, sits in. */
export const FEELING_FAMILIES = Object.keys(MOOD_TAG_GROUPS);
/** How many of the user's own words the tag prompt offers, most used first. */
export const MAX_CUSTOM_IN_PROMPT = 50;
export const MAX_FEELING_CHARS = 40;

/**
 * Compares feeling words: case and accents on Latin letters make no new word.
 * Marks in other scripts (a Devanagari vowel sign) are part of the word.
 */
export function feelingKey(word) {
  return String(word)
    .normalize("NFD")
    .replace(/(\p{Script=Latin})\p{M}+/gu, "$1")
    .normalize("NFC")
    .trim()
    .toLowerCase();
}

const BUILT_IN_FEELINGS = new Map([
  ...FEELING_FAMILIES.map((f) => [feelingKey(f), { name: f, family: f }]),
  ...Object.entries(MOOD_TAG_GROUPS).flatMap(([family, words]) =>
    words.map((w) => [feelingKey(w), { name: w, family }]),
  ),
]);

/** The built-in word (with its family) a typed word matches, or null. */
export const builtInFeeling = (word) =>
  BUILT_IN_FEELINGS.get(feelingKey(word)) ?? null;

/**
 * A word the user typed, trimmed and otherwise unchanged (any script, RTL
 * included); null when it cannot be one. A comma, ; or | would split it when
 * tags are read back from GROUP_CONCAT or a CSV.
 */
export function cleanFeelingWord(raw) {
  if (typeof raw !== "string") return null;
  const word = raw.trim();
  if (!word || [...word].length > MAX_FEELING_CHARS) return null;
  return /[,;|\p{Cc}]/u.test(word) ? null : word;
}

/**
 * Keep only tags that are in the taxonomy (case-insensitive), de-duplicated and
 * capped at 5. Anything the model invented or a category name is dropped.
 * `custom` is the user's own words offered in the prompt.
 */
export function sanitizeMoodTags(tags, custom = []) {
  if (!Array.isArray(tags)) return [];
  const known = custom.length
    ? new Map([
        ...CANONICAL_MOOD_TAGS,
        ...custom.map((w) => [w.name.toLowerCase(), w.name]),
      ])
    : CANONICAL_MOOD_TAGS;
  const out = [];
  for (const raw of tags) {
    if (typeof raw !== "string") continue;
    const canonical = known.get(raw.trim().toLowerCase());
    if (canonical && !out.includes(canonical)) out.push(canonical);
    if (out.length === 5) break;
  }
  return out;
}

/**
 * What one metadata call asks for (KAN-437): `enrich` is the title and the
 * mood word, `feelings` the feeling words. Either can be left out.
 */
export const ALL_METADATA = Object.freeze({ enrich: true, feelings: true });

/**
 * Parse + validate the AI metadata response. The model answers with one of
 * the five mood words; anything else is unusable. Returns a sanitized object
 * with only the parts asked for ({ title, mood_score } and/or { mood_tags }),
 * or null when the output is unusable (so callers can mark the entry failed
 * instead of silently writing garbage).
 * `custom` is the user's own words that were offered in the prompt.
 */
export function parseJournalMetadata(
  rawResponse,
  custom = [],
  parts = ALL_METADATA,
) {
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

  const out = {};
  if (parts.enrich) {
    out.title =
      typeof parsed.title === "string"
        ? parsed.title.trim().slice(0, MAX_TITLE_CHARS).trim()
        : "";
    out.mood_score = moodScoreFromWord(parsed.mood);
    // Require at least a title and a mood score to consider it usable.
    if (!out.title || out.mood_score == null) return null;
  }
  if (parts.feelings) {
    out.mood_tags = sanitizeMoodTags(parsed.mood_tags, custom);
    // Feelings alone with none usable is nothing to offer.
    if (!parts.enrich && !out.mood_tags.length) return null;
  }
  return out;
}

/** Every journal call and Ask's planning step stop after this many tokens, on either provider. */
export const MAX_OUTPUT_TOKENS = 300;
/**
 * Ask's answer is grammar-forced JSON, so a cap that cuts it leaves JSON that
 * cannot be parsed. About 4,000 characters; each retry after a failed parse
 * gets this much more.
 */
export const ASK_ANSWER_MAX_TOKENS = 1024;
/** A title longer than this is cut before it reaches the journal. */
export const MAX_TITLE_CHARS = 80;

/**
 * The shape getAutoPopulateValues asks for, forced as a grammar on the model.
 * `custom` (the user's own words, at most MAX_CUSTOM_IN_PROMPT) joins the enum.
 * A part left out of `parts` is not in the schema at all.
 */
export function journalMetadataSchema(custom = [], parts = ALL_METADATA) {
  const properties = {};
  if (parts.enrich) {
    properties.title = { type: "string", maxLength: MAX_TITLE_CHARS };
    properties.mood = { enum: MOOD_WORDS };
  }
  if (parts.feelings) {
    properties.mood_tags = {
      type: "array",
      items: {
        enum: [...CANONICAL_MOOD_TAGS.values(), ...custom.map((w) => w.name)],
      },
      minItems: 1,
      maxItems: 5,
    };
  }
  return { type: "object", properties, required: Object.keys(properties) };
}
export const JOURNAL_METADATA_SCHEMA = journalMetadataSchema();

export function getAutoPopulateValues(
  content,
  custom = [],
  parts = ALL_METADATA,
) {
  // Constructs the prompt asking the model to analyze a journal entry and
  // return a structured JSON object: a title and a mood word (`enrich`)
  // and/or feeling words (`feelings`). Callers send this with
  // journalMetadataSchema(custom, parts) so the output always parses;
  // parseJournalMetadata then validates the values. The user's own words are
  // listed under the family they picked, and only when feelings are asked for.
  const steps = [
    "**Read and Analyze:** Carefully read the journal entry provided at the end of this prompt.",
  ];
  const keys = [];
  let tagList = "";
  if (parts.enrich) {
    steps.push(
      "**Create a Title:** Generate a concise, evocative title (3 to 7 words) capturing the main theme or feeling.",
      `**Choose a Mood:** Exactly one of these words:
    * \`${MOOD_WORDS[0]}\`: despair, grief, intense anger
    * \`${MOOD_WORDS[1]}\`: sadness, frustration, anxiety
    * \`${MOOD_WORDS[2]}\`: neutral or mixed feelings
    * \`${MOOD_WORDS[3]}\`: content, hopeful, peaceful
    * \`${MOOD_WORDS[4]}\`: joyful, inspired, triumphant`,
    );
    keys.push("`title` (string)", "`mood` (one of the five mood words above)");
  }
  if (parts.feelings) {
    const groups = Object.fromEntries(
      Object.entries(MOOD_TAG_GROUPS).map(([f, words]) => [
        f,
        [...words, ...custom.filter((w) => w.family === f).map((w) => w.name)],
      ]),
    );
    steps.push(
      '**Select Mood Tags:** Choose 1 to 5 of the most relevant tags. You **MUST** copy tags verbatim from the specific moods listed below (e.g., "Playful", "Lonely", "Frustrated"). Do **not** use the top-level category names (e.g., "Happy", "Sad") and do **not** invent new tags.',
    );
    keys.push("`mood_tags` (array of strings)");
    tagList = `### Allowed Mood Tags (choose only from the specific values):

${JSON.stringify(groups, null, 2)}

`;
  }
  steps.push(
    `**Output:** Return a single valid JSON object with exactly the keys ${keys.join(", ")}. No prose, no markdown, no text outside the JSON.`,
  );
  const prompt = `
You are an expert AI assistant specializing in emotional analysis and sentiment extraction from text. Analyze the user's journal entry and return ONLY a JSON object.

**Instructions:**

${steps.map((step, i) => `${i + 1}.  ${step}`).join("\n")}

${tagList}### Journal Content to Analyze:

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
const SUMMARY_PREAMBLE =
  /^(sure[,!.]?\s*)?(here('s| is)|below is)[^:]{0,60}:\s*/i;

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
  text = text
    .replace(/^```[a-z]*\s*/i, "")
    .replace(/```$/, "")
    .trim();
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
      const word = moodWord(p.mood_score);
      const mood = word ? `Mood: ${word}` : "";
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

// Ask is a reflection tool, not advice or therapy (KAN-51): both Ask prompts
// carry this rule.
export const NO_ADVICE_RULE = `- You are a reflection tool, not a therapist or an adviser. Do NOT give advice, instructions, diagnoses or recommendations about what the user should do. Reflect what the entries show and ask what matters to them. If the user seems to be in danger or distress, say gently that talking to someone they trust or a local support line can help, without giving clinical guidance.`;

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
${NO_ADVICE_RULE}
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
${NO_ADVICE_RULE}
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

export function generateContextTimeAndBaseQueryPrompt(
  userQuery,
  currentTimeISO,
) {
  log.info(currentTimeISO, "current time");
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
