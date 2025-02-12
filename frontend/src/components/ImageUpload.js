import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import React, { useEffect, useRef, useState } from "react";

import ReactMarkdown from "react-markdown";

const ImageUpload = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [evaluationResult, setEvaluationResult] = useState("");
  const [segmentationResult, setSegmentationResult] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [processedSegmentationResults, setProcessedSegmentationResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const workerRef = useRef(null);

  // State variables
  let lastPoints = null;
  let isEncoded = false;
  let isDecoding = false;
  let isMultiMaskMode = false;
  let modelReady = false;
  let imageDataURI = null;


  // Create a web worker so that the main (UI) thread is not blocked during inference.
  const worker = new Worker('../workers/worker.js', {
    type: 'module',
  });

  // Initialize the worker only once (on mount)
  useEffect(() => {
    if (!workerRef.current) {
      workerRef.current = new Worker(
        new URL("../workers/worker.js", import.meta.url),
        { type: "module" }
      );

      workerRef.current.addEventListener("message", (e) => {
        const { type, data } = e.data;

        if (type === "ready") {
          modelReady = true;
          console.log("Received Ready signal from worker");
        } else if (type === "decode_result") {
          isDecoding = false;
          console.log("[Image Upload Receive Mask] Decoding Result:", data);
          setSegmentationResult(data);
          console.log("[Image Upload setSegmentation]Segmentation Result:", segmentationResult);          
        } else if (type === "segment_result") {
          if (data === "start") {
            console.log("Segmentation started...");
          } else {
            console.log("Embedding Extracted");
            isEncoded = true;
            startDecoding();
          }
        }
      });
    }

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, []); // No dependencies, run only once

  // Handle `preview` changes separately
  useEffect(() => {
    if (preview && workerRef.current) {
      console.log("Sending segment message to worker...");
      workerRef.current.postMessage({
        type: "segment", // Specify the operation type
        preview, // Send the URL to the worker
      });
    }
  }, [preview]); // Trigger only when `preview` changes

  const startDecoding = () => {
    if (workerRef.current) {
      console.log("Sending decode message to worker...");
      workerRef.current.postMessage({
        type: "decode",
        data: "start",
      });
    } else {
      console.error("Worker is not initialized.");
    }
  };
  
  // Process segmentation results
  useEffect(() => {
    if (segmentationResult?.mask) {
      console.log(`[Image Dimensions]:`, imageDimensions);
      console.log("Batch Masks:", segmentationResult);
  
      const processedResults = [{
        width: segmentationResult.mask.width,
        height: segmentationResult.mask.height,
        data: segmentationResult.mask.data,
      }];
  
      setProcessedSegmentationResults(processedResults);
      console.log("Processed Segmentation Results:", processedResults);
    }
  }, [segmentationResult, imageDimensions]); // Removed processedSegmentationResults
  

  // Extract image dimensions from the preview
  useEffect(() => {
    if (preview) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.width, height: img.height });
        console.log(`[Preview Image] Dimensions: ${img.width}x${img.height}`);
      };
      img.src = preview;
    }
  }, [preview]);

  // Handle file selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const supportedFormats = [
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/heic",
        "image/heif",
      ];

      if (!supportedFormats.includes(file.type)) {
        setUploadStatus(
          "Unsupported file format. Please upload a PNG, JPEG, WEBP, HEIC, or HEIF image."
        );
        setSelectedImage(null);
        setPreview(null);
        return;
      }

      setSelectedImage(file);
      setUploadStatus("");
      const imagePreview = URL.createObjectURL(file);
      setPreview(imagePreview);
    }
  };

  // Evaluate the image (API call)
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedImage) {
      setUploadStatus("Please select an image before starting the evaluation.");
      return;
    }

    try {
      setLoading(true);
      setUploadStatus("");

      const formData = new FormData();
      formData.append("image", selectedImage);

      const response = await fetch("/api/evaluate-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setLoading(false);
        setUploadStatus("Evaluation failed. Please try again.");
        return;
      }

      const { data } = await response.json();
      setEvaluationResult(data);
    } catch (error) {
      console.error("Error during evaluation:", error);
      setUploadStatus("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Perform segmentation using the web worker
  const handleSegmentImage = () => {
    if (!preview || !workerRef.current) {
      setError("Please upload an image first");
      return;
    }

    setLoading(true);
    setError(null);
    setSegmentationResult(null); // Clear old results

    // Send the properly structured message to the worker
    workerRef.current.postMessage({
      type: "startWorker", // Specify the operation type
      preview
    });
  };

  // Generate SVG path for a mask
  const generateMaskPath = (mask) => {
    const { width, height, data } = mask;
    const path = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (data[index] > 0) {
          path.push(`M${x},${y} h1 v1 h-1 Z`);
        }
      }
    }
    return path.join(" ");
  };

  const drawMask = (canvas, maskData, width, height) => {
    const ctx = canvas.getContext("2d");
    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < maskData.data.length; i++) {
      const value = maskData.data[i] ? 255 : 0; // Binary mask: 255 for mask, 0 for background
      imageData.data[i * 4] = value; // Red
      imageData.data[i * 4 + 1] = value; // Green
      imageData.data[i * 4 + 2] = value; // Blue
      imageData.data[i * 4 + 3] = 100; // Alpha (semi-transparent)
    }
    ctx.putImageData(imageData, 0, 0);
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
          Upload image to convert to tactile graphic
        </Typography>
        <form>
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
                <CardMedia
                  component="img"
                  image={preview}
                  alt="Selected Preview"
                />
                <CardContent>
                  <Typography variant="body2" color="textSecondary">
                    Preview of your uploaded image.
                  </Typography>
                </CardContent>
              </Card>
            )}
          </Stack>
        </form>
      </Box>

      {/* Results */}
      {selectedImage && (
        <Box
          sx={{
            textAlign: "center",
            border: "2px solid #ccc",
            borderRadius: "8px",
            padding: "16px",
            width: "60%",
            margin: "10px auto",
          }}
        >
          <Typography
            variant="body2"
            component="h2"
            sx={{ fontWeight: "bold", textAlign: "start" }}
          >
            Tactile Graphic Evaluation and Segmentation
          </Typography>

          {loading ? (
            <Box
              sx={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                marginTop: "20px",
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <>
              {evaluationResult && (
                <Typography
                  component="div"
                  variant="body2"
                  sx={{ textAlign: "left", marginTop: "20px" }}
                >
                  <ReactMarkdown>{evaluationResult}</ReactMarkdown>
                </Typography>
              )}
              )}

              <Button
                type="button"
                variant="contained"
                color="primary"
                sx={{ marginTop: "20px" }}
                onClick={handleSubmit}
              >
                Evaluate Tactile Compatibility
              </Button>

            </>
          )}
        </Box>
      )}

      {processedSegmentationResults.length > 0 && (
        <Box
          sx={{
            position: "relative",
            display: "inline-block",
            marginTop: "20px",
          }}
        >
          {/* Uploaded Image */}
          <img
            src={preview}
            alt="Uploaded"
            style={{
              width: `${imageDimensions.width}px`,
              height: `${imageDimensions.height}px`,
              display: "block",
            }}
          />
      
          {/* Mask Canvas */}
          <canvas
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${imageDimensions.width}px`,
              height: `${imageDimensions.height}px`,
              pointerEvents: "none",
            }}
            ref={(canvas) => {
              if (canvas) {
                const ctx = canvas.getContext("2d");
      
                // Clear the canvas before drawing
                ctx.clearRect(0, 0, canvas.width, canvas.height);
      
                // Set canvas dimensions to match the image
                canvas.width = imageDimensions.width;
                canvas.height = imageDimensions.height;
      
                // Draw each mask on the canvas
                processedSegmentationResults.forEach((mask) => {
                  const imageData = ctx.createImageData(mask.width, mask.height);
      
                  // Map mask data to imageData
                  for (let i = 0; i < mask.data.length; i++) {
                    const value = mask.data[i] ? 255 : 0; // Binary mask: 255 for mask, 0 for background
                    imageData.data[i * 4] = value; // Red
                    imageData.data[i * 4 + 1] = value; // Green
                    imageData.data[i * 4 + 2] = value; // Blue
                    imageData.data[i * 4 + 3] = 100; // Alpha (semi-transparent)
                  }
      
                  // Draw the imageData on the canvas
                  ctx.putImageData(imageData, 0, 0);
                });
              }
            }}
          />
        </Box>
      )}
      
      
    </Box>
  );
};

export default ImageUpload;
