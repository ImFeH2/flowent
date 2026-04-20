import { LayoutDashboard } from "lucide-react";
import type { PageId } from "@/context/AgentContext";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { PAGE_NAVIGATION_ITEMS } from "@/lib/pageNavigation";

interface WorkflowCommandItem {
  id: string;
  shortId: string;
  title: string;
}

interface GlobalCommandPaletteProps {
  onOpenChange: (open: boolean) => void;
  onSelectPage: (page: PageId) => void;
  onSelectWorkflow: (workflowId: string) => void;
  open: boolean;
  workflows: WorkflowCommandItem[];
}

export function GlobalCommandPalette({
  onOpenChange,
  onSelectPage,
  onSelectWorkflow,
  open,
  workflows,
}: GlobalCommandPaletteProps) {
  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command Palette"
      description="Search pages and workflows."
      className="max-w-[680px] rounded-2xl border-border/80 bg-surface-overlay/95 shadow-2xl backdrop-blur-2xl"
    >
      <CommandInput placeholder="Search pages and workflows..." />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>No pages or workflows match.</CommandEmpty>
        <CommandGroup heading="Pages">
          {PAGE_NAVIGATION_ITEMS.map(({ icon: Icon, id, label }) => (
            <CommandItem
              key={id}
              value={`page-${label}`}
              onSelect={() => {
                onSelectPage(id);
                onOpenChange(false);
              }}
              className="gap-3 rounded-xl"
            >
              <Icon className="size-4 text-muted-foreground" />
              <span>{label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Workflows">
          {workflows.map((workflow) => (
            <CommandItem
              key={workflow.id}
              value={`workflow-${workflow.title}-${workflow.shortId}`}
              onSelect={() => {
                onSelectWorkflow(workflow.id);
                onOpenChange(false);
              }}
              className="items-start gap-3 rounded-xl py-3"
            >
              <LayoutDashboard className="mt-0.5 size-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-foreground">
                  {workflow.title}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Workflow {workflow.shortId}
                </p>
              </div>
              <CommandShortcut>{workflow.shortId}</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
