const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20 MB
});

router.use(requireAuth);

// GET /api/documents — list current user's documents (no full text, keep it light)
router.get("/", (req, res) => {
  const docs = db
    .prepare(
      "SELECT id, name, word_count, uploaded_at FROM documents WHERE user_id = ? ORDER BY uploaded_at DESC"
    )
    .all(req.userId);
  res.json({ documents: docs });
});

// GET /api/documents/:id — full document, including text and chat history
router.get("/:id", (req, res) => {
  const doc = db
    .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
    .get(req.params.id, req.userId);
  if (!doc) return res.status(404).json({ error: "Document not found." });

  const messages = db
    .prepare("SELECT role, content, created_at FROM messages WHERE document_id = ? ORDER BY id ASC")
    .all(doc.id);

  res.json({ document: doc, messages });
});

// POST /api/documents — upload a .txt or .pdf file
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file was uploaded." });

    const { originalname, mimetype, buffer } = req.file;
    const isPdf = mimetype === "application/pdf" || originalname.toLowerCase().endsWith(".pdf");
    const isTxt = mimetype === "text/plain" || originalname.toLowerCase().endsWith(".txt");

    if (!isPdf && !isTxt) {
      return res.status(400).json({ error: "Only .txt and .pdf files are supported." });
    }

    let text;
    if (isPdf) {
      const parsed = await pdfParse(buffer);
      text = parsed.text;
    } else {
      text = buffer.toString("utf-8");
    }
    text = (text || "").trim();

    if (!text) {
      return res.status(422).json({ error: "No readable text was found in that file." });
    }

    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const info = db
      .prepare("INSERT INTO documents (user_id, name, content, word_count) VALUES (?, ?, ?, ?)")
      .run(req.userId, originalname, text, wordCount);

    const doc = db.prepare("SELECT * FROM documents WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json({ document: doc });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not process that file. Please try another." });
  }
});

// DELETE /api/documents/:id
router.delete("/:id", (req, res) => {
  const result = db
    .prepare("DELETE FROM documents WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.userId);
  if (result.changes === 0) return res.status(404).json({ error: "Document not found." });
  res.json({ ok: true });
});

module.exports = router;
