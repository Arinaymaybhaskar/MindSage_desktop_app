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
