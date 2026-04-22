/* STUDYSPACE — script.js */

// Homepage
function scrollToExams() { var el = document.getElementById("exams"); if (el) el.scrollIntoView({ behavior: "smooth" }); }
function flipCard(card) { card.querySelector(".inner").classList.toggle("flipped"); }

// Data
var revisionCards = [], mcqCards = [], currentCardIndex = 0, currentTab = "revision";
var uploadedFileText = "";
var API_KEY = "AIzaSyA8FPGrHl6mo5xck6CKOjf0dbXQCIywoiU";


// =============================================
// CLEAN TEXT — Remove junk from PPT/PDF
// =============================================
function cleanExtractedText(text) {
  var lines = text.split("\n");
  var cleaned = lines.filter(function (line) {
    var l = line.trim().toLowerCase();
    if (l.length < 3) return false;
    if (/^(slide|page)\s*\d+/i.test(l)) return false;
    if (/^(prof|dr|mr|mrs|ms|sir|ma'am|teacher|faculty|instructor|presented\s+by|prepared\s+by|submitted\s+by|name|roll\s*no|reg\s*no|department|university|college|date|copyright|©|\(c\)|all\s+rights\s+reserved)/i.test(l)) return false;
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(l)) return false;
    if (/^(thank\s*you|questions\??|any\s+questions|end\s+of|references|bibliography)$/i.test(l)) return false;
    if (l.length < 5 && !/[a-z]/i.test(l)) return false;
    return true;
  });
  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}


// =============================================
// FILE UPLOAD
// =============================================
function handleFileUpload(event) {
  var file = event.target.files[0];
  if (!file) return;
  document.getElementById("file-name").textContent = file.name;
  var ext = file.name.split(".").pop().toLowerCase();

  if (ext === "txt") {
    var r = new FileReader();
    r.onload = function (e) {
      uploadedFileText = cleanExtractedText(e.target.result);
      document.getElementById("user-notes").value = uploadedFileText;
      showStatus("Text file loaded!", "success");
    };
    r.readAsText(file);
  } else if (ext === "pdf") {
    showStatus("Reading PDF...", "success");
    var r = new FileReader();
    r.onload = function (e) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      pdfjsLib.getDocument(new Uint8Array(e.target.result)).promise.then(function (pdf) {
        var all = [], done = 0, pages = pdf.numPages;
        for (var i = 1; i <= pages; i++) pdf.getPage(i).then(function (pg) {
          pg.getTextContent().then(function (c) {
            all.push(c.items.map(function (x) { return x.str; }).join(" "));
            if (++done === pages) {
              uploadedFileText = cleanExtractedText(all.join("\n"));
              document.getElementById("user-notes").value = "(PDF loaded: " + file.name + " - " + pages + " pages)\nYou can add extra notes here.";
              showStatus("PDF loaded (" + pages + " pages). Click Generate.", "success");
            }
          });
        });
      }).catch(function () { showStatus("Could not read this PDF.", "error"); });
    };
    r.readAsArrayBuffer(file);
  } else if (ext === "pptx") {
    showStatus("Reading PPTX...", "success");
    var r = new FileReader();
    r.onload = function (e) {
      JSZip.loadAsync(e.target.result).then(function (zip) {
        var slides = [], files = [];
        zip.forEach(function (p) { if (p.match(/ppt\/slides\/slide\d+\.xml/)) files.push(p); });
        files.sort();
        var done = 0;
        files.forEach(function (p, idx) {
          zip.file(p).async("text").then(function (xml) {
            var text = xml.replace(/<a:t>/g, "|||").replace(/<[^>]+>/g, "").replace(/\|\|\|/g, " ").replace(/\s+/g, " ").trim();
            slides[idx] = text;
            if (++done === files.length) {
              uploadedFileText = cleanExtractedText(slides.join("\n\n"));
              document.getElementById("user-notes").value = "(PPTX loaded: " + file.name + " - " + files.length + " slides)\nYou can add extra notes here.";
              showStatus("PPTX loaded (" + files.length + " slides). Click Generate.", "success");
            }
          });
        });
        if (files.length === 0) showStatus("No slides found in PPTX.", "error");
      }).catch(function () { showStatus("Could not read PPTX.", "error"); });
    };
    r.readAsArrayBuffer(file);
  } else {
    showStatus("Unsupported file type. Use PDF, PPTX, or TXT.", "error");
  }
}


// =============================================
// GENERATE
// =============================================
function generateFlashcards() {
  var typedText = document.getElementById("user-notes").value.trim();
  typedText = typedText.replace(/^\(PDF loaded:.*\)/m, "").replace(/^\(PPTX loaded:.*\)/m, "").trim();

  var fullText = "";
  if (uploadedFileText.length > 0) {
    fullText = uploadedFileText;
    if (typedText.length > 10) fullText += "\n\nAdditional notes:\n" + typedText;
  } else {
    fullText = typedText;
  }

  if (fullText.length < 30) { showStatus("Please enter notes or upload a file first.", "error"); return; }
  showLoading(true); hideStatus();
  document.getElementById("generate-btn").disabled = true;

  callGeminiAPI(fullText).then(function (res) {
    revisionCards = res.revision; mcqCards = res.mcq;
    fetchCardImages().then(function () {
      finish(revisionCards.length + " Revision + " + mcqCards.length + " MCQ flashcards generated with AI!");
    });
  }).catch(function (err) {
    console.error("Gemini API failed:", err);
    // Show clear error — don't silently fall back to bad content
    showLoading(false);
    document.getElementById("generate-btn").disabled = false;
    showStatus("AI generation failed: " + err.message + ". Check your internet connection and try again.", "error");
  });
}

function finish(msg) {
  currentCardIndex = 0; currentTab = "revision";
  showLoading(false); document.getElementById("generate-btn").disabled = false;
  showStatus(msg, "success"); displayFlashcards();
}


// =============================================
// GEMINI API — NotebookLM-style quality prompt
// =============================================
function callGeminiAPI(text) {
  var url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + API_KEY;

  var prompt = "You are an AI study assistant similar to Google NotebookLM. "
    + "A student has shared their study material with you. "
    + "You must THOROUGHLY STUDY every concept, definition, process, and fact in the material before generating questions.\n\n"

    + "YOUR TASK: Create a high-quality revision set — the kind a professor would prepare for an exam.\n\n"

    + "STRICT RULES:\n"
    + "- ONLY ask about concepts explicitly present in the material. Do NOT add outside knowledge.\n"
    + "- NEVER use vague phrasing like 'Explain this topic' or 'What do you know about'. Every question must be precise.\n"
    + "- IGNORE metadata: teacher names, slide numbers, dates, 'thank you', copyright, university names.\n"
    + "- Questions must sound like a PROFESSOR asking in a viva — formal, clear, specific.\n\n"

    + "PART A — 20 REVISION FLASHCARDS:\n"
    + "Each has 'question' and 'answer'. Use these EXACT question patterns:\n"
    + "  - 'Define [specific term].' (for key terms)\n"
    + "  - 'What is the purpose of [X]?' (for tools/techniques)\n"
    + "  - 'Differentiate between [X] and [Y].' (for similar concepts)\n"
    + "  - 'List the key characteristics of [X].' (for features)\n"
    + "  - 'What role does [X] play in [Y]?' (for relationships)\n"
    + "  - 'Why is [X] important in [context]?' (for significance)\n"
    + "  - 'What are the steps involved in [process]?' (for procedures)\n"
    + "  - 'Name the types/categories of [X].' (for classifications)\n"
    + "Answers: 1-3 sentences, factual, well-structured. Start with the key point.\n"
    + "For exactly 5 of these 20 cards, add 'image_topic' with a REAL Wikipedia article title.\n\n"

    + "PART B — 10 MCQ FLASHCARDS (competitive exam quality):\n"
    + "Each has 'question', 'options' (4 strings: 'A. ...', 'B. ...', 'C. ...', 'D. ...'), 'correct' (letter only), 'explanation'.\n\n"
    + "MCQ QUALITY RULES:\n"
    + "- The question must test a SPECIFIC fact or concept from the material.\n"
    + "- All 4 options MUST be real, plausible terms/concepts from the same domain.\n"
    + "- FORBIDDEN options: 'None of the above', 'All of the above', 'Not applicable', or any filler.\n"
    + "- Wrong options should be common confusions or related terms that a student might mistakenly choose.\n"
    + "- Keep each option SHORT (under 15 words). Do not put entire paragraphs as options.\n"
    + "- The 'explanation' should say: 'Correct: [why A is right]. [Why one wrong option is wrong].'\n\n"

    + "EXAMPLE of a good MCQ:\n"
    + '{"question":"Which protocol operates at the Transport layer of the OSI model?","options":["A. TCP","B. HTTP","C. ARP","D. ICMP"],"correct":"A","explanation":"TCP operates at the Transport layer, providing reliable data delivery. HTTP works at the Application layer, ARP at the Data Link layer."}\n\n'

    + "EXAMPLE of a BAD MCQ (do NOT do this):\n"
    + '{"question":"Explain digital forensics","options":["A. Long paragraph...","B. Not applicable","C. None of the above","D. All of the above"]}\n\n'

    + "OUTPUT: Return ONLY valid JSON, no markdown, no code fences:\n"
    + '{"revision":[{"question":"...","answer":"..."}],"mcq":[{"question":"...","options":["A. ...","B. ...","C. ...","D. ..."],"correct":"A","explanation":"..."}]}\n'
    + "For 5 revision cards with images, add: \"image_topic\":\"Wikipedia_Article_Title\"\n\n"

    + "=== STUDY MATERIAL START ===\n" + text + "\n=== STUDY MATERIAL END ===";

  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192
      }
    })
  })
    .then(function (r) {
      if (!r.ok) {
        return r.text().then(function (body) {
          throw new Error("API returned " + r.status + ": " + body.substring(0, 200));
        });
      }
      return r.json();
    })
    .then(function (data) {
      if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
        throw new Error("Empty response from AI. The content may have been blocked.");
      }
      var raw = data.candidates[0].content.parts[0].text;
      raw = raw.replace(/```json/g, "").replace(/```/g, "").trim();
      var res = JSON.parse(raw);
      if (!res.revision || !res.mcq) throw new Error("AI returned unexpected format");
      var revision = res.revision.filter(function (c) { return c.question && c.answer; });
      var mcq = res.mcq.filter(function (c) { return c.question && c.options && c.options.length === 4 && c.correct && c.explanation; });
      if (revision.length === 0 && mcq.length === 0) throw new Error("AI could not generate questions from this content");
      return { revision: revision, mcq: mcq };
    });
}


// =============================================
// FETCH WIKIPEDIA IMAGES
// =============================================
function fetchCardImages() {
  var promises = [];
  revisionCards.forEach(function (card) {
    if (card.image_topic) {
      var wikiUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(card.image_topic);
      var p = fetch(wikiUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data.thumbnail && data.thumbnail.source) card.image_url = data.thumbnail.source;
        })
        .catch(function () { });
      promises.push(p);
    }
  });
  return Promise.all(promises);
}


// =============================================
// TAB SWITCHING
// =============================================
function switchTab(tab) {
  currentTab = tab; currentCardIndex = 0;
  document.getElementById("tab-revision").classList.toggle("active", tab === "revision");
  document.getElementById("tab-mcq").classList.toggle("active", tab === "mcq");
  document.getElementById("revision-view").style.display = (tab === "revision") ? "block" : "none";
  document.getElementById("mcq-view").style.display = (tab === "mcq") ? "block" : "none";
  updateCardDisplay();
}


// =============================================
// FLASHCARD VIEWER
// =============================================
function displayFlashcards() {
  var v = document.getElementById("flashcard-viewer");
  if (v) { v.style.display = "block"; v.scrollIntoView({ behavior: "smooth", block: "start" }); switchTab("revision"); }
}

function updateCardDisplay() {
  var cards = (currentTab === "revision") ? revisionCards : mcqCards;
  if (cards.length === 0) return;
  var card = cards[currentCardIndex];

  if (currentTab === "revision") {
    document.getElementById("card-question").textContent = card.question;
    document.getElementById("card-answer").textContent = card.answer;
    document.getElementById("viewer-inner").classList.remove("flipped");
    var imgEl = document.getElementById("card-image");
    var viewerCard = document.getElementById("viewer-card");
    if (card.image_url) {
      imgEl.src = card.image_url;
      imgEl.alt = card.image_topic || "Diagram";
      imgEl.style.display = "block";
      viewerCard.classList.add("has-image");
    } else {
      imgEl.style.display = "none";
      viewerCard.classList.remove("has-image");
    }
  } else {
    document.getElementById("mcq-question").textContent = card.question;
    document.getElementById("mcq-feedback").textContent = "";
    document.getElementById("mcq-feedback").className = "mcq-feedback";
    document.getElementById("mcq-explanation").textContent = "";
    document.getElementById("mcq-explanation").style.display = "none";
    var div = document.getElementById("mcq-options"); div.innerHTML = "";
    card.options.forEach(function (opt) {
      var btn = document.createElement("button"); btn.className = "mcq-option-btn"; btn.textContent = opt;
      btn.onclick = function () { checkMCQ(btn, opt, card.correct, card.explanation); }; div.appendChild(btn);
    });
  }
  document.getElementById("card-counter").textContent = (currentCardIndex + 1) + " / " + cards.length;
  document.getElementById("prev-btn").disabled = (currentCardIndex === 0);
  document.getElementById("next-btn").disabled = (currentCardIndex === cards.length - 1);
}

function checkMCQ(btn, selected, correct, explanation) {
  var fb = document.getElementById("mcq-feedback");
  var exp = document.getElementById("mcq-explanation");
  var all = document.querySelectorAll(".mcq-option-btn");
  all.forEach(function (b) { b.disabled = true; });

  if (selected.startsWith(correct)) {
    btn.classList.add("correct");
    fb.textContent = "Correct!";
    fb.className = "mcq-feedback correct";
  } else {
    btn.classList.add("wrong");
    fb.textContent = "Wrong! Correct answer: " + correct;
    fb.className = "mcq-feedback wrong";
    all.forEach(function (b) { if (b.textContent.startsWith(correct)) b.classList.add("correct"); });
  }
  if (explanation) { exp.textContent = explanation; exp.style.display = "block"; }
}

function flipViewerCard() { document.getElementById("viewer-inner").classList.toggle("flipped"); }
function nextCard() { var c = (currentTab === "revision") ? revisionCards : mcqCards; if (currentCardIndex < c.length - 1) { currentCardIndex++; updateCardDisplay(); } }
function prevCard() { if (currentCardIndex > 0) { currentCardIndex--; updateCardDisplay(); } }


// =============================================
// UI HELPERS
// =============================================
function showLoading(s) { var el = document.getElementById("loading-overlay"); if (el) el.classList.toggle("active", s); if (s) { var v = document.getElementById("flashcard-viewer"); if (v) v.style.display = "none"; } }
function showStatus(m, t) { var el = document.getElementById("status-msg"); if (el) { el.textContent = m; el.className = "status-msg " + t; } }
function hideStatus() { var el = document.getElementById("status-msg"); if (el) { el.className = "status-msg"; el.textContent = ""; } }
