localStorage.removeItem("screeningResults");
localStorage.removeItem("loadingDone");
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.querySelector(".start-btn");
  const jobInput = document.querySelector('input[placeholder="Enter job title"]');
  const skillsInput = document.querySelector('.skills-box');
  const positionsInput = document.querySelector('input[placeholder="Enter number of positions (<=Resumes)"]');
  const fileInput = document.querySelector('input[type="file"]');

  // -------------------------------
  // PDF.js Worker Setup (CDN)
  // -------------------------------
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.15.349/pdf.worker.min.js";
  pdfjsLib.GlobalWorkerOptions.useWorkerFetch = true; // fixes FoxitDingbats warning

  // -------------------------------
  // Extract text from PDF
  // -------------------------------
  const extractTextFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(" ") + "\n";
    }
    return fullText;
  };

  // -------------------------------
  // Start Screening Button
  // -------------------------------
  startBtn.addEventListener("click", async () => {
    try {
      const jobTitle = jobInput.value.trim();
      const skillsRequired = skillsInput.value.trim();
      const positions = positionsInput.value.trim();
      const files = fileInput.files;

      if (!jobTitle || !skillsRequired || !positions) {
        alert("Please fill all fields");
        return;
      }

      if (!files.length) {
        alert("Please upload at least one PDF resume");
        return;
      }

      // Extract text from all uploaded PDFs
      // Extract text from all uploaded PDFs
      const resumes = [];
      const resumeURLs = [];

      for (let file of files) {
        const text = await extractTextFromPDF(file);
        resumes.push(text);
        resumeURLs.push(URL.createObjectURL(file)); // store file URL
      }

      localStorage.setItem("uploadedResumes", JSON.stringify(resumeURLs));


      // Send to backend API
      const response = await fetch("https://ai-recruiter-9i96.onrender.com/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobTitle, skillsRequired, positions, resumes })
      });

      if (!response.ok) throw new Error(`Server returned status ${response.status}`);

      const data = await response.json();

      // Save jobId from backend
      localStorage.setItem("jobId", data.jobId);

      // Redirect to loading page
      window.location.href = "../loading_page/loading.html";


    } catch (err) {
      console.error("Error:", err);
      alert("Failed to process resumes. Check console for details.");
    }
  });
});
