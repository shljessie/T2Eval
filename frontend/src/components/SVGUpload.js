import {
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Grid,
  IconButton,
  Menu,
  MenuItem,
  Slider,
  Switch,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { parseSync, stringify } from "svgson";

import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import NavBar from "./NavBar";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import tactileRules from "../tactileRules.json";

/************************************************
 (1) Recursively parse elements & store snippet
*************************************************/
const categorizeElements = (elements) => {
  return elements.reduce((acc, element) => {
    const { name, attributes, children } = element;
    if (attributes?.id) {
      acc[attributes.id] = {
        type: name,
        attributes,
        original: stringify({
          ...element,
          name: element.name || "svg",
        }),
      };
    }
    if (children?.length) {
      Object.assign(acc, categorizeElements(children));
    }
    return acc;
  }, {});
};

/************************************************
 (2) Basic property inference for each element
*************************************************/
const inferProperties = (type, attributes) => {
  const props = [];
  if (type === "line") {
    props.push("line");
    if (attributes.strokeDasharray) {
      props.push("dashed_line");
    }
  } else if (["rect", "circle", "polygon"].includes(type)) {
    props.push("shape");
  } else if (type === "text") {
    props.push("label");
  } else if (type === "path") {
    const fill = (attributes.fill || "").trim().toLowerCase();
    const d = (attributes.d || "").trim();
    const endsClosed = d.endsWith("z") || d.endsWith("Z");
    if ((fill && fill !== "none") || endsClosed) {
      props.push("shape");
    } else if (attributes.stroke && attributes.stroke !== "none") {
      props.push("line");
    } else {
      props.push("shape");
    }
  }
  return props;
};

/************************************************
 (3) Apply local Tactile Rules (based on properties)
*************************************************/
const checkLocalRules = (elementId, elementProps) => {
  const issues = [];
  if (elementProps.includes("line")) {
    (tactileRules.lines?.primary_lines || []).forEach((r) => {
      issues.push(r.rule);
    });
  }
  if (elementProps.includes("dashed_line")) {
    (tactileRules.lines?.secondary_lines || []).forEach((r) => {
      issues.push(r.rule);
    });
  }
  if (elementProps.includes("shape")) {
    (tactileRules.shapes?.simple_geometric_shapes || []).forEach((r) => {
      issues.push(r.rule);
    });
  }
  if (elementProps.includes("label")) {
    (tactileRules.keys_and_labels || []).forEach((r) => {
      issues.push(r.rule);
    });
  }
  return issues;
};

/************************************************
 (4) Send snippet + local issues to Gemini
*************************************************/
const callGeminiForIssues = async (id, snippet, localIssues) => {
  const prompt = `
    You are an expert in tactile graphics and accessibility.
    Below is an SVG snippet with ID: ${id}.
    It has the following local issues found by our rule-based system:
    ${localIssues.length ? localIssues.join("\\n") : "(None)"}

    Evaluate the snippet for any additional issues or improvements
    the user should know about, from a tactile graphics perspective.
    Then list all issues (local + new) clearly, and provide suggestions.
    keep the evaluation short and concise.
  `;
  try {
    const response = await fetch("/api/process-svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ svgCode: snippet, prompt }),
    });
    const data = await response.json();
    const rawText = data.svg || "No AI response found.";
    let combinedIssues = [...localIssues];
    let suggestions = "";
    const lines = rawText.split("\n");
    let readingIssues = false;
    let readingSuggestions = false;
    for (const line of lines) {
      const lower = line.toLowerCase().trim();
      if (lower.startsWith("issues:")) {
        readingIssues = true;
        readingSuggestions = false;
        continue;
      }
      if (lower.startsWith("suggestions:")) {
        readingSuggestions = true;
        readingIssues = false;
        continue;
      }
      if (readingIssues && line.trim()) {
        combinedIssues.push(line.trim());
      } else if (readingSuggestions && line.trim()) {
        suggestions += line.trim() + "\n";
      }
    }
    combinedIssues = [...new Set(combinedIssues)];
    return { issues: combinedIssues, suggestions: suggestions.trim() };
  } catch (err) {
    console.error("Gemini error:", err);
    return { issues: localIssues, suggestions: "Gemini call failed." };
  }
};

/************************************************
 Global Utilities
*************************************************/
// Applies a global outline (if missing) with stroke-width set to 1 (or global setting)
const applyGlobalOutline = (svgString) => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, "image/svg+xml");
  const shapeElements = doc.querySelectorAll(
    "path, rect, circle, ellipse, polygon, line, polyline"
  );
  shapeElements.forEach((el) => {
    const stroke = el.getAttribute("stroke");
    if (!stroke || stroke.toLowerCase() === "none") {
      el.setAttribute("stroke", "black");
      el.setAttribute("stroke-width", "1");
    }
  });
  return new XMLSerializer().serializeToString(doc);
};

const TactileGraphicEvaluator = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [originalSVG, setOriginalSVG] = useState(null);
  const [tactileSVG, setTactileSVG] = useState(null);
  const [viewMode, setViewMode] = useState("tactile"); // "original" or "tactile"
  const [scale, setScale] = useState(1);
  const [currentEvalIndex, setCurrentEvalIndex] = useState(0);
  const [exportAnchorEl, setExportAnchorEl] = useState(null);

  // Global settings
  const [globalOutlineThickness, setGlobalOutlineThickness] = useState(1);
  const [patternTileSize, setPatternTileSize] = useState(20);

  const canvasRef = useRef(null);

  /************************************************
   1. File Upload & Processing
  *************************************************/
  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "image/svg+xml") {
      alert("Please upload a valid SVG file!");
      return;
    }
    setLoading(true);
    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const rawSVG = evt.target.result;
          setOriginalSVG(rawSVG);
          const outlinedSVG = applyGlobalOutline(rawSVG);
          setTactileSVG(outlinedSVG);
          const parsed = parseSync(rawSVG);
          const categorized = categorizeElements(parsed.children);
          const tasks = Object.entries(categorized).map(async ([id, obj]) => {
            const { type, original, attributes } = obj;
            const props = inferProperties(type, attributes);
            const localIssues = checkLocalRules(id, props);
            const { issues, suggestions } = await callGeminiForIssues(
              id,
              original,
              localIssues
            );
            const evaluationLogic = `ASP Logic Evaluation:
- Inferred Properties: ${props.join(", ") || "None"}
- Local Rules Applied: ${localIssues.join(", ") || "None"}
- Combined Issues: ${issues.join(", ") || "None"}
- Suggestions: ${suggestions || "None"}`;
            return [id, { type, svgSnippet: original, issues, suggestions, evaluationLogic }];
          });
          const results = await Promise.all(tasks);
          const finalReport = {};
          results.forEach(([id, data]) => {
            finalReport[id] = data;
          });
          setReport(finalReport);
          setCurrentEvalIndex(0);
        } catch (err) {
          console.error("Failed to process SVG:", err);
        } finally {
          setLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("Could not read file:", err);
      setLoading(false);
    }
  }, []);

  /************************************************
   2. Zoom Controls
  *************************************************/
  const handleZoomIn = () => setScale((prev) => prev + 0.1);
  const handleZoomOut = () => setScale((prev) => Math.max(prev - 0.1, 0.1));

  /************************************************
   3. Export
  *************************************************/
  const handleExport = (format) => {
    alert(`Export as ${format} clicked`);
  };

  /************************************************
   4. Line Thickness Utility (Individual)
  *************************************************/
  const applyLineThickness = (element, thickness) => {
    element.setAttribute("stroke-width", thickness);
  };

  /************************************************
   5. Global Outline Update
  *************************************************/
  const updateGlobalOutlineThickness = (thickness) => {
    setGlobalOutlineThickness(thickness);
    const svg = canvasRef.current.querySelector("svg");
    if (!svg) return;
    const elements = svg.querySelectorAll("path, rect, circle, ellipse, polygon, line, polyline");
    elements.forEach((el) => {
      if (el.getAttribute("stroke") && el.getAttribute("stroke").toLowerCase() !== "none") {
        el.setAttribute("stroke-width", thickness);
      }
    });
    setTactileSVG(svg.outerHTML);
  };

  /************************************************
   6. Global Pattern Tile Size Update
  *************************************************/
  const updateGlobalPatternTileSize = (size) => {
    setPatternTileSize(size);
    const svg = canvasRef.current.querySelector("svg");
    if (!svg) return;
    const defs = svg.querySelector("defs");
    if (!defs) return;
    const patterns = defs.querySelectorAll("pattern[id^='pattern-']");
    patterns.forEach((pattern) => {
      pattern.setAttribute("width", size);
      pattern.setAttribute("height", size);
      // Optionally update child elements here if needed.
    });
    setTactileSVG(svg.outerHTML);
  };

  /************************************************
   7. Pattern Fill Utility for Shapes (Individual)
  *************************************************/
  const applyPatternFill = (element, patternType) => {
    const container = canvasRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;
    let defs = svg.querySelector("defs");
    if (!defs) {
      defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      svg.insertBefore(defs, svg.firstChild);
    }
    let elementId = element.getAttribute("id");
    if (!elementId) {
      elementId = "elem-" + Math.random().toString(36).substring(2, 9);
      element.setAttribute("id", elementId);
    }
    const patternId = `pattern-${elementId}`;
    const existingPattern = defs.querySelector(`#${patternId}`);
    if (existingPattern) {
      defs.removeChild(existingPattern);
    }
    const pattern = document.createElementNS("http://www.w3.org/2000/svg", "pattern");
    pattern.setAttribute("id", patternId);
    pattern.setAttribute("patternUnits", "userSpaceOnUse");
    pattern.setAttribute("width", patternTileSize);
    pattern.setAttribute("height", patternTileSize);
    if (patternType === "dotted") {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", patternTileSize / 2);
      circle.setAttribute("cy", patternTileSize / 2);
      circle.setAttribute("r", patternTileSize / 10);
      circle.setAttribute("fill", "black");
      pattern.appendChild(circle);
    } else if (patternType === "stripes") {
      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", "0");
      rect.setAttribute("y", "0");
      rect.setAttribute("width", patternTileSize);
      rect.setAttribute("height", patternTileSize / 5);
      rect.setAttribute("fill", "black");
      pattern.appendChild(rect);
    } else if (patternType === "waves") {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      // Create a wave based on the current tile size.
      path.setAttribute(
        "d",
        `M0,${patternTileSize / 2} Q${patternTileSize / 2},0 ${patternTileSize},${patternTileSize / 2} L${patternTileSize},${patternTileSize} L0,${patternTileSize} Z`
      );
      path.setAttribute("fill", "black");
      pattern.appendChild(path);
    } else if (patternType === "crosshatch") {
      const line1 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line1.setAttribute("x1", "0");
      line1.setAttribute("y1", "0");
      line1.setAttribute("x2", patternTileSize);
      line1.setAttribute("y2", patternTileSize);
      line1.setAttribute("stroke", "black");
      line1.setAttribute("stroke-width", "1");
      pattern.appendChild(line1);
      const line2 = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line2.setAttribute("x1", patternTileSize);
      line2.setAttribute("y1", "0");
      line2.setAttribute("x2", "0");
      line2.setAttribute("y2", patternTileSize);
      line2.setAttribute("stroke", "black");
      line2.setAttribute("stroke-width", "1");
      pattern.appendChild(line2);
    }
    defs.appendChild(pattern);
    element.setAttribute("fill", `url(#${patternId})`);
    element.style.fill = `url(#${patternId})`;
    element.setAttribute("stroke", "black");
    element.setAttribute("stroke-width", globalOutlineThickness);
  };

  /************************************************
   8. Action: Fill Shape with Pattern (in Tactile mode)
  *************************************************/
  const handlePatternFill = (id, patternType) => {
    if (viewMode !== "tactile") return;
    const container = canvasRef.current;
    if (!container) return;
    const target = container.querySelector(`#${id}`);
    if (target) {
      applyPatternFill(target, patternType);
      const svg = container.querySelector("svg");
      if (svg) {
        setTactileSVG(svg.outerHTML);
      }
    }
  };

  /************************************************
   9. Action: Set Line Thickness (Individual, Tactile mode)
  *************************************************/
  const handleLineThickness = (id, thickness) => {
    if (viewMode !== "tactile") return;
    const container = canvasRef.current;
    if (!container) return;
    const target = container.querySelector(`#${id}`);
    if (target) {
      applyLineThickness(target, thickness);
      const svg = container.querySelector("svg");
      if (svg) {
        setTactileSVG(svg.outerHTML);
      }
    }
  };

  /************************************************
   10. Action: Set Line Style (Primary, Secondary, Dotted, or Original)
  *************************************************/
  const handleLineStyle = (id, styleType) => {
    if (viewMode !== "tactile") return;
    const container = canvasRef.current;
    if (!container) return;
    const target = container.querySelector(`#${id}`);
    if (!target) return;
    if (styleType === "original") {
      if (report && report[id]) {
        const parser = new DOMParser();
        const originalDoc = parser.parseFromString(report[id].svgSnippet, "image/svg+xml");
        const originalEl = originalDoc.querySelector(`#${id}`);
        if (originalEl) {
          const origStroke = originalEl.getAttribute("stroke") || "black";
          const origDash = originalEl.getAttribute("stroke-dasharray");
          const origWidth = originalEl.getAttribute("stroke-width") || globalOutlineThickness;
          target.setAttribute("stroke", origStroke);
          origDash ? target.setAttribute("stroke-dasharray", origDash) : target.removeAttribute("stroke-dasharray");
          target.setAttribute("stroke-width", origWidth);
        }
      }
    } else {
      if (styleType === "primary") {
        target.removeAttribute("stroke-dasharray");
      } else if (styleType === "secondary") {
        target.setAttribute("stroke-dasharray", "5,5");
      } else if (styleType === "dotted") {
        target.setAttribute("stroke-dasharray", "2,2");
      }
      if (!target.getAttribute("stroke") || target.getAttribute("stroke") === "none") {
        target.setAttribute("stroke", "black");
      }
      if (!target.getAttribute("stroke-width")) {
        target.setAttribute("stroke-width", globalOutlineThickness);
      }
    }
    const svg = container.querySelector("svg");
    if (svg) {
      setTactileSVG(svg.outerHTML);
    }
  };

  /************************************************
   11. Global Individual Pattern Tile Size Update (for a specific element)
  *************************************************/
  const handleIndividualPatternTileSize = (id, newSize) => {
    if (viewMode !== "tactile") return;
    const container = canvasRef.current;
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;
    const defs = svg.querySelector("defs");
    if (!defs) return;
    const patternId = `pattern-${id}`;
    const pattern = defs.querySelector(`#${patternId}`);
    if (!pattern) return;
    // Update tile size for the pattern.
    pattern.setAttribute("width", newSize);
    pattern.setAttribute("height", newSize);
    // Update child elements accordingly.
    if (pattern.querySelector("circle")) {
      const circle = pattern.querySelector("circle");
      circle.setAttribute("cx", newSize / 2);
      circle.setAttribute("cy", newSize / 2);
      circle.setAttribute("r", newSize / 10);
    }
    if (pattern.querySelector("rect")) {
      const rect = pattern.querySelector("rect");
      rect.setAttribute("width", newSize);
      rect.setAttribute("height", newSize / 5);
    }
    if (pattern.querySelector("path")) {
      const path = pattern.querySelector("path");
      path.setAttribute("d", `M0,${newSize / 2} Q${newSize / 2},0 ${newSize},${newSize / 2} L${newSize},${newSize} L0,${newSize} Z`);
    }
    if (pattern.querySelectorAll("line").length >= 2) {
      const lines = pattern.querySelectorAll("line");
      lines[0].setAttribute("x2", newSize);
      lines[0].setAttribute("y2", newSize);
      lines[1].setAttribute("x1", newSize);
      lines[1].setAttribute("y2", newSize);
    }
    setTactileSVG(svg.outerHTML);
  };

  /************************************************
   12. Remove Pattern Fill (Revert to Original Fill)
  *************************************************/
  const handleRemovePatternFill = (id) => {
    if (viewMode !== "tactile") return;
    const container = canvasRef.current;
    if (!container) return;
    const target = container.querySelector(`#${id}`);
    if (!target) return;
    if (report && report[id]) {
      const parser = new DOMParser();
      const originalDoc = parser.parseFromString(report[id].svgSnippet, "image/svg+xml");
      const originalEl = originalDoc.querySelector(`#${id}`);
      if (originalEl) {
        const origFill = originalEl.getAttribute("fill") || "none";
        target.setAttribute("fill", origFill);
        target.style.fill = origFill;
      }
    }
    const svg = container.querySelector("svg");
    if (svg) {
      setTactileSVG(svg.outerHTML);
    }
  };

  /************************************************
   13. Filter & Navigate Elements with Issues
  *************************************************/
  const errorEvaluations = report
    ? Object.entries(report).filter(([id, data]) => data.issues && data.issues.length > 0)
    : [];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!errorEvaluations.length) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        setCurrentEvalIndex((prev) => (prev + 1) % errorEvaluations.length);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        setCurrentEvalIndex((prev) => (prev - 1 + errorEvaluations.length) % errorEvaluations.length);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [errorEvaluations]);

  useEffect(() => {
    if (!canvasRef.current || !errorEvaluations.length) return;
    const highlighted = canvasRef.current.querySelectorAll(".highlight");
    highlighted.forEach((el) => el.classList.remove("highlight"));
    const [currentId] = errorEvaluations[currentEvalIndex];
    const target = canvasRef.current.querySelector(`#${currentId}`);
    if (target) {
      target.classList.add("highlight");
    }
  }, [currentEvalIndex, errorEvaluations, viewMode]);

  const displayedSVG = viewMode === "tactile" ? tactileSVG : originalSVG;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <style>{`
        .highlight {
          stroke: red !important;
          stroke-width: 3px !important;
          filter: drop-shadow(0 0 5px red);
          transition: all 0.3s ease;
        }
      `}</style>

      <NavBar />

      <Grid container sx={{ flex: 1 }}>
        <Grid item xs={12} sm={3} sx={{ borderRight: "1px solid #ccc", p: 2, overflowY: "auto" }}>
          <Box sx={{ mb: 3 }}>
            <input id="file-input" type="file" accept=".svg" onChange={handleFileChange} style={{ display: "none" }} />
            <label htmlFor="file-input">
              <Button variant="contained" component="span" fullWidth>Upload SVG</Button>
            </label>
          </Box>

          {originalSVG && tactileSVG && (
            <Box sx={{ mb: 3 }}>
              <Typography variant="body2">Toggle View</Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2">Original</Typography>
                <Switch
                  checked={viewMode === "tactile"}
                  onChange={() => setViewMode((prev) => (prev === "tactile" ? "original" : "tactile"))}
                />
                <Typography variant="body2">Tactile</Typography>
              </Box>
            </Box>
          )}

          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
              <IconButton onClick={handleZoomOut} color="primary">
                <ZoomOutIcon />
              </IconButton>
              <Typography variant="body1" sx={{ alignSelf: "center" }}>{Math.round(scale * 100)}%</Typography>
              <IconButton onClick={handleZoomIn} color="primary">
                <ZoomInIcon />
              </IconButton>
            </Box>
            <Slider value={scale} min={0.1} max={3} step={0.1} onChange={(e, value) => setScale(value)} aria-labelledby="zoom-slider" />
          </Box>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body2">Global Outline Thickness</Typography>
            <Slider
              value={globalOutlineThickness}
              min={0.5}
              max={10}
              step={0.5}
              onChange={(e, value) => updateGlobalOutlineThickness(value)}
              aria-labelledby="outline-slider"
            />
          </Box>

          <Box>
            <Typography variant="h8" gutterBottom>Evaluation Report</Typography>
            <Box sx={{ display: "flex", justifyContent: "space-between", mt: 1 }}>
              <IconButton onClick={() => setCurrentEvalIndex((prev) => (prev - 1 + errorEvaluations.length) % errorEvaluations.length)}>
                <ArrowBackIosIcon />
              </IconButton>
              <IconButton onClick={() => setCurrentEvalIndex((prev) => (prev + 1) % errorEvaluations.length)}>
                <ArrowForwardIosIcon />
              </IconButton>
            </Box>
            {loading ? (
              <Box sx={{ textAlign: "center", mt: 2 }}>
                <CircularProgress size={24} />
                <Typography variant="body2">Processing...</Typography>
              </Box>
            ) : errorEvaluations.length ? (
              (() => {
                const [currentId, currentData] = errorEvaluations[currentEvalIndex];
                return (
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="subtitle1">
                        ID: {currentId} ({currentEvalIndex + 1} of {errorEvaluations.length})
                      </Typography>
                      <Typography variant="body2">Type: {currentData.type}</Typography>
                      <Box sx={{ mt: 1 }}>
                        <Typography variant="subtitle2">Issues:</Typography>
                        <ul>
                          {currentData.issues.map((issue, idx) => (
                            <li key={idx}>
                              <Typography variant="body2">{issue}</Typography>
                            </li>
                          ))}
                        </ul>
                      </Box>
                      {currentData.suggestions && (
                        <Box sx={{ mt: 1 }}>
                          <Typography variant="subtitle2">Suggestions:</Typography>
                          <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                            {currentData.suggestions}
                          </Typography>
                        </Box>
                      )}
                    </CardContent>
                  </Card>
                );
              })()
            ) : (
              !loading && <Typography variant="body2">No issues found in evaluations.</Typography>
            )}
          </Box>

          {errorEvaluations.length > 0 && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h8" gutterBottom>Interactive Enhancements</Typography>
              {(() => {
                const [currentId, currentData] = errorEvaluations[currentEvalIndex];
                if (currentData.type === "line") {
                  return (
                    <>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
                        <Typography variant="subtitle2">Line Thickness</Typography>
                        <Box sx={{ display: "flex", gap: 1 }}>
                          <Button variant="outlined" onClick={() => handleLineThickness(currentId, "1")}>Thin</Button>
                          <Button variant="outlined" onClick={() => handleLineThickness(currentId, "3")}>Medium</Button>
                          <Button variant="outlined" onClick={() => handleLineThickness(currentId, "5")}>Thick</Button>
                        </Box>
                      </Box>
                      <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <Typography variant="subtitle2">Line Style</Typography>
                        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                          <Button variant="outlined" onClick={() => handleLineStyle(currentId, "original")}>Original</Button>
                          <Button variant="outlined" onClick={() => handleLineStyle(currentId, "primary")}>Primary</Button>
                          <Button variant="outlined" onClick={() => handleLineStyle(currentId, "secondary")}>Secondary</Button>
                          <Button variant="outlined" onClick={() => handleLineStyle(currentId, "dotted")}>Dotted</Button>
                        </Box>
                      </Box>
                    </>
                  );
                } else {
                  return (
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <Typography variant="subtitle2">Pattern Fill</Typography>
                      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                        <Button variant="outlined" onClick={() => handleRemovePatternFill(currentId)}>Original</Button>
                        <Button variant="outlined" onClick={() => handlePatternFill(currentId, "dotted")}>Dotted</Button>
                        <Button variant="outlined" onClick={() => handlePatternFill(currentId, "stripes")}>Stripes</Button>
                        <Button variant="outlined" onClick={() => handlePatternFill(currentId, "waves")}>Waves</Button>
                        <Button variant="outlined" onClick={() => handlePatternFill(currentId, "crosshatch")}>Crosshatch</Button>
                      </Box>
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="subtitle2">Individual Pattern Tile Size</Typography>
                        <Slider
                          defaultValue={patternTileSize}
                          min={5}
                          max={100}
                          step={1}
                          onChangeCommitted={(e, value) => handleIndividualPatternTileSize(currentId, value)}
                        />
                      </Box>
                    </Box>
                  );
                }
              })()}
            </Box>
          )}

          <Box sx={{ mb: 3, mt: 3 }}>
            <Button variant="outlined" fullWidth onClick={(e) => setExportAnchorEl(e.currentTarget)}>
              Export
            </Button>
            <Menu anchorEl={exportAnchorEl} open={Boolean(exportAnchorEl)} onClose={() => setExportAnchorEl(null)}>
              <MenuItem onClick={() => { handleExport("SVG"); setExportAnchorEl(null); }}>Download as SVG</MenuItem>
              <MenuItem onClick={() => { handleExport("PNG"); setExportAnchorEl(null); }}>Download as PNG</MenuItem>
              <MenuItem onClick={() => { handleExport("PDF"); setExportAnchorEl(null); }}>Download as PDF</MenuItem>
            </Menu>
          </Box>
        </Grid>

        <Grid item xs={12} sm={9} sx={{ p: 2, display: "flex", justifyContent: "center", alignItems: "center", overflow: "auto" }}>
          {displayedSVG ? (
            <Box ref={canvasRef} sx={{ p: 2, transform: `scale(${scale})` }} dangerouslySetInnerHTML={{ __html: displayedSVG }} />
          ) : (
            <Typography variant="h6" color="textSecondary">SVG will be displayed here.</Typography>
          )}
        </Grid>
      </Grid>
    </Box>
  );
};

export default TactileGraphicEvaluator;
