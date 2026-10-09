"use client";

import { Globe2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TIMEZONE_OPTIONS } from "@/lib/time/format";
import { cn } from "@/lib/utils";
import { useTimezone } from "./timezone-provider";

export function TimezoneSelect({ className }: { className?: string }) {
  const { tz, setTz } = useTimezone();
  const known = TIMEZONE_OPTIONS.some((o) => o.value === tz);
  return (
    <Select value={tz} onValueChange={setTz}>
      <SelectTrigger
        size="sm"
        aria-label="Display timezone"
        className={cn("border-hairline h-8 gap-1.5 text-xs", className)}
      >
        <Globe2 className="text-muted-foreground size-3.5" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!known && <SelectItem value={tz}>{tz}</SelectItem>}
        {TIMEZONE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
