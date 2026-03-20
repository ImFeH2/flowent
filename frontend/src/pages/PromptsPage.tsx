import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { Button } from "@/components/ui/button";
import { fetchPromptSettings, savePromptSettings } from "@/lib/api";

export function PromptsPage() {
  const [customPrompt, setCustomPrompt] = useState("");
  const [postPrompt, setPostPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    fetchPromptSettings()
      .then((data) => {
        if (!mounted) return;
        setCustomPrompt(data.custom_prompt);
        setPostPrompt(data.post_prompt);
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
        post_prompt: postPrompt,
      });
      setCustomPrompt(saved.custom_prompt);
      setPostPrompt(saved.post_prompt);
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
      description="Configure the global system prompt layer and the runtime post prompt layer."
    >
      <div className="mx-auto flex h-full max-w-3xl flex-col">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-muted-foreground/60">
            <span>{customPrompt.length} custom</span>
            <span>{postPrompt.length} post</span>
          </div>
          <Button onClick={() => void handleSave()} disabled={saving}>
            <Save className="size-4" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 gap-4">
          <div className="flex min-h-0 flex-col">
            <div className="mb-2">
              <p className="text-sm font-medium text-foreground">
                Custom Prompt
              </p>
              <p className="text-xs text-muted-foreground/70">
                Appended to every node&apos;s system prompt.
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
            <div className="mb-2">
              <p className="text-sm font-medium text-foreground">Post Prompt</p>
              <p className="text-xs text-muted-foreground/70">
                Appended after history on every runtime request.
              </p>
            </div>
            <div className="relative flex min-h-0 flex-1">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[2px] rounded-full bg-white/8" />
              <textarea
                aria-label="Post Prompt"
                value={postPrompt}
                onChange={(event) => setPostPrompt(event.target.value)}
                placeholder="Add runtime instructions appended after history..."
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
