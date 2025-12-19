document.addEventListener("DOMContentLoaded", () => {

  const evaluations = JSON.parse(localStorage.getItem("evaluations") || "[]");

  if (!evaluations.length) {
    document.body.innerHTML = "<h2>No interview results found</h2>";
    return;
  }

  // ================================
  // CALCULATE FINAL SUMMARY
  // ================================
  const totalScore = evaluations.reduce(
    (sum, e) => sum + (e.score ?? 0),
    0
  );

  const averageScore = totalScore / evaluations.length;

  const finalInterviewResult = {
    summary: {
      finalScore: Math.round(averageScore * 10), // out of 100
      recommendation: averageScore >= 5 ? "Hire" : "Do Not Hire",
      summary: "Overall interview assessment based on your answers.",
      suggestions: evaluations
        .flatMap(e => e.weaknesses || [])
        .slice(0, 5)
    },
    evaluations
  };

  // Save (optional but good practice)
  localStorage.setItem(
    "finalInterviewResult",
    JSON.stringify(finalInterviewResult)
  );

  // ================================
  // RENDER RESULTS
  // ================================
  document.getElementById("finalScore").textContent =
    `Final Score: ${finalInterviewResult.summary.finalScore}/100`;

  document.getElementById("recommendation").textContent =
    `Hire Recommendation: ${finalInterviewResult.summary.recommendation}`;

  document.getElementById("summaryText").textContent =
    finalInterviewResult.summary.summary;

  const suggestionsList = document.getElementById("suggestionsList");
  suggestionsList.innerHTML = "";
  finalInterviewResult.summary.suggestions.forEach(s => {
    const li = document.createElement("li");
    li.textContent = s;
    suggestionsList.appendChild(li);
  });

  const container = document.getElementById("evaluationCards");
  container.innerHTML = "";

  finalInterviewResult.evaluations.forEach((e, i) => {
    const card = document.createElement("div");
    card.className = "eval-card";
    card.innerHTML = `
      <h4>Question ${i + 1}</h4>
      <p><strong>Score:</strong> ${e.score}/10</p>
      <p>${e.feedback}</p>

      <strong>Strengths:</strong>
      <ul>${(e.strengths || []).map(s => `<li>${s}</li>`).join("")}</ul>

      <strong>Weaknesses:</strong>
      <ul>${(e.weaknesses || []).map(w => `<li>${w}</li>`).join("")}</ul>
    `;
    container.appendChild(card);
  });

});
