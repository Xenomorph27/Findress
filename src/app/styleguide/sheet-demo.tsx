"use client";

import { PanelRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCommandPalette } from "@/components/command/command-palette-provider";

export function SheetDemo() {
  const { setOpen } = useCommandPalette();
  return (
    <div className="flex flex-wrap gap-2">
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">
            <PanelRight /> Open preview sheet
          </Button>
        </SheetTrigger>
        <SheetContent className="glass border-hairline sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="font-display text-3xl font-normal">CVPR 2027</SheetTitle>
            <SheetDescription>
              Glass side sheet: backdrop blur, 1px hairline border and a soft inner glow.
            </SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open command palette
      </Button>
    </div>
  );
}
