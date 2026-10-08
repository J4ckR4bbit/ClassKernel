import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Roboto, bundled (the CSP allows no font CDN): the three weights the app uses,
// Latin and Latin Extended only, so accented names still render in it.
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-ext-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-ext-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-ext-700.css";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
