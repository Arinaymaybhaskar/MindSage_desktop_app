import express from "express";
import textResponse from "../../config/geminiConfig.js";
import fs from "fs";
import path from "path";
import authenticateToken from "../../middleware/authenticate.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get current user info
router.post("/text", authenticateToken, async (req, res) => {
    let { prompt, model } = req.body;

    if (!model) model = "gemini-2.5-flash";
    if (!prompt) {
        return res.status(400).json({ error: "Prompt is required" });
    }
    try {
        const data = await textResponse(prompt, model);
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
});

router.post("/analyze-journal", authenticateToken, async (req, res) => {
    let { content } = req.body;
    const model = "gemini-2.5-flash";
    if (!content) return res.status(400).json({ error: "content is required." })
    const prompt = `
    You are a mental health assistant that extracts structured behavioral insights from journal entries.

    Here’s a journal entry:
    """\n${content}\n"""

    Return the following structured JSON:
    {
    sentiment: "",
    mood: "",
    topics: [],
    recurring_thoughts: [],
    cognitive_distortions: [],
    suggested_therapy_technique: ""
    }

    Only return valid JSON. Do not explain.
    `;
    try {
        const rawData = await textResponse(prompt, model);
        const raw = rawData.result;
        console.log("Gemini raw output:", raw);
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}") + 1;
        const jsonString = raw.slice(jsonStart, jsonEnd);
        const data = JSON.parse(jsonString);
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
})
router.post("/analyze-user-patterns", authenticateToken, async (req, res) => {
    // let { content } = req.body;
    const model = "gemini-2.5-flash";
    const {file} = req.body
    // if (!content) return res.status(400).json({ error: "content is required." });
    const journalPath = path.resolve(__dirname, "journals.json");
    
const journalFile = fs.readFileSync(journalPath, "utf8");
    const prompt = [file, `
        Analyze the following list of journal entries from the past 4 weeks.

        Identify and summarize any meaningful patterns across the entries, including:

        1. **Recurring emotional themes** (e.g., anxiety, guilt, overwhelm)
        2. **Frequently mentioned topics or concerns** (e.g., self-worth, relationships, work stress)
        3. **Cognitive distortions** or negative thinking habits that repeat (e.g., catastrophizing, black-and-white thinking, overgeneralization)
        4. **Day-of-week correlations** — determine if certain emotions or thought patterns consistently appear on specific days
        5. **Time-of-day effects** if noticeable
        6. **Shifts or changes in mood, tone, or self-perception** over time

        Then, based on these patterns, suggest:

        - An **evidence-based psychological intervention** that may help the user gain insight or feel better (e.g., cognitive restructuring, mindfulness, journaling prompt, gratitude exercise, thought challenging).
        - A **suggested journaling prompt** or reflective question that would be helpful for the user to explore this pattern further.

        Return the result in the following structured JSON format only:

        {
        "insight": "<A natural language summary of the behavioral and emotional patterns detected>",
        "recurring_themes": ["<theme1>", "<theme2>", ...],
        "cognitive_distortions": ["<distortion1>", "<distortion2>", ...],
        "day_of_week": "<If a particular day is relevant, otherwise 'None'>",
        "time_of_day": "<Morning | Afternoon | Evening | None>",
        "suggested_intervention": "<Short name of the recommended technique>",
        "suggested_prompt": "<A reflective journaling question or exercise to address the pattern>"
        }

        Do not explain or introduce the output. Just return the JSON object.

    `];
    try {
        const rawData = await textResponse(prompt, model);
        const raw = rawData.result;
        console.log("Gemini raw output:", raw);
        const jsonStart = raw.indexOf("{");
        const jsonEnd = raw.lastIndexOf("}") + 1;
        const jsonString = raw.slice(jsonStart, jsonEnd);
        const data = JSON.parse(jsonString);
        res.json({ data });
    } catch (err) {
        res.status(500).json({ error: err.message || "Internal Server Error" });
    }
})

export default router;