export type MoodCore =
  | "Happy"
  | "Sad"
  | "Angry"
  | "Fearful"
  | "Bad"
  | "Surprised"
  | "Disgusted";

export type MoodHierarchy = {
  [core in MoodCore]: {
    [secondary: string]: string[];
  };
};

export const moodHierarchy: MoodHierarchy = {
  Happy: {
    Playful: ["Aroused", "Cheeky"],
    Content: ["Free", "Joyful"],
    Interested: ["Curious", "Inquisitive"],
    Proud: ["Successful", "Confident"],
    Accepted: ["Respected", "Valued"],
    Powerful: ["Courageous", "Creative"],
    Peaceful: ["Loving", "Thankful"],
    Trusting: ["Sensitive", "Intimate"],
    Optimistic: ["Hopeful", "Inspired"],
  },
  Sad: {
    Lonely: ["Isolated", "Abandoned"],
    Vulnerable: ["Victimized", "Fragile"],
    Despair: ["Grief", "Powerless"],
    Guilty: ["Ashamed", "Remorseful"],
    Depressed: ["Empty", "Inferior"],
    Hurt: ["Disappointed", "Embarrassed"],
  },
  Angry: {
    LetDown: ["Betrayed", "Resentful"],
    Humiliated: ["Disrespected", "Ridiculed"],
    Bitter: ["Indignant", "Violated"],
    Mad: ["Furious", "Jealous"],
    Aggressive: ["Provoked", "Hostile"],
    Frustrated: ["Annoyed", "Withdrawn"],
    Distant: ["Numb", "Skeptical"],
    Critical: ["Judgmental", "Dismissive"],
  },
  Fearful: {
    Scared: ["Helpless", "Frightened"],
    Anxious: ["Overwhelmed", "Worried"],
    Insecure: ["Inferior", "Inadequate"],
    Weak: ["Worthless", "Insignificant"],
    Rejected: ["Excluded", "Persecuted"],
    Threatened: ["Nervous", "Exposed"],
  },
  Bad: {
    Bored: ["Indifferent", "Apathetic"],
    Busy: ["Pressured", "Rushed"],
    Stressed: ["Overwhelmed", "Out of Control"],
    Tired: ["Sleepy", "Unfocused"],
  },
  Surprised: {
    Startled: ["Shocked", "Dismayed"],
    Confused: ["Disillusioned", "Perplexed"],
    Amazed: ["Astonished", "Awe"],
    Excited: ["Eager", "Energetic"],
  },
  Disgusted: {
    Disapproving: ["Judgmental", "Embarrassed"],
    Disappointed: ["Appalled", "Revolted"],
    Awful: ["Nauseated", "Detestable"],
    Repelled: ["Horrified", "Hesitant"],
  },
};

// Define corresponding colors for each primary mood
export const moodColors = {
  Happy: "#FBBF24", // Amber 400
  Sad: "#60A5FA", // Blue 400
  Angry: "#F87171", // Red 400
  Fearful: "#A78BFA", // Violet 400
  Bad: "#94A3B8", // Slate 400
  Surprised: "#4ADE80", // Green 400
  Disgusted: "#F472B6", // Pink 400
};
