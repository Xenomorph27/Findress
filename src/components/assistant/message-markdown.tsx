"use client";

import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** Turn "[§3]" / "[record]" citations into links the renderer shows as source pills. */
export function linkCitations(text: string): string {
  return text
    .replace(/\[§\s?(\d+)\](?!\()/g, (_, n: string) => `[§${n}](#cfp-${n})`)
    .replace(/\[record\](?!\()/gi, "[record](#record)");
}

const pill =
  "mx-0.5 inline-flex h-5 items-center rounded-full border border-hairline-strong bg-surface-2/70 px-1.5 align-[1px] text-xs leading-none text-muted-foreground no-underline transition-colors hover:border-aurora-2/60 hover:text-foreground";

export function MessageMarkdown({ text, cfpUrl }: { text: string; cfpUrl?: string | null }) {
  const components: Components = {
    a: ({ href, children }) => {
      if (!href) return <>{children}</>;
      if (href.startsWith("#cfp-")) {
        return cfpUrl ? (
          <a
            href={cfpUrl}
            target="_blank"
            rel="noreferrer"
            className={pill}
            title={`CFP section ${href.slice(5)}`}
          >
            {children}
          </a>
        ) : (
          <span className={pill}>{children}</span>
        );
      }
      if (href === "#record")
        return (
          <span className={pill} title="From the FIndress event record">
            record
          </span>
        );
      if (href.startsWith("/")) {
        return (
          <Link href={href} className="text-aurora-ink underline-offset-2 hover:underline">
            {children}
          </Link>
        );
      }
      let host = href;
      try {
        host = new URL(href).hostname.replace(/^www\./, "");
      } catch {
        /* keep raw */
      }
      const label = typeof children === "string" && children !== href ? children : null;
      return (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="text-aurora-ink underline-offset-2 hover:underline"
        >
          {label ?? children}
          {label && <span className={`${pill} ml-1`}>{host}</span>}
        </a>
      );
    },
    h1: ({ children }) => <h3 className="mt-4 mb-1.5 text-base font-semibold">{children}</h3>,
    h2: ({ children }) => <h3 className="mt-4 mb-1.5 text-base font-semibold">{children}</h3>,
    h3: ({ children }) => <h4 className="mt-3 mb-1 text-sm font-semibold">{children}</h4>,
    p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
    ul: ({ children }) => (
      <ul className="marker:text-muted-foreground my-2 list-disc space-y-1 pl-5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="marker:text-muted-foreground my-2 list-decimal space-y-1 pl-5">{children}</ol>
    ),
    code: ({ children, className }) =>
      className ? (
        <code
          className={`${className} bg-surface-2 block overflow-x-auto rounded-lg p-3 font-mono text-xs`}
        >
          {children}
        </code>
      ) : (
        <code className="bg-surface-2 rounded px-1 py-0.5 font-mono text-xs">{children}</code>
      ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className="w-full text-xs">{children}</table>
      </div>
    ),
    th: ({ children }) => (
      <th className="border-hairline border-b px-2 py-1 text-left font-medium">{children}</th>
    ),
    td: ({ children }) => (
      <td className="border-hairline border-b px-2 py-1 align-top">{children}</td>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-aurora-2/60 text-muted-foreground my-2 border-l-2 pl-3">
        {children}
      </blockquote>
    ),
  };
  return (
    <div className="text-foreground/90 text-sm">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
