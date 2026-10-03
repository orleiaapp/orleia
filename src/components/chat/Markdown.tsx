"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChartBlock } from "./ChartBlock";
import { compactUrl } from "@/lib/utils";

// Strip the internal hast `node` prop before spreading onto DOM elements
type MDProps = Record<string, any>;
function dom(props: MDProps) {
  const { node, ...rest } = props;
  return rest;
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: (props) => <h1 className="text-base font-bold mt-3 mb-1.5 first:mt-0" {...dom(props)} />,
          h2: (props) => <h2 className="text-[15px] font-bold mt-3 mb-1.5 first:mt-0" {...dom(props)} />,
          h3: (props) => <h3 className="text-sm font-bold mt-3 mb-1 first:mt-0" {...dom(props)} />,
          h4: (props) => <h4 className="text-sm font-semibold mt-2 mb-1 first:mt-0" {...dom(props)} />,
          p: (props) => <p className="my-1.5 leading-relaxed first:mt-0 last:mb-0" {...dom(props)} />,
          strong: (props) => <strong className="font-semibold text-foreground" {...dom(props)} />,
          // The user hates slanted text: italics render as upright but
          // tinted, never as *em* slant. Blockquotes stay clean of italics.
          em: (props) => <em className="not-italic text-muted-foreground" {...dom(props)} />,
          i: (props) => <i className="not-italic text-muted-foreground" {...dom(props)} />,
          del: (props) => <del className="line-through text-muted-foreground" {...dom(props)} />,
          ul: (props) => <ul className="list-disc pl-5 my-1.5 space-y-1 marker:text-foreground/40" {...dom(props)} />,
          ol: (props) => <ol className="list-decimal pl-5 my-1.5 space-y-1 marker:text-foreground/40" {...dom(props)} />,
          li: (props) => <li className="leading-relaxed" {...dom(props)} />,
          a: (props) => {
            const { children, ...rest } = dom(props);
            // GFM autolinks use the whole address as link text, which reads
            // terribly for long source URLs: keep the href (and the full
            // address on hover) but show the compact form. Authored link
            // text is passed through untouched.
            const one = Array.isArray(children) && children.length === 1 ? children[0] : children;
            const raw = typeof one === "string" ? one.trim() : "";
            const isRawUrl = /^https?:\/\/\S+$/.test(raw);
            return (
              <a
                className="text-primary-500 underline underline-offset-2 break-all hover:opacity-80"
                target="_blank"
                rel="noopener noreferrer"
                title={isRawUrl ? raw : undefined}
                {...rest}
              >
                {isRawUrl ? compactUrl(raw) : children}
              </a>
            );
          },
          img: (props) => (
            <img
              className="my-2.5 max-h-96 w-auto max-w-full rounded-2xl border border-border object-contain"
              alt={(props.alt as string) || "Image shared in the conversation"}
              {...dom(props)}
            />
          ),
          hr: (props) => <hr className="my-3 border-border/60" {...dom(props)} />,
          blockquote: (props) => (
            <blockquote className="border-l-2 border-primary-500/40 pl-3 my-2 text-muted-foreground" {...dom(props)} />
          ),
          table: (props) => (
            <div className="overflow-x-auto my-2.5 rounded-xl border border-border">
              <table className="w-full text-[13px] border-collapse" {...dom(props)} />
            </div>
          ),
          thead: (props) => <thead className="bg-secondary/70" {...dom(props)} />,
          th: (props) => (
            <th className="px-3 py-2 text-left font-semibold border-b border-border whitespace-nowrap" {...dom(props)} />
          ),
          td: (props) => <td className="px-3 py-2 border-b border-border/60 align-top" {...dom(props)} />,
          tr: (props) => <tr className="odd:bg-secondary/30" {...dom(props)} />,
          input: (props) => {
            const { checked } = props as { checked?: boolean };
            return (
              <input
                type="checkbox"
                checked={checked}
                readOnly
                className="mx-1.5 inline-block h-3.5 w-3.5 translate-y-[1px] cursor-default accent-primary-500"
              />
            );
          },
          pre: (props) => {
            const child = (props as any).children as any;
            const codeEl = child?.props;
            const lang = typeof codeEl?.className === "string" ? codeEl.className.match(/language-(\S+)/)?.[1] : undefined;
            const raw = typeof codeEl?.children === "string" ? codeEl.children : "";
            if (lang === "chart" && raw.trim()) {
              return <ChartBlock code={raw.trim()} />;
            }
            return (
              <pre className="my-2.5 rounded-xl bg-zinc-900 dark:bg-black/60 border border-border p-3 overflow-x-auto text-xs font-mono leading-relaxed text-zinc-100" {...dom(props)} />
            );
          },
          code: (props) => {
            const { className, children, ...rest } = dom(props) as { className?: string; children?: React.ReactNode };
            const isBlock = /language-/.test(className || "") || String(children).includes("\n");
            if (isBlock) {
              return <code className="font-mono text-[12px] text-zinc-100" {...rest}>{children}</code>;
            }
            return (
              <code className="rounded-md bg-secondary px-1.5 py-0.5 font-mono text-[0.85em] text-foreground" {...rest}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
