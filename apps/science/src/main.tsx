import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initTheme, revealWindow } from "./theme";
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

// In the desktop app, after React has drawn the first screen (a timer rather
// than an animation frame: frames don't run in a window that is still hidden).
setTimeout(() => void revealWindow(), 0);
