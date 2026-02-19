import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div className={cn("break-words", className)}>
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
                <code className="rounded bg-zinc-700/60 px-1 py-0.5 font-mono text-[0.9em] text-zinc-200">
                  {children}
                </code>
              );
            }
            return (
              <code className="block font-mono text-[0.9em] text-zinc-300">
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="mb-1.5 overflow-x-auto rounded bg-zinc-900/60 p-2 text-[0.9em] leading-relaxed">
              {children}
            </pre>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 underline hover:text-blue-300"
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
            <strong className="font-semibold text-zinc-100">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-zinc-300">{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="mb-1.5 border-l-2 border-zinc-500 pl-3 text-zinc-400 italic">
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
            <th className="border border-zinc-600 bg-zinc-800/60 px-2 py-1 text-left font-semibold text-zinc-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-zinc-700 px-2 py-1 text-zinc-300">
              {children}
            </td>
          ),
          h1: ({ children }) => (
            <h1 className="mb-1.5 text-base font-bold text-zinc-100">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-1.5 text-sm font-bold text-zinc-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-1.5 text-xs font-bold text-zinc-200">
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
