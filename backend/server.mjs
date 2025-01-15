import dotenv from "dotenv";
import express from "express";
import fetch from "node-fetch";
import next from "next";

dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const port = 3000;

app.prepare().then(() => {
  const server = express();

  // Middleware to parse JSON requests
  server.use(express.json());

  // API Route for Homepage
  server.post("/home/image-gen", (req, res) => {
    const { prompt } = req.body; // Get the query from the frontend

    if (!prompt) {
      return res.status(400).json({ error: "Prompt is required" });
    }

    // Respond with the prompt
    res.json({ message: `You entered: ${prompt}` });
  });

  // Handle all other routes with Next.js
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  // Start the server
  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
