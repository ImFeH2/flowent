import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageScaffold, SoftPanel } from "@/components/layout/PageScaffold";
import { fetchPromptSettings, savePromptSettings } from "@/lib/api";

export function PromptsPage() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchPromptSettings()
      .then((data) => {
        if (!mounted) return;
        setCustomPrompt(data.custom_prompt);
      })
      .catch(() => {
        toast.error("Failed to load prompts");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const saved = await savePromptSettings({ custom_prompt: customPrompt });
      setCustomPrompt(saved.custom_prompt);
      toast.success("Prompts saved");
    } catch {
      toast.error("Failed to save prompts");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-2 w-32 rounded-full skeleton-shimmer" />
          <p className="text-sm text-muted-foreground">Loading prompts...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold
      title="Prompts"
      description="Add a global custom prompt that is appended to every node."
      actions={
        <button
          onClick={() => void handleSave()}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-[0.98] hover:bg-primary/90 disabled:opacity-50"
        >
          <Save className="size-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      }
    >
      <div className="mx-auto max-w-3xl">
        <SoftPanel className="rounded-xl border-border p-6 shadow-lg">
          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold">Global Custom Prompt</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Inserted after the built-in collaboration prompt and before the
                role-specific prompt.
              </p>
            </div>

            <textarea
              value={customPrompt}
              onChange={(event) => setCustomPrompt(event.target.value)}
              placeholder="Add extra instructions that should apply to every node..."
              rows={18}
              className="min-h-[26rem] w-full resize-y rounded-xl border border-border bg-background px-4 py-3 font-mono text-sm transition-all duration-200 placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </SoftPanel>
      </div>
    </PageScaffold>
  );
}
