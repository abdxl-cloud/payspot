import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2.5 py-1 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3.5 gap-1.5 [&>svg]:pointer-events-none transition-colors overflow-hidden",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-white",
        outline: "border-border bg-card text-foreground",
        ghost: "text-muted-foreground",
        // Status variants - soft pastel backgrounds
        success: "border-[var(--status-success)]/20 bg-[var(--status-success-soft)] text-[var(--status-success)]",
        warning: "border-[var(--status-warning)]/20 bg-[var(--status-warning-soft)] text-[var(--status-warning)]",
        danger: "border-[var(--status-danger)]/20 bg-[var(--status-danger-soft)] text-[var(--status-danger)]",
        info: "border-[var(--status-info)]/20 bg-[var(--status-info-soft)] text-[var(--status-info)]",
        muted: "bg-muted text-muted-foreground",
      },
      size: {
        default: "px-2.5 py-1 text-xs",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
