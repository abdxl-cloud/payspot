import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const alertVariants = cva(
  "relative w-full rounded-xl border px-4 py-3 text-sm grid has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] grid-cols-[0_1fr] has-[>svg]:gap-x-3 gap-y-1 items-start [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-slate-50/85 text-card-foreground border-slate-200/80",
        destructive:
          "text-destructive bg-rose-50/80 border-rose-200/80 [&>svg]:text-current *:data-[slot=alert-description]:text-destructive/90",
        success:
          "bg-emerald-50/80 text-emerald-900 border-emerald-200/80 [&>svg]:text-emerald-600 *:data-[slot=alert-description]:text-emerald-800",
        warning:
          "bg-amber-50/80 text-amber-900 border-amber-200/80 [&>svg]:text-amber-600 *:data-[slot=alert-description]:text-amber-800",
        info:
          "bg-sky-50/80 text-sky-900 border-sky-200/80 [&>svg]:text-sky-600 *:data-[slot=alert-description]:text-sky-800",
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
