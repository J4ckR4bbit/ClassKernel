import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installMissingFolderDemo } from "./lib/demoMissingFolder";
import { initTheme } from "./store/theme";
// Roboto, bundled (the CSP allows no font CDN): the three weights the app uses,
// Latin and Latin Extended only, so accented names still render in it.
import "@fontsource/roboto/latin-400.css";
import "@fontsource/roboto/latin-ext-400.css";
import "@fontsource/roboto/latin-500.css";
import "@fontsource/roboto/latin-ext-500.css";
import "@fontsource/roboto/latin-700.css";
import "@fontsource/roboto/latin-ext-700.css";
import "./styles.css";

// Before the first render, so a dark theme never starts with a white flash.
initTheme();
installMissingFolderDemo();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
