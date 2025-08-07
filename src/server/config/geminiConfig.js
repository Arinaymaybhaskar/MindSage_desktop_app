import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export default async function textResponse(prompt, model) {
  try {
    const response = await ai.models.generateContent({
      model: model,
      contents: prompt,
    });

    const result = response.candidates[0].content.parts[0].text;
    const usageMetadata = response.usageMetadata;
    return { result, usageMetadata };
  } catch (error) {
    console.error("Gemini error:", error);
    throw new Error("Failed to generate content");
  }
}
