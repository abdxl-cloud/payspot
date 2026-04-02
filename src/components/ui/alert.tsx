import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border p-4 text-sm grid has-[>svg]:grid-cols-[auto_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-start [&>svg]:size-5 [&>svg]:mt-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-foreground border-border/50",
        destructive:
          "border-[var(--status-danger)]/20 bg-[var(--status-danger-soft)] text-[var(--status-danger)] [&>svg]:text-[var(--status-danger)]",
        success:
          "border-[var(--status-success)]/20 bg-[var(--status-success-soft)] text-[var(--status-success)] [&>svg]:text-[var(--status-success)]",
        warning:
          "border-[var(--status-warning)]/20 bg-[var(--status-warning-soft)] text-[var(--status-warning)] [&>svg]:text-[var(--status-warning)]",
        info:
          "border-[var(--status-info)]/20 bg-[var(--status-info-soft)] text-[var(--status-info)] [&>svg]:text-[var(--status-info)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn(
        "col-start-2 font-semibold leading-tight tracking-tight",
        className
      )}
      {...props}
    />
  )
}

function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 text-sm opacity-90 [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
