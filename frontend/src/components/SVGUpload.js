import { Box, Button, Card, CardContent, CircularProgress, Typography, Grid, Accordion, AccordionSummary, AccordionDetails } from "@mui/material";
import React, { useCallback, useState } from "react";
import { parseSync, stringify } from "svgson";
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningIcon from '@mui/icons-material/Warning';

import NavBar from "./NavBar";
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

const SVGUpload = () => {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [uploadedSVG, setUploadedSVG] = useState(null);

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
          const svgString = evt.target.result;
          setUploadedSVG(svgString);
          const parsed = parseSync(svgString);

          const categorized = categorizeElements(parsed.children);

          const tasks = Object.entries(categorized).map(async ([id, obj]) => {
            const { type, original, attributes } = obj;
            const props = inferProperties(type, attributes);
            const localIssues = checkLocalRules(id, props);
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", p: 0 }}>
      <NavBar />

      <input
        id="file-input"
        type="file"
        accept=".svg"
        onChange={handleFileChange}
        style={{ display: "none", alignText: "center" }}
      />
      <label htmlFor="file-input" sx={{ display: "flex", alignText: "center" }}>
        <Button variant="contained" component="span" color="primary" sx={{ mt: 5 }}>
          Upload SVG to Evaluate Tactile Graphic
        </Button>
      </label>

      {uploadedSVG && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="h6">Uploaded Tactile Graphic</Typography>
          <Box
            sx={{
              border: "1px solid #ccc",
              display: "inline-block",
              p: 2,
              width: '60%',
              "& svg": { maxWidth: "100%", height: "auto" },
            }}
            dangerouslySetInnerHTML={{ __html: uploadedSVG }}
          />
        </Box>
      )}

      {loading && (
        <Box sx={{ mt: 2, textAlign: "center" }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Processing SVG, please wait...
          </Typography>
        </Box>
      )}

      {report && (
        <Box sx={{ mt: 2, width: "80%", textAlign: "left" }}>
          <Typography variant="h6">Evaluation Report</Typography>
          <Grid container spacing={2}>
            {Object.entries(report).map(([id, data]) => {
              const { type, svgSnippet, issues, suggestions } = data;
              const passed = issues.length === 0;
              const hasLongReport = issues.length > 3 || suggestions.length > 100;
              return (
                <Grid item xs={12} sm={4} key={id}>
                  <Card>
                    <CardContent>
                      <Box sx={{ display: "flex", alignItems: "center" }}>
                        {passed ? (
                          <CheckCircleIcon sx={{ color: "green", mr: 1 }} />
                        ) : (
                          <WarningIcon sx={{ color: "orange", mr: 1 }} />
                        )}
                        <Typography variant="subtitle1">Element ID: {id}</Typography>
                      </Box>
                      <Typography variant="body2">Type: {type}</Typography>

                      <Typography variant="h6" sx={{ mt: 2 }}>
                        SVG Element
                      </Typography>
                      <div
                        style={{
                          border: "1px solid #ccc",
                          display: "inline-block",
                          padding: 4,
                        }}
                        dangerouslySetInnerHTML={{
                          __html: `<svg 
                                      xmlns="http://www.w3.org/2000/svg"
                                      style='max-width:200px; max-height:200px; overflow:auto;'
                                    >
                                      ${svgSnippet}
                                    </svg>`,
                        }}
                      />

                      {hasLongReport ? (
                        <Accordion sx={{ mt: 2 }}>
                          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Typography variant="h6">Details</Typography>
                          </AccordionSummary>
                          <AccordionDetails>
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
                          </AccordionDetails>
                        </Accordion>
                      ) : (
                        <>
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
                        </>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              );
            })}
          </Grid>
        </Box>
      )}
    </Box>
  );
};

export default SVGUpload;