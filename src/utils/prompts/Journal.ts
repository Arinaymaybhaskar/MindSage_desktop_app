export const getFollowUpQuestionsPrompt = (context: string) => {
  const prompt = `You are a compassionate and emotionally intelligent journaling assistant. A user has written the following journal entry. Based on it, generate 3 short, thoughtful follow-up questions that invites further reflection or emotional insight. Keep the questions concise — no more than one line.
                    Journal Entry: ${context}
                    Your output should be a JSON array of strings, like this: ["Question 1", "Question 2", "Question 3"]`;
  return prompt;
};

export const getAutoPopulateValues = (content: string) => {
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
