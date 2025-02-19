import { VertexAI } from "@google-cloud/vertexai";
import dotenv from "dotenv";
import express from "express";
import { fileURLToPath } from "url";
import fs from "fs";
import next from "next";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = 3000;

app.prepare().then(() => {
  const server = express();
  server.use(express.json());

  /**
   * 📌 API: Evaluate Image for Tactile Graphics
   * Accepts an uploaded image and evaluates if it can be used for tactile graphics.
   */
  server.post("/api/evaluate-image", async (req, res) => {
    if (!req.body.image) {
      return res.status(400).json({ error: "'image' base64 data is required" });
    }

    const userPrompt = `
    Evaluate the provided image for its suitability as a tactile graphic, considering the following:
    - General Style: Should be suitable for tactile representation.
    - Line Thickness: Bold and distinguishable by touch.
    - Patterns: Clear and tactilely differentiable.
    - Perspective: Should be simplified and clear.

    Provide a structured response with suggestions if improvements are needed.
    `;

    try {
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_PROJECT_ID,
        location: "us-central1",
      });

      const generativeVisionModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-pro",
      });

      const request = {
        contents: [
          {
            role: "user",
            parts: [
              { text: userPrompt },
              { inlineData: { data: req.body.image, mimeType: req.body.mimeType } },
            ],
          },
        ],
      };

      const response = await generativeVisionModel.generateContent(request);

      const fullTextResponse =
        response.response.candidates[0]?.content?.parts[0]?.text || "No response received";

      res.json({ data: fullTextResponse });
    } catch (error) {
      console.error("Error during image evaluation:", error);
      res.status(500).json({ error: "Failed to evaluate the image" });
    }
  });

  /**
   * 📌 API: Process SVG with AI
   * Accepts raw SVG code and a user prompt to analyze, optimize, or modify the SVG.
   */
  server.post("/api/process-svg", async (req, res) => {
    const { svgCode, prompt } = req.body;

    if (!svgCode) {
      return res.status(400).json({ error: "SVG code is required." });
    }

    const defaultPrompt = `
    Analyze and optimize the given SVG code. If the user specifies modifications, apply them.
    Otherwise, provide insights on how to make the SVG more efficient and readable.
    `;

    try {
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_PROJECT_ID,
        location: "us-central1",
      });

      const generativeTextModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-pro",
      });

      const request = {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt || defaultPrompt },
              { text: `Here is the SVG code:\n\n${svgCode}` },
            ],
          },
        ],
      };

      const response = await generativeTextModel.generateContent(request);

      const processedSVG =
        response.response.candidates[0]?.content?.parts[0]?.text || "No response received";

      res.json({ svg: processedSVG });
    } catch (error) {
      console.error("Error processing SVG with AI:", error);
      res.status(500).json({ error: "Failed to process SVG with AI." });
    }
  });

  /**
   * 📌 Default Next.js Request Handler
   */
  server.all("*", (req, res) => {
    return handle(req, res);
  });

  server.listen(port, () => {
    console.log(`> Ready on http://localhost:${port}`);
  });
});
