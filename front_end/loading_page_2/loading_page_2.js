const progressFill = document.getElementById("progressFill");
const percentText = document.getElementById("percentText");
const scanStatus = document.getElementById("scanStatus");

let progress = 0;
let apiDone = false;

// ===============================
// FAKE PROGRESS (MAX 95%)
// ===============================
const animTimer = setInterval(() => {
  if (progress < 95 && !apiDone) {
    progress += Math.random() * 4;
    progress = Math.min(progress, 95);

    progressFill.style.width = `${Math.floor(progress)}%`;
    percentText.textContent = `${Math.floor(progress)}%`;
  }
}, 250);

// ===============================
// STATUS MESSAGES
// ===============================
const stages = [
  "Initializing interview engine...",
  "Analyzing resume...",
  "Understanding job role...",
  "Mapping skills...",
  "Generating interview questions...",
  "Finalizing interview..."
];

let stageIndex = 0;
const statusTimer = setInterval(() => {
  if (stageIndex < stages.length) {
    scanStatus.textContent = stages[stageIndex++];
  }
}, 1400);

// ===============================
// CALL INTERVIEW API
// ===============================
async function generateInterview() {
  try {
    const payload = {
      jobTitle: localStorage.getItem("jobTitle"),
      jobDesc: localStorage.getItem("jobDesc"),
      skillsReq: localStorage.getItem("skillsReq"),
      resumeText: localStorage.getItem("resumeText")
    };

    const response = await fetch(
      "https://smart-hire-nao3.onrender.com/api/interview/generate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );

    const data = await response.json();

    if (!response.ok || !Array.isArray(data.questions)) {
      throw new Error("Invalid API response");
    }

    // ===============================
    // STORE INTERVIEW DATA
    // ===============================
    localStorage.setItem(
      "interviewQuestions",
      JSON.stringify(data.questions.map(q => q.question))
    );
    localStorage.setItem("interviewSessionId", data.sessionId);

    // ===============================
    // COMPLETE LOADING
    // ===============================
    apiDone = true;

    clearInterval(animTimer);
    clearInterval(statusTimer);

    progressFill.style.width = "100%";
    percentText.textContent = "100%";
    scanStatus.textContent = "Interview Ready 🎯";

    setTimeout(() => {
      window.location.replace("../interview_page/interview.html");
    }, 800);

  } catch (err) {
    console.error(err);

    apiDone = true;
    clearInterval(animTimer);
    clearInterval(statusTimer);

    scanStatus.textContent = "Failed to prepare interview. Please retry.";
    percentText.textContent = "❌";
  }
}

// ===============================
// START
// ===============================
generateInterview();
