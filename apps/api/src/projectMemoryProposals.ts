import type { MemoryTarget } from "./agent/curatedMemory.js";
import type { SeedStore } from "./seed.js";

export type MemoryProposalStatus = "proposed" | "committed" | "rejected";

export interface MemoryProposal {
  id: string;
  projectId: string;
  conversationId: string;
  userId: string;
  target: MemoryTarget;
  content: string;
  reason: string;
  status: MemoryProposalStatus;
  createdAt: string;
}

const EXECUTABLE_PATTERNS: RegExp[] = [
  /\b(script|脚本|playbook|阈值|threshold)\b/i,
  /\b(判定|判断逻辑|if\s+.+\s+then)\b/i,
  /\b(tlkw|run_status|fdd)\b.*(>|>=|<|==|判定|脚本)/i,
  /\bfeedback_tools\b/i
];

export function looksExecutableMemoryContent(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }
  return EXECUTABLE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function ensureStoreMemoryProposals(store: SeedStore): void {
  if (!store.pendingMemoryProposalsByProject) {
    store.pendingMemoryProposalsByProject = {};
  }
}

let proposalSequence = 0;

export function restoreMemoryProposalSequence(store: SeedStore): void {
  let max = 0;
  for (const proposals of Object.values(store.pendingMemoryProposalsByProject ?? {})) {
    for (const proposal of proposals) {
      const match = proposal.id.match(/^memprop_(\d+)$/);
      if (match) {
        max = Math.max(max, Number(match[1]));
      }
    }
  }
  proposalSequence = max;
}

function nextProposalId(): string {
  proposalSequence += 1;
  return `memprop_${String(proposalSequence).padStart(3, "0")}`;
}

export interface ProjectMemoryProposalBindings {
  propose(
    projectId: string,
    conversationId: string,
    userId: string,
    target: MemoryTarget,
    content: string,
    reason: string
  ): MemoryProposal;
  findLatestProposed(projectId: string, conversationId: string, userId: string): MemoryProposal | null;
  commit(proposalId: string, projectId: string): MemoryProposal | null;
  reject(proposalId: string, projectId: string): MemoryProposal | null;
  list(projectId: string, userId?: string): MemoryProposal[];
}

export function createProjectMemoryProposalBindings(
  store: SeedStore,
  persistSoon: () => void
): ProjectMemoryProposalBindings {
  ensureStoreMemoryProposals(store);

  return {
    propose(projectId, conversationId, userId, target, content, reason) {
      const proposal: MemoryProposal = {
        id: nextProposalId(),
        projectId,
        conversationId,
        userId,
        target,
        content: content.trim(),
        reason: reason.trim(),
        status: "proposed",
        createdAt: new Date().toISOString()
      };
      const existing = store.pendingMemoryProposalsByProject![projectId] ?? [];
      store.pendingMemoryProposalsByProject![projectId] = [...existing, proposal].slice(-50);
      persistSoon();
      return proposal;
    },

    findLatestProposed(projectId, conversationId, userId) {
      const proposals = store.pendingMemoryProposalsByProject?.[projectId] ?? [];
      for (let index = proposals.length - 1; index >= 0; index -= 1) {
        const proposal = proposals[index];
        if (!proposal) {
          continue;
        }
        if (
          proposal.status === "proposed" &&
          proposal.conversationId === conversationId &&
          proposal.userId === userId
        ) {
          return proposal;
        }
      }
      return null;
    },

    commit(proposalId, projectId) {
      const proposals = store.pendingMemoryProposalsByProject?.[projectId];
      if (!proposals) {
        return null;
      }
      const proposal = proposals.find((entry) => entry.id === proposalId && entry.status === "proposed");
      if (!proposal) {
        return null;
      }
      proposal.status = "committed";
      persistSoon();
      return proposal;
    },

    reject(proposalId, projectId) {
      const proposals = store.pendingMemoryProposalsByProject?.[projectId];
      if (!proposals) {
        return null;
      }
      const proposal = proposals.find((entry) => entry.id === proposalId && entry.status === "proposed");
      if (!proposal) {
        return null;
      }
      proposal.status = "rejected";
      persistSoon();
      return proposal;
    },

    list(projectId, userId) {
      const proposals = store.pendingMemoryProposalsByProject?.[projectId] ?? [];
      if (!userId) {
        return [...proposals];
      }
      return proposals.filter((proposal) => proposal.userId === userId);
    }
  };
}
