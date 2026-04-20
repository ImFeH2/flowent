import { useEffect, useRef, useState } from "react";
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
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text).then(() => {
      if (!mountedRef.current) {
        return;
      }
      setCopied(true);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
      }
      resetTimerRef.current = setTimeout(() => {
        if (!mountedRef.current) {
          return;
        }
        setCopied(false);
      }, 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className={cn(
        "rounded p-0.5 text-muted-foreground opacity-0 transition-all hover:bg-accent/45 hover:text-foreground group-hover:opacity-100",
        className,
      )}
      title="Copy"
    >
      {copied ? (
        <Check className={cn("size-3 text-foreground", copiedClassName)} />
      ) : (
        <Copy className={cn("size-3", iconClassName)} />
      )}
    </button>
  );
}
