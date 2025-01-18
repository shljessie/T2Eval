import { VertexAI } from "@google-cloud/vertexai";
import dotenv from "dotenv";
import express from "express";
import { fileURLToPath } from "url";
import fs from "fs";
import multer from "multer";
import next from "next";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3000;

const uploadDir = path.join(__dirname, "uploads");
const upload = multer({ dest: uploadDir });

app.prepare().then(() => {
  const server = express();
  server.use(express.json());

  server.post("/api/evaluate-image", upload.single("image"), async (req, res) => {
    const { prompt } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: "'image' is required" });
    }

    const userPrompt = prompt || "evaluate image";

    try {
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_PROJECT_ID,
        location: "us-central1",
      });

      const generativeVisionModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-flash-001",
      });

      // Encode the image file as base64
      const base64Data = fs.readFileSync(req.file.path).toString("base64");

      const request = {
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: req.file.mimetype, // Pass correct MIME type
                },
              },
              {
                text: userPrompt,
              },
            ],
          },
        ],
      };

      const response = await generativeVisionModel.generateContent(request);

      const aggregatedResponse = response.response;
      const fullTextResponse =
        aggregatedResponse.candidates[0]?.content?.parts[0]?.text || "No response received";

      res.json({ data: fullTextResponse });
    } catch (error) {
      console.error("Error during image evaluation:", error);
      res.status(500).json({ error: "Failed to evaluate the image" });
    } finally {
      setTimeout(() => {
        fs.unlink(path.join(uploadDir, req.file.filename), (err) => {
          if (err) console.error("Failed to delete temporary file:", err);
        });
      }, 60000);
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
