import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere]",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="mb-1.5 last:mb-0 whitespace-pre-wrap">{children}</p>
          ),
          code: ({ children, className: cls }) => {
            const isInline = !cls;
            if (isInline) {
              return (
                <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[0.9em] text-foreground/90 break-all">
                  {children}
                </code>
              );
            }
            return (
              <code className="block font-mono text-[0.9em] text-foreground/80">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-1.5 max-w-full overflow-x-auto rounded bg-surface-1 p-2 text-[0.9em] leading-relaxed">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline hover:text-primary/80"
            >
              {children}
            </a>
          ),
          ul: ({ children }) => (
            <ul className="mb-1.5 list-disc pl-4 space-y-0.5">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="mb-1.5 list-decimal pl-4 space-y-0.5">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">
              {children}
            </strong>
          ),
          em: ({ children }) => (
            <em className="italic text-foreground/80">{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-1.5 border-l-2 border-muted-foreground pl-3 text-muted-foreground italic">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="mb-1.5 overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-surface-2 px-2 py-1 text-left font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-2 py-1 text-foreground/80">
              {children}
            </td>
          ),
          h1: ({ children }) => (
            <h1 className="mb-1.5 text-base font-bold text-foreground">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 text-sm font-bold text-foreground">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 text-xs font-bold text-foreground/90">
              {children}
            </h3>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
