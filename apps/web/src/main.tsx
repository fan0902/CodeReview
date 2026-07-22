import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { configureMonaco } from "./features/files/monaco-setup.js";
import "./styles/tokens.css";

configureMonaco();

const root = document.getElementById("root");
if (!root) throw new Error("CR root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
