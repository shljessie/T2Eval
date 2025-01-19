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

    if (!req.file) {
      return res.status(400).json({ error: "'image' is required" });
    }

    const userPrompt = `
    Evaluate the provided image for its suitability as a tactile graphic, considering the following criteria:
    
    1. **General Style**: 
       Assess whether the image is a tactile graphic. No color, patterns and line drawings. Suitable for a tactile graphic.
    
    2. **Perspective**: 
       Determine if the image uses a flat or simplified perspective suitable for tactile interpretation, avoiding 3D effects or complicated angles.
    
    3. **Line Thickness**: 
       Evaluate whether the line thickness is consistent and bold enough to be easily distinguishable by touch, avoiding lines that are too thin or too dense.
    
    4. **Patterns**: 
       Check if the patterns used are clear and tactilely distinguishable, ensuring that similar patterns are not placed adjacent to each other and that they follow tactile graphic design conventions.

    5. **Suitability Level**: 1) Not Suitable at all - upload a new Image (format font in markdown red), 2) Suitable with Adjustments (format font in markdown yellow), 3) Suitable (format font in markdown green)

    Response Format: 
    Evaluate the image for its suitability as a tactile graphic, providing one simple, constructive sentence for each category
    Include a final Suitability Level
    `;    

    try {
      const vertexAI = new VertexAI({
        project: process.env.GOOGLE_PROJECT_ID,
        location: "us-central1",
      });

      const generativeVisionModel = vertexAI.getGenerativeModel({
        model: "gemini-1.5-pro",
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
