document.addEventListener("DOMContentLoaded", () => {

  const evaluations = JSON.parse(localStorage.getItem("evaluations") || "[]");

  if (!evaluations.length) {
    document.body.innerHTML = "<h2>No Interview Results Found</h2>";
    return;
  }

  const totalScore = evaluations.reduce((s, e) => s + (e.score || 0), 0);
  const avgScore = totalScore / evaluations.length;
  const finalScore = Math.round(avgScore * 10);
  const isHire = avgScore >= 7;

  document.getElementById("finalScore").textContent = `${finalScore} / 100`;

  const badge = document.getElementById("recommendation");
  badge.textContent = isHire ? "Hire" : "Do Not Hire";
  badge.className = `badge ${isHire ? "hire" : "reject"}`;

  document.getElementById("summaryText").textContent =
    isHire
      ? "Candidate demonstrates strong overall performance and is suitable for the role."
      : "Candidate needs improvement in key skill areas before selection.";

  const weaknesses = evaluations.flatMap(e => e.weaknesses || []);
  const suggestionsList = document.getElementById("suggestionsList");

  [...new Set(weaknesses)].slice(0, 6).forEach(w => {
    const li = document.createElement("li");
    li.textContent = w;
    suggestionsList.appendChild(li);
  });

  const cardsContainer = document.getElementById("evaluationCards");

  evaluations.forEach((e, i) => {
    const card = document.createElement("div");
    card.className = "eval-card";

    card.innerHTML = `
      <h4>Question ${i + 1}</h4>
      <p><strong>Score:</strong> ${e.score}/10</p>
      <p>${e.feedback || "No feedback provided."}</p>

      <h5 class="strength-title">Strengths</h5>
      <ul>${(e.strengths || []).map(s => `<li>${s}</li>`).join("")}</ul>

      <h5 class="weakness-title">Weaknesses</h5>
      <ul>${(e.weaknesses || []).map(w => `<li>${w}</li>`).join("")}</ul>
    `;

    cardsContainer.appendChild(card);
  });

  /* ✅ CORRECT BUTTON LOGIC */

  const viewBtn = document.getElementById("viewAnalysisBtn");
  const hideBtn = document.getElementById("hideAnalysisBtn");
  const analysis = document.getElementById("detailedAnalysis");

  // SHOW analysis (TOP button)
  viewBtn.addEventListener("click", () => {
    analysis.classList.remove("hidden");
    viewBtn.style.display = "none";
    analysis.scrollIntoView({ behavior: "smooth" });
  });

  // HIDE analysis (BOTTOM button)
  hideBtn.addEventListener("click", () => {
    analysis.classList.add("hidden");
    viewBtn.style.display = "inline-block";
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

});
