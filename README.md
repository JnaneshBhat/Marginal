# Marginal — Document Q&A App

A full-stack app: upload a document, then ask questions about it in a chat that answers only from what's actually in the document.

```
document-qa-app/
├── backend/     Node.js + Express API, SQLite database, Gemini API integration
└── frontend/    Plain HTML/CSS/JS client (no build step needed)
```

## What each part is

- **frontend/** — this is the actual "frontend": the web page your browser loads and displays. It has no server logic of its own — it just calls the backend over HTTP.
- **backend/** — this is the "backend": a Node.js server that handles registration/login, stores documents, and talks to Google's Gemini API to answer questions. It's the only place that holds secrets (like your API key) and does real work.
- **database** — SQLite, a single file (`backend/data/app.db`) created automatically the first time you run the server. No separate database server to install.

## 1. Requirements

- [Node.js](https://nodejs.org) version 22.5 or later (check with `node -v`) — this app uses Node's built-in SQLite support, so no extra database software or build tools are needed
- A **free** Google Gemini API key — no credit card needed:
  1. Go to https://aistudio.google.com
  2. Sign in with any Google account
  3. Click **"Get API key"** → **"Create API key"**
  4. Copy the key (starts with `AIza...`)

## 2. Set up the backend

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `JWT_SECRET` — any long random string (used to sign login sessions). Generate one with:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- `GEMINI_API_KEY` — the key you copied from Google AI Studio
- `GEMINI_MODEL` — leave as `gemini-2.5-flash` (fast and free-tier eligible)

Start the server:

```bash
npm start
```

You should see: `Marginal backend running on http://localhost:5000`

## 3. Run the frontend

The frontend is static files — no build step. Simplest option, from the `frontend/` folder:

```bash
cd frontend
npx serve .
```

(or just open `frontend/index.html` directly in your browser — it will call the backend at `http://localhost:5000/api` automatically).

Then visit the URL it gives you (e.g. `http://localhost:3000`), create an account, upload a `.txt` or `.pdf`, and start asking questions.

## 4. How it fits together

1. **Register/Login** (`frontend` → `POST /api/auth/register` or `/login`) — the backend hashes passwords with bcrypt and returns a signed JWT, which the frontend stores and sends with every request afterward.
2. **Upload** (`POST /api/documents`) — the backend extracts text from `.pdf` (via `pdf-parse`) or reads `.txt` directly, and saves it in the `documents` table tied to your account.
3. **Ask a question** (`POST /api/documents/:id/messages`) — the backend loads that document's text, sends it as context to the Gemini API along with your question and recent chat history, saves both messages to the `messages` table, and returns the answer.

## Note on the free tier

The Gemini free tier is genuinely free (no card, no expiration) but it's rate-limited and meant for prototyping/low-volume use — don't feed it anything highly sensitive, since free-tier inputs may be used by Google to improve their models. If you outgrow it, Google's paid tier removes that data-use clause and raises the limits.

## 5. Database schema

```
users        id, name, email, password_hash, created_at
documents    id, user_id, name, content, word_count, uploaded_at
messages     id, document_id, role, content, created_at
```

Everything lives in `backend/data/app.db`. Delete that file to reset the whole app.

## 6. Notes on going to production

This is set up to run comfortably on your own machine. Before deploying it publicly, you'd want to:
- Serve the frontend and backend from the same origin (or configure CORS more tightly)
- Put the SQLite file on persistent storage, or switch to Postgres for multiple concurrent users
- Add rate limiting on `/api/auth` and `/api/documents/:id/messages`
- Use HTTPS and a proper secrets manager for `JWT_SECRET` / `GEMINI_API_KEY`
