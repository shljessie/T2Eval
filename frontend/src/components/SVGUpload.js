import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import React, { useCallback, useState } from "react";
import { parseSync, stringify } from "svgson";

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

  // e.g. "line" or "dashed_line"
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
    // Heuristic: If fill is not 'none', or path ends in z => shape, else line
    const fill = (attributes.fill || "").trim().toLowerCase();
    const d = (attributes.d || "").trim();
    const endsClosed = d.endsWith("z") || d.endsWith("Z");

    if ((fill && fill !== "none") || endsClosed) {
      props.push("shape");
    } else if (attributes.stroke && attributes.stroke !== "none") {
      props.push("line");
    } else {
      // fallback
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

  // For each property, see what rules apply
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
  `;

  try {
    const response = await fetch("/api/process-svg", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ svgCode: snippet, prompt }),
    });

    const data = await response.json();
    const rawText = data.svg || "No AI response found.";

    // We can parse the rawText. For example, let's do a naive approach:
    // - If the AI returns something like:
    //   Issues:
    //   1) ...
    //   2) ...
    //
    //   Suggestions:
    //   ...
    //
    // We'll parse it out:
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

    // Ensure uniqueness in issues
    combinedIssues = [...new Set(combinedIssues)];

    return { issues: combinedIssues, suggestions: suggestions.trim() };
  } catch (err) {
    console.error("Gemini error:", err);
    // If we fail, just return local issues
    return { issues: localIssues, suggestions: "Gemini call failed." };
  }
};

const SVGUpload = () => {
  const [report, setReport] = useState(null);

  const handleFileChange = useCallback(async (e) => {
    const file = e.target.files[0];
    if (!file || file.type !== "image/svg+xml") {
      alert("Please upload a valid SVG file!");
      return;
    }

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const svgString = evt.target.result;
          const parsed = parseSync(svgString);

          // Step A: Collect elements by ID
          const categorized = categorizeElements(parsed.children);

          // Step B: For each element, run local checks + Gemini
          const tasks = Object.entries(categorized).map(async ([id, obj]) => {
            const { type, original, attributes } = obj;
            // 1) Infer properties
            const props = inferProperties(type, attributes);

            // 2) Local issues
            const localIssues = checkLocalRules(id, props);

            // 3) AI check (Gemini) merges local + AI issues
            const { issues, suggestions } = await callGeminiForIssues(id, original, localIssues);

            return [id, { type, svgSnippet: original, issues, suggestions }];
          });

          const results = await Promise.all(tasks);
          const finalReport = {};
          results.forEach(([id, data]) => {
            finalReport[id] = data;
          });

          setReport(finalReport);
        } catch (err) {
          console.error("Failed to parse or process the SVG:", err);
        }
      };
      reader.readAsText(file);
    } catch (err) {
      console.error("Could not read file:", err);
    }
  }, []);

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", p: 2 }}>
      <Typography variant="h6">Upload an SVG (Hybrid Tactile Checks + Gemini)</Typography>

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

      {report && (
        <Box sx={{ mt: 2, width: "80%", textAlign: "left" }}>
          <Typography variant="h6">Evaluation Report</Typography>

          {Object.entries(report).map(([id, data]) => {
            const { type, svgSnippet, issues, suggestions } = data;
            return (
              <Card key={id} sx={{ mt: 2 }}>
                <CardContent>
                  <Typography variant="subtitle1">Element ID: {id}</Typography>
                  <Typography variant="body2">Type: {type}</Typography>

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
                                 ${svgSnippet}
                               </svg>`
                    }}
                  />

                  {/* Issues (merged local + Gemini) */}
                  {issues.length > 0 ? (
                    <>
                      <Typography variant="h6" sx={{ mt: 2 }}>
                        Issues
                      </Typography>
                      <ul style={{ marginTop: 8 }}>
                        {issues.map((issue, idx) => (
                          <li key={idx}>{issue}</li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <Typography variant="body2" color="green" sx={{ mt: 1 }}>
                      No issues found
                    </Typography>
                  )}

                  {/* Suggestions from Gemini */}
                  {suggestions && (
                    <>
                      <Typography variant="h6" sx={{ mt: 2 }}>
                        Suggestions
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>
                        {suggestions}
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

export default SVGUpload;
