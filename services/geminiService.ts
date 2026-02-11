
import { GoogleGenAI, Type } from "@google/genai";

// Use process.env.API_KEY directly as required by guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeAnimation = async (frames: string[]) => {
  if (frames.length === 0) return null;

  // Use the first, middle, and last frame to save tokens and provide context
  const selectedIndices = [0, Math.floor(frames.length / 2), frames.length - 1];
  const uniqueIndices = Array.from(new Set(selectedIndices)).filter(i => i >= 0 && i < frames.length);
  
  const parts = uniqueIndices.map(i => ({
    inlineData: {
      mimeType: 'image/jpeg',
      data: frames[i].split(',')[1]
    }
  }));

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          ...parts,
          { text: "These are frames from a stop motion animation. Based on these frames, generate a creative title and a one-sentence story for this animation. Return as JSON." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            story: { type: Type.STRING }
          },
          required: ["title", "story"]
        }
      }
    });

    // The Gemini response.text property is a getter that returns the text string.
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini analysis failed:", error);
    return { title: "My Masterpiece", story: "A beautiful stop motion story." };
  }
};
