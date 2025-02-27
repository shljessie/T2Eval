import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import React, { useCallback, useState } from "react";
import { parseSync, stringify } from "svgson";

import tactileRules from "../tactileRules.json";

// 1) Attempt to get dimension info for shapes/lines
const generateDimensions = (element) => {
  const { attributes } = element;
  const numeric = (val) => (val ? parseFloat(val) : 0);

  if (element.type === "rect") {
    const w = numeric(attributes.width);
    const h = numeric(attributes.height);
    if (w && h) {
      return `bounding_box(${w}, ${h})`;
    }
  } else if (element.type === "circle") {
    const r = numeric(attributes.r);
    if (r) {
      return `bounding_box(${2 * r}, ${2 * r})`;
    }
  } else if (element.type === "line") {
    const x1 = numeric(attributes.x1);
    const y1 = numeric(attributes.y1);
    const x2 = numeric(attributes.x2);
    const y2 = numeric(attributes.y2);
    if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2)) {
      const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2).toFixed(2);
      return `length(${length})`;
    }
  }
  return null;
};

// 2) Recursively parse elements to store each snippet by id
const categorizeElements = (elements) => {
  return elements.reduce((acc, element) => {
    const { name, attributes, children } = element;
    if (attributes?.id) {
      acc[attributes.id] = {
        type: name,
        attributes,
        // Store the snippet for mini rendering
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

// 3) Build base ASP lines for each element, ignoring rules for now
const createAspRepresentation = (id, element, properties) => {
  const lines = [];
  lines.push(`object(${id}).`);

  const dim = generateDimensions(element);
  if (dim) {
    lines.push(`property(object(${id}), ${dim}).`);
  }

  properties.forEach((prop) => {
    if (prop === "line") {
      lines.push(`property(object(${id}), type(line)).`);
    } else if (prop === "dashed_line") {
      lines.push(`property(object(${id}), type(dashed_line)).`);
    } else if (prop === "shape") {
      lines.push(`property(object(${id}), type(shape)).`);
    } else if (prop === "label") {
      lines.push(`property(object(${id}), type(label)).`);
    }
  });

  return lines.join("\n");
};

// 4) Assign broad ASP properties to each element
const assignASPProperties = (elements) => {
  const aspMap = {};

  Object.entries(elements).forEach(([id, element]) => {
    const { type, attributes } = element;
    const props = [];

    // Basic property inference
    if (type === "line") {
      props.push("line");
      if (attributes.strokeDasharray) {
        props.push("dashed_line");
      }
    }
    if (["rect", "circle", "polygon"].includes(type)) {
      props.push("shape");
    }
    if (type === "text") {
      props.push("label");
    }

    const aspString = createAspRepresentation(id, element, props);
    aspMap[id] = { type, properties: props, aspString };
  });

  return aspMap;
};

// 5) For each property, see what rules apply. Then append them as ASP lines.
const evaluateAgainstRules = (elements, aspProperties) => {
  const report = {};

  Object.entries(elements).forEach(([id, element]) => {
    const properties = aspProperties[id]?.properties || [];
    const baseAsp = aspProperties[id]?.aspString || "";

    // We'll store all triggered rule lines plus the text for issues
    const ruleLines = [];
    const issues = [];

    // For example, if it's a line, we add all rules from 'lines.primary_lines'
    properties.forEach((property) => {
      if (property === "line") {
        (tactileRules.lines?.primary_lines || []).forEach((r) => {
          issues.push(r.rule);
          ruleLines.push(`property(object(${id}), rule("${r.rule}")).`);
        });
      }
      if (property === "dashed_line") {
        (tactileRules.lines?.secondary_lines || []).forEach((r) => {
          issues.push(r.rule);
          ruleLines.push(`property(object(${id}), rule("${r.rule}")).`);
        });
      }
      if (property === "shape") {
        (tactileRules.shapes?.simple_geometric_shapes || []).forEach((r) => {
          issues.push(r.rule);
          ruleLines.push(`property(object(${id}), rule("${r.rule}")).`);
        });
      }
      if (property === "label") {
        (tactileRules.keys_and_labels || []).forEach((r) => {
          issues.push(r.rule);
          ruleLines.push(`property(object(${id}), rule("${r.rule}")).`);
        });
      }
    });

    // Combine base lines with rule lines
    const finalAsp = [baseAsp, ...ruleLines].join("\n");

    report[id] = {
      type: element.type,
      issues,
      aspString: finalAsp,
      svgSnippet: element.original || "",
    };
  });

  return report;
};

const UploadSVG = () => {
  const [parsedData, setParsedData] = useState(null);
  const [evaluationReport, setEvaluationReport] = useState(null);
  const [improvements, setImprovements] = useState({});

  const getImprovements = useCallback(async (id, aspString, issues, snippet) => {
    if (issues.length === 0) return "";

    try {
      const prompt = `
      We have an SVG element with the following ASP representation:
      ${aspString}

      The element has these issues:
      ${issues.join("\n")}

      The raw snippet is:
      ${snippet}

      Provide suggestions on how to fix or improve these issues 
      from the perspective of tactile graphics best practices.
      `;

      const response = await fetch("/api/process-svg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ svgCode: snippet, prompt }),
      });

      const data = await response.json();
      console.log('data', data) 
      return data.svg || "No suggestions found.";
    } catch (err) {
      console.error("Improvement fetch error:", err);
      return "Error fetching improvements.";
    }
  }, []);

  const handleFileChange = useCallback(
    (e) => {
      const file = e.target.files[0];
      if (!file || file.type !== "image/svg+xml") {
        alert("Please upload a valid SVG file with element IDs!");
        return;
      }

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const svgString = event.target.result;
          const parsedSVG = parseSync(svgString);

          // 1) Categorize
          const categorizedElements = categorizeElements(parsedSVG.children);
          setParsedData(categorizedElements);

          // 2) Assign ASP
          const aspMap = assignASPProperties(categorizedElements);

          console.log('aspMap', aspMap)

          // 3) Evaluate rules
          const report = evaluateAgainstRules(categorizedElements, aspMap);

          // 4) Optionally call AI for improvements
          const improvementTasks = Object.entries(report).map(async ([id, data]) => {
            const suggestions = await getImprovements(
              id,
              data.aspString,
              data.issues,
              data.svgSnippet
            );
            return [id, suggestions];
          });

          const results = await Promise.all(improvementTasks);
          const suggestionsMap = {};
          results.forEach(([id, text]) => {
            suggestionsMap[id] = text;
          });

          setEvaluationReport(report);
          setImprovements(suggestionsMap);
        } catch (error) {
          alert("Error parsing SVG file: " + error);
        }
      };
      reader.readAsText(file);
    },
    [getImprovements]
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", p: 2 }}>
      <Typography variant="h6">Upload an SVG File</Typography>

      <input
        id="file-input"
        type="file"
        accept=".svg"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <label htmlFor="file-input">
        <Button variant="contained" component="span" color="primary" sx={{ mt: 2 }}>
          Upload SVG
        </Button>
      </label>

      {/* Render the evaluation report */}
      {evaluationReport && (
        <Box sx={{ mt: 2, width: "80%", textAlign: "left" }}>
          <Typography variant="h6">Evaluation Report</Typography>
          {Object.entries(evaluationReport).map(([id, data]) => {
            const elementImprovements = improvements[id] || "";
            return (
              <Card key={id} sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1">Element ID: {id}</Typography>
                  <Typography variant="body2">Type: {data.type}</Typography>

                  {/* (A) Show final ASP with rule references */}
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
                    {data.aspString}
                  </Typography>

                  {/* (B) Show snippet of element */}
                  <Typography variant="h6" sx={{ mt: 2 }}>
                    SVG Element
                  </Typography>
                  <div
                    style={{ border: "1px solid #ccc", display: "inline-block", padding: 4 }}
                    dangerouslySetInnerHTML={{
                      __html: `<svg 
                                 xmlns="http://www.w3.org/2000/svg"
                                 style='max-width:200px; max-height:200px; overflow:auto;'
                               >
                                 ${data.svgSnippet}
                               </svg>`
                    }}
                  />

                  {/* (C) Issues Found */}
                  {data.issues.length > 0 ? (
                    <ul style={{ marginTop: 8 }}>
                      {data.issues.map((issue, idx) => (
                        <li key={idx}>{issue}</li>
                      ))}
                    </ul>
                  ) : (
                    <Typography variant="body2" color="green" sx={{ mt: 1 }}>
                      No issues found
                    </Typography>
                  )}

                  {/* (D) AI Suggestions */}
                  {elementImprovements && (
                    <>
                      <Typography variant="h6" sx={{ mt: 2 }}>
                        AI Suggestions
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
                        {elementImprovements}
                      </Typography>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
};
export default UploadSVG;
