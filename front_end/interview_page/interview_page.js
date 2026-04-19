document.addEventListener("DOMContentLoaded", () => {

  // ================================
  // STATE
  // ================================
  let questions = [];
  let answers = []; // store all typed answers
  let index = 0;

  // ================================
  // ELEMENTS
  // ================================
  const avatar = document.getElementById("avatar");
  const greetingScreen = document.getElementById("greetingScreen");
  const greetingText = document.getElementById("greetingText");
  const startInterviewBtn = document.getElementById("startInterviewBtn");

  const interviewScreen = document.getElementById("interviewScreen");
  const questionText = document.getElementById("questionText");

  const speakBtn = document.getElementById("speakBtn");
  const submitBtn = document.getElementById("submitBtn");
  const finishBtn = document.getElementById("finishBtn");
  const answerBox = document.getElementById("answerBox");
  const statusText = document.getElementById("status");

  // ================================
  // TEXT TO SPEECH
  // ================================
  function speakText(text) {
    if (!text) return;
    speechSynthesis.cancel();
    const speech = new SpeechSynthesisUtterance(text);
    speech.lang = "en-US";
    speech.onstart = () => avatar.classList.add("speaking");
    speech.onend = () => avatar.classList.remove("speaking");
    speechSynthesis.speak(speech);
  }

  // ================================
  // GREETING
  // ================================
  const candidateName =
  localStorage.getItem("candidateName") || "Candidate";

  const interviewerName = "Vishadhar Reddy";

  const greeting = `Hello ${candidateName}! 
  I am ${interviewerName}, and I will be your AI interviewer today. 
  Relax and answer confidently. Click Start to begin your interview.`;

  greetingText.textContent = greeting;
  speakText(greeting);

  // ================================
  // FETCH QUESTIONS
  // ================================
  function fetchQuestions() {
    const stored = localStorage.getItem("interviewQuestions");
    if (!stored) { alert("Interview questions missing"); return []; }
    return JSON.parse(stored);
  }

  // ================================
  // LOAD QUESTION
  // ================================
  function loadQuestion() {
    if (!questions[index]) return;
    questionText.textContent = questions[index];
    speakText(questions[index]);
    answerBox.value = answers[index] || "";
    statusText.textContent = "";
    submitBtn.textContent = "Submit";
    submitBtn.dataset.state = "submit";
  }

  // ================================
  // START INTERVIEW
  // ================================
  startInterviewBtn.addEventListener("click", () => {
    greetingScreen.style.display = "none";
    interviewScreen.style.display = "block";
    questions = fetchQuestions();
    answers = Array(questions.length).fill("");
    index = 0;
    loadQuestion();
  });

  // ================================
  // SPEAK QUESTION
  // ================================
  speakBtn.addEventListener("click", () => speakText(questions[index]));

  // ================================
  // SUBMIT / NEXT BUTTON
  // ================================
  submitBtn.addEventListener("click", () => {

    const answerText = answerBox.value.trim();
    if (!answerText) { alert("Please type your answer"); return; }

    answers[index] = answerText; // save answer

    submitBtn.textContent = "Next ➜";
    submitBtn.dataset.state = "next";
    statusText.textContent = "Answers saved";
    statusText.style.color = "green";

    // Move to next question
    index++;
    if (index < questions.length) {
      loadQuestion();
    } else {
      questionText.textContent = "Interview completed!";
      speakText("Interview completed. Click finish to submit all answers.");
      submitBtn.style.display = "none";
      speakBtn.style.display = "none";
      answerBox.style.display = "none";
      finishBtn.style.display = "inline-block";
    }
  });

  // ================================
  // FINISH INTERVIEW (BATCH SUBMISSION)
  // ================================
  finishBtn.addEventListener("click", async () => {
    statusText.textContent = "Submitting all answers...";
    statusText.style.color = "red";

    try {
      const res = await fetch("https://ai-recruiter-9i96.onrender.com/api/interview/evaluate-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions, answers })
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Server error: ${res.status} - ${text}`);
      }

      const evaluations = await res.json();
      localStorage.setItem("evaluations", JSON.stringify(evaluations));

      statusText.textContent = "Submission successful!";
      statusText.style.color = "green";

      setTimeout(() => {
        window.location.href = "../result_page/result_page.html";
      }, 1000);

    } catch (err) {
      console.error(err);
      statusText.textContent = "❌ Submission failed: " + err.message;
      statusText.style.color = "red";
    }
  });

});
