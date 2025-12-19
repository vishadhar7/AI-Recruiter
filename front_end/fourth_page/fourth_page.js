document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.querySelector(".start-btn");
  const jobInput = document.querySelector('input[placeholder="Enter job title"]');
  const jdInput = document.querySelector(".jd-box");
  const skillsInput = document.querySelector(".skills-box");
  const resumeInput = document.getElementById("resumeUpload");

  // PDF Text Extraction
  const extractPDF = async (file) => {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(buffer).promise;

    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(" ") + "\n";
    }
    return text;
  };

  startBtn.addEventListener("click", async () => {
    try {
      const jobTitle = jobInput.value.trim();
      const jobDesc = jdInput.value.trim();
      const skillsReq = skillsInput.value.trim();

      if (!jobTitle || !jobDesc || !skillsReq) {
        alert("Please fill all fields!");
        return;
      }

      if (!resumeInput.files.length) {
        alert("Please upload one resume (PDF only)");
        return;
      }

      const file = resumeInput.files[0];
      if (file.type !== "application/pdf") {
        alert("Only PDF files allowed!");
        return;
      }

      const resumeText = await extractPDF(file);

      // ✅ Store for loading page
      localStorage.setItem("jobTitle", jobTitle);
      localStorage.setItem("jobDesc", jobDesc);
      localStorage.setItem("skillsReq", skillsReq);
      localStorage.setItem("resumeText", resumeText);

      // 👉 Redirect to loading page
      window.location.href = "../loading_page_2/loading_page_2.html";

    } catch (err) {
      console.error(err);
      alert("Error extracting resume!");
    }
  });
});
