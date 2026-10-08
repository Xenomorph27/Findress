import type { ReactNode } from "react";

/**
 * Render extracted CFP text (plain text with "## " headings and "- " bullets) as React
 * elements — no HTML from third-party pages is ever injected.
 */
export function CfpText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  let para: string[] = [];
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(
        <ul
          key={`ul-${blocks.length}`}
          className="marker:text-muted-foreground my-3 list-disc space-y-1 pl-5"
        >
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="my-3">
          {para.join(" ")}
        </p>,
      );
      para = [];
    }
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      flushBullets();
      flushPara();
      continue;
    }
    if (line.startsWith("## ")) {
      flushBullets();
      flushPara();
      blocks.push(
        <h3
          key={`h-${blocks.length}`}
          className="font-display text-foreground mt-6 mb-2 text-xl first:mt-0"
        >
          {line.slice(3)}
        </h3>,
      );
    } else if (/^[-•*]\s+/.test(line)) {
      flushPara();
      bullets.push(line.replace(/^[-•*]\s+/, ""));
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushBullets();
  flushPara();
  return <div className="text-foreground/85 text-[15px] leading-relaxed">{blocks}</div>;
}
