import { useCallback, useMemo, useRef, useState } from "react";
import {
  createTabEdgeRequest,
  createTabNodeRequest,
  deleteTabEdgeRequest,
  deleteTabNodeRequest,
} from "@/lib/api";
import type { Node } from "@/types";

type GraphHistoryCommand = {
  undo: () => Promise<void>;
  redo: () => Promise<void>;
};

type TabGraphStacks = {
  undo: GraphHistoryCommand[];
  redo: GraphHistoryCommand[];
};

type CreateAgentInput = {
  tabId: string;
  roleName: string;
  name?: string;
};

type CreateLinkedAgentInput = CreateAgentInput & {
  anchorNodeId: string;
};

type DeleteAgentInput = {
  tabId: string;
  node: Node;
  tabAgents: Node[];
};

type InsertAgentBetweenInput = CreateAgentInput & {
  sourceNodeId: string;
  targetNodeId: string;
};

function cloneStacks(stacks?: TabGraphStacks): TabGraphStacks {
  return {
    undo: [...(stacks?.undo ?? [])],
    redo: [...(stacks?.redo ?? [])],
  };
}

function normalizeOptionalName(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : undefined;
}

export function useTabGraphHistory() {
  const stacksRef = useRef(new Map<string, TabGraphStacks>());
  const [revision, setRevision] = useState(0);

  const touch = useCallback(() => {
    setRevision((current) => current + 1);
  }, []);

  const pushHistory = useCallback(
    (tabId: string, command: GraphHistoryCommand) => {
      const next = cloneStacks(stacksRef.current.get(tabId));
      next.undo.push(command);
      next.redo = [];
      stacksRef.current.set(tabId, next);
      touch();
    },
    [touch],
  );

  const createStandaloneAgent = useCallback(
    async ({ tabId, roleName, name }: CreateAgentInput) => {
      const normalizedName = normalizeOptionalName(name);
      let currentNodeId = (
        await createTabNodeRequest(tabId, {
          role_name: roleName,
          name: normalizedName,
        })
      ).id;

      pushHistory(tabId, {
        undo: async () => {
          await deleteTabNodeRequest(tabId, currentNodeId);
        },
        redo: async () => {
          currentNodeId = (
            await createTabNodeRequest(tabId, {
              role_name: roleName,
              name: normalizedName,
            })
          ).id;
        },
      });

      return currentNodeId;
    },
    [pushHistory],
  );

  const createLinkedAgent = useCallback(
    async ({ tabId, anchorNodeId, roleName, name }: CreateLinkedAgentInput) => {
      const normalizedName = normalizeOptionalName(name);
      let currentNodeId = (
        await createTabNodeRequest(tabId, {
          role_name: roleName,
          name: normalizedName,
        })
      ).id;

      try {
        await createTabEdgeRequest(tabId, anchorNodeId, currentNodeId);
      } catch (error) {
        await deleteTabNodeRequest(tabId, currentNodeId).catch(() => undefined);
        throw error;
      }

      pushHistory(tabId, {
        undo: async () => {
          await deleteTabNodeRequest(tabId, currentNodeId);
        },
        redo: async () => {
          currentNodeId = (
            await createTabNodeRequest(tabId, {
              role_name: roleName,
              name: normalizedName,
            })
          ).id;
          await createTabEdgeRequest(tabId, anchorNodeId, currentNodeId);
        },
      });

      return currentNodeId;
    },
    [pushHistory],
  );

  const createConnection = useCallback(
    async (tabId: string, sourceNodeId: string, targetNodeId: string) => {
      await createTabEdgeRequest(tabId, sourceNodeId, targetNodeId);

      pushHistory(tabId, {
        undo: async () => {
          await deleteTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
        },
        redo: async () => {
          await createTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
        },
      });
    },
    [pushHistory],
  );

  const deleteConnection = useCallback(
    async (tabId: string, sourceNodeId: string, targetNodeId: string) => {
      await deleteTabEdgeRequest(tabId, sourceNodeId, targetNodeId);

      pushHistory(tabId, {
        undo: async () => {
          await createTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
        },
        redo: async () => {
          await deleteTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
        },
      });
    },
    [pushHistory],
  );

  const deleteAgent = useCallback(
    async ({ tabId, node, tabAgents }: DeleteAgentInput) => {
      const roleName = node.role_name?.trim() ?? "";
      if (!roleName) {
        throw new Error("Missing role for this node");
      }

      const incomingNodeIds = tabAgents
        .filter((candidate) => candidate.id !== node.id)
        .filter((candidate) => candidate.connections.includes(node.id))
        .map((candidate) => candidate.id);
      const connectedNodeIds = Array.from(
        new Set(
          [...incomingNodeIds, ...node.connections].filter((targetId) =>
            tabAgents.some((candidate) => candidate.id === targetId),
          ),
        ),
      );
      const normalizedName = normalizeOptionalName(node.name);
      let currentNodeId = node.id;

      await deleteTabNodeRequest(tabId, currentNodeId);

      pushHistory(tabId, {
        undo: async () => {
          currentNodeId = (
            await createTabNodeRequest(tabId, {
              role_name: roleName,
              name: normalizedName,
            })
          ).id;

          for (const connectedNodeId of connectedNodeIds) {
            await createTabEdgeRequest(tabId, connectedNodeId, currentNodeId);
          }
        },
        redo: async () => {
          await deleteTabNodeRequest(tabId, currentNodeId);
        },
      });
    },
    [pushHistory],
  );

  const insertAgentBetween = useCallback(
    async ({
      tabId,
      sourceNodeId,
      targetNodeId,
      roleName,
      name,
    }: InsertAgentBetweenInput) => {
      const normalizedName = normalizeOptionalName(name);
      let currentNodeId: string | null = null;

      await deleteTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
      try {
        currentNodeId = (
          await createTabNodeRequest(tabId, {
            role_name: roleName,
            name: normalizedName,
          })
        ).id;
        await createTabEdgeRequest(tabId, sourceNodeId, currentNodeId);
        await createTabEdgeRequest(tabId, currentNodeId, targetNodeId);
      } catch (error) {
        if (currentNodeId) {
          await deleteTabNodeRequest(tabId, currentNodeId).catch(
            () => undefined,
          );
        }
        await createTabEdgeRequest(tabId, sourceNodeId, targetNodeId).catch(
          () => undefined,
        );
        throw error;
      }

      pushHistory(tabId, {
        undo: async () => {
          if (!currentNodeId) {
            return;
          }
          await deleteTabNodeRequest(tabId, currentNodeId);
          await createTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
        },
        redo: async () => {
          await deleteTabEdgeRequest(tabId, sourceNodeId, targetNodeId);
          currentNodeId = (
            await createTabNodeRequest(tabId, {
              role_name: roleName,
              name: normalizedName,
            })
          ).id;
          await createTabEdgeRequest(tabId, sourceNodeId, currentNodeId);
          await createTabEdgeRequest(tabId, currentNodeId, targetNodeId);
        },
      });

      return currentNodeId;
    },
    [pushHistory],
  );

  const canUndo = useCallback(
    (tabId: string | null) =>
      Boolean(tabId && (stacksRef.current.get(tabId)?.undo.length ?? 0) > 0),
    [],
  );

  const canRedo = useCallback(
    (tabId: string | null) =>
      Boolean(tabId && (stacksRef.current.get(tabId)?.redo.length ?? 0) > 0),
    [],
  );

  const undo = useCallback(
    async (tabId: string | null) => {
      if (!tabId) {
        return false;
      }
      const current = cloneStacks(stacksRef.current.get(tabId));
      const command = current.undo.pop();
      if (!command) {
        return false;
      }

      await command.undo();
      current.redo.push(command);
      stacksRef.current.set(tabId, current);
      touch();
      return true;
    },
    [touch],
  );

  const redo = useCallback(
    async (tabId: string | null) => {
      if (!tabId) {
        return false;
      }
      const current = cloneStacks(stacksRef.current.get(tabId));
      const command = current.redo.pop();
      if (!command) {
        return false;
      }

      await command.redo();
      current.undo.push(command);
      stacksRef.current.set(tabId, current);
      touch();
      return true;
    },
    [touch],
  );

  return useMemo(
    () => ({
      canRedo,
      canUndo,
      createConnection,
      createLinkedAgent,
      createStandaloneAgent,
      deleteAgent,
      deleteConnection,
      insertAgentBetween,
      redo,
      revision,
      undo,
    }),
    [
      canRedo,
      canUndo,
      createConnection,
      createLinkedAgent,
      createStandaloneAgent,
      deleteAgent,
      deleteConnection,
      insertAgentBetween,
      redo,
      revision,
      undo,
    ],
  );
}
