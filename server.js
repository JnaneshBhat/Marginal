require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const documentRoutes = require("./routes/documents");
const chatRoutes = require("./routes/chat");

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (req, res) => res.json({ ok: true }));

app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
// Chat is nested under documents: POST /api/documents/:id/messages
app.use("/api/documents", chatRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found." }));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error." });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Marginal backend running on http://localhost:${PORT}`);
});
