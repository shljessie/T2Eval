import { AutoProcessor, RawImage, SamModel, Tensor, env } from "@xenova/transformers";

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

env.allowLocalModels = false; // Disable local model loading

// Singleton class for SegmentAnything
class SegmentAnythingSingleton {
  static model_id = "Xenova/slimsam-77-uniform";
  static model;
  static processor;

  static async getInstance() {
    if (!this.model) {
      this.model = await SamModel.from_pretrained(this.model_id, {
        quantized: true,
      });
    }
    if (!this.processor) {
      this.processor = await AutoProcessor.from_pretrained(this.model_id);
    }

    return { model: this.model, processor: this.processor };
  }
}

app.prepare().then(() => {
  const server = express();
  server.use(express.json());

  // Evaluate Image Endpoint
  server.post("/api/evaluate-image", upload.single("image"), async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "'image' is required" });
    }

    const userPrompt = `
    Evaluate the provided image for its suitability as a tactile graphic, considering the following criteria:
    1. General Style: No color, patterns, and line drawings.
    2. Perspective: Should be flat or simplified for tactile interpretation.
    3. Line Thickness: Lines should be bold and distinguishable by touch.
    4. Patterns: Patterns should be tactilely distinguishable and not adjacent.
    5. Suitability Level: 1) Not Suitable, 2) Suitable with Adjustments, 3) Suitable.

    Response Format: Constructive sentences for each category, and a final suitability level.
    `;

    try {
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_PROJECT_ID,
        location: "us-central1",
      });

      const generativeVisionModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-pro",
      });

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
