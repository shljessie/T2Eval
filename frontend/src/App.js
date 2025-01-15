import React, { useEffect, useState } from "react";

const App = () => {
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/hello")
      .then((response) => response.json())
      .then((data) => setMessage(data.message));
  }, []);

  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <h1>T2Eval</h1>
      <p>{message}</p>
    </div>
  );
};

export default App;
