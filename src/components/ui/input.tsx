import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      suppressHydrationWarning
      className={cn(
        "h-11 w-full rounded-lg border border-border bg-surface px-3.5 text-sm text-foreground placeholder:text-subtle",
        "transition-[border-color,box-shadow] duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70",
        "disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
