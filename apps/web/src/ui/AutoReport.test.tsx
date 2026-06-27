import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardRecord } from "../api";
import { queryBmsDashboardLatestBatch } from "../bmsCollectorClient";
import { AutoReport } from "./AutoReport";

vi.mock("../bmsCollectorClient", () => ({
  queryBmsDashboardLatestBatch: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

const plantDashboard: DashboardRecord = {
  id: "dash_plant",
  projectId: "project_alpha",
  ownerUserId: "user_ada",
  visibility: "project",
  title: "Central plant dashboard",
  description: "Chiller plant operating snapshot.",
  layoutVersion: 2,
  layout: [
    { widgetId: "plant_live", x: 0, y: 0, w: 3, h: 2 },
    { widgetId: "plant_trend", x: 3, y: 0, w: 6, h: 4 }
  ],
  widgets: [
    {
      id: "plant_live",
      kind: "live_value_grid",
      title: "Plant live values",
      pointBindings: [
        { pointName: "CHW_SUPPLY_TEMP", label: "CHW Supply", unit: "degF" },
        { pointName: "CHW_RETURN_TEMP", label: "CHW Return", unit: "degF" }
      ]
    },
    {
      id: "plant_trend",
      kind: "timeseries_chart",
      title: "Plant temperature trend",
      defaultTimeRange: "24h",
      pointBindings: [
        { pointName: "CHW_SUPPLY_TEMP", label: "CHW Supply", unit: "degF" }
      ]
    }
  ],
  createdAt: "2026-06-24T02:00:00.000Z",
  updatedAt: "2026-06-24T02:00:00.000Z"
};

const comfortDashboard: DashboardRecord = {
  id: "dash_comfort",
  projectId: "project_alpha",
  ownerUserId: "user_ada",
  visibility: "private",
  title: "Tenant comfort dashboard",
  description: "Zone comfort watchlist.",
  layoutVersion: 2,
  layout: [
    { widgetId: "comfort_live", x: 0, y: 0, w: 3, h: 2 },
    { widgetId: "comfort_note", x: 3, y: 0, w: 3, h: 2 }
  ],
  widgets: [
    {
      id: "comfort_live",
      kind: "stat_value",
      title: "Lobby temperature",
      pointBindings: [
        { pointName: "LOBBY_TEMP", label: "Lobby Temp", unit: "degF" }
      ]
    },
    {
      id: "comfort_note",
      kind: "note",
      title: "Shift note",
      content: "Lobby was warm after 15:00.",
      tone: "yellow",
      pointBindings: []
    }
  ],
  createdAt: "2026-06-24T02:00:00.000Z",
  updatedAt: "2026-06-24T03:00:00.000Z"
};

describe("AutoReport", () => {
  it("generates a web report from checked dashboards only", async () => {
    vi.mocked(queryBmsDashboardLatestBatch).mockResolvedValue({
      results: [
        {
          key: "CHW_SUPPLY_TEMP",
          ok: true,
          total: 1,
          point: { id: 1, name: "CHW_SUPPLY_TEMP", last_value: "44.2", last_polled_at: "2026-06-24T03:15:00.000Z" }
        },
        {
          key: "CHW_RETURN_TEMP",
          ok: true,
          total: 1,
          point: { id: 2, name: "CHW_RETURN_TEMP", last_value: "54.8", last_polled_at: "2026-06-24T03:15:00.000Z" }
        }
      ],
      requestId: "req_latest"
    });

    render(
      <AutoReport
        token="seed-token"
        projectId="project_alpha"
        projectName="Alpha Build"
        dashboards={[plantDashboard, comfortDashboard]}
      />
    );

    await userEvent.click(screen.getByLabelText(/Tenant comfort dashboard/i));
    await userEvent.click(screen.getByRole("button", { name: /Generate web/i }));

    await waitFor(() => expect(screen.getByText("Generated")).toBeInTheDocument());
    const preview = screen.getByLabelText("Generated report preview");
    expect(within(preview).getByText("44.2 degF")).toBeInTheDocument();
    expect(within(preview).getByText("Central plant dashboard")).toBeInTheDocument();
    expect(within(preview).queryByText("Tenant comfort dashboard")).not.toBeInTheDocument();
    expect(vi.mocked(queryBmsDashboardLatestBatch)).toHaveBeenCalledWith("seed-token", expect.arrayContaining([
      expect.objectContaining({ key: "CHW_SUPPLY_TEMP" }),
      expect.objectContaining({ key: "CHW_RETURN_TEMP" })
    ]));
  });

  it("prepares a printable PDF report", async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.mocked(queryBmsDashboardLatestBatch).mockResolvedValue({
      results: [
        {
          key: "LOBBY_TEMP",
          ok: true,
          total: 1,
          point: { id: 3, name: "LOBBY_TEMP", last_value: "76", last_polled_at: "2026-06-24T03:20:00.000Z" }
        }
      ],
      requestId: "req_latest"
    });

    render(
      <AutoReport
        token="seed-token"
        projectId="project_alpha"
        projectName="Alpha Build"
        dashboards={[comfortDashboard]}
      />
    );

    await user.click(screen.getByLabelText("Operator note"));
    await user.keyboard("Check lobby air balance on next round.");
    await user.click(screen.getByRole("button", { name: /Save PDF/i }));

    await waitFor(() => expect(screen.getByText("Generated")).toBeInTheDocument());
    const preview = screen.getByLabelText("Generated report preview");
    expect(within(preview).getByText("Check lobby air balance on next round.")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: /Report point snapshot/i })).getByText("76.0 degF")).toBeInTheDocument();

    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  });
});
