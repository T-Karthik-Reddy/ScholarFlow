# ScholarFlow

ScholarFlow is an elegant, local-first web application designed for researchers to intuitively manage, read, and chat with arXiv research papers. It features a modern AI-powered chat interface that allows users to ask questions directly about the PDFs they are reading, powered by Gemini — and an **Implement** button that asks Gemini to recreate a paper's method as a runnable code project, written straight to a folder on your computer.

## Key Features

- **Import arXiv Papers**: Paste an arXiv URL and ScholarFlow fetches and ingests the PDF.
- **AI-Powered Reading**: Ask questions, request summaries, or extract key findings using the integrated AI Chat panel.
- **Implement**: Generate a small, runnable code project recreating the paper's method, written to a folder you choose.
- **Collection Management**: Organize papers into custom collections. Move, categorize, and delete them with ease.
- **Advanced PDF Viewer**: Continuous scrolling and pinch-to-zoom for effortless reading.
- **Bring your own Gemini key**: Paste a free Gemini API key in Settings — it's stored only in your browser and sent directly to the backend per-request, never persisted server-side.
- **Local-first storage**: PDFs are saved to a folder you pick on your own machine via the File System Access API. The backend only stores lightweight metadata (titles, authors, chat history).
- **Premium Dark Mode**: Toggle between light and dark, persisted across sessions.

## Tech Stack

- **Frontend**: React (Vite), Tailwind CSS, Lucide Icons, react-resizable-panels, react-pdf.
- **Backend**: FastAPI (Python), SQLite (metadata only), Google Gemini API (`google-genai` SDK).

**Browser requirement**: ScholarFlow uses the File System Access API to read/write PDFs locally, so it currently requires a Chromium-based browser (Chrome, Edge, Brave, Arc).

---

## Local Development

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)
- A free Google Gemini API key — get one at https://aistudio.google.com/apikey

### 1. Clone the repository
```bash
git clone https://github.com/T-Karthik-Reddy/ScholarFlow.git
cd ScholarFlow
```

### 2. Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env       # optional: set a server-wide fallback GEMINI_API_KEY
uvicorn main:app --reload
```
The API runs at `http://localhost:8000`. A Gemini key is **not** required to start the server — each user can instead paste their own key into the app's Settings panel, which is sent per-request via the `X-Gemini-Key` header.

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
```
Open **http://localhost:5173**. On first run you'll be walked through pasting a Gemini key and choosing a folder to store PDFs in.

---

## Deploying (free tier)

ScholarFlow deploys as two pieces: a static frontend and a small stateless-ish API. Because PDFs live on each user's own machine (not the server), the backend only needs to persist paper metadata and chat history — which makes a free-tier ephemeral host acceptable.

### Backend → Render
1. Push this repo to GitHub.
2. On [Render](https://render.com), create a new **Blueprint** and point it at the repo — it will pick up [`render.yaml`](render.yaml) and provision a free Python web service rooted at `backend/`.
3. Set the `CORS_ORIGINS` environment variable to your Vercel frontend URL once you have it (comma-separated if you need more than one), e.g. `https://scholarflow.vercel.app`.
4. `GEMINI_API_KEY` is optional — leave it unset and rely on per-user keys, or set it as a shared fallback.
5. Note: Render's free plan has no persistent disk, so the SQLite metadata database resets on redeploy/restart. This does **not** affect your PDFs (they're local), only titles/chat history. Upgrade to a paid plan and add a disk if you want that to persist.

### Frontend → Vercel
1. On [Vercel](https://vercel.com), import the repo and set the **Root Directory** to `frontend`.
2. It auto-detects the Vite build (`vercel.json` pins `npm run build` / `dist`).
3. Set the environment variable `VITE_API_URL` to your Render backend's URL plus `/api`, e.g. `https://scholarflow-api.onrender.com/api`.
4. Deploy. Share the Vercel URL — each visitor pastes their own free Gemini key and picks their own local folder on first run.

---

## Future Enhancements
- Citation tracking
- Bulk import capabilities
- Extended support for non-arXiv PDFs

## License
MIT License
