import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  className?: string;
  iconClassName?: string;
  copiedClassName?: string;
}

export function CopyButton({
  text,
  className,
  iconClassName,
  copiedClassName,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "rounded p-0.5 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-all",
        className,
      )}
      title="Copy"
    >
      {copied ? (
        <Check className={cn("size-3 text-white/88", copiedClassName)} />
      ) : (
        <Copy className={cn("size-3", iconClassName)} />
      )}
    </button>
  );
}
