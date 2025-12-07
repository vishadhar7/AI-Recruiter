import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Analyze resume text and return a score
export const analyzeResume = async (resumeText) => {
  if (!resumeText) return 0;

  // Placeholder: you can replace this with a real OpenAI call
  // Example: use OpenAI to evaluate candidate resume and return a score
  try {
    // Example pseudo AI scoring
    // const response = await client.chat.completions.create({
    //   model: "gpt-4",
    //   messages: [
    //     { role: "system", content: "Score this resume 0-100 based on suitability for software jobs." },
    //     { role: "user", content: resumeText }
    //   ]
    // });
    // const score = parseInt(response.choices[0].message.content);
    
    // For now, just return a random score
    return Math.floor(Math.random() * 101);
  } catch (err) {
    console.error("OpenAI error:", err.message);
    return 0;
  }
};
