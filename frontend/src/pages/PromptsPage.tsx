import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Button } from "@/components/ui/button";
import { fetchPromptSettings, savePromptSettings } from "@/lib/api";

export function PromptsPage() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [customPostPrompt, setCustomPostPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchPromptSettings()
      .then((data) => {
        if (!mounted) return;
        setCustomPrompt(data.custom_prompt);
        setCustomPostPrompt(data.custom_post_prompt);
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
      const saved = await savePromptSettings({
        custom_prompt: customPrompt,
        custom_post_prompt: customPostPrompt,
      });
      setCustomPrompt(saved.custom_prompt);
      setCustomPostPrompt(saved.custom_post_prompt);
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
      description="Edit the global custom prompt layer and the runtime post prompt layer."
    >
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
            <span>Custom Prompt {customPrompt.length}</span>
            <span>Custom Post Prompt {customPostPrompt.length}</span>
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                Custom Prompt
              </p>
              <p className="text-[11px] text-muted-foreground/72">
                Appended to every node&apos;s system prompt
              </p>
            </div>
            <div className="relative flex min-h-0 flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[2px] rounded-full bg-white/8" />
              <textarea
                aria-label="Custom Prompt"
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="Add a custom prompt appended to every agent's system prompt..."
                rows={10}
                className="min-h-0 w-full flex-1 resize-none rounded-r-lg bg-surface-1 pb-4 pl-5 pr-4 pt-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                Custom Post Prompt
              </p>
              <p className="text-[11px] text-muted-foreground/72">
                Added after the built-in runtime post prompt
              </p>
            </div>
            <div className="relative flex min-h-0 flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[2px] rounded-full bg-white/8" />
              <textarea
                aria-label="Custom Post Prompt"
                value={customPostPrompt}
                onChange={(event) => setCustomPostPrompt(event.target.value)}
                placeholder="Add custom runtime instructions appended after the built-in post prompt..."
                rows={10}
                className="min-h-0 w-full flex-1 resize-none rounded-r-lg bg-surface-1 pb-4 pl-5 pr-4 pt-4 font-mono text-sm leading-relaxed text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
