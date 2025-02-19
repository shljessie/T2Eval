import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import React, { useState } from "react";

import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import potrace from "potrace";

const ImageUpload = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [svgResult, setSvgResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiResponse, setAiResponse] = useState(null);
  const [processingAI, setProcessingAI] = useState(false);

  // Convert image to SVG
  const convertToSvg = async () => {
    if (!selectedImage) {
      setUploadStatus("Please upload an image first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(selectedImage);
      reader.onload = async () => {
        const imageData = reader.result;

        potrace.trace(imageData, { threshold: 128 }, (err, svg) => {
          if (err) {
            console.error("Error converting to SVG:", err);
            setError("Failed to convert image.");
          } else {
            console.log("SVG Generated:", svg);
            setSvgResult(svg);
          }
          setLoading(false);
        });
      };
    } catch (err) {
      console.error("Error processing image:", err);
      setError("An error occurred.");
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedImage(file);
      setUploadStatus("");
      setPreview(URL.createObjectURL(file));
    }
  };

  const processSvgWithAI = async () => {
    if (!svgResult) {
      setUploadStatus("Generate SVG first before sending to AI.");
      return;
    }
  
    setProcessingAI(true);
    setAiResponse(null);
  
    try {
      const response = await fetch("/api/process-svg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          svgCode: svgResult,
          prompt: "Optimize this SVG for better performance and readability.",
        }),
      });
  
      const data = await response.json();
      setAiResponse(data.svg);
    } catch (err) {
      console.error("Error processing SVG:", err);
      setError("Failed to process SVG with AI.");
    } finally {
      setProcessingAI(false);
    }
  };
  

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
      }}
    >
      {/* Image Upload */}
      <Box
        sx={{
          padding: "10px",
          textAlign: "center",
          width: "60%",
          border: "2px dotted #ccc",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <Typography variant="body2" component="h1" gutterBottom>
          Upload an image to convert to SVG
        </Typography>
        <Stack spacing={2} alignItems="center">
          <input
            id="file-input"
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
          <label htmlFor="file-input">
            <Button variant="contained" component="span" color="primary">
              Choose Image
            </Button>
          </label>
          {uploadStatus && (
            <Typography variant="body2" color="error">
              {uploadStatus}
            </Typography>
          )}
          {preview && (
            <Card sx={{ maxWidth: 300 }}>
              <CardMedia component="img" image={preview} alt="Selected Preview" />
              <CardContent>
                <Typography variant="body2" color="textSecondary">
                  Preview of your uploaded image.
                </Typography>
              </CardContent>
            </Card>
          )}
        </Stack>
      </Box>

      {/* Convert to SVG Button */}
      <Button
        type="button"
        variant="contained"
        color="secondary"
        sx={{ marginTop: "20px" }}
        onClick={convertToSvg}
      >
        Convert to SVG
      </Button>

      {loading && (
        <Box sx={{ marginTop: "20px", textAlign: "center" }}>
          <CircularProgress />
        </Box>
      )}

      {/* Accordions for Preview and Code */}
      {svgResult && (
        <Box sx={{ width: "60%", marginTop: "20px" }}>
          {/* SVG Preview Accordion */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">SVG Preview</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <div dangerouslySetInnerHTML={{ __html: svgResult }} />
            </AccordionDetails>
          </Accordion>

          {/* SVG Code Accordion */}
          <Accordion>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="body2">SVG Code</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  wordWrap: "break-word",
                  background: "#f4f4f4",
                  padding: "10px",
                  borderRadius: "5px",
                  maxHeight: "400px",
                  overflowY: "auto",
                  textAlign: "left",
                }}
              >
                {svgResult}
              </pre>
            </AccordionDetails>
          </Accordion>

          {/* Send SVG to AI for Processing */}
          <Button
            type="button"
            variant="contained"
            color="primary"
            sx={{ marginTop: "20px" }}
            onClick={processSvgWithAI}
            disabled={processingAI}
          >
            {processingAI ? "Processing with AI..." : "Process SVG with AI"}
          </Button>

          {processingAI && (
            <Box sx={{ marginTop: "20px", textAlign: "center" }}>
              <CircularProgress />
            </Box>
          )}

          {/* AI Response */}
          {aiResponse && (
            <Accordion sx={{ marginTop: "10px" }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="body2">AI Analysis</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2">{aiResponse}</Typography>
              </AccordionDetails>
            </Accordion>
          )}
        </Box>
      )}

      {error && (
        <Typography variant="body2" color="error">
          {error}
        </Typography>
      )}
    </Box>
  );
};

export default ImageUpload;
