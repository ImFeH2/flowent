import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, Check, X, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
  fetchProviders,
  createProvider,
  updateProvider,
  deleteProvider,
} from "@/lib/api";
import type { Provider } from "@/types";

const PROVIDER_TYPES = [
  "openai_compatible",
  "openai_responses",
  "anthropic",
  "gemini",
];

const emptyForm = (): Omit<Provider, "id"> => ({
  name: "",
  type: "openai_compatible",
  base_url: "",
  api_key: "",
  default_model: "",
});

export function ProvidersPage() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [showKeys, setShowKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchProviders()
      .then(setProviders)
      .catch(() => {});
  }, []);

  const toggleShowKey = (id: string) => {
    setShowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    try {
      if (editId) {
        const updated = await updateProvider(editId, form);
        setProviders((prev) =>
          prev.map((p) => (p.id === editId ? updated : p)),
        );
        toast.success("Provider updated");
      } else {
        const created = await createProvider(form);
        setProviders((prev) => [...prev, created]);
        toast.success("Provider created");
      }
      setShowForm(false);
      setEditId(null);
      setForm(emptyForm());
    } catch {
      toast.error("Failed to save provider");
    }
  };

  const handleEdit = (p: Provider) => {
    setEditId(p.id);
    setForm({
      name: p.name,
      type: p.type,
      base_url: p.base_url,
      api_key: p.api_key,
      default_model: p.default_model,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProvider(id);
      setProviders((prev) => prev.filter((p) => p.id !== id));
      toast.success("Provider deleted");
    } catch {
      toast.error("Failed to delete provider");
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
        <h1 className="text-lg font-semibold text-zinc-100">Providers</h1>
        <button
          onClick={() => {
            setEditId(null);
            setForm(emptyForm());
            setShowForm(true);
          }}
          className="flex items-center gap-1.5 rounded-md bg-zinc-800 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          <Plus className="size-3.5" />
          Add Provider
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-sm font-medium text-zinc-200">
            {editId ? "Edit Provider" : "New Provider"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="My Provider"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">Type</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">
                Base URL
              </label>
              <input
                value={form.base_url}
                onChange={(e) => setForm({ ...form, base_url: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="https://api.example.com/v1"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-400 mb-1 block">
                Default Model
              </label>
              <input
                value={form.default_model}
                onChange={(e) =>
                  setForm({ ...form, default_model: e.target.value })
                }
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="model-name"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-zinc-400 mb-1 block">
                API Key
              </label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
                className="w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-500"
                placeholder="sk-..."
              />
            </div>
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
        {providers.length === 0 && (
          <p className="text-sm text-zinc-500 text-center py-8">
            No providers configured. Add one to get started.
          </p>
        )}
        {providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-zinc-200">
                  {p.name}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 border border-zinc-700">
                  {p.type}
                </span>
              </div>
              <div className="text-xs text-zinc-500 mt-0.5 truncate">
                {p.base_url}
              </div>
              {p.api_key && (
                <div className="flex items-center gap-1 mt-1">
                  <span className="text-xs text-zinc-500 font-mono">
                    {showKeys.has(p.id)
                      ? p.api_key
                      : "••••••••" + p.api_key.slice(-4)}
                  </span>
                  <button
                    onClick={() => toggleShowKey(p.id)}
                    className="text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showKeys.has(p.id) ? (
                      <EyeOff className="size-3" />
                    ) : (
                      <Eye className="size-3" />
                    )}
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleEdit(p)}
                className="size-8 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <Edit2 className="size-3.5" />
              </button>
              <button
                onClick={() => handleDelete(p.id)}
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
