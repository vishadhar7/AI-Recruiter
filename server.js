// server.js
import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Screening from "./models/Screening.js";

dotenv.config();
const app = express();

// ===================================================================
// FIX __dirname FOR ES MODULES (REQUIRED FOR RENDER)
// ===================================================================
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===================================================================
// Middleware
// ===================================================================
app.use(cors());
app.use(express.json());

// ===================================================================
// Ensure uploads folder exists
// ===================================================================
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log("✅ Created uploads folder");
}
app.use("/uploads", express.static(uploadDir)); // Serve uploaded files

// Multer memory storage
const storage = multer.memoryStorage();
const upload = multer({ storage });

console.log("🔥 RUNTIME URI:", process.env.MONGO_URI);

// ===================================================================
// MongoDB connection
// ===================================================================
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

// ===================================================================
// JOB QUEUE
// ===================================================================
let jobs = {}; // jobId → {status, results}

// ===================================================================
// FILE UPLOAD API
// ===================================================================
app.post("/api/upload", upload.array("resumes"), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: "No files uploaded" });
  }

  const timestamp = Date.now();

  const fileUrls = req.files.map(
    (file, i) =>
      `${req.protocol}://${req.get("host")}/uploads/resume_${timestamp}_${i}.pdf`
  );

  req.files.forEach((file, i) => {
    fs.writeFileSync(
      path.join(uploadDir, `resume_${timestamp}_${i}.pdf`),
      file.buffer
    );
  });

  res.json({ urls: fileUrls });
});

// ===================================================================
// SCREEN API
// ===================================================================
app.post("/api/screen", async (req, res) => {
  try {
    const jobId = Date.now().toString();
    jobs[jobId] = { status: "pending", results: null };

    res.json({ jobId }); // Frontend goes to loading page
    processScreening(jobId, req.body); // Background processing
  } catch (err) {
    console.error("SCREEN INIT ERROR:", err);
    res.status(500).json({ error: "Failed to start screening" });
  }
});

// ===================================================================
// STATUS CHECK API
// ===================================================================
app.get("/api/status/:jobId", (req, res) => {
  const jobId = req.params.jobId;

  if (!jobs[jobId]) return res.json({ status: "invalid_job" });

  res.json({
    status: jobs[jobId].status,
    results: jobs[jobId].results,
  });
});

// ===================================================================
// BACKGROUND AI PROCESSOR
// ===================================================================
async function processScreening(jobId, body) {
  try {
    console.log(`🔔 processScreening started for jobId=${jobId}`);
    let { jobTitle, skillsRequired, positions, resumes } = body || {};
    const positionsNum = parseInt(positions, 10) || 1;

    console.log(
      `📥 Received ${
        Array.isArray(resumes) ? resumes.length : 0
      } resumes for "${jobTitle}"`
    );

    // ================ YOUR FULL PROMPT ================
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

Return STRICT JSON in this EXACT format:

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
    // ==================================================

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        input: [
          {
            role: "user",
            content: [{ type: "input_text", text: prompt }],
          },
        ],
      }),
    });

    const data = await response.json();
    console.log("🧠 RAW AI RESPONSE:", data);

    // Extract text properly
    let outputText = "";
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.content && Array.isArray(item.content)) {
          for (const block of item.content) {
            if (block.type === "output_text" && block.text) {
              outputText += block.text;
            }
          }
        }
      }
    }

    if (!outputText) {
      jobs[jobId] = {
        status: "completed",
        results: { error: "AI returned empty output", raw: data },
      };
      return;
    }

    const cleanedText = outputText.replace(/```json|```/g, "").trim();

    let parsedJSON;
    try {
      parsedJSON = JSON.parse(cleanedText);
    } catch (err) {
      jobs[jobId] = {
        status: "completed",
        results: { error: "Invalid JSON", raw: cleanedText },
      };
      return;
    }

    // Rank candidates
    parsedJSON.rankedCandidates.sort((a, b) => b.matchScore - a.matchScore);
    const rankedCandidates = parsedJSON.rankedCandidates.slice(0, positionsNum);

    // Save to DB
    const record = new Screening({
      jobTitle,
      skillsRequired,
      positions: positionsNum,
      resumes,
      result: { rankedCandidates },
    });
    await record.save();

    jobs[jobId] = {
      status: "completed",
      results: { rankedCandidates },
    };

    console.log(`✅ Screening completed for jobId=${jobId}`);
  } catch (err) {
    console.error("PROCESSING ERROR:", err);
    jobs[jobId] = {
      status: "completed",
      results: { error: "Processing failed" },
    };
  }
}

// ===================================================================
// SERVE FRONTEND FILES (Render fix)
// ===================================================================
app.use(express.static(path.join(__dirname, "front_end")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "front_end", "landing_page", "index.html"));
});

// ===================================================================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
