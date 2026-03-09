import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  BookOpen,
  Check,
  Edit2,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  createRole,
  deleteRole,
  fetchRoles,
  fetchTools,
  updateRole,
  type ToolInfo,
} from "@/lib/api";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

type RoleDraft = Role;
type ToolState = "allowed" | "required" | "excluded";

const MINIMUM_TOOLS = new Set([
  "send",
  "idle",
  "todo",
  "list_connections",
  "exit",
]);

const emptyDraft = (): RoleDraft => ({
  name: "",
  system_prompt: "",
  required_tools: [],
  excluded_tools: [],
});

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const configurableTools = useMemo(
    () => tools.filter((tool) => !MINIMUM_TOOLS.has(tool.name)),
    [tools],
  );

  const refreshRoles = async () => {
    setLoading(true);
    try {
      const [roleItems, toolItems] = await Promise.all([
        fetchRoles(),
        fetchTools(),
      ]);
      setRoles(roleItems);
      setTools(toolItems);
    } catch {
      toast.error("Failed to load roles");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshRoles();
  }, []);

  const handleCreate = () => {
    setIsCreating(true);
    setEditingName(null);
    setDraft(emptyDraft());
  };

  const handleEdit = (role: Role) => {
    setEditingName(role.name);
    setIsCreating(false);
    setDraft({
      name: role.name,
      system_prompt: role.system_prompt,
      required_tools: [...role.required_tools],
      excluded_tools: [...role.excluded_tools],
    });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingName(null);
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    const nextName = draft.name.trim();

    if (!nextName) {
      toast.error("Role name is required");
      return;
    }
    if (!draft.system_prompt.trim()) {
      toast.error("System prompt is required");
      return;
    }

    const nameExists = roles.some(
      (role) => role.name === nextName && role.name !== editingName,
    );
    if (nameExists) {
      toast.error("Role name already exists");
      return;
    }

    setSaving(true);
    try {
      const nextDraft = {
        name: nextName,
        system_prompt: draft.system_prompt,
        required_tools: draft.required_tools,
        excluded_tools: draft.excluded_tools,
      };

      if (editingName) {
        const updated = await updateRole(editingName, nextDraft);
        setRoles((prev) =>
          prev.map((role) => (role.name === editingName ? updated : role)),
        );
        toast.success("Role updated");
      } else {
        const created = await createRole(nextDraft);
        setRoles((prev) => [created, ...prev]);
        toast.success("Role created");
      }
      handleCancel();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save role",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    try {
      await deleteRole(name);
      setRoles((prev) => prev.filter((role) => role.name !== name));
      if (editingName === name) handleCancel();
      toast.success("Role deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete role",
      );
    }
  };

  const isEditing = Boolean(isCreating || editingName);

  const getToolState = (toolName: string): ToolState => {
    if (draft.required_tools.includes(toolName)) return "required";
    if (draft.excluded_tools.includes(toolName)) return "excluded";
    return "allowed";
  };

  const cycleToolState = (toolName: string) => {
    setDraft((current) => {
      const currentState = current.required_tools.includes(toolName)
        ? "required"
        : current.excluded_tools.includes(toolName)
          ? "excluded"
          : "allowed";

      if (currentState === "allowed") {
        return {
          ...current,
          required_tools: [...current.required_tools, toolName],
          excluded_tools: current.excluded_tools.filter(
            (name) => name !== toolName,
          ),
        };
      }

      if (currentState === "required") {
        return {
          ...current,
          required_tools: current.required_tools.filter(
            (name) => name !== toolName,
          ),
          excluded_tools: [...current.excluded_tools, toolName],
        };
      }

      return {
        ...current,
        required_tools: current.required_tools.filter(
          (name) => name !== toolName,
        ),
        excluded_tools: current.excluded_tools.filter(
          (name) => name !== toolName,
        ),
      };
    });
  };

  if (loading && !isEditing) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
          <p className="text-sm text-muted-foreground">Loading roles...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Roles"
      description="Define reusable agent behaviors"
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={() => void refreshRoles()}
            disabled={loading}
            className="flex size-9 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} />
          </button>
          <button
            onClick={handleCreate}
            disabled={isEditing}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
          >
            <Plus className="size-4" />
            New Role
          </button>
        </div>
      }
    >
      {isEditing ? (
        <div className="mx-auto max-w-3xl">
          <SoftPanel className="rounded-xl border-border p-6 shadow-lg">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editingName ? "Edit Role" : "Create Role"}
              </h2>
              <button
                onClick={handleCancel}
                className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Role Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="e.g., Code Reviewer"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">System Prompt</label>
                <textarea
                  value={draft.system_prompt}
                  onChange={(e) =>
                    setDraft({ ...draft, system_prompt: e.target.value })
                  }
                  placeholder="You are a helpful assistant that..."
                  rows={12}
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-xs text-muted-foreground">
                  This prompt defines how agents with this role will behave.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Tool Configuration</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimum tools are injected by the framework. Configure the
                    remaining tools as Allowed, Required, or Excluded.
                  </p>
                </div>

                <div className="overflow-hidden rounded-xl border border-border bg-background">
                  {configurableTools.map((tool) => {
                    const state = getToolState(tool.name);
                    return (
                      <div
                        key={tool.name}
                        className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="font-mono text-sm">{tool.name}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {tool.description}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => cycleToolState(tool.name)}
                          className={cn(
                            "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                            state === "required" &&
                              "border-emerald-500/40 bg-emerald-500/10 text-emerald-600",
                            state === "excluded" &&
                              "border-red-500/40 bg-red-500/10 text-red-600",
                            state === "allowed" &&
                              "border-border bg-card text-muted-foreground",
                          )}
                        >
                          {state === "allowed"
                            ? "Allowed"
                            : state === "required"
                              ? "Required"
                              : "Excluded"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="size-4" />
                  {saving ? "Saving..." : "Save Role"}
                </button>
              </div>
            </div>
          </SoftPanel>
        </div>
      ) : roles.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex h-full flex-col items-center justify-center text-center"
        >
          <div className="flex size-16 items-center justify-center rounded-2xl bg-accent">
            <BookOpen className="size-8 text-primary/50" />
          </div>
          <h3 className="mt-4 text-lg font-semibold">No Roles Yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Create your first role to define how agents should behave.
          </p>
          <button
            onClick={handleCreate}
            className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Create Role
          </button>
        </motion.div>
      ) : (
        <div className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {roles.map((role, i) => (
            <motion.div
              key={role.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group relative rounded-xl border border-border bg-card p-5 shadow-sm transition-all hover:border-foreground/15 hover:shadow-md"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                    <BookOpen className="size-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{role.name}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleEdit(role)}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    <Edit2 className="size-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(role.name)}
                    className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-4">
                <p className="line-clamp-4 text-sm text-muted-foreground">
                  {role.system_prompt}
                </p>
              </div>

              {(role.required_tools.length > 0 ||
                role.excluded_tools.length > 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {role.required_tools.map((toolName) => (
                    <span
                      key={`required-${role.name}-${toolName}`}
                      className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600"
                    >
                      {toolName}
                    </span>
                  ))}
                  {role.excluded_tools.map((toolName) => (
                    <span
                      key={`excluded-${role.name}-${toolName}`}
                      className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600"
                    >
                      {toolName}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </PageScaffold>
  );
}
