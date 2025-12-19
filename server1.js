// server1.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));

// -------------------------
// CONFIG
// -------------------------
const PORT = 5000;
const __dirname = path.resolve();

// OpenAI client
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// -------------------------
// HEALTH CHECK
// -------------------------
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "interview-assistant" });
});

// ======================================================
// 1️⃣ GENERATE INTERVIEW QUESTIONS
// ======================================================
app.post("/api/interview/generate", async (req, res) => {
  try {
    const { jobTitle, jobDesc, skillsReq, resumeText } = req.body;
    if (!jobTitle || !jobDesc || !skillsReq || !resumeText) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const prompt = `
You are a professional technical interviewer.

Generate exactly 8 interview questions based on:
- Job Title: ${jobTitle}
- Job Description: ${jobDesc}
- Skills Required: ${skillsReq}
- Resume: ${resumeText}

Rules:
- Questions must be realistic
- Increasing difficulty
- Short and clear
- No explanations

Return STRICT JSON ONLY:
{
  "questions": [
    { "id": 1, "question": "", "difficulty": "easy|medium|hard" }
  ]
}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 800,
    });

    const outputText = response.output_text || "";
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({
        error: "Failed to parse AI response",
        raw: outputText,
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      sessionId: Date.now().toString(),
      questions: parsed.questions,
    });

  } catch (err) {
    console.error("❌ Generate error:", err);
    res.status(500).json({ error: "Question generation failed" });
  }
});

// ======================================================
// 2️⃣ EVALUATE SINGLE TEXT ANSWER
// ======================================================
app.post("/api/interview/evaluate", async (req, res) => {
  try {
    const { question, answerText, resumeContext } = req.body;

    if (!question || !answerText) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const prompt = `
You are an expert interviewer.

Question:
"${question}"

Candidate Answer:
"${answerText}"

Resume Context:
${JSON.stringify(resumeContext || {})}

Evaluate the answer on:
- Technical correctness
- Clarity
- Depth
- Confidence

Return STRICT JSON ONLY:
{
  "score": 0,
  "feedback": "",
  "strengths": [],
  "weaknesses": []
}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.1,
      max_output_tokens: 400,
    });

    const outputText = response.output_text || "";
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({
        error: "Failed to parse evaluation",
        raw: outputText,
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);

  } catch (err) {
    console.error("❌ Evaluation error:", err);
    res.status(500).json({ error: "Evaluation failed" });
  }
});

// ======================================================
// 3️⃣ EVALUATE ALL ANSWERS (BATCH SUBMISSION) - FIXED
// ======================================================
app.post("/api/interview/evaluate-all", async (req, res) => {
  try {
    const { questions, answers } = req.body;

    if (!Array.isArray(questions) || !Array.isArray(answers) || questions.length !== answers.length) {
      return res.status(400).json({ error: "Invalid input" });
    }

    // Build a prompt to get evaluations for all answers
    let prompt = "You are an expert interviewer. Evaluate each candidate answer individually:\n\n";

    questions.forEach((q, i) => {
      prompt += `Question ${i + 1}: "${q}"\nCandidate Answer: "${answers[i]}"\n\n`;
    });

    prompt += `
Return STRICT JSON ONLY with an array "evaluations" where each element corresponds to a question:
{
  "evaluations": [
`;

    questions.forEach((_, i) => {
      prompt += `    { "score": 0, "feedback": "", "strengths": [], "weaknesses": [] }${i < questions.length - 1 ? "," : ""}\n`;
    });

    prompt += "  ]\n}";

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.1,
      max_output_tokens: 2000,
    });

    const outputText = response.output_text || "";
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({
        error: "Failed to parse batch evaluation",
        raw: outputText,
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed.evaluations);

  } catch (err) {
    console.error("❌ Batch evaluation error:", err);
    res.status(500).json({ error: "Batch evaluation failed" });
  }
});

// ======================================================
// 4️⃣ FINAL INTERVIEW SUMMARY
// ======================================================
app.post("/api/interview/summary", async (req, res) => {
  try {
    const { evaluations } = req.body;

    if (!Array.isArray(evaluations)) {
      return res.status(400).json({ error: "Invalid evaluations" });
    }

    const prompt = `
You are an HR interviewer.

Given these interview evaluations:
${JSON.stringify(evaluations)}

Provide:
- Overall performance summary
- Final score (0-100)
- Hire recommendation (Yes/No)
- Improvement suggestions

Return STRICT JSON ONLY:
{
  "finalScore": 0,
  "recommendation": "",
  "summary": "",
  "suggestions": []
}
`;

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: prompt,
      temperature: 0.2,
      max_output_tokens: 400,
    });

    const outputText = response.output_text || "";
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({
        error: "Failed to parse summary",
        raw: outputText,
      });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);

  } catch (err) {
    console.error("❌ Summary error:", err);
    res.status(500).json({ error: "Summary failed" });
  }
});

// ================================
// STATIC FRONTEND
// ================================
app.use(express.static(path.join(__dirname, "front_end")));

// Fallback for SPA
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "front_end/landing_page/index.html"));
});

// -------------------------
// START SERVER
// -------------------------
app.listen(PORT, () => {
  console.log(`🚀 Interview Assistant running on http://localhost:${PORT}`);
});
