import { useCallback, useEffect, useState } from "react";
import { fetchFormations } from "@/lib/api";
import type { AgentEvent, Formation } from "@/types";

export function useFormations() {
  const [formations, setFormations] = useState<Map<string, Formation>>(
    new Map(),
  );

  useEffect(() => {
    fetchFormations()
      .then((list) => {
        const next = new Map<string, Formation>();
        for (const formation of list) {
          next.set(formation.id, formation);
        }
        setFormations(next);
      })
      .catch(() => {});
  }, []);

  const handleUpdateEvent = useCallback((event: AgentEvent) => {
    if (event.type !== "formation_created") {
      return;
    }

    const data = event.data as Partial<Formation>;
    if (
      typeof data.id !== "string" ||
      typeof data.owner_agent_id !== "string"
    ) {
      return;
    }

    const formationId = data.id;
    const ownerAgentId = data.owner_agent_id;

    setFormations((prev) => {
      const next = new Map(prev);
      next.set(formationId, {
        id: formationId,
        owner_agent_id: ownerAgentId,
        parent_formation_id:
          typeof data.parent_formation_id === "string"
            ? data.parent_formation_id
            : null,
        name: typeof data.name === "string" ? data.name : null,
        goal: typeof data.goal === "string" ? data.goal : "",
      });
      return next;
    });
  }, []);

  return { formations, handleUpdateEvent };
}
