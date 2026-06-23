import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

export function mountBuildingGPT(root: HTMLElement): void {
  root.querySelector("[data-static-fallback]")?.setAttribute("data-static-fallback", "superseded");
  root.replaceChildren();

  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

const root = document.getElementById("root");

if (root) {
  mountBuildingGPT(root);
}
