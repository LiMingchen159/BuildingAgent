import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardRecord } from "../api";
import { queryBmsDashboardHistoryBatch, queryBmsDashboardLatestBatch } from "../bmsCollectorClient";
import { AutoReport } from "./AutoReport";

vi.mock("../bmsCollectorClient", () => ({
  queryBmsDashboardHistoryBatch: vi.fn(),
  queryBmsDashboardLatestBatch: vi.fn()
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
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

function freshTimestamp(minutesAgo = 10): string {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString();
}

function mockEvidenceForPlant(): void {
  vi.mocked(queryBmsDashboardLatestBatch).mockResolvedValue({
    results: [
      {
        key: "CHW_SUPPLY_TEMP",
        ok: true,
        total: 1,
        point: { id: 1, name: "CHW_SUPPLY_TEMP", last_value: "44.2", last_polled_at: freshTimestamp() }
      },
      {
        key: "CHW_RETURN_TEMP",
        ok: true,
        total: 1,
        point: { id: 2, name: "CHW_RETURN_TEMP", last_value: "54.8", last_polled_at: freshTimestamp() }
      }
    ],
    requestId: "req_latest"
  });
  vi.mocked(queryBmsDashboardHistoryBatch).mockResolvedValue({
    results: [
      {
        key: "CHW_SUPPLY_TEMP",
        ok: true,
        total: 3,
        items: [
          { name: "CHW_SUPPLY_TEMP", ts: freshTimestamp(180), value_num: 44.1 },
          { name: "CHW_SUPPLY_TEMP", ts: freshTimestamp(90), value_num: 44.5 },
          { name: "CHW_SUPPLY_TEMP", ts: freshTimestamp(15), value_num: 44.2 }
        ]
      },
      {
        key: "CHW_RETURN_TEMP",
        ok: true,
        total: 2,
        items: [
          { name: "CHW_RETURN_TEMP", ts: freshTimestamp(160), value_num: 54.4 },
          { name: "CHW_RETURN_TEMP", ts: freshTimestamp(20), value_num: 54.8 }
        ]
      }
    ],
    requestId: "req_history"
  });
}

describe("AutoReport", () => {
  it("changes visible sections and wording when report intent changes", async () => {
    render(
      <AutoReport
        token="seed-token"
        projectId="project_alpha"
        projectName="Alpha Build"
        dashboards={[plantDashboard, comfortDashboard]}
      />
    );

    const preview = screen.getByLabelText("Generated report preview");
    expect(within(preview).getByText(/交班摘要 \/ Shift Summary/u)).toBeInTheDocument();
    expect(within(preview).getByText(/异常、风险与数据质量 \/ Exceptions, Risks, And Data Quality/u)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /周\/月管理汇报/u }));
    expect(within(preview).getByText(/管理摘要 \/ Management Summary/u)).toBeInTheDocument();
    expect(within(preview).getByText(/KPI 与趋势证据 \/ KPI And Trend Evidence/u)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /故障\/问题复盘/u }));
    expect(within(preview).getByText(/问题复盘摘要 \/ Issue Review Summary/u)).toBeInTheDocument();
    expect(within(preview).getByText(/请在验证说明中记录现场检查和复测结果/u)).toBeInTheDocument();
  });

  it("updates coverage, evidence, and point snapshot from selected dashboards", async () => {
    mockEvidenceForPlant();

    render(
      <AutoReport
        token="seed-token"
        projectId="project_alpha"
        projectName="Alpha Build"
        dashboards={[plantDashboard, comfortDashboard]}
      />
    );

    await userEvent.click(screen.getByLabelText(/Tenant comfort dashboard/u));
    await userEvent.click(screen.getByRole("button", { name: /Generate web/u }));

    await waitFor(() => expect(screen.getByText(/已生成 \/ Generated/u)).toBeInTheDocument());
    const preview = screen.getByLabelText("Generated report preview");
    expect(within(preview).getByText("44.2 degF")).toBeInTheDocument();
    expect(within(preview).getByText("Central plant dashboard")).toBeInTheDocument();
    expect(within(preview).queryByText("Tenant comfort dashboard")).not.toBeInTheDocument();
    expect(within(preview).getAllByText(/BMS · CHW_SUPPLY_TEMP/u).length).toBeGreaterThan(0);
    expect(within(screen.getByLabelText("Trend evidence")).getByText("Samples 3")).toBeInTheDocument();

    const latestQueries = vi.mocked(queryBmsDashboardLatestBatch).mock.calls[0]?.[1] ?? [];
    const historyQueries = vi.mocked(queryBmsDashboardHistoryBatch).mock.calls[0]?.[1] ?? [];
    expect(latestQueries).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "CHW_SUPPLY_TEMP", name: "CHW_SUPPLY_TEMP" }),
      expect.objectContaining({ key: "CHW_RETURN_TEMP", name: "CHW_RETURN_TEMP" })
    ]));
    expect(latestQueries).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "LOBBY_TEMP" })
    ]));
    expect(historyQueries).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "CHW_SUPPLY_TEMP", source: "bms" })
    ]));
  });

  it("renders bilingual narrative and surfaces stale or missing latest values", async () => {
    vi.mocked(queryBmsDashboardLatestBatch).mockResolvedValue({
      results: [
        {
          key: "CHW_SUPPLY_TEMP",
          ok: true,
          total: 1,
          point: { id: 1, name: "CHW_SUPPLY_TEMP", last_value: "44.2", last_polled_at: freshTimestamp(190) }
        },
        { key: "CHW_RETURN_TEMP", ok: false, total: 0, point: null, error: "not_found" },
        { key: "LOBBY_TEMP", ok: false, total: 0, point: null, error: "not_found" }
      ],
      requestId: "req_latest"
    });
    vi.mocked(queryBmsDashboardHistoryBatch).mockResolvedValue({
      results: [],
      requestId: "req_history"
    });

    render(
      <AutoReport
        token="seed-token"
        projectId="project_alpha"
        projectName="Alpha Build"
        dashboards={[plantDashboard, comfortDashboard]}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Generate web/u }));

    await waitFor(() => expect(screen.getByText(/已生成 \/ Generated/u)).toBeInTheDocument());
    const preview = screen.getByLabelText("Generated report preview");
    expect(within(preview).getByText(/本报告只使用 dashboard、BMS latest\/history 和 derived metric 证据/u)).toBeInTheDocument();
    expect(within(preview).getByText(/Evidence comes only from dashboards, BMS latest\/history, and derived metrics/u)).toBeInTheDocument();
    expect(within(preview).getAllByText(/过期 \/ stale/u).length).toBeGreaterThan(0);
    expect(within(preview).getAllByText(/缺失 \/ missing/u).length).toBeGreaterThan(0);
    expect(within(preview).getAllByText(/CHW_SUPPLY_TEMP/u).length).toBeGreaterThan(0);
    expect(within(preview).queryByText(/assignee|CMMS link|work order status/iu)).not.toBeInTheDocument();
  });

  it("prepares a printable PDF report with free-text follow-up notes", async () => {
    const user = userEvent.setup();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    vi.mocked(queryBmsDashboardLatestBatch).mockResolvedValue({
      results: [
        {
          key: "LOBBY_TEMP",
          ok: true,
          total: 1,
          point: { id: 3, name: "LOBBY_TEMP", last_value: "76", last_polled_at: freshTimestamp() }
        }
      ],
      requestId: "req_latest"
    });
    vi.mocked(queryBmsDashboardHistoryBatch).mockResolvedValue({
      results: [
        {
          key: "LOBBY_TEMP",
          ok: true,
          total: 1,
          items: [{ name: "LOBBY_TEMP", ts: freshTimestamp(), value_num: 76 }]
        }
      ],
      requestId: "req_history"
    });

    render(
      <AutoReport
        token="seed-token"
        projectId="project_alpha"
        projectName="Alpha Build"
        dashboards={[comfortDashboard]}
      />
    );

    await user.click(screen.getByLabelText(/Follow-up notes/u));
    await user.keyboard("Check lobby air balance on next round.");
    await user.click(screen.getByRole("button", { name: /Save PDF/u }));

    await waitFor(() => expect(screen.getByText(/已生成 \/ Generated/u)).toBeInTheDocument());
    const preview = screen.getByLabelText("Generated report preview");
    expect(within(preview).getByText("Check lobby air balance on next round.")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: /Report point snapshot/u })).getByText("76.0 degF")).toBeInTheDocument();
    await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  });
});
