import { FormEvent, useEffect, useState } from "react";
import {
  ApiClientError,
  getGlobalUserMemory,
  getProjectMemoryBank,
  getProjectMemoryRules,
  getProjectUserMemory,
  patchGlobalUserMemory,
  patchProjectMemoryBank,
  patchProjectUserMemory,
  type MemoryBankResponse,
  type ProjectMemoryRulesResponse
} from "../api";
import { Button, Card, EmptyState, Input, Surface } from "./primitives";

interface MemoryPanelProps {
  projectId: string;
  projectName: string;
  token: string;
  canConfigure: boolean;
}

function MemoryEntryList({
  title,
  description,
  entries,
  usage,
  mutable,
  busy,
  onSave
}: {
  title: string;
  description: string;
  entries: string[];
  usage: string;
  mutable: boolean;
  busy: boolean;
  onSave: (entries: string[]) => Promise<void>;
}) {
  const [draft, setDraft] = useState(entries.join("\n"));
  const [newEntry, setNewEntry] = useState("");

  useEffect(() => {
    setDraft(entries.join("\n"));
  }, [entries]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const next = draft
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    await onSave(next);
  }

  async function handleAddEntry() {
    const trimmed = newEntry.trim();
    if (!trimmed) {
      return;
    }
    const next = [...entries, trimmed];
    setNewEntry("");
    await onSave(next);
  }

  return (
    <Card className="memory-panel-section">
      <header className="memory-panel-section-header">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <span className="memory-panel-usage">{usage}</span>
      </header>
      {entries.length === 0 ? <EmptyState title="No entries yet">Saved preferences and notes appear here.</EmptyState> : null}
      <ul className="memory-panel-entry-list">
        {entries.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {mutable ? (
        <form className="memory-panel-editor" onSubmit={handleSubmit}>
          <label>
            Edit entries (one per line)
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={6} disabled={busy} />
          </label>
          <div className="memory-panel-inline-add">
            <Input
              value={newEntry}
              onChange={(event) => setNewEntry(event.target.value)}
              placeholder="Add a new entry"
              disabled={busy}
            />
            <Button type="button" variant="secondary" disabled={busy || !newEntry.trim()} onClick={() => void handleAddEntry()}>
              Add
            </Button>
          </div>
          <Button type="submit" disabled={busy}>
            Save
          </Button>
        </form>
      ) : (
        <p className="memory-panel-readonly">Read-only for your role. Ask a project configure member to edit.</p>
      )}
    </Card>
  );
}

export function MemoryPanel({ projectId, projectName, token, canConfigure }: MemoryPanelProps) {
  const [userMemory, setUserMemory] = useState<MemoryBankResponse | null>(null);
  const [globalMemory, setGlobalMemory] = useState<MemoryBankResponse | null>(null);
  const [projectMemory, setProjectMemory] = useState<MemoryBankResponse | null>(null);
  const [rules, setRules] = useState<ProjectMemoryRulesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    setError(null);
    const [userBank, globalBank, projectBank, rulesResponse] = await Promise.all([
      getProjectUserMemory(token, projectId),
      getGlobalUserMemory(token, projectId),
      getProjectMemoryBank(token, projectId),
      getProjectMemoryRules(token, projectId)
    ]);
    setUserMemory(userBank);
    setGlobalMemory(globalBank);
    setProjectMemory(projectBank);
    setRules(rulesResponse);
  }

  useEffect(() => {
    void loadAll().catch((loadError: unknown) => {
      setError(loadError instanceof ApiClientError ? loadError.message : "Failed to load memory banks.");
    });
  }, [projectId, token]);

  async function saveUser(entries: string[]) {
    setBusy(true);
    try {
      const result = await patchProjectUserMemory(token, projectId, entries);
      setUserMemory((current) => (current ? { ...current, entries: result.entries, usage: result.usage ?? current.usage } : current));
    } finally {
      setBusy(false);
    }
  }

  async function saveGlobal(entries: string[]) {
    setBusy(true);
    try {
      const result = await patchGlobalUserMemory(token, projectId, entries);
      setGlobalMemory((current) => (current ? { ...current, entries: result.entries, usage: result.usage ?? current.usage } : current));
    } finally {
      setBusy(false);
    }
  }

  async function saveProject(entries: string[]) {
    setBusy(true);
    try {
      const result = await patchProjectMemoryBank(token, projectId, entries);
      setProjectMemory((current) => (current ? { ...current, entries: result.entries, usage: result.usage ?? current.usage } : current));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Surface className="memory-panel">
      <header className="memory-panel-header">
        <div>
          <h2>Memory</h2>
          <p>
            Manage preferences and project notes for <strong>{projectName}</strong>. Judgment rules saved from chat appear under Site rules below.
          </p>
        </div>
      </header>
      {error ? <p className="memory-panel-error">{error}</p> : null}
      <div className="memory-panel-grid">
        <MemoryEntryList
          title="My preferences (this project)"
          description="Personal habits and query preferences scoped to this project."
          entries={userMemory?.entries ?? []}
          usage={userMemory?.usage ?? ""}
          mutable={userMemory?.mutable ?? true}
          busy={busy}
          onSave={saveUser}
        />
        <MemoryEntryList
          title="Global preferences"
          description="Portable preferences shared across all projects (language, style, timezone)."
          entries={globalMemory?.entries ?? []}
          usage={globalMemory?.usage ?? ""}
          mutable={globalMemory?.mutable ?? true}
          busy={busy}
          onSave={saveGlobal}
        />
        <MemoryEntryList
          title="Project notes"
          description="Declarative site facts for everyone on this project. Not executable rules."
          entries={projectMemory?.entries ?? []}
          usage={projectMemory?.usage ?? ""}
          mutable={canConfigure && (projectMemory?.mutable ?? false)}
          busy={busy}
          onSave={saveProject}
        />
        <Card className="memory-panel-section">
          <header className="memory-panel-section-header">
            <div>
              <h3>Project rules</h3>
              <p>Operator rules and site rules remembered from chat corrections.</p>
            </div>
          </header>
          <div className="memory-panel-rules-block">
            <h4>Grounding</h4>
            {(rules?.grounding ?? []).length === 0 ? <p className="memory-panel-muted">No grounding rules yet.</p> : null}
            <ul className="memory-panel-entry-list">
              {(rules?.grounding ?? []).map((rule) => (
                <li key={rule.id}>
                  {rule.scope || rule.name ? (
                    <>
                      <strong>{rule.name ?? rule.scope}</strong>
                      {rule.name && rule.scope ? <div className="memory-panel-muted">{rule.scope}</div> : null}
                      {rule.status ? <span className="memory-panel-muted"> — {rule.status}</span> : null}
                      {rule.action ? <div>{rule.action}</div> : null}
                      {(rule.triggerTopics ?? []).length > 0 ? (
                        <div className="memory-panel-muted">Triggers: {(rule.triggerTopics ?? []).join(", ")}</div>
                      ) : null}
                    </>
                  ) : (
                    rule.content
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="memory-panel-rules-block">
            <h4>Site rules (scripts)</h4>
            {(rules?.playbooks ?? []).length === 0 ? (
              <p className="memory-panel-muted">No script-based site rules yet.</p>
            ) : null}
            <ul className="memory-panel-entry-list">
              {(rules?.playbooks ?? []).map((playbook) => (
                <li key={playbook.id}>
                  <strong>{playbook.title}</strong>
                  {playbook.groundingSummary ? ` — ${playbook.groundingSummary}` : ""}
                </li>
              ))}
            </ul>
          </div>
          {(rules?.pendingMemoryProposals ?? []).length > 0 ? (
            <div className="memory-panel-rules-block">
              <h4>Pending memory proposals</h4>
              <ul className="memory-panel-entry-list">
                {rules?.pendingMemoryProposals.map((proposal) => (
                  <li key={proposal.id}>
                    <strong>{proposal.target}</strong>: {proposal.content}
                    <span className="memory-panel-muted"> — confirm in chat with 保存记忆: 是</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </Surface>
  );
}
