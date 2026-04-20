import { useEffect, useState } from "react";
import useSWR from "swr";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { FormTextarea } from "@/components/form/FormControls";
import { PageScaffold } from "@/components/layout/PageScaffold";
import { PageLoadingState } from "@/components/layout/PageLoadingState";
import { Button } from "@/components/ui/button";
import { fetchPromptSettings, savePromptSettings } from "@/lib/api";

const promptCharCountClass =
  "rounded-full border border-border bg-accent/30 px-2 py-0.5 text-[10px] font-medium text-muted-foreground";
const promptEditorSurfaceClass =
  "relative flex min-h-0 flex-1 rounded-xl border border-border bg-card/30 p-1";
const promptEditorTextareaClass =
  "min-h-0 w-full flex-1 resize-none select-text rounded-md bg-transparent p-3 font-mono text-[13px] leading-relaxed text-foreground placeholder:text-muted-foreground transition-colors focus:bg-background/35 focus:outline-none scrollbar-none";

export function PromptsPage() {
  const {
    data,
    isLoading: loading,
    mutate,
  } = useSWR("promptSettings", fetchPromptSettings);

  const [customPrompt, setCustomPrompt] = useState("");
  const [customPostPrompt, setCustomPostPrompt] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setCustomPrompt(data.custom_prompt);
      setCustomPostPrompt(data.custom_post_prompt);
    }
  }, [data]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        custom_prompt: customPrompt,
        custom_post_prompt: customPostPrompt,
      };
      const saved = await savePromptSettings(payload);
      void mutate(saved, false);
      toast.success("Prompts saved");
    } catch {
      toast.error("Failed to save prompts");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PageLoadingState
        label="Loading prompts..."
        textClassName="text-[13px]"
      />
    );
  }

  return (
    <PageScaffold>
      <div className="mx-auto flex h-full w-full max-w-[800px] flex-col px-4 pb-10 pt-8">
        <div className="mb-6 flex justify-end">
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            size="sm"
            className="text-[13px]"
          >
            <Save className="size-4" />
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
        <div className="grid min-h-0 flex-1 gap-8">
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-medium text-foreground">
                  Custom Prompt
                </h2>
                <span className={promptCharCountClass}>
                  {customPrompt.length} chars
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Appended to every node's system prompt
              </p>
            </div>
            <div className={promptEditorSurfaceClass}>
              <FormTextarea
                aria-label="Custom Prompt"
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
                placeholder="Add a custom prompt appended to every agent's system prompt..."
                className={promptEditorTextareaClass}
                mono
              />
            </div>
          </div>
          <div className="flex min-h-0 flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-medium text-foreground">
                  Runtime Post Prompt
                </h2>
                <span className={promptCharCountClass}>
                  {customPostPrompt.length} chars
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                Added after the built-in runtime post prompt
              </p>
            </div>
            <div className={promptEditorSurfaceClass}>
              <FormTextarea
                aria-label="Custom Post Prompt"
                value={customPostPrompt}
                onChange={(event) => setCustomPostPrompt(event.target.value)}
                placeholder="Add custom runtime instructions appended after the built-in post prompt..."
                className={promptEditorTextareaClass}
                mono
              />
            </div>
          </div>
        </div>
      </div>
    </PageScaffold>
  );
}
