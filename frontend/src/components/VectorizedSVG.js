import React from "react";

const VectorizedSVG = ({ svgCode }) => {
  if (!svgCode) return null; // Don't render anything if there's no SVG

  return (
    <div style={{ textAlign: "center", marginTop: "20px" }}>
      <h3>Vectorized SVG Preview</h3>
      <div dangerouslySetInnerHTML={{ __html: svgCode }} />
    </div>
  );
};

export default VectorizedSVG;
