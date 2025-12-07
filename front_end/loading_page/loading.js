/* loading.js — robust handling for bfcache/back navigation + polling */

// ---------- Config ----------
const STATUS_POLL_INTERVAL = 1000; // ms
const ANIM_INTERVAL = 300; // ms
const COMPLETE_REDIRECT_DELAY = 600; // ms

// ---------- UI elements ----------
const progressFill = document.getElementById("progressFill");
const percentText = document.getElementById("percentText");
const scanStatus = document.getElementById("scanStatus");

// ---------- quick helpers ----------
const log = (...args) => console.debug("[loading.js]", ...args);

// ---------- Immediate skip: if results already present, go to results ----------
if (localStorage.getItem("screeningResults")) {
  log("screeningResults found in localStorage → skipping loading page");
  // replace so loading page is NOT left in history
  window.location.replace("../third_page/index.html");
  // stop executing further
  throw new Error("Redirecting to results because results exist");
}

// ---------- When page is restored from bfcache (pageshow.persisted) ----------
window.addEventListener("pageshow", (event) => {
  // event.persisted === true when loaded from bfcache in many browsers
  if (event.persisted) {
    log("pageshow: persisted=true (loaded from bfcache). Checking state...");
    // If results already exist — go straight to results
    if (localStorage.getItem("screeningResults")) {
      log("results exist on pageshow → redirecting to results");
      window.location.replace("../third_page/index.html");
      return;
    }
    // If jobId missing, send user back to the second page (safeguard)
    if (!localStorage.getItem("jobId")) {
      log("jobId missing on pageshow → redirecting to second page");
      window.location.replace("../second_page/index.html");
      return;
    }
    // Otherwise continue normally (this is a fresh screening in progress)
    log("pageshow persisted but no results → continuing");
  }
});

// ---------- Also handle navigation via Back/Forward (performance API fallback) ----------
try {
  const navType = (performance.getEntriesByType && performance.getEntriesByType("navigation").length)
    ? performance.getEntriesByType("navigation")[0].type
    : (performance?.navigation?.type ?? null);

  if (navType === "back_forward" || navType === 2) {
    log("Navigation type indicates back/forward navigation:", navType);
    // if results exist, instantly redirect
    if (localStorage.getItem("screeningResults")) {
      log("results exist → replacing to results page");
      window.location.replace("../third_page/index.html");
      throw new Error("Redirecting from back navigation because results exist");
    }
  }
} catch (e) {
  // Not critical if performance API differs between browsers
  log("performance API check error (non-fatal)", e);
}

// ---------- Verify jobId exists ----------
const jobId = localStorage.getItem("jobId");
if (!jobId) {
  log("No jobId found — sending user back to second page");
  window.location.replace("../second_page/index.html");
  throw new Error("No jobId - redirecting");
}

// ---------- Animated status messages ----------
const statusStages = [
  "Initializing screening engine...",
  "Analyzing skills...",
  "Checking education & projects...",
  "Matching skills to job description...",
  "Ranking candidates...",
  "Finalizing report...",
  "Almost done..."
];
let stageIndex = 0;
const statusTimer = setInterval(() => {
  if (stageIndex < statusStages.length) {
    scanStatus.textContent = statusStages[stageIndex++];
  }
}, 1500);

// ---------- Polling for status ----------
let pollTimer = null;
let animTimer = null;
let progress = 0;

async function checkStatusOnce() {
  try {
    const resp = await fetch(`https://smart-hire-nao3.onrender.com/api/status/${jobId}`, { cache: "no-store" });
    if (!resp.ok) {
      log("Status fetch failed status:", resp.status);
      return null;
    }
    const payload = await resp.json();
    log("status response:", payload);
    return payload;
  } catch (err) {
    console.error("Error fetching status:", err);
    return null;
  }
}

async function startPolling() {
  // start progress animation
  animTimer = setInterval(() => {
    // lightly progress up to 92% while waiting
    if (progress < 92) {
      progress += Math.random() * 5;
      progress = Math.min(progress, 92);
    }
    progressFill.style.width = `${Math.floor(progress)}%`;
    percentText.textContent = `${Math.floor(progress)}%`;
  }, ANIM_INTERVAL);

  // first immediate check (don't wait interval)
  const first = await checkStatusOnce();
  if (first && first.status === "completed") {
    onComplete(first.results);
    return;
  }

  // then regular polling
  pollTimer = setInterval(async () => {
    const res = await checkStatusOnce();
    if (!res) return; // transient error, just wait next poll

    if (res.status === "completed") {
      onComplete(res.results);
    } else if (res.status === "invalid_job") {
      // if the job id is invalid - go back
      log("Invalid job id returned by status API → redirecting to second page");
      cleanup();
      window.location.replace("../second_page/index.html");
    } else {
      // still pending; do nothing (animation continues)
      log("Job still pending...");
    }
  }, STATUS_POLL_INTERVAL);
}

function cleanup() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (animTimer) { clearInterval(animTimer); animTimer = null; }
  if (statusTimer) { clearInterval(statusTimer); }
}

function onComplete(results) {
  try {
    cleanup();

    // store results and show full progress
    localStorage.setItem("screeningResults", JSON.stringify(results));
    progress = 100;
    progressFill.style.width = "100%";
    percentText.textContent = "100%";
    scanStatus.textContent = "Completed";

    // Replace current history entry with results page after a short delay so user sees 100%
    setTimeout(() => {
      window.location.replace("../third_page/third_page.html");
    }, COMPLETE_REDIRECT_DELAY);

  } catch (err) {
    console.error("onComplete error:", err);
  }
}

// Start polling loop
startPolling();

// ---------- Extra: If user tries to navigate back while we're running, remove this page from history ----------
window.addEventListener("beforeunload", () => {
  // nothing required here, but keeping placeholder for future needs
  log("beforeunload fired");
});
