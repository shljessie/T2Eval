import React, { useState } from "react";

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
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>Image Upload</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          style={{ marginBottom: "10px" }}
        />
        {uploadStatus && <p style={{ color: "red" }}>{uploadStatus}</p>}
        {preview && (
          <div>
            <h2>Preview:</h2>
            <img
              src={preview}
              alt="Selected Preview"
              style={{ maxWidth: "30%", maxHeight: "30%", marginTop: "10px" }}
            />
          </div>
        )}
        <button type="submit" style={{ marginTop: "10px" }}>
          Start Tactile Evaluation
        </button>
      </form>
      {evaluationResult && (
        <div style={{ marginTop: "20px" }}>
          <h2>Evaluation Result:</h2>
          <p>{evaluationResult}</p>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
