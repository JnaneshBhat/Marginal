const express = require("express");
const db = require("../config/db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
const MAX_CONTEXT_CHARS = 18000;

router.use(requireAuth);

// POST /api/documents/:id/messages — ask a question about a document
router.post("/:id/messages", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || !question.trim()) {
      return res.status(400).json({ error: "Enter a question first." });
    }

    const doc = db
      .prepare("SELECT * FROM documents WHERE id = ? AND user_id = ?")
      .get(req.params.id, req.userId);
    if (!doc) return res.status(404).json({ error: "Document not found." });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "The server isn't configured with a GEMINI_API_KEY. Add one to backend/.env."
      });
    }

    // Save the user's message first
    db.prepare("INSERT INTO messages (document_id, role, content) VALUES (?, 'user', ?)").run(
      doc.id,
      question.trim()
    );

    const history = db
      .prepare("SELECT role, content FROM messages WHERE document_id = ? ORDER BY id ASC")
      .all(doc.id);

    const docText =
      doc.content.length > MAX_CONTEXT_CHARS
        ? doc.content.slice(0, MAX_CONTEXT_CHARS) + "\n\n[…document truncated…]"
        : doc.content;

    const systemPrompt =
      `You are Marginal, a careful reading assistant. Answer the user's question using ONLY the document text below. ` +
      `If the answer isn't in the document, say so plainly rather than guessing. Quote sparingly and keep answers concise.\n\n` +
      `DOCUMENT: ${doc.name}\n---\n${docText}\n---`;

    // Last 8 turns of history (excluding the message we just saved, which is re-added below)
    const recent = history.slice(-9, -1);

    // Gemini uses "user" / "model" roles, and no separate history entry for the
    // question we're about to ask — that goes in as the final "user" turn.
    const contents = [
      ...recent.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }]
      })),
      { role: "user", parts: [{ text: question.trim() }] }
    ];

    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;

    const apiResponse = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: { maxOutputTokens: 1000 }
      })
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error("Gemini API error:", apiResponse.status, errText);
      return res.status(502).json({ error: "The AI service could not be reached. Please try again." });
    }

    const data = await apiResponse.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ||
      "I wasn't able to generate a response.";

    db.prepare("INSERT INTO messages (document_id, role, content) VALUES (?, 'assistant', ?)").run(
      doc.id,
      answer
    );

    res.json({ answer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong answering that question." });
  }
});

module.exports = router;
