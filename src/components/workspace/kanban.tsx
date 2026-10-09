"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { NotebookPen, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CountdownChip } from "@/components/event/countdown-chip";
import { LocationLabel, TypeBadge } from "@/components/event/chips";
import type { WorkspaceItem } from "@/lib/data/workspace";
import { bookmarkStatuses, STATUS_LABEL, type BookmarkStatus } from "@/lib/taxonomy";
import { cn } from "@/lib/utils";
import { parseTargetKey } from "@/lib/workspace/targets";

function nextSubmission(item: WorkspaceItem, now: number) {
  const subs = item.deadlines.filter((d) => d.kind === "abstract" || d.kind === "paper");
  const upcoming = subs.find((d) => Date.parse(d.dueAtUtc) >= now);
  return upcoming ?? subs.at(-1) ?? null;
}

function Card({
  item,
  now,
  onRemove,
  dragging,
}: {
  item: WorkspaceItem;
  now: number;
  onRemove?: () => void;
  dragging?: boolean;
}) {
  const nd = nextSubmission(item, now);
  const label = item.year != null ? `${item.acronym} ${item.year}` : item.acronym;
  const external = !item.href.startsWith("/");
  return (
    <div
      className={cn(
        "group border-hairline bg-surface rounded-xl border p-3 text-sm shadow-sm transition-shadow",
        dragging && "ring-aurora-2/50 shadow-lg ring-1",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={item.href}
          className="min-w-0"
          onPointerDown={(e) => e.stopPropagation()}
          {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
        >
          <span className="font-display text-xl leading-none">
            {item.acronym}
            {item.year != null && <span className="text-muted-foreground"> {item.year}</span>}
          </span>
        </Link>
        {onRemove && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={onRemove}
            aria-label={`Remove ${label} from workspace`}
            className="text-muted-foreground hover:text-foreground rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {item.kind !== "event" && (
        <div className="mt-1">
          <TypeBadge type={item.kind === "journal" ? "journal" : "special-issue"} />
        </div>
      )}
      <p className="text-muted-foreground mt-1 line-clamp-2 text-xs">{item.name}</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <CountdownChip
          dueAt={nd?.dueAtUtc ?? null}
          label={
            nd
              ? item.kind !== "event"
                ? "SI"
                : nd.kind === "abstract"
                  ? "abs"
                  : "paper"
              : undefined
          }
        />
        {item.hasNote && (
          <NotebookPen className="text-muted-foreground size-3.5" aria-label="Has notes" />
        )}
      </div>
      {item.kind === "event" && (
        <LocationLabel
          city={item.city}
          country={item.country}
          countryCode={item.countryCode}
          className="text-muted-foreground mt-2 text-xs"
        />
      )}
    </div>
  );
}

function SortableCard({
  item,
  now,
  onRemove,
}: {
  item: WorkspaceItem;
  now: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
    data: { status: item.status },
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-none list-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      aria-roledescription="Draggable venue card"
    >
      <Card item={item} now={now} onRemove={onRemove} />
    </li>
  );
}

function Column({
  status,
  items,
  now,
  onRemove,
}: {
  status: BookmarkStatus;
  items: WorkspaceItem[];
  now: number;
  onRemove: (key: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col-${status}`, data: { status } });
  return (
    <section
      aria-label={`${STATUS_LABEL[status]} (${items.length})`}
      className={cn(
        "border-hairline bg-surface/40 flex w-[260px] shrink-0 flex-col rounded-2xl border p-2.5 transition-colors",
        isOver && "border-aurora-2/50 bg-aurora-2/5",
      )}
    >
      <header className="mb-2 flex items-center justify-between px-1">
        <h3 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {STATUS_LABEL[status]}
        </h3>
        <span className="text-muted-foreground font-mono text-[11px]">{items.length}</span>
      </header>
      <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="flex min-h-24 flex-1 flex-col gap-2">
          {items.map((item) => (
            <SortableCard
              key={item.key}
              item={item}
              now={now}
              onRemove={() => onRemove(item.key)}
            />
          ))}
          {items.length === 0 && (
            <li className="border-hairline-strong text-muted-foreground grid flex-1 place-items-center rounded-xl border border-dashed p-4 text-center text-xs">
              Drop a venue here
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

/** Status pipeline (SPEC §2 /workspace): drag between columns (mouse, touch or keyboard). */
export function Kanban({ initial, now }: { initial: WorkspaceItem[]; now: number }) {
  const [items, setItems] = useState(initial);
  const [active, setActive] = useState<WorkspaceItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const byStatus = useMemo(() => {
    const m = new Map<BookmarkStatus, WorkspaceItem[]>(bookmarkStatuses.map((s) => [s, []]));
    for (const it of [...items].sort((a, b) => a.position - b.position)) m.get(it.status)?.push(it);
    return m;
  }, [items]);

  const persist = (key: string, status: BookmarkStatus, position: number) =>
    fetch("/api/workspace/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...parseTargetKey(key), status, position }),
    });

  const onStart = (e: DragStartEvent) =>
    setActive(items.find((i) => i.key === e.active.id) ?? null);

  const onEnd = (e: DragEndEvent) => {
    setActive(null);
    const id = String(e.active.id);
    const over = e.over;
    if (!over) return;
    const overStatus =
      (over.data.current?.status as BookmarkStatus | undefined) ??
      items.find((i) => i.key === over.id)?.status;
    if (!overStatus) return;
    const column = (byStatus.get(overStatus) ?? []).filter((i) => i.key !== id);
    const overIndex = column.findIndex((i) => i.key === over.id);
    const insertAt = overIndex >= 0 ? overIndex : column.length;
    const moved = items.find((i) => i.key === id);
    if (!moved) return;
    const reordered = [
      ...column.slice(0, insertAt),
      { ...moved, status: overStatus },
      ...column.slice(insertAt),
    ].map((it, idx) => ({ ...it, position: idx * 10 }));
    setItems((prev) => [
      ...prev.filter((i) => i.status !== overStatus && i.key !== id),
      ...reordered,
    ]);
    void Promise.all(reordered.map((it) => persist(it.key, it.status, it.position)));
  };

  const remove = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
    void fetch("/api/workspace/bookmarks", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parseTargetKey(key)),
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onStart}
      onDragEnd={onEnd}
    >
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
        {bookmarkStatuses.map((s) => (
          <Column key={s} status={s} items={byStatus.get(s) ?? []} now={now} onRemove={remove} />
        ))}
      </div>
      <DragOverlay>{active ? <Card item={active} now={now} dragging /> : null}</DragOverlay>
    </DndContext>
  );
}
