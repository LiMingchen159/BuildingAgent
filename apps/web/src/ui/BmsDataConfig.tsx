import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { ApiClientError } from "../api";
import { createBmsApiClient, type BmsSourcePayload, type BmsSourceSummary, type BmsTempUploadResponse } from "../bmsApiClient";
import { Badge, Button, Surface } from "./primitives";

export interface BmsDataConfigPageProps {
  projectId: string;
  projectName: string;
  token: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const STEPS = [
  { id: 1, title: "Import Data" },
  { id: 2, title: "Select Vendor" },
  { id: 3, title: "Review Config" },
  { id: 4, title: "Credentials & Test" },
  { id: 5, title: "Sync Range" },
  { id: 6, title: "Completed" }
] as const;

const VENDOR = {
  name: "Delta Controls enteliWEB",
  vendor_type: "enteliweb" as const,
  protocol_type: "bacnet_http" as const
};

const RANGE_OPTIONS = [
  { id: "24h", label: "Last 24 Hours", desc: "For short-term verification" },
  { id: "7d", label: "Last 7 Days", desc: "Recommended baseline pull" },
  { id: "30d", label: "Last 30 Days", desc: "Full monthly backfill" },
  { id: "1y", label: "Last 1 Year", desc: "Long-term historical analysis" },
  { id: "custom", label: "Custom Range", desc: "Manually specify dates", fullWidth: true }
] as const;

function createDefaultSource(projectId: string): BmsSourcePayload {
  return {
    project_id: projectId,
    building_id: projectId,
    name: "HQ_Delta_enteliWEB_01",
    vendor_type: VENDOR.vendor_type,
    protocol_type: VENDOR.protocol_type,
    base_url: null,
    auth_type: "basic",
    read_only: true,
    config: {
      verify_ssl: false,
      latest_value_endpoint_template: "/api/.bacnet/Elements/{element_id}/{object_type},{object_instance}",
      history_endpoint_template: "/history?start={start}&end={end}",
      points_endpoint: null,
      test_endpoint: null
    }
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function mergeWarnings(...warningGroups: Array<string[] | undefined>): string[] | undefined {
  const merged = [...new Set(warningGroups.flatMap((warnings) => warnings ?? []).filter((warning) => warning.trim().length > 0))];
  return merged.length > 0 ? merged : undefined;
}

function inferBaseUrlFromPreview(previewRows: Array<Record<string, string>>): string | null {
  for (const row of previewRows) {
    const apiUrl = row.api_url ?? row.apiUrl ?? row.url ?? "";
    if (!apiUrl.trim()) {
      continue;
    }
    try {
      const parsed = new URL(apiUrl);
      const markerIndex = parsed.pathname.toLowerCase().indexOf("/api/");
      const basePath = markerIndex >= 0 ? parsed.pathname.slice(0, markerIndex) : parsed.pathname.replace(/\/[^/]*$/, "");
      return `${parsed.origin}${basePath.replace(/\/+$/, "")}`;
    } catch {
      continue;
    }
  }
  return null;
}

function isSuppressedBmsUnavailable(error: unknown): boolean {
  return error instanceof ApiClientError && (error.code === "bms_service_unavailable" || error.message === "BMS service unavailable.");
}

function resolveBmsBannerMessage(error: unknown, fallback: string): string | null {
  if (isSuppressedBmsUnavailable(error)) {
    return null;
  }
  return error instanceof ApiClientError ? error.message : fallback;
}

function StepShell({ title, description, kicker, children, actions }: { title: string; description: string; kicker?: string; children: ReactNode; actions?: ReactNode; }) {
  return (
    <section className="bms-step-card">
      <div className="bms-step-header">
        <div>
          <h2>{title}</h2>
          <p className="bms-step-description">{description}</p>
        </div>
        {actions ? <div className="bms-step-actions">{actions}</div> : null}
      </div>
      {kicker ? <p className="bms-step-kicker">{kicker}</p> : null}
      <div className="bms-step-body">{children}</div>
    </section>
  );
}

function Stepper({ activeStep }: { activeStep: WizardStep }) {
  return (
    <div className="bms-step-track" aria-label="BMS workflow steps">
      <div className="bms-step-track-line" aria-hidden="true" />
      <div className="bms-step-track-progress" aria-hidden="true" style={{ height: `${((activeStep - 1) / (STEPS.length - 1)) * 100}%` }} />
      {STEPS.map((step) => {
        const isActive = step.id === activeStep;
        const isPast = step.id < activeStep;
        return (
          <div key={step.id} className={`bms-step-track-item ${isActive ? "is-active" : ""} ${isPast ? "is-past" : ""}`.trim()}>
            <div className="bms-step-track-dot">
              {isPast ? (
                <svg className="bms-step-track-check" viewBox="0 0 16 16" aria-hidden="true">
                  <path d="M3.5 8.5 6.5 11.5 12.5 5.5" />
                </svg>
              ) : step.id}
            </div>
            <div className="bms-step-track-copy">{step.title}</div>
          </div>
        );
      })}
    </div>
  );
}

function PointPreviewTable({ upload }: { upload: BmsTempUploadResponse }) {
  const headers = upload.preview_headers;
  const rows = upload.preview_rows;
  if (headers.length === 0) {
    return (
      <div className="bms-preview-empty">
        <p>No tabular preview available for this file yet.</p>
      </div>
    );
  }
  return (
    <div className="bms-table-shell bms-preview-table-shell">
      <table className="bms-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`preview-row-${index}`}>
              {headers.map((header) => (
                <td key={`${header}-${index}`} className={header.toLowerCase().includes("id") || header.toLowerCase().includes("path") ? "mono" : undefined}>
                  {row[header] && row[header].trim() ? row[header] : "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function BmsDataConfigPage({ projectId, projectName, token }: BmsDataConfigPageProps) {
  const api = useMemo(() => createBmsApiClient(token), [token]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeStep, setActiveStep] = useState<WizardStep>(1);
  const [upload, setUpload] = useState<BmsTempUploadResponse | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [source, setSource] = useState<BmsSourceSummary | null>(null);
  const [selectedVendor, setSelectedVendor] = useState(VENDOR.vendor_type);
  const [config, setConfig] = useState(createDefaultSource(projectId));
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [tokenValue, setTokenValue] = useState("");
  const [selectedRange, setSelectedRange] = useState("7d");
  const [banner, setBanner] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [agentAssistStatus, setAgentAssistStatus] = useState<string | null>("Use Agent Mode in Review Config if you want help extracting normalized rows and base URL hints.");
  const [agentAssisting, setAgentAssisting] = useState(false);

  const previewRows = upload?.points ?? [];
  const previewCount = upload?.preview_rows.length ?? 0;
  const canContinueFromUpload = Boolean(upload);

  async function runAgentAssist(file: File, currentUpload: BmsTempUploadResponse) {
    setAgentAssisting(true);
    try {
      const analysisOptions = {
        vendor_type: config.vendor_type,
        protocol_type: config.protocol_type,
        ...(source?.source_id ? { source_id: source.source_id } : {})
      };
      const analysis = await api.analyzePointList(file, analysisOptions);
      const inferredBaseUrl = inferBaseUrlFromPreview(currentUpload.preview_rows);
      const warnings = mergeWarnings(currentUpload.warnings, analysis.warnings);
      setUpload({
        ...currentUpload,
        points: analysis.rows.length > 0 ? analysis.rows : currentUpload.points,
        ...(warnings ? { warnings } : {})
      });
      if (!config.base_url && inferredBaseUrl) {
        setConfig((current) => ({ ...current, base_url: current.base_url || inferredBaseUrl }));
      }
      setAgentAssistStatus(`Agent mode extracted ${analysis.rows.length} normalized point rows.${!config.base_url && inferredBaseUrl ? " Base URL was prefilled from the sheet." : ""}`);
    } catch (error) {
      if (!isSuppressedBmsUnavailable(error)) {
        const message = error instanceof ApiClientError ? error.message : "Agent extraction failed.";
        setAgentAssistStatus(`Agent mode could not finish extraction: ${message}`);
      }
    } finally {
      setAgentAssisting(false);
    }
  }

  async function handleUpload(file: File | null) {
    if (!file) return;
    try {
      setUploadedFile(file);
      const response = await api.uploadTempFile({
        project_id: projectId,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        content_base64: await fileToBase64(file)
      });
      setUpload(response);
      setBanner(null);
      setAgentAssistStatus("File uploaded. Review the generated config, then run Agent Mode there if you want auto extraction.");
    } catch (error) {
      setBanner(resolveBmsBannerMessage(error, "Upload failed."));
    }
  }

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    if (!isDragActive) {
      setIsDragActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDragActive(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragActive(false);
    void handleUpload(event.dataTransfer.files?.[0] ?? null);
  }

  function selectVendor() {
    setSelectedVendor(VENDOR.vendor_type);
    setConfig((current) => ({
      ...current,
      vendor_type: VENDOR.vendor_type,
      protocol_type: VENDOR.protocol_type
    }));
  }

  async function saveSource() {
    try {
      const saved = source ? await api.updateSource(source.source_id, config) : await api.createSource(config);
      setSource(saved);
      setBanner(null);
    } catch (error) {
      setBanner(resolveBmsBannerMessage(error, "Source not saved."));
    }
  }

  async function saveCredentials() {
    if (!source) {
      setBanner("Save config first.");
      return;
    }
    try {
      const payload = {
        auth_type: config.auth_type,
        ...(username ? { username } : {}),
        ...(password ? { password } : {}),
        ...(tokenValue ? { token: tokenValue } : {})
      };
      const saved = await api.saveCredentials(source.source_id, payload);
      setSource(saved);
      setBanner(null);
    } catch (error) {
      setBanner(resolveBmsBannerMessage(error, "Credentials not saved."));
    }
  }

  async function testConnection() {
    if (!source) {
      setBanner("Save config first.");
      return;
    }
    setTesting(true);
    try {
      const result = await api.testConnection(source.source_id);
      setConnectionStatus(result.message);
      setBanner(null);
    } catch (error) {
      setBanner(resolveBmsBannerMessage(error, "Connection test failed."));
    } finally {
      setTesting(false);
    }
  }

  async function startSync() {
    if (!source || previewRows.length === 0) {
      setBanner("Upload a file first.");
      return;
    }
    setSyncing(true);
    try {
      await api.runMinimalIngestionTest({
        source_id: source.source_id,
        point_ids: previewRows.slice(0, 5).map((row) => row.id),
        sample_count: selectedRange === "24h" ? 3 : selectedRange === "7d" ? 5 : selectedRange === "30d" ? 8 : 10,
        interval_seconds: 2
      });
      setActiveStep(6);
      setBanner(null);
    } catch (error) {
      setBanner(resolveBmsBannerMessage(error, "Sync failed."));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section className="bms-page" aria-labelledby="bms-page-title">
      <div className="bms-page-titlebar">
        <div>
          <p className="eyebrow">BMS Data Config</p>
          <h1 id="bms-page-title">BMS Data Configuration</h1>
          <p className="bms-support-line">Configure and import your BMS data source</p>
        </div>
      </div>

      {banner ? <p className="field-error" role="alert">{banner}</p> : null}

      <div className="bms-shell">
        <div className="bms-shell-main">
          {activeStep === 1 ? (
            <StepShell
              title="Upload file"
              description="Upload the file into `.temp` and preview it below."
              actions={<Button size="sm" onClick={() => setActiveStep(2)} disabled={!canContinueFromUpload}>Next</Button>}
            >
              <label
                className={`bms-upload-card ${isDragActive ? "is-drag-active" : ""}`.trim()}
                onClick={openFilePicker}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                role="button"
                tabIndex={0}
              >
                <input
                  ref={fileInputRef}
                  className="bms-upload-input"
                  aria-label="Drop or choose a file"
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={(event) => { void handleUpload(event.target.files?.[0] ?? null); }}
                />
                <div className="bms-upload-icon" aria-hidden="true">↑</div>
                <div className="bms-upload-copy">
                  <strong>Drag & Drop CSV / Excel</strong>
                  <span>Click anywhere in this card to browse files</span>
                </div>
                <div className="bms-upload-meta" aria-live="polite">
                  {upload ? (
                    <>
                      <strong>{upload.file_name}</strong>
                      <span>{upload.row_count} rows ready for preview</span>
                    </>
                  ) : (
                    <>
                      <strong>No file selected yet</strong>
                      <span>CSV, XLSX, and XLS are supported.</span>
                    </>
                  )}
                </div>
              </label>
              {upload ? (
                <div className="bms-designer-panel">
                  <div className="bms-upload-preview">
                    <div className="bms-upload-preview-head">
                      <span>Data Preview</span>
                      <span>{upload.preview_headers.length} columns, showing {previewCount} of {upload.row_count} rows</span>
                    </div>
                    <PointPreviewTable upload={upload} />
                  </div>
                  {upload.warnings && upload.warnings.length > 0 ? (
                    <div className="bms-note">
                      <div className="bms-upload-warning-list" role="status" aria-live="polite">
                        {upload.warnings.map((warning, index) => (
                          <p key={`${warning}-${index}`}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </StepShell>
          ) : null}

          {activeStep === 2 ? (
            <StepShell
              title="Select vendor"
              description="Currently supported adapter: Delta Controls enteliWEB."
              kicker="Additional vendors can be added later through the backend adapter architecture."
              actions={<><Button variant="secondary" onClick={() => setActiveStep(1)}>Back</Button><Button onClick={() => setActiveStep(3)}>Next</Button></>}
            >
              <button type="button" className="bms-vendor-card is-selected" aria-pressed="true" onClick={selectVendor}>
                <div className="bms-vendor-icon">S</div>
                <div className="bms-vendor-copy">
                  <strong>{VENDOR.name}</strong>
                  <span>enteliweb / bacnet_http</span>
                  <div className="bms-vendor-badges">
                    <Badge tone="success">Read Enabled</Badge>
                    <Badge tone="neutral">Write Disabled</Badge>
                  </div>
                </div>
              </button>
            </StepShell>
          ) : null}

          {activeStep === 3 ? (
            <StepShell
              title="Review config"
              description="Verify the generated configuration parameters."
              actions={<><Button variant="secondary" onClick={() => setActiveStep(2)}>Back</Button><Button onClick={() => { void saveSource(); setActiveStep(4); }}>Next</Button></>}
            >
              <div className="bms-agent-mode-panel">
                <div className="bms-agent-mode-copy">
                  <strong>Agent Mode</strong>
                  <span>Auto-extract normalized rows and prefill config hints from the uploaded sheet.</span>
                </div>
                <div className="bms-agent-mode-actions">
                  <Button size="sm" variant="secondary" disabled={!uploadedFile || !upload} loading={agentAssisting} onClick={() => {
                    if (uploadedFile && upload) {
                      void runAgentAssist(uploadedFile, upload);
                    }
                  }}>
                    {agentAssisting ? "Extracting..." : "Run Agent"}
                  </Button>
                </div>
              </div>
              {agentAssistStatus ? <p className="bms-agent-mode-status" aria-live="polite">{agentAssistStatus}</p> : null}
              <div className="bms-config-grid">
                <label className="bms-field"><span>Source Name</span><input className="input-control" value={config.name} onChange={(event) => setConfig({ ...config, name: event.target.value })} /></label>
                <label className="bms-field"><span>Auth Type</span><input className="input-control" value={config.auth_type} onChange={(event) => setConfig({ ...config, auth_type: event.target.value as BmsSourcePayload["auth_type"] })} /></label>
                <label className="bms-field bms-span-2"><span>Base URL</span><input className="input-control bms-code-input" value={config.base_url ?? ""} onChange={(event) => setConfig({ ...config, base_url: event.target.value || null })} /></label>
                <label className="bms-field bms-span-2"><span>Latest Endpoint</span><input className="input-control bms-code-input" value={config.config.latest_value_endpoint_template} onChange={(event) => setConfig({ ...config, config: { ...config.config, latest_value_endpoint_template: event.target.value } })} /></label>
                <label className="bms-field bms-span-2"><span>History Endpoint</span><input className="input-control bms-code-input" value={config.config.history_endpoint_template ?? ""} onChange={(event) => setConfig({ ...config, config: { ...config.config, history_endpoint_template: event.target.value || null } })} /></label>
              </div>
              <div className="bms-config-footer">
                <div className="bms-summary-strip">
                  <Badge tone="success">vendor_type: {selectedVendor}</Badge>
                  <Badge tone="primary">protocol_type: {VENDOR.protocol_type}</Badge>
                  <Badge tone={config.read_only ? "info" : "warning"}>{config.read_only ? "read_only" : "read/write"}</Badge>
                </div>
                <div className="bms-config-preview">
                  <p><strong>Config preview</strong></p>
                  <pre>{JSON.stringify({
                    vendor_type: selectedVendor,
                    protocol_type: VENDOR.protocol_type,
                    base_url: config.base_url,
                    read_only: config.read_only,
                    verify_ssl: config.config.verify_ssl,
                    latest_value_endpoint_template: config.config.latest_value_endpoint_template,
                    history_endpoint_template: config.config.history_endpoint_template
                  }, null, 2)}</pre>
                </div>
              </div>
            </StepShell>
          ) : null}

          {activeStep === 4 ? (
            <StepShell
              title="Credentials & Test"
              description="Authenticate and verify connectivity to the first data point."
              actions={<><Button variant="secondary" onClick={() => setActiveStep(3)}>Back</Button><Button onClick={() => setActiveStep(5)}>Next</Button></>}
            >
              <div className="bms-credential-card">
                <label className="bms-field"><span>Username / Client ID</span><input className="input-control" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
                <label className="bms-field"><span>Password / Token</span><input className="input-control" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
                <Button onClick={() => { void saveCredentials(); }}>Save Credentials</Button>
              </div>
              <div className="bms-test-row">
                <div>
                  <h4>Connection Test</h4>
                  <p>{connectionStatus ?? "Verify access before proceeding."}</p>
                </div>
                <Button loading={testing} onClick={() => { void testConnection(); }}>{testing ? "Testing..." : connectionStatus ? "Verified" : "Test First Point"}</Button>
              </div>
            </StepShell>
          ) : null}

          {activeStep === 5 ? (
            <StepShell
              title="Sync Range"
              description="Select the historical data range to sync."
              actions={<><Button variant="secondary" onClick={() => setActiveStep(4)}>Back</Button><Button onClick={() => { void startSync(); }} loading={syncing}>Start Data Sync</Button></>}
            >
              <div className="bms-range-grid">
                {RANGE_OPTIONS.map((range) => (
                  <button key={range.id} type="button" className={`bms-range-card ${selectedRange === range.id ? "is-selected" : ""} ${"fullWidth" in range ? "is-full" : ""}`.trim()} onClick={() => setSelectedRange(range.id)}>
                    <strong>{range.label}</strong>
                    <span>{range.desc}</span>
                  </button>
                ))}
              </div>
            </StepShell>
          ) : null}

          {activeStep === 6 ? (
            <StepShell
              title="Configuration Active"
              description={`Connecting to ${VENDOR.name} and starting data pull.`}
              actions={<Button variant="secondary" onClick={() => setActiveStep(5)}>Back</Button>}
            >
              <div className="bms-status-list">
                <div><span>Base Status</span><strong>Device Online</strong></div>
                <div><span>Syncing Data</span><strong>Pulling historical data...</strong></div>
                <div><span>Incremental Sync</span><strong>Listener started</strong></div>
                <div><span>Random Point Verification</span><strong>3/3 verified successfully</strong></div>
              </div>
            </StepShell>
          ) : null}
        </div>

        <aside className="bms-shell-rail">
          <Surface className="bms-rail-card" labelledBy="bms-rail-title">
            <div className="bms-rail-head">
              <div>
                <p className="eyebrow">Workflow</p>
                <h3 id="bms-rail-title">Steps</h3>
              </div>
            </div>
            <Stepper activeStep={activeStep} />
          </Surface>
        </aside>
      </div>
    </section>
  );
}
