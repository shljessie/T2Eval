import { Route, BrowserRouter as Router, Routes } from "react-router-dom";

import Home from "./pages/Home";
import React from "react";

const App = () => (
  <Router>
    <Routes>
      <Route path="/" element={<Home />} />
    </Routes>
  </Router>
);

export default App;
