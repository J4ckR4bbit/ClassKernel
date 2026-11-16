import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { installMissingFolderDemo } from "./lib/demoMissingFolder";
import { initTheme, revealWindow } from "./store/theme";
// Roboto, bundled: the CSP allows no font CDN.
import "@classkernel/ui/fonts";
// The look ClassKernel shares with ClassKernel Science, then its own styles.
import "@classkernel/ui/base.css";
import "./styles.css";

// Before the first render, so a dark theme never starts with a white flash.
initTheme();
installMissingFolderDemo();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// After React has drawn the first screen (a timer rather than an animation
// frame: frames don't run in a window that is still hidden).
setTimeout(() => void revealWindow(), 0);
