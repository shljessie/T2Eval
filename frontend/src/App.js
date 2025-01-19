import "@fontsource/inter";

import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

import Home from "./pages/Home";
import React from "react";

// Create a Material-UI theme
const theme = createTheme({
  palette: {
    primary: {
      main: "#000000", //black
    },
    secondary: {
      main: "#808080", //gray
    },
    background: {
      default: "white",
    },
  },
  typography: {
    fontFamily: "Inter, Basis Grotesque, sans-serif",
  },
});

const App = () => (
  <ThemeProvider theme={theme}>
    <CssBaseline />
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
    </Router>
  </ThemeProvider>
);

export default App;
