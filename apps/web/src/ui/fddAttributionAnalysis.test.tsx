import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateFddAttributionAnalysis = vi.fn();

vi.mock("../bmsCollectorClient", async () => {
  const actual = await vi.importActual<typeof import("../bmsCollectorClient")>("../bmsCollectorClient");
  return { ...actual, generateFddAttributionAnalysis };
});

const { FddAttributionAnalysisWidget, decideFddAnalysisAction, fddAttributionDailyCacheKey } = await import("./DashboardView");

const ANALYSIS_TEXT = [
  "## Overall summary",
  "WCC-8 reports fault samples across the window and the bound inputs stay within range.",
  "## Likely cause",
  "Chilled water return temperature drifts while the chiller is loaded.",
  "## Data-based next check",
  "Compare CHWRT against CHWST over the same fault window."
].join("\n\n");

type Series = Parameters<typeof FddAttributionAnalysisWidget>[0]["series"];

/** An output series whose values >= 0.5 count as fault samples. */
function faultSeries(sampleCount: number): Series {
  const points = Array.from({ length: sampleCount }, (_value, index) => ({
    ts: new Date(Date.UTC(2026, 7, 20, 0, index)).toISOString(),
    value: index % 4 === 0 ? 1 : 0
  }));
  return [
    {
      label: "WCC-8 FDD output",
      groupLabel: "WCC-8",
      pointName: "WCC-L1-08-FDD",
      unit: "",
      color: "#ef4444",
      dependencyRole: "output",
      points
    },
    {
      label: "WCC-8 CHWRT",
      groupLabel: "WCC-8",
      pointName: "WCC-L1-08-CHWRT",
      unit: "degC",
      color: "#2563eb",
      dependencyRole: "input",
      points: points.map((point, index) => ({ ts: point.ts, value: 12 + (index % 5) * 0.1 }))
    }
  ];
}

function renderWidget(series: Series) {
  return render(
    <FddAttributionAnalysisWidget
      token="token_test"
      projectId="project_element"
      widgetId="widget_fdd"
      series={series}
      loading={false}
      onRefresh={() => undefined}
    />
  );
}

beforeEach(() => {
  window.localStorage.clear();
  generateFddAttributionAnalysis.mockReset();
  generateFddAttributionAnalysis.mockResolvedValue({
    ok: true,
    content: ANALYSIS_TEXT,
    requestId: "req_test"
  });
});

afterEach(() => {
  window.localStorage.clear();
});

describe("decideFddAnalysisAction", () => {
  const base = {
    hasFaultEvidence: true,
    forced: false,
    cacheKey: "key-a",
    hasCachedContent: false,
    lastRequestedKey: null
  };

  it("clears when there is no fault evidence", () => {
    expect(decideFddAnalysisAction({ ...base, hasFaultEvidence: false })).toBe("clear");
  });

  it("generates the first time a key is seen", () => {
    expect(decideFddAnalysisAction(base)).toBe("generate");
  });

  it("prefers the cached analysis", () => {
    expect(decideFddAnalysisAction({ ...base, hasCachedContent: true })).toBe("use-cache");
  });

  it("waits instead of re-asking once a request went out for the same key", () => {
    expect(decideFddAnalysisAction({ ...base, lastRequestedKey: "key-a" })).toBe("wait");
  });

  it("generates again for a different key, such as the next day", () => {
    expect(decideFddAnalysisAction({ ...base, lastRequestedKey: "key-b" })).toBe("generate");
  });

  it("always regenerates when the user forces a refresh", () => {
    expect(decideFddAnalysisAction({ ...base, forced: true, hasCachedContent: true, lastRequestedKey: "key-a" })).toBe("generate");
  });
});

describe("fddAttributionDailyCacheKey", () => {
  it("ignores sample values so live polling cannot invalidate it", () => {
    const first = fddAttributionDailyCacheKey("project_element", "widget_fdd", faultSeries(40), "2026-08-20");
    const second = fddAttributionDailyCacheKey("project_element", "widget_fdd", faultSeries(400), "2026-08-20");
    expect(second).toBe(first);
  });

  it("changes when the local day rolls over", () => {
    const today = fddAttributionDailyCacheKey("project_element", "widget_fdd", faultSeries(40), "2026-08-20");
    const tomorrow = fddAttributionDailyCacheKey("project_element", "widget_fdd", faultSeries(40), "2026-08-21");
    expect(tomorrow).not.toBe(today);
  });

  it("separates widgets and projects", () => {
    const series = faultSeries(40);
    const mine = fddAttributionDailyCacheKey("project_element", "widget_fdd", series, "2026-08-20");
    expect(fddAttributionDailyCacheKey("project_other", "widget_fdd", series, "2026-08-20")).not.toBe(mine);
    expect(fddAttributionDailyCacheKey("project_element", "widget_other", series, "2026-08-20")).not.toBe(mine);
  });
});

describe("FddAttributionAnalysisWidget", () => {
  it("asks BuildingGPT once and keeps the answer while live data keeps polling", async () => {
    const { rerender } = renderWidget(faultSeries(40));
    await waitFor(() => expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1));

    // Each poll hands the widget a brand new series array with an extra sample,
    // which is what used to restart the analysis every 60 seconds.
    for (let poll = 1; poll <= 5; poll += 1) {
      rerender(
        <FddAttributionAnalysisWidget
          token="token_test"
          projectId="project_element"
          widgetId="widget_fdd"
          series={faultSeries(40 + poll)}
          loading={false}
          onRefresh={() => undefined}
        />
      );
      await waitFor(() => expect(screen.getAllByText(/Overall summary/u).length).toBeGreaterThan(0));
    }

    expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1);
  });

  it("does not retry on its own after an unusable answer", async () => {
    generateFddAttributionAnalysis.mockResolvedValue({ ok: true, content: "too short", requestId: "req_bad" });
    const { rerender } = renderWidget(faultSeries(40));
    await waitFor(() => expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1));

    for (let poll = 1; poll <= 3; poll += 1) {
      rerender(
        <FddAttributionAnalysisWidget
          token="token_test"
          projectId="project_element"
          widgetId="widget_fdd"
          series={faultSeries(40 + poll)}
          loading={false}
          onRefresh={() => undefined}
        />
      );
    }

    await waitFor(() => expect(screen.getByText(/incomplete analysis/u)).toBeInTheDocument());
    expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1);
  });

  it("serves a second mount from the daily cache without calling the API", async () => {
    const first = renderWidget(faultSeries(40));
    await waitFor(() => expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText(/Overall summary/u).length).toBeGreaterThan(0));
    first.unmount();

    renderWidget(faultSeries(60));
    await waitFor(() => expect(screen.getAllByText(/Overall summary/u).length).toBeGreaterThan(0));
    expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1);
  });

  it("regenerates when the user clicks Refresh", async () => {
    renderWidget(faultSeries(40));
    await waitFor(() => expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getAllByText(/Overall summary/u).length).toBeGreaterThan(0));

    await userEvent.click(screen.getByRole("button", { name: /refresh/iu }));

    await waitFor(() => expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(2));
  });

  it("keeps only the newest cache entry for a widget", async () => {
    const staleKey = fddAttributionDailyCacheKey("project_element", "widget_fdd", faultSeries(40), "2026-01-01");
    window.localStorage.setItem(staleKey, JSON.stringify({ content: ANALYSIS_TEXT, generatedAt: "2026-01-01T00:00:00.000Z" }));

    renderWidget(faultSeries(40));
    await waitFor(() => expect(generateFddAttributionAnalysis).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.localStorage.getItem(staleKey)).toBeNull());
  });
});
