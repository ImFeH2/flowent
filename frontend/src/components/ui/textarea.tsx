import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input placeholder:text-muted-foreground flex min-h-24 w-full rounded-[1rem] border bg-black/10 px-3.5 py-3 text-sm leading-6 text-foreground shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] outline-none transition-[border-color,box-shadow,background-color] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-white/26 focus-visible:bg-black/20 focus-visible:ring-[3px] focus-visible:ring-white/8",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
