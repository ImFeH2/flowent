import { useEffect, useState } from "react";
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
import { createRole, deleteRole, fetchRoles, updateRole } from "@/lib/api";
import type { Role } from "@/types";
import { cn } from "@/lib/utils";

type RoleDraft = Omit<Role, "id">;

const emptyDraft = (): RoleDraft => ({
  name: "",
  system_prompt: "",
});

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const refreshRoles = async () => {
    setLoading(true);
    try {
      const items = await fetchRoles();
      setRoles(items);
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
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const handleEdit = (role: Role) => {
    setEditingId(role.id);
    setIsCreating(false);
    setDraft({ name: role.name, system_prompt: role.system_prompt });
  };

  const handleCancel = () => {
    setIsCreating(false);
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Role name is required");
      return;
    }
    if (!draft.system_prompt.trim()) {
      toast.error("System prompt is required");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateRole(editingId, draft);
        setRoles((prev) => prev.map((r) => (r.id === editingId ? updated : r)));
        toast.success("Role updated");
      } else {
        const created = await createRole(draft.name, draft.system_prompt);
        setRoles((prev) => [created, ...prev]);
        toast.success("Role created");
      }
      handleCancel();
    } catch {
      toast.error("Failed to save role");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this role?")) return;
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
      if (editingId === id) handleCancel();
      toast.success("Role deleted");
    } catch {
      toast.error("Failed to delete role");
    }
  };

  const isEditing = Boolean(isCreating || editingId);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <BookOpen className="size-5 text-primary" />
          <div>
            <h1 className="text-lg font-semibold">Roles</h1>
            <p className="text-sm text-muted-foreground">
              Define reusable agent behaviors
            </p>
          </div>
        </div>
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
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isEditing ? (
          <div className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-border bg-card p-6 shadow-lg">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-semibold">
                  {editingId ? "Edit Role" : "Create Role"}
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
                    onChange={(e) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
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
            </div>
          </div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="space-y-3 text-center">
              <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
              <p className="text-sm text-muted-foreground">Loading roles...</p>
            </div>
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
                key={role.id}
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
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {role.id.slice(0, 8)}
                      </p>
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
                      onClick={() => handleDelete(role.id)}
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
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
