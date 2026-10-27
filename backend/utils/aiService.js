import { GoogleGenAI } from "@google/genai";

let client = null;
const getClient = () => {
  if (client) return client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  client = new GoogleGenAI({ apiKey: key });
  return client;
};

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export const isAIEnabled = () => !!process.env.GEMINI_API_KEY;

export const parseJSON = (text) => {
  let cleaned = (text || "").trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/```json\n?/g, "").replace(/```\n?$/g, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/```\n?/g, "");
  }
  return JSON.parse(cleaned.trim());
};

export const chatCompletion = async ({ system, user, temperature = 0.7 }) => {
  const c = getClient();
  if (!c) {
    return {
      ok: false,
      content:
        "AI features are disabled - set GEMINI_API_KEY in the backend .env to enable real AI responses."
    };
  }
  try {
    const res = await c.models.generateContent({
      model: MODEL,
      contents: user,
      config: {
        systemInstruction: system,
        temperature,
      },
    });
    return { ok: true, content: (res.text || "").trim() };
  } catch (err) {
    console.error("AI error:", err.message);
    return { ok: false, content: "AI request failed. Please try again later." };
  }
};

export const SYSTEM_PROMPTS = {
  weekly: `You are an AI habit coach writing a personalized weekly review. 
Write a 120 to 180-word report covering wins, struggles, patterns, and encouragement.
Use the user's actual habit names and data provided in the context.
Do not use markdown headers. Write in plain prose with line breaks.`,

  suggestion: `You are an AI habit coach helping a user build new habits.
Based on the user's goals, productive time, and past struggles, provide exactly 3 personalized habit suggestions.
Return ONLY valid JSON in the following exact format, with no markdown code fences or extra text:
[
  {
    "name": "Habit Name",
    "description": "Short description",
    "frequency": "daily",
    "category": "health", // Must be one of: health, fitness, learning, mindfulness, productivity, social, finance, creative, other
    "icon": "🎯", // A single emoji
    "reason": "Why this fits you"
  }
]`,

  recovery: `You are an empathetic habit recovery coach helping a user bounce back after breaking a long streak.
Start with an empathetic opening acknowledging the broken streak.
Then, outline a structured 3-day comeback plan tailored specifically to this habit:
- Day 1: One concrete, easy action to restart.
- Day 2: One concrete action to build momentum.
- Day 3: One concrete action to get back to the original target.
End with a short closing line of encouragement.`,

  chat: `You are an analytical AI habit data assistant. 
Answer the user's question using ONLY the provided habit data context. 
Cite actual habit names, specific days of the week, and completion percentages from the provided context. 
Keep your response strictly grounded in the real numbers and data provided. Do not give generic advice.`,

  morning: `You are an energetic and warm morning habit coach.
Write a short, personalized morning motivation message between 30 and 60 words.
You MUST mention the user's specific habit names and their current streaks from the provided context.
Be warm but not cheesy. Limit yourself to exactly one emoji maximum.`
};