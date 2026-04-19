// ==========================
// IMPORTS
// ==========================
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

import Screening from "./models/Screening.js";

dotenv.config();

// ==========================
// APP INIT
// ==========================
const app = express();
const PORT = process.env.PORT || 5000;
const __dirname = path.resolve();

// ==========================
// MIDDLEWARE
// ==========================
app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true }));

// ==========================
// GEMINI CLIENT
// ==========================
if (!process.env.GEMINI_API_KEY) {
  console.error("❌ Missing GEMINI_API_KEY");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

// ==========================
// MONGODB
// ==========================
console.log("🔥 RUNTIME URI:", process.env.MONGO_URI);

mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

// ==========================
// UPLOADS
// ==========================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log("✅ Created uploads folder");
}
app.use("/uploads", express.static(uploadDir));

const storage = multer.memoryStorage();
const upload = multer({ storage });

// ==========================
// JOB QUEUE
// ==========================
let jobs = {}; // jobId → { status, results }

// ==========================
// FILE UPLOAD API
// ==========================
app.post("/api/upload", upload.array("resumes"), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const fileUrls = req.files.map(
    (file, i) =>
      `${req.protocol}://${req.get("host")}/uploads/resume_${Date.now()}_${i}.pdf`
  );

  req.files.forEach((file, i) => {
    fs.writeFileSync(
      path.join(uploadDir, `resume_${Date.now()}_${i}.pdf`),
      file.buffer
    );
  });

  res.json({ urls: fileUrls });
});

// ==========================
// SCREEN INIT API
// ==========================
app.post("/api/screen", async (req, res) => {
  try {
    const jobId = Date.now().toString();
    jobs[jobId] = { status: "pending", results: null };

    res.json({ jobId });
    processScreening(jobId, req.body);

  } catch (err) {
    console.error("SCREEN INIT ERROR:", err);
    res.status(500).json({ error: "Failed to start screening" });
  }
});

// ==========================
// STATUS CHECK API
// ==========================
app.get("/api/status/:jobId", (req, res) => {
  const jobId = req.params.jobId;
  if (!jobs[jobId]) return res.json({ status: "invalid_job" });

  res.json(jobs[jobId]);
});

// ==========================
// BACKGROUND SCREENING
// ==========================
async function processScreening(jobId, body) {
  try {
    console.log(`🔔 processScreening started for jobId=${jobId}`);

    let { jobTitle, skillsRequired, positions, resumes } = body || {};
    const positionsNum = parseInt(positions, 10) || 1;

    const prompt = `
You are an AI HR Screening Assistant.

TASK:
Analyze each resume provided. Extract:
- name
- courseName
- collegeName
- graduation (summarize full education)
- grades: { tenth, intermediate, btech }
- experience summary
- projects (array)
- phone
- email
- address

MATCH SCORE (0–100):
Calculate using:
- Skills Match → 35%
- Experience Relevance → 15%
- Education → 40%
      • 10th → 10%
      • Intermediate → 10%
      • Graduation (degree + CGPA) → 20%
- Projects Relevance → 10%

Grade Quality Guide:
Excellent ≥ 90% or CGPA ≥ 9  
Good 80–89% or CGPA 8–8.9  
Average 70–79% or CGPA 7–7.9  
Weak < 70% or CGPA < 7

Rules for recommended:
- recommended: true → candidate is a strong overall fit (matchScore >= 60)
- recommended: false → candidate is not a strong fit (matchScore < 60)

SKILLS:
Match skillsRequired with resume skills → matchingSkills & missingSkills.

ANALYSIS (STRICT & MANDATORY):
For each candidate you MUST generate a remarks field containing 5–10 complete lines of text.
Never leave remarks empty.
Never use "", null, [], or {} for remarks.
Never skip or shorten remarks even if token limit is low.
Remarks must include:
- Academic evaluation
- College reputation
- Technical skills assessment
- Project depth & relevance
- Experience quality
- Missing skills analysis
- Growth potential
- Job suitability

OUTPUT RULES:
- Strict JSON only.
- No explanations.

FORMAT:
{
  "rankedCandidates": [
    {
      "resumeNumber": 1,
      "name": "",
      "graduation": "",
      "courseName": "",
      "collegeName": "",
      "grades": {
        "tenth": "",
        "intermediate": "",
        "btech": ""
      },
      "experience": "",
      "projects": [],
      "matchScore": 0,
      "matchingSkills": [],
      "missingSkills": [],
      "analysis": "",
      "recommended": false,
      "phone": "",
      "email": "",
      "address": ""
    }
  ]
}

Job Title: ${jobTitle}
Skills Required: ${skillsRequired}

Resumes:
${resumes.map((r, i) => `Resume ${i + 1}:\n${r}`).join("\n\n")}
`;

    const result = await model.generateContent(prompt);
    const outputText = result.response.text();

    const cleaned = outputText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    parsed.rankedCandidates.forEach(c => {
      if (c.courseName || c.collegeName) {
        c.graduation = `${c.courseName || ""} | ${c.collegeName || ""}`.trim();
      }
    });

    parsed.rankedCandidates.sort((a, b) => b.matchScore - a.matchScore);
    const rankedCandidates = parsed.rankedCandidates.slice(0, positionsNum);

    await new Screening({
      jobTitle,
      skillsRequired,
      positions: positionsNum,
      resumes,
      result: { rankedCandidates },
    }).save();

    jobs[jobId] = { status: "completed", results: { rankedCandidates } };

  } catch (err) {
    console.error("PROCESSING ERROR:", err);
    jobs[jobId] = { status: "completed", results: { error: "Processing failed" } };
  }
}

// ======================================================
// INTERVIEW ASSISTANT ROUTES (UNCHANGED)
// ======================================================
app.get("/api/health", (req, res) => {
  res.json({ ok: true, service: "interview-assistant" });
});

app.post("/api/interview/generate", async (req, res) => {
  try {
    const { jobTitle, jobDesc, skillsReq, resumeText } = req.body;

    if (!jobTitle || !jobDesc || !skillsReq || !resumeText) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const prompt = `
You are a senior technical interviewer.

STEP 1 — ANALYZE RESUME:
Determine:
- Candidate full name
- Candidate domain: software / non-software
- Skills mentioned in resume
- Projects listed
- Extra-curricular activities
- Certifications / achievements (if any)

STEP 2 — SKILL MATCHING:
Compare:
- Required Skills: ${skillsReq}
- Resume Skills

Identify:
- matchedSkills
- missingSkills

STEP 3 — QUESTION GENERATION RULES:
Generate EXACTLY 10 interview questions.

MANDATORY STRUCTURE:
1️⃣ Question 1 → Candidate self-introduction
2️⃣ Questions 2–4 → Skill-based questions  
   - If skill exists → depth-based
   - If skill missing → fundamentals
3️⃣ Question 5 → Programming question ONLY IF resume is software-related
4️⃣ Questions 6–7 → Questions from projects mentioned in resume
5️⃣ Question 8 → Extra-curricular / leadership / teamwork
6️⃣ Question 9 → Question from certifications / achievements / internships (if none, ask learning attitude)
7️⃣ Question 10 → Scenario or problem-solving question related to job role

RULES:
- Questions must be clear and realistic
- Increasing difficulty
- No explanations
- Do NOT invent skills or projects
- Programming question must be language/tech from resume

OUTPUT:
STRICT JSON ONLY

FORMAT:
{
  "resumeAnalysis": {
    "candidateName": "",
    "domain": "software | non-software",
    "matchedSkills": [],
    "missingSkills": [],
    "projectsFound": [],
    "extraCurricular": []
  },
  "questions": [
    { "id": 1, "question": "", "category": "introduction", "difficulty": "easy" },
    { "id": 2, "question": "", "category": "skills", "difficulty": "easy" },
    { "id": 3, "question": "", "category": "skills", "difficulty": "medium" },
    { "id": 4, "question": "", "category": "skills", "difficulty": "medium" },
    { "id": 5, "question": "", "category": "programming", "difficulty": "medium" },
    { "id": 6, "question": "", "category": "projects", "difficulty": "medium" },
    { "id": 7, "question": "", "category": "projects", "difficulty": "hard" },
    { "id": 8, "question": "", "category": "extra-curricular", "difficulty": "easy" },
    { "id": 9, "question": "", "category": "achievements", "difficulty": "medium" },
    { "id": 10, "question": "", "category": "scenario", "difficulty": "hard" }
  ]
}

JOB TITLE: ${jobTitle}
JOB DESCRIPTION: ${jobDesc}

RESUME:
${resumeText}
`;

    const result = await model.generateContent(prompt);
    const jsonMatch = result.response.text().match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return res.status(500).json({ error: "Failed to parse interview questions" });
    }

    res.json(JSON.parse(jsonMatch[0]));

  } catch (err) {
    console.error("Interview generation error:", err);
    res.status(500).json({ error: "Interview generation failed" });
  }
});


app.post("/api/interview/evaluate", async (req, res) => {
  try {
    const { question, answerText, resumeContext } = req.body;

    const prompt = `
You are an expert interviewer.

Question:
"${question}"

Candidate Answer:
"${answerText}"

Resume Context:
${JSON.stringify(resumeContext || {})}

Return STRICT JSON ONLY:
{
  "score": 0,
  "feedback": "",
  "strengths": [],
  "weaknesses": []
}
`;

    const result = await model.generateContent(prompt);
    res.json(JSON.parse(result.response.text().match(/\{[\s\S]*\}/)[0]));

  } catch {
    res.status(500).json({ error: "Evaluation failed" });
  }
});

app.post("/api/interview/evaluate-all", async (req, res) => {
  try {
    const { questions, answers } = req.body;

    if (
      !Array.isArray(questions) ||
      !Array.isArray(answers) ||
      questions.length !== answers.length
    ) {
      return res.status(400).json({ error: "Invalid input" });
    }

    let prompt = "You are an expert interviewer. Evaluate each candidate answer individually:\n\n";

    questions.forEach((q, i) => {
      prompt += `Question ${i + 1}: "${q}"\nCandidate Answer: "${answers[i]}"\n\n`;
    });

    prompt += `
Return STRICT JSON ONLY with an array "evaluations":
{
  "evaluations": [
`;

    questions.forEach((_, i) => {
      prompt += `    { "score": 0, "feedback": "", "strengths": [], "weaknesses": [] }${i < questions.length - 1 ? "," : ""}\n`;
    });

    prompt += "  ]\n}";

    const result = await model.generateContent(prompt);
    const outputText = result.response.text() || "";
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


app.post("/api/interview/summary", async (req, res) => {
  try {
    const prompt = `
You are an HR interviewer.

Given these interview evaluations:
${JSON.stringify(req.body.evaluations)}

Return STRICT JSON ONLY:
{
  "finalScore": 0,
  "recommendation": "",
  "summary": "",
  "suggestions": []
}
`;

    const result = await model.generateContent(prompt);
    res.json(JSON.parse(result.response.text().match(/\{[\s\S]*\}/)[0]));

  } catch {
    res.status(500).json({ error: "Summary failed" });
  }
});

// ==========================
// FRONTEND
// ==========================
app.use(express.static(path.join(__dirname, "front_end")));
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "front_end/landing_page/index.html"));
});

// ==========================
// START SERVER
// ==========================
app.listen(PORT, () => {
  console.log(`🚀 Unified Server running on http://localhost:${PORT}`);
});