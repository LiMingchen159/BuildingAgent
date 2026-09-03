import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";

const API_BASE = process.env.REAL_API_BASE ?? "http://127.0.0.1:3000";
const PROJECT_ID = process.env.REAL_PROJECT_ID ?? "project_element";
const TOKEN = process.env.REAL_TOKEN ?? "seed-token-buildinggpt";
const METRIC_INSTANCE_ID = process.env.REAL_METRIC_INSTANCE_ID ?? "";
const nodeFetch = globalThis.fetch.bind(globalThis);

function realApiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const raw = String(input);
  const url = raw.startsWith("/api") || raw.startsWith("/health")
    ? `${API_BASE}${raw}`
    : raw;
  return nodeFetch(url, init);
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", `/projects/${PROJECT_ID}/kpis/${METRIC_INSTANCE_ID}`);
  window.localStorage.setItem("building-agent.session.v1", JSON.stringify({
    token: TOKEN,
    user: { id: "user_buildinggpt", name: "BuildingGPT" },
    projectId: PROJECT_ID
  }));

  class InertWebSocket {
    static OPEN = 1;
    readyState = InertWebSocket.OPEN;
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor() {
      queueMicrotask(() => this.onopen?.());
    }
    send() {
      // Real KPI page checks do not need websocket traffic.
    }
    close() {
      this.onclose?.();
    }
  }

  vi.stubGlobal("fetch", vi.fn(realApiFetch));
  vi.stubGlobal("WebSocket", InertWebSocket as unknown as typeof WebSocket);
  if (!HTMLElement.prototype.scrollIntoView) {
    HTMLElement.prototype.scrollIntoView = vi.fn();
  }
});

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await act(async () => {
    await Promise.resolve();
  });
});

describe.skipIf(!METRIC_INSTANCE_ID)("Generated KPI/FDD page against real API", () => {
  it("renders the generated derived asset page with group and entity Background Calculation controls", async () => {
    render(<App />);

    const title = await screen.findByRole("heading", { name: /system cop/i }, { timeout: 30_000 });
    const detailPage = title.closest(".kpi-detail-page");
    expect(detailPage).toBeTruthy();

    const metricList = await screen.findByLabelText("Project KPI assets");
    await waitFor(() => {
      const metricRows = metricList.querySelectorAll(".workspace-right-metric-row");
      expect(metricRows).toHaveLength(1);
      expect(within(metricRows[0] as HTMLElement).getByText(/system cop/i)).toBeInTheDocument();
      expect(within(metricRows[0] as HTMLElement).getAllByText(/8 entities/i).length).toBeGreaterThanOrEqual(1);
      expect(metricRows[0]?.querySelectorAll(".metric-toggle input")).toHaveLength(1);
    }, { timeout: 30_000 });

    expect(within(detailPage as HTMLElement).queryByText(/^KPI$/)).not.toBeInTheDocument();
    expect(within(detailPage as HTMLElement).queryByText(/system_cop\s*·\s*v\d+/i)).not.toBeInTheDocument();
    expect(within(detailPage as HTMLElement).getByText("Formula")).toBeInTheDocument();
    expect((detailPage as HTMLElement).querySelector(".kpi-formula-markdown .katex-display")).toBeInTheDocument();
    expect(within(detailPage as HTMLElement).getByText(/Coefficient of Performance/i)).toBeInTheDocument();
    expect(within(detailPage as HTMLElement).getByText("Inputs / Output")).toBeInTheDocument();
    expect(within(detailPage as HTMLElement).getAllByText("Background Calculation").length).toBeGreaterThanOrEqual(1);
    expect(within(detailPage as HTMLElement).getByText("Covered Entities")).toBeInTheDocument();
    expect(within(detailPage as HTMLElement).getByText("Linked Dashboards")).toBeInTheDocument();

    const coveredEntitiesSection = screen.getByText("Covered Entities").closest("section");
    expect(coveredEntitiesSection).toBeTruthy();
    await waitFor(() => {
      for (const label of ["WCC-01", "WCC-02", "WCC-03", "WCC-04", "WCC-05", "WCC-06", "WCC-07", "WCC-08"]) {
        expect(within(coveredEntitiesSection as HTMLElement).getByText(new RegExp(label, "i"))).toBeInTheDocument();
      }
      const entityBackgroundStates = [...coveredEntitiesSection!.querySelectorAll(".kpi-entity-background small")].map((node) => node.textContent);
      expect(entityBackgroundStates).toHaveLength(8);
      expect(entityBackgroundStates.every((value) => value === "On")).toBe(true);
      const toggles = detailPage!.querySelectorAll(".metric-toggle input");
      expect(toggles.length).toBeGreaterThanOrEqual(9);
      expect([...toggles].every((toggle) => toggle instanceof HTMLInputElement && toggle.checked)).toBe(true);
    }, { timeout: 30_000 });

    const linkedDashboardsSection = screen.getByText("Linked Dashboards").closest("section");
    expect(linkedDashboardsSection).toBeTruthy();
    expect(within(linkedDashboardsSection as HTMLElement).getByText(/Chiller COP/i)).toBeInTheDocument();
    expect((linkedDashboardsSection as HTMLElement).querySelector(".kpi-dashboard-link-icon")).toBeInTheDocument();

    await waitFor(() => {
      expect(document.body).not.toHaveTextContent(/Materializing|materializer|materialization/i);
    });
  }, 45_000);
});
