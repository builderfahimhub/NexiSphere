import { GoogleGenAI } from "@google/genai";

// Standard implementation for Gemini API in AI Studio using the modern SDK
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const getGeminiResponse = async (prompt: string, history: { role: 'user' | 'model', parts: { text: string }[] }[] = []) => {
  try {
    // Format history for the new SDK structure
    // Note: The SDK expect contents array for multi-turn
    const contents = [
      {
        role: "user",
        parts: [{ text: "You are the AI Assistant for NexiSphere, a next-generation social network. Help users with platform features, social tips, and general conversation. Keep responses friendly, tech-forward, and concise." }],
      },
      {
        role: "model",
        parts: [{ text: "Hello! I'm the NexiSphere AI Assistant. How can I help you navigate our social sphere today?" }],
      },
      ...history,
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ];

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: contents as any,
    });

    return response.text || "I'm sorry, I couldn't generate a response.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm sorry, I'm having trouble connecting to my neural net right now. Please try again in a moment!";
  }
};
