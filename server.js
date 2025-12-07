import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";

import Screening from "./models/Screening.js";

dotenv.config();
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadDir = path.join(path.resolve(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log("✅ Created uploads folder");
}

// Serve uploaded files
app.use("/uploads", express.static(uploadDir));

// Multer storage setup
const storage = multer.memoryStorage();

const upload = multer({ storage });

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.log("❌ MongoDB Error:", err));

// Root route
app.get("/", (req, res) => res.send("Smart Hire Backend is running 🚀"));


// =====================================================
//  🔥 JOB QUEUE + STATUS STORAGE (ADDED FOR LOADING PAGE)
// =====================================================
let jobs = {}; // jobId → { status: "pending" | "completed", results: {...} }


// =====================================================
//  STEP 1: Your FILE UPLOAD API (NO CHANGES)
// =====================================================
app.post("/api/upload", upload.array("resumes"), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const fileUrls = req.files.map(file => `${req.protocol}://${req.get("host")}/uploads/${file.filename}`);
  res.json({ urls: fileUrls });
});


// =====================================================
//  STEP 2: UPDATED /api/screen → returns jobId immediately
// =====================================================
app.post("/api/screen", async (req, res) => {
  try {
    const jobId = Date.now().toString();
    jobs[jobId] = { status: "pending", results: null };

    // Immediately send jobId → FE goes to loading page
    res.json({ jobId });

    // Process resumes in background
    processScreening(jobId, req.body);

  } catch (err) {
    console.error("SCREEN INIT ERROR:", err);
    res.status(500).json({ error: "Failed to start screening" });
  }
});


// =====================================================
//  STEP 3: NEW /api/status/:jobId for loading page
// =====================================================
app.get("/api/status/:jobId", (req, res) => {
  const jobId = req.params.jobId;

  if (!jobs[jobId]) return res.json({ status: "invalid_job" });

  res.json({
    status: jobs[jobId].status,
    results: jobs[jobId].results || null
  });
});


// =====================================================
//  STEP 4: BACKGROUND PROCESSOR (runs your ORIGINAL logic)
// =====================================================
async function processScreening(jobId, body) {
  try {
    let { jobTitle, skillsRequired, positions, resumes } = body;
    const positionsNum = parseInt(positions, 10);

    // -----------------------------
    // AI PROMPT — SAME AS YOUR CODE
    // -----------------------------
    const prompt = `
You are an AI HR Assistant. For EACH uploaded resume, extract candidate info
and calculate a matchScore between 0 and 100 using the following weights:

- Skills: 40% → based on matching required skills
- Experience relevance: 20% → based on alignment with the job title and responsibilities
- Education: 30% → relevant degrees or certifications
- Projects: 10% → relevant projects or achievements

Also, extract contact details if present:

- Phone number(s)
- Email address(es)
- Address

Return STRICT JSON in this format:

{
  "rankedCandidates": [
    {
      "resumeNumber": 1,
      "name": "",
      "graduation": "",
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

Rules for recommended:
- recommended: true → candidate is a strong overall fit (matchScore >= 60)
- recommended: false → candidate is not a strong fit (matchScore < 60)

Job Title: ${jobTitle}
Skills Required: ${skillsRequired}

Resumes:
${resumes.map((r, i) => `Resume ${i + 1}:\n${r}`).join("\n\n")}
`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }]
      })
    });

    const data = await response.json();
    const outputText = data.output?.[0]?.content?.[0]?.text;

    if (!outputText) {
      jobs[jobId] = { status: "completed", results: { error: "AI returned empty output", raw: data } };
      return;
    }

    const cleanedText = outputText.replace(/^```json/, "").replace(/```$/, "").trim();

    let parsedJSON;
    try { parsedJSON = JSON.parse(cleanedText); }
    catch (err) {
      jobs[jobId] = { status: "completed", results: { error: "Invalid JSON", raw: cleanedText } };
      return;
    }

    // Ranking logic
    parsedJSON.rankedCandidates.sort((a, b) => b.matchScore - a.matchScore);
    const rankedCandidates = parsedJSON.rankedCandidates.slice(0, positionsNum);

    // Save to MongoDB
    const record = new Screening({
      jobTitle,
      skillsRequired,
      positions: positionsNum,
      resumes,
      result: { rankedCandidates }
    });

    await record.save();

    // FINISH JOB
    jobs[jobId] = {
      status: "completed",
      results: { rankedCandidates }
    };

  } catch (err) {
    console.error("PROCESSING ERROR:", err);
    jobs[jobId] = {
      status: "completed",
      results: { error: "Processing failed" }
    };
  }
}


// ======================
app.listen(5000, () => console.log("🚀 Server running on port 5000"));
