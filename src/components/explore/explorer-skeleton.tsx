import { Skeleton } from "@/components/ui/skeleton";

export function ExplorerSkeleton() {
  return (
    <div className="flex gap-8 pt-6" aria-busy="true" aria-label="Loading venues">
      <div className="hidden w-[268px] shrink-0 space-y-5 lg:block">
        <Skeleton className="h-4 w-20" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="border-hairline space-y-2.5 border-b pb-5">
            <Skeleton className="h-3 w-16" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 5 }).map((__, j) => (
                <Skeleton key={j} className="h-7 w-16 rounded-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="mt-6 h-12 w-full rounded-xl" />
        <div className="border-hairline mt-3 overflow-hidden rounded-xl border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="border-hairline flex items-center gap-4 border-b px-4 py-4">
              <Skeleton className="h-6 w-20 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3.5 w-3/4" />
              </div>
              <Skeleton className="hidden h-4 w-28 md:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
