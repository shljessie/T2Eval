import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Stack,
  Typography,
} from "@mui/material";
import React, { useState } from "react";

import ReactMarkdown from "react-markdown";

const ImageUpload = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("");
  const [evaluationResult, setEvaluationResult] = useState("");

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedImage) {
      setUploadStatus("Please select an image before starting the evaluation.");
      return;
    }

    try {
      const formData = new FormData();
      formData.append("image", selectedImage);
      formData.append("prompt", "evaluate image");

      const response = await fetch("/api/evaluate-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        setUploadStatus("Evaluation failed. Please try again.");
        return;
      }

      const { data } = await response.json();
      setEvaluationResult(data);
    } catch (error) {
      console.error("Error during evaluation:", error);
      setUploadStatus("An error occurred. Please try again.");
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
      {/* Dotted Box */}
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
          upload image to convert to tactile graphic
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

      {/* Evaluation Result */}
      {selectedImage && (
        <Box
          sx={{
            textAlign: "center",
            border: "2px solid #ccc",
            borderRadius: "8px",
            padding: "16px",
            width: "60%",
            margin: "10px auto", // Center horizontally with vertical margin
          }}
        >
          {/* Title */}
          <Typography variant="body2" component="h2" sx={{ fontWeight: "bold", textAlign: "start" }}>
            Tactile Graphic Evaluation Result
          </Typography>

          {/* Markdown Content */}
          {evaluationResult && (
            <Typography
              component="div"
              variant="body2"
              sx={{ textAlign: "left", marginTop: "20px" }}
            >
              <ReactMarkdown>{evaluationResult}</ReactMarkdown>
            </Typography>
          )}

          {/* Evaluate Button */}
          <Button
            type="submit"
            variant="contained"
            color="primary"
            sx={{ marginTop: "20px"}}
            onClick={handleSubmit} // Trigger form submission
          >
            Evaluate Tactile Compatibility
          </Button>
        </Box>
      )}
          </Box>
        );
};

export default ImageUpload;
