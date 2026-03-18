import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Apply theme immediately to prevent flash of wrong theme
(function () {
  const stored = localStorage.getItem("scribe-theme") || "system";
  const isDark =
    stored === "dark" ||
    (stored === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
})();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
