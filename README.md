# StudySpace

A web-based study companion built with HTML, CSS, and JavaScript. Designed to help students prepare for competitive exams using AI-powered flashcard generation.

## Features

- **Homepage** with quick links to 12 popular Indian competitive exams (JEE, NEET, UPSC, CAT, etc.)
- **AI Flashcard Generator** that creates 30 flashcards from user-provided study material
  - 20 Revision cards (question and answer, flip to reveal)
  - 10 MCQ cards (4 options with explanation on correct/wrong answer)
- **File Upload Support** for PDF, PPTX, and TXT files
- **Wikipedia Images** automatically fetched for 5 revision cards
- **Text Cleaning** that strips out metadata like teacher names, slide numbers, dates, and copyright text from uploaded files

## How It Works

1. Go to the Flashcards page
2. Paste your study notes in the textarea or upload a PDF/PPTX file
3. Click "Generate 30 Flashcards"
4. The app sends your content to the Google Gemini API
5. Gemini returns 20 revision Q&A cards and 10 MCQ cards
6. Navigate through cards using Prev/Next buttons
7. Flip revision cards to see answers, select MCQ options to check your knowledge

## Tech Stack

- HTML5
- CSS3 (custom styles, no frameworks)
- Vanilla JavaScript (no libraries except for file reading)
- Google Gemini API (for AI-powered question generation)
- PDF.js (for reading PDF files in the browser)
- JSZip (for reading PPTX files in the browser)
- Wikipedia REST API (for fetching relevant images)

## Project Structure

```
StudySpace/
  index.html          - Homepage with exam links and flashcard preview
  flashcards.html     - AI flashcard generator page
  style.css           - Shared stylesheet
  script.js           - Shared JavaScript logic
  open.bat            - Double-click to open the site in your browser
```

## Setup

1. Clone the repository
2. Open `index.html` in any browser, or double-click `open.bat`
3. No server or build tools required


## License

This project is for educational purposes.
