import React, { useState } from "react";

const ImageGen = () => {
  const [prompt, setPrompt] = useState("");
  const [image, setImage] = useState(null);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setImage(null);

    try {
      const response = await fetch("/home/image-gen", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        setError(errorData.error || "Failed to generate image");
        return;
      }

      const data = await response.json();
      setImage(data.imageUrl); // Assuming the backend returns an `imageUrl`
    } catch (err) {
      setError("An error occurred while generating the image");
    }
  };

  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>Image Generator</h1>
      <form onSubmit={handleSubmit}>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows="4"
          cols="50"
          placeholder="Enter your prompt..."
        ></textarea>
        <br />
        <button type="submit">Generate Image</button>
      </form>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {image && (
        <div>
          <h2>Generated Image:</h2>
          <img src={image} alt="Generated" style={{ maxWidth: "100%" }} />
        </div>
      )}
    </div>
  );
};

export default ImageGen;
