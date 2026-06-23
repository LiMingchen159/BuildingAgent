export interface BufferedToolActivity {
  tool: string;
  toolCallId: string | null;
  durationMs?: number;
  exitCode?: number;
  args?: string;
  resultPreview?: string;
}

export interface ParallelToolActivityCoordinator {
  onToolStarted(
    event: { metadata?: Record<string, unknown> },
    emit: (payload: Record<string, unknown>) => void,
    formatLabel: (toolName: string, state: "running" | "done", metadata?: Record<string, unknown>) => string,
    sanitizeDetail: (value: unknown) => string | undefined,
    reqId: string
  ): void;
  onToolCompleted(
    event: { metadata?: Record<string, unknown> },
    emit: (payload: Record<string, unknown>) => void,
    formatLabel: (toolName: string, state: "running" | "done", metadata?: Record<string, unknown>) => string,
    sanitizeDetail: (value: unknown) => string | undefined,
    reqId: string
  ): void;
}

function parallelBatchActivityId(reqId: string, iteration: number, toolName: string): string {
  const safeTool = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `tool_${reqId}_iter${iteration}_${safeTool}_parallel`;
}

export function createParallelToolActivityCoordinator(): ParallelToolActivityCoordinator {
  const pendingDoneByIteration = new Map<number, Map<string, BufferedToolActivity[]>>();
  const pendingStartByIteration = new Map<number, Map<string, BufferedToolActivity[]>>();
  const expectedToolCountByIteration = new Map<number, number>();

  const getOrCreate = <V>(map: Map<number, Map<string, V>>, iteration: number): Map<string, V> => {
    let inner = map.get(iteration);
    if (!inner) {
      inner = new Map<string, V>();
      map.set(iteration, inner);
    }
    return inner;
  };

  const flushIteration = (
    iteration: number,
    wallMs: number | undefined,
    emit: (payload: Record<string, unknown>) => void,
    formatLabel: (toolName: string, state: "running" | "done", metadata?: Record<string, unknown>) => string,
    sanitizeDetail: (value: unknown) => string | undefined,
    reqId: string
  ): void => {
    const byTool = pendingDoneByIteration.get(iteration);
    if (!byTool) {
      return;
    }

    for (const [toolName, entries] of byTool) {
      if (entries.length >= 2) {
        const totalMs =
          typeof wallMs === "number"
            ? wallMs
            : Math.max(...entries.map((entry) => entry.durationMs ?? 0));
        emit({
          id: parallelBatchActivityId(reqId, iteration, toolName),
          label: `Ran ${entries.length} × ${toolName} (parallel, ${totalMs}ms)`,
          kind: "tool",
          tool: toolName,
          status: "done",
          durationMs: totalMs
        });
      } else if (entries.length === 1) {
        const entry = entries[0]!;
        emit({
          ...(entry.toolCallId ? { id: `tool_${reqId}_${entry.toolCallId}` } : {}),
          label: formatLabel(toolName, "done", { durationMs: entry.durationMs }),
          kind: "tool",
          tool: toolName,
          status: "done",
          ...(typeof entry.durationMs === "number" ? { durationMs: entry.durationMs } : {}),
          ...(typeof entry.exitCode === "number" ? { exitCode: entry.exitCode } : {}),
          ...(entry.resultPreview ? { output: entry.resultPreview } : {})
        });
      }
    }

    pendingDoneByIteration.delete(iteration);
    pendingStartByIteration.delete(iteration);
    expectedToolCountByIteration.delete(iteration);
  };

  const flushStarts = (
    iteration: number,
    emit: (payload: Record<string, unknown>) => void,
    formatLabel: (toolName: string, state: "running" | "done", metadata?: Record<string, unknown>) => string,
    sanitizeDetail: (value: unknown) => string | undefined,
    reqId: string
  ): void => {
    const byTool = pendingStartByIteration.get(iteration);
    if (!byTool) {
      return;
    }
    for (const [toolName, entries] of byTool) {
      if (entries.length >= 2) {
        emit({
          id: parallelBatchActivityId(reqId, iteration, toolName),
          label: `Running ${entries.length} × ${toolName} (parallel)`,
          kind: "tool",
          tool: toolName,
          status: "running"
        });
      } else if (entries.length === 1) {
        const entry = entries[0]!;
        emit({
          ...(entry.toolCallId ? { id: `tool_${reqId}_${entry.toolCallId}` } : {}),
          label: formatLabel(toolName, "running"),
          kind: "tool",
          tool: toolName,
          status: "running",
          ...(entry.args ? { detail: entry.args } : {})
        });
      }
    }
    pendingStartByIteration.delete(iteration);
  };

  const bufferedStartCount = (iteration: number): number => {
    const byTool = pendingStartByIteration.get(iteration);
    if (!byTool) {
      return 0;
    }
    let count = 0;
    for (const entries of byTool.values()) {
      count += entries.length;
    }
    return count;
  };

  return {
    onToolStarted(event, emit, formatLabel, sanitizeDetail, reqId) {
      const toolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
      const iteration = event.metadata?.iteration;
      const toolCount = event.metadata?.toolCount;

      if (typeof iteration === "number" && typeof toolCount === "number" && !toolName) {
        expectedToolCountByIteration.set(iteration, toolCount);
        return;
      }

      if (!toolName || typeof iteration !== "number") {
        if (toolName) {
          const toolCallId = typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null;
          emit({
            ...(toolCallId ? { id: `tool_${reqId}_${toolCallId}` } : {}),
            label: formatLabel(toolName, "running"),
            kind: "tool",
            tool: toolName,
            status: "running",
            ...(sanitizeDetail(event.metadata?.args) ? { detail: sanitizeDetail(event.metadata?.args) } : {})
          });
        }
        return;
      }

      const byTool = getOrCreate(pendingStartByIteration, iteration);
      const list = byTool.get(toolName) ?? [];
      const args = sanitizeDetail(event.metadata?.args);
      list.push({
        tool: toolName,
        toolCallId: typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null,
        ...(args ? { args } : {})
      });
      byTool.set(toolName, list);

      const expected = expectedToolCountByIteration.get(iteration);
      if (typeof expected === "number" && bufferedStartCount(iteration) >= expected) {
        flushStarts(iteration, emit, formatLabel, sanitizeDetail, reqId);
      }
    },

    onToolCompleted(event, emit, formatLabel, sanitizeDetail, reqId) {
      const toolName = typeof event.metadata?.tool === "string" ? event.metadata.tool : null;
      const iteration = event.metadata?.iteration;
      const isParallelBatch = event.metadata?.parallel === true;
      const isIterationFlush =
        typeof iteration === "number" && (!toolName || event.metadata?.flushToolActivities === true);

      if (isParallelBatch && typeof iteration === "number") {
        flushIteration(
          iteration,
          typeof event.metadata?.durationMs === "number" ? event.metadata.durationMs : undefined,
          emit,
          formatLabel,
          sanitizeDetail,
          reqId
        );
        return;
      }

      if (isIterationFlush && !toolName) {
        flushIteration(iteration, undefined, emit, formatLabel, sanitizeDetail, reqId);
        return;
      }

      if (toolName && event.metadata?.flushToolActivities === true) {
        return;
      }

      if (!toolName || typeof iteration !== "number") {
        if (toolName) {
          const toolCallId = typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null;
          emit({
            ...(toolCallId ? { id: `tool_${reqId}_${toolCallId}` } : {}),
            label: formatLabel(toolName, "done", event.metadata),
            kind: "tool",
            tool: toolName,
            status: "done",
            ...(typeof event.metadata?.durationMs === "number" ? { durationMs: event.metadata.durationMs } : {}),
            ...(typeof event.metadata?.exitCode === "number" ? { exitCode: event.metadata.exitCode } : {}),
            ...(sanitizeDetail(event.metadata?.resultPreview) ? { output: sanitizeDetail(event.metadata?.resultPreview) } : {})
          });
        }
        return;
      }

      const byTool = getOrCreate(pendingDoneByIteration, iteration);
      const list = byTool.get(toolName) ?? [];
      const resultPreview = sanitizeDetail(event.metadata?.resultPreview);
      list.push({
        tool: toolName,
        toolCallId: typeof event.metadata?.toolCallId === "string" ? event.metadata.toolCallId : null,
        ...(typeof event.metadata?.durationMs === "number" ? { durationMs: event.metadata.durationMs } : {}),
        ...(typeof event.metadata?.exitCode === "number" ? { exitCode: event.metadata.exitCode } : {}),
        ...(resultPreview ? { resultPreview } : {})
      });
      byTool.set(toolName, list);
    }
  };
}
