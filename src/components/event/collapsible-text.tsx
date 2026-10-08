"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Clamp long server-rendered content with a fade and a "Read more" toggle. */
export function CollapsibleText({
  children,
  collapsedHeight = 420,
}: {
  children: ReactNode;
  collapsedHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div>
      <div
        id={id}
        className={cn(
          "relative overflow-hidden",
          !open && "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]",
        )}
        style={open ? undefined : { maxHeight: collapsedHeight }}
      >
        {children}
      </div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="text-aurora-ink mt-2 inline-flex items-center gap-1 text-sm hover:underline"
      >
        {open ? "Show less" : "Read the full call"}
        <ChevronDown
          className={cn("size-4 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
    </div>
  );
}
