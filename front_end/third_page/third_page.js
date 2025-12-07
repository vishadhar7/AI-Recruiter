document.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("ranked-container");

  const uploadedFiles = JSON.parse(localStorage.getItem("uploadedResumes")) || [];
  const data = JSON.parse(localStorage.getItem("screeningResults")) || { rankedCandidates: [] };

  if (!data.rankedCandidates || data.rankedCandidates.length === 0) {
    container.innerHTML = "<p>No candidates found.</p>";
    return;
  }

  const rankedCandidates = data.rankedCandidates.map((candidate, index) => ({
    ...candidate,
    fileURL: uploadedFiles[index] || null
  }));

  rankedCandidates.forEach((candidate, index) => {
    const card = document.createElement("div");
    card.className = "rank-card";

    const missingSkills = candidate.missingSkills?.length
  ? candidate.missingSkills.join(", ")
  : "No missing skills";

    const recommendation = candidate.recommended ? "Recommended" : "Not Recommended";

    card.innerHTML = `
      <div class="info-line">
        <div class="name-block">
          <span class="rank-number">${index + 1}</span>
          <span class="candidate-name">${candidate.name || "Unknown"}</span>
        </div>
        <div class="score">Match Score: <span class="score-number">${candidate.matchScore}%</span></div>
        <div class="missing-skills">
          <span class="label-red">Missing Skills:</span> 
          <span class="white-text">${missingSkills}</span>
        </div>
        <div class="recommendation ${candidate.recommended ? 'recommended' : 'not-recommended'}">${recommendation}</div>
      </div>

      <div class="buttons-line">
        <button class="toggle-btn" onclick="toggleDetails(this)">View Details</button>
        <button class="view-btn" onclick="viewContact(this, ${index})">
          <span class="contact-text">View Contact</span>
        </button>
      </div>

      <div class="details-section">
        <div><strong class="side-heading">Graduation:</strong> ${candidate.graduation || "-"}</div>
        <div><strong class="side-heading">Experience:</strong> ${candidate.experience || "-"}</div>
        <div><strong class="side-heading">Projects:</strong> ${candidate.projects?.length ? candidate.projects.join(", ") : "-"}</div>
        <div><strong class="side-heading">Matched Skills:</strong> ${candidate.matchingSkills?.length ? candidate.matchingSkills.join(", ") : "-"}</div>
        <div><strong class="side-heading remarks">Remarks:</strong> ${candidate.analysis || "No remarks"}</div>
      </div>

      <div class="contact-section">
        <div><strong class="side-heading"><span class="icon">📞</span> Phone:</strong> ${candidate.phone || "-"}</div>
        <div><strong class="side-heading"><span class="icon">✉️</span> Email:</strong> ${candidate.email || "-"}</div>
        <div><strong class="side-heading"><span class="icon">📍</span> Address:</strong> ${candidate.address || "-"}</div>
      </div>
    `;

    container.appendChild(card);
  });

  localStorage.setItem("screeningResults", JSON.stringify({ rankedCandidates }));

  window.toggleDetails = (button) => {
    const details = button.parentElement.nextElementSibling;
    details.classList.toggle("open");
    button.textContent = details.classList.contains("open") ? "Hide Details" : "View Details";
  };

  window.viewContact = (button, index) => {
    const card = container.children[index];
    const contactSection = card.querySelector(".contact-section");
    contactSection.classList.toggle("open");
    const textSpan = button.querySelector(".contact-text");
    textSpan.textContent = contactSection.classList.contains("open") ? "Hide Contact" : "View Contact";
  };
});
