import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { fetchRoles, createRole, updateRole, deleteRole } from "@/lib/api";
import type { Role } from "@/types";

const emptyForm = () => ({ name: "", system_prompt: "" });

export function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());

  useEffect(() => {
    fetchRoles()
      .then(setRoles)
      .catch(() => {});
  }, []);

  const handleSubmit = async () => {
    try {
      if (editId) {
        const updated = await updateRole(editId, form);
        setRoles((prev) => prev.map((r) => (r.id === editId ? updated : r)));
        toast.success("Role updated");
      } else {
        const created = await createRole(form.name, form.system_prompt);
        setRoles((prev) => [...prev, created]);
        toast.success("Role created");
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm());
    } catch {
      toast.error("Failed to save role");
    }
  };

  const handleEdit = (r: Role) => {
    setEditId(r.id);
    setForm({ name: r.name, system_prompt: r.system_prompt });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRole(id);
      setRoles((prev) => prev.filter((r) => r.id !== id));
      toast.success("Role deleted");
    } catch {
      toast.error("Failed to delete role");
    }
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditId(null);
    setForm(emptyForm());
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-zinc-100">Roles</h1>
        <button
          onClick={() => {
            setEditId(null);
            setForm(emptyForm());
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          <Plus className="size-3.5" />
          Add Role
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-sm font-medium text-zinc-200">
            {editId ? "Edit Role" : "New Role"}
          </h2>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
              placeholder="My Agent Role"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-400 mb-1 block">
              System Prompt
            </label>
            <textarea
              value={form.system_prompt}
              onChange={(e) =>
                setForm({ ...form, system_prompt: e.target.value })
              }
              rows={8}
              className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-zinc-500 resize-y"
              placeholder="You are a specialized agent that..."
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-500 transition-colors"
            >
              <Check className="size-3.5" />
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
            >
              <X className="size-3.5" />
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {roles.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-8">
            No roles configured. Create one to use with spawned agents.
          </p>
        )}
        {roles.map((r) => (
          <div
            key={r.id}
            className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-zinc-200">
                {r.name}
              </span>
              <p className="text-xs text-zinc-500 mt-1 line-clamp-2 font-mono">
                {r.system_prompt}
              </p>
              <p className="text-[10px] text-zinc-600 mt-1 font-mono">{r.id}</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleEdit(r)}
                className="size-8 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Edit2 className="size-3.5" />
              </button>
              <button
                onClick={() => handleDelete(r.id)}
                className="size-8 flex items-center justify-center rounded text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
