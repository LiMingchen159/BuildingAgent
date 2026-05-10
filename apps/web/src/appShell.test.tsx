import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

function readTrackedIndexHtml(): string {
  return readFileSync(resolve(__dirname, "../index.html"), "utf8");
}

function getRootFromIndexHtml(): HTMLElement {
  const parser = new DOMParser();
  const documentFromFile = parser.parseFromString(readTrackedIndexHtml(), "text/html");
  const root = documentFromFile.getElementById("root");
  if (!root) {
    throw new Error("Expected apps/web/index.html to include #root.");
  }
  return root;
}

beforeEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
});

describe("BuildingAgent no-blank HTML shell", () => {
  it("ships non-empty tracked #root fallback markup with brand, skeleton loading copy, and mock-only safety language", () => {
    const root = getRootFromIndexHtml();

    expect(root.innerHTML.trim()).not.toHaveLength(0);
    expect(root.querySelector("[data-static-fallback]")).toBeTruthy();
    expect(root.textContent).toMatch(/BuildingAgent/i);
    expect(root.textContent).toMatch(/loading|preparing/i);
    expect(root.querySelector(".html-fallback-skeleton")).toBeTruthy();
    expect(root.textContent).toMatch(/mock|stub/i);
    expect(root.textContent).toMatch(/no live building systems/i);
    expect(root.querySelector('[role="status"]')?.textContent).toMatch(/safe startup mode/i);
  });

  it("mountBuildingAgent removes the static fallback before normal React rendering", async () => {
    const { mountBuildingAgent } = await import("./main");
    const root = document.createElement("div");
    root.id = "root";
    root.innerHTML = getRootFromIndexHtml().innerHTML;
    document.body.append(root);
    expect(root.querySelector("[data-static-fallback]")).toBeTruthy();

    mountBuildingAgent(root);

    expect(root.querySelector("[data-static-fallback]")).toBeNull();
    expect(await screen.findByRole("heading", { name: /sign in to buildingagent/i })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/safe startup mode/i)).not.toBeInTheDocument());
  });
});
