import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styles - mobile first with larger touch targets
        "flex w-full min-w-0 rounded-xl border border-input bg-card text-foreground",
        "min-h-[52px] px-4 py-3 text-base",
        "sm:min-h-[44px] sm:py-2.5 sm:text-sm",
        // Placeholder & selection
        "placeholder:text-muted-foreground",
        "selection:bg-primary selection:text-primary-foreground",
        // Shadows & transitions
        "shadow-[var(--shadow-xs)] transition-all duration-200",
        // Hover state
        "hover:border-border/80",
        // Focus state
        "focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/30",
        // Disabled state
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        // Invalid state
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        // File input
        "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Input }
