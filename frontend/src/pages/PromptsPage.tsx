import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { PageScaffold } from "@/components/layout/PageScaffold";
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
          <div className="mx-auto h-2 w-32 animate-pulse rounded-full bg-white/[0.05]" />
          <p className="text-[13px] text-white/40">Loading prompts...</p>
        </div>
      </div>
    );
  }

  return (
    <PageScaffold>
      <div className="mx-auto flex h-full w-full max-w-[800px] flex-col px-4 pb-10 pt-8">
        <div className="mb-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex h-9 items-center gap-2 rounded-full bg-white px-5 text-[13px] font-medium text-black transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Save className="size-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
        <div className="grid min-h-0 flex-1 gap-8">
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-medium text-white/90">
                  Custom Prompt
                </h2>
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/40">
                  {customPrompt.length} chars
                </span>
              </div>
              <p className="text-[12px] text-white/40">
                Appended to every node's system prompt
              </p>
            </div>
            <div className="relative flex min-h-0 flex-1 rounded-xl border border-white/[0.04] bg-white/[0.01] p-1">
              <textarea
                aria-label="Custom Prompt"
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="Add a custom prompt appended to every agent's system prompt..."
                className="min-h-0 w-full flex-1 resize-none rounded-lg bg-transparent p-4 font-mono text-[13px] leading-relaxed text-white placeholder:text-white/20 focus:bg-white/[0.02] focus:outline-none transition-colors scrollbar-none"
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-medium text-white/90">
                  Runtime Post Prompt
                </h2>
                <span className="rounded-full bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium text-white/40">
                  {customPostPrompt.length} chars
                </span>
              </div>
              <p className="text-[12px] text-white/40">
                Added after the built-in runtime post prompt
              </p>
            </div>
            <div className="relative flex min-h-0 flex-1 rounded-xl border border-white/[0.04] bg-white/[0.01] p-1">
              <textarea
                aria-label="Custom Post Prompt"
                value={customPostPrompt}
                onChange={(event) => setCustomPostPrompt(event.target.value)}
                placeholder="Add custom runtime instructions appended after the built-in post prompt..."
                className="min-h-0 w-full flex-1 resize-none rounded-lg bg-transparent p-4 font-mono text-[13px] leading-relaxed text-white placeholder:text-white/20 focus:bg-white/[0.02] focus:outline-none transition-colors scrollbar-none"
              />
            </div>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
