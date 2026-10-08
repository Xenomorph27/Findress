import { Skeleton } from "@/components/ui/skeleton";

export function EventDetailSkeleton() {
  return (
    <div className="grid gap-10 pt-12 lg:grid-cols-12" aria-busy="true" aria-label="Loading event">
      <div className="space-y-6 lg:col-span-8">
        <Skeleton className="h-3 w-40" />
        <div className="flex gap-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-16 w-72" />
        <Skeleton className="h-5 w-full max-w-xl" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-60" />
          <Skeleton className="h-4 w-52" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <div className="space-y-2 pt-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </div>
      <div className="lg:col-span-4">
        <Skeleton className="h-96 w-full rounded-2xl" />
      </div>
    </div>
  );
}
