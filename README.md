# ScholarFlow

ScholarFlow is an elegant, local-first web application designed for researchers to intuitively manage, read, and chat with arXiv research papers. It features a modern AI-powered chat interface that allows users to ask questions directly about the PDFs they are reading, powered by Gemini.

![ScholarFlow UI Preview](https://github.com/T-Karthik-Reddy/ScholarFlow/blob/main/frontend/public/favicon.ico) <!-- Placeholder -->

## Key Features

- **Import arXiv Papers**: Just paste an arXiv URL and ScholarFlow will automatically fetch and ingest the PDF.
- **AI-Powered Reading**: Ask questions, request summaries, or extract key findings from the paper using the integrated AI Chat panel.
- **Collection Management**: Organize your research papers into custom collections. Move, categorize, and delete them with ease.
- **Advanced PDF Viewer**: Features continuous scrolling and pinch-to-zoom for an effortless reading experience.
- **Premium Dark Mode**: Seamlessly toggle between light and a sleek dark palette with a single click.

## Tech Stack

- **Frontend**: React (Vite), Tailwind CSS (w/ custom variables for dynamic dark mode), Lucide Icons, and React-Resizable-Panels.
- **Backend**: FastAPI (Python), SQLite (for local persistence), Google Gemini API (for AI embeddings and chat capabilities).

---

## Setup & Installation

### Prerequisites
- Node.js (v16+)
- Python (v3.9+)
- A Google Gemini API Key

### 1. Clone the repository
```bash
git clone https://github.com/T-Karthik-Reddy/ScholarFlow.git
cd ScholarFlow
```

### 2. Backend Setup
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install the dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file in the `backend/` directory and add your Google Gemini API Key:
   ```env
   GEMINI_API_KEY=your_actual_api_key_here
   ```
5. Start the FastAPI development server:
   ```bash
   uvicorn main:app --reload
   ```

### 3. Frontend Setup
1. Open a new terminal window and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install the Node modules:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```

### 4. Open the App
Once both servers are running, open your browser and navigate to:  
**[http://localhost:5173](http://localhost:5173)**

---

## Future Enhancements
- Citation tracking
- Bulk import capabilities
- Extended support for non-arXiv PDFs

## License
MIT License
