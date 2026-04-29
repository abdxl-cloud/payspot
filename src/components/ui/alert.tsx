import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-secondary text-card-foreground border-border",
        destructive:
          "text-[var(--red)] bg-[color-mix(in_oklch,var(--red),transparent_90%)] border-[color-mix(in_oklch,var(--red),transparent_72%)] [&>svg]:text-current *:data-[slot=alert-description]:text-[var(--red)]",
        success:
          "bg-[color-mix(in_oklch,var(--green),transparent_90%)] text-[var(--green)] border-[color-mix(in_oklch,var(--green),transparent_72%)] [&>svg]:text-current *:data-[slot=alert-description]:text-[var(--green)]",
        warning:
          "bg-[color-mix(in_oklch,var(--amber),transparent_90%)] text-[var(--amber)] border-[color-mix(in_oklch,var(--amber),transparent_72%)] [&>svg]:text-current *:data-[slot=alert-description]:text-[var(--amber)]",
        info:
          "bg-[var(--ac-dim)] text-primary border-[var(--ac-bd)] [&>svg]:text-current *:data-[slot=alert-description]:text-primary",
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
        "col-start-2 line-clamp-1 min-h-4 font-semibold tracking-tight",
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
        "text-muted-foreground col-start-2 grid justify-items-start gap-1 text-sm [&_p]:leading-relaxed",
        className
      )}
      {...props}
    />
  )
}

export { Alert, AlertTitle, AlertDescription }
