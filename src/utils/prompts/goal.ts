import type { Category } from "../../types/Goals";

export const getGoalPrompt = (ambition: string, categories: Category[]) => {
  const today = new Date();
  const formattedDate = today.toLocaleDateString("en-GB"); // dd/mm/yyyy

  const categoryList = categories
    .map((cat) => `- ${cat.name} (id: ${cat.id})`)
    .join("\n");

  return `
You are an assistant that converts a high-level ambition into exactly 4 specific, achievable goals.

You are given:
- The user's ambition: "${ambition}"
- A list of allowed categories (you must select one of these for each goal):
${categoryList}
- Today's date: ${formattedDate}

Instructions:
1. Each goal must include:
   - title (short and specific)
   - description (a concise explanation of the goal)
   - target_date (realistic, future date in dd-mm-yyyy format)
   - category (!!! MUST BE from the provided category )
   - category_id (!!! MUST match the category with the id in the provided categories)
   - target_value (numeric value)
   - unit (e.g., days, hours, pages, km, sessions, etc.)
2. You must always pick a category from the provided list. Never invent new categories.
3. Goals should be actionable, measurable, and realistic based on the ambition.
4. Output ONLY valid JSON. Do not include markdown code fences or extra text.

Return format example (STRICTLY THIS FORMAT ONLY):
[
  {
    "title": "Read 5 books",
    "description": "Read 5 self-improvement books to enhance personal growth.",
    "target_date": "30-09-2025",
    "category": "Personal Development",
    "category_id": 3,
    "target_value": 5,
    "unit": "books"
  },
  {
    "title": "Run a half marathon",
    "description": "Train and complete a half marathon event.",
    "target_date": "15-11-2025",
    "category": "Health",
    "category_id": 4,
    "target_value": 21,
    "unit": "km"
  },
  {
    "title": "Exercise for 30 minutes, 3 times a week",
    "description": "Exercise to get in better shape",
    "target_date": "15-11-2025",
    "category": "Health",
    "category_id": 4,
    "target_value": 90,
    "unit": "minutes"
  }
  },
  {
    "title": "Exercise for 30 minutes, 3 times a week",
    "description": "Exercise to get in better shape",
    "target_date": "15-11-2025",
    "category": "Health",
    "category_id": 4,
    "target_value": 90,
    "unit": "minutes"
  }
]
`;
};

export const AmbitionNamePrompt = (ambition: string) => {
  return `Summarize the following user goal into a clean, concise title of 5 words or less. Respond with only the title text. Goal: ${ambition}`;
};
