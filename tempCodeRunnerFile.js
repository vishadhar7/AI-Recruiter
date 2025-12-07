import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();

// ✅ Enable CORS for all origins
app.use(cors());

app.use(express.json());

// ---------------------------------
// 1. ROOT TEST ROUTE
// ---------------------------------
app.get("/", (req, res) => {
  res.send("Smart Hire Backend is running 🚀");
});

// ---------------------------------
// 2. USERS API (Already exists)
// ---------------------------------
app.get("/api/users", (req, res) => {
  res.json({ message: "GET /api/users works!" });
});

app.post("/api/users", (req, res) => {
  const { name, email, resumeText } = req.body;
  res.json({
    name,
    email,
    resumeText,
    score: Math.floor(Math.random() * 100)
  });
});

// ------------------------------------------------------
// ⭐ 3. FIXED RESUME SCREENING API (NO node-fetch) ⭐
// ------------------------------------------------------
app.post("/api/screen", async (req, res) => {
  try {
    const { jobTitle, skillsRequired, positions, resumes } = req.body;

    if (!jobTitle || !skillsRequired || !positions || !Array.isArray(resumes)) {
      return res.status(400).json({ error: "Missing or invalid required fields" });
    }

    // -------------------------------
    // Build OpenAI Prompt
    // -------------------------------
    const prompt = `
Analyze the following resumes for hiring.

Job Title: ${jobTitle}
Skills Required: ${skillsRequired}
Number of Positions: ${positions}

Resumes:
${resumes.map((r, i) => `Resume ${i + 1}:\n${r}`).join("\n\n")}

Return ONLY valid JSON in this EXACT format:

{
  "rankedCandidates": [
    {
      "resumeNumber": 1,
      "matchScore": 0,
      "matchingSkills": [],
      "missingSkills": [],
      "analysis": "",
      "shortlist": true
    }
  ]
}
`;

    // -------------------------------
    // OpenAI Responses API using native fetch
    // -------------------------------
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: prompt,
        temperature: 0.1,
        response_format: { type: "json_object" } // Forces valid JSON
      })
    });

    const data = await response.json();
    console.log("AI Response:", JSON.stringify(data, null, 2));

    // -------------------------------
    // Safely extract AI JSON text
    // -------------------------------
    const outputText = data.output?.[0]?.content?.[0]?.text;

    if (!outputText) {
      return res.json({ error: "AI returned empty output", raw: data });
    }

    let parsedJSON;
    try {
      parsedJSON = JSON.parse(outputText);
    } catch (err) {
      console.error("JSON PARSE FAILED:", err);
      return res.json({
        error: "AI returned invalid JSON",
        raw: outputText
      });
    }

    // -------------------------------
    // SUCCESS → Send to frontend
    // -------------------------------
    res.json(parsedJSON);

  } catch (err) {
    console.error("SCREENING ERROR:", err);
    res.status(500).json({ error: "Resume screening failed" });
  }
});

// -----------------------------------------
// 4. MONGO + SERVER START
// -----------------------------------------
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB connected successfully");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.error("MongoDB connection failed:", err));
