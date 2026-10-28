export const getFollowUpQuestionsPrompt = (context: string) => {
  const prompt = `You are a compassionate and emotionally intelligent journaling assistant. A user has written the following journal entry. Based on it, generate 3 short, thoughtful follow-up questions that invites further reflection or emotional insight. Keep the questions concise: no more than one line.
                    Journal Entry: ${context}
                    Your output should be a JSON array of strings, like this: ["Question 1", "Question 2", "Question 3"]`;
  return prompt;
};
