import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url"; // <-- Import the correct function

import authRoutes from "./routes/auth.js";
import journalRoutes from "./routes/journal.js";
import userRoutes from "./routes/user.js";
import notificationRoutes from "./routes/notifications.js";
import geminiRoutes from "./routes/ai/gemini.js";
import insightsRoutes from "./routes/ai/insights.js";
import interventionRoutes from "./routes/ai/interventions.js";
import journalAnalysisRoutes from "./routes/journal-analysis.js";

// --- START: CORRECTED PATH LOGIC ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// This path assumes your .env file is in the root, two levels up from src/server/
const envPath = path.resolve(__dirname, '../../.env'); 
dotenv.config({ path: envPath });
// --- END: CORRECTED PATH LOGIC ---

const app = express();
app.use(
  cors({
    origin: "http://localhost:5173", // frontend origin
    credentials: true,               // allow cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(cookieParser());
app.use("/api/ai/gemini", geminiRoutes);
app.use("/api/ai/insights", insightsRoutes);
app.use("/api/ai/interventions", interventionRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/journals", journalRoutes);
app.use("/api/journal-analysis", journalAnalysisRoutes);
app.use("/api/users", userRoutes);
app.use("/api/notifications", notificationRoutes);


const PORT = process.env.PORT || 4000;

export function startServer() {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}
