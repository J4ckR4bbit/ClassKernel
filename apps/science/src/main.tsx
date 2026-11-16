import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme } from "./theme";
import "@classkernel/ui/fonts";
import "@classkernel/ui/base.css";
import "./styles.css";

// Before the first render, so a dark theme never starts with a white flash.
initTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
