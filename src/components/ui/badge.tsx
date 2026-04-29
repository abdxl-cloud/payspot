import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2.5 py-1 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/40 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default: "border-[var(--ac-bd)] bg-[var(--ac-dim)] text-primary [a&]:hover:bg-[var(--ac-soft)]",
        secondary:
          "border-border bg-secondary text-muted-foreground [a&]:hover:bg-[var(--s3)]",
        destructive:
          "border-[color-mix(in_oklch,var(--red),transparent_72%)] bg-[color-mix(in_oklch,var(--red),transparent_86%)] text-[var(--red)] [a&]:hover:bg-[color-mix(in_oklch,var(--red),transparent_76%)]",
        outline:
          "border-border bg-secondary text-muted-foreground [a&]:hover:bg-[var(--s3)]",
        ghost: "text-muted-foreground [a&]:hover:bg-secondary",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        success:
          "border-[color-mix(in_oklch,var(--green),transparent_70%)] bg-[color-mix(in_oklch,var(--green),transparent_88%)] text-[var(--green)] [a&]:hover:bg-[color-mix(in_oklch,var(--green),transparent_80%)]",
        warning:
          "border-[color-mix(in_oklch,var(--amber),transparent_70%)] bg-[color-mix(in_oklch,var(--amber),transparent_88%)] text-[var(--amber)] [a&]:hover:bg-[color-mix(in_oklch,var(--amber),transparent_80%)]",
        info:
          "border-[var(--ac-bd)] bg-[var(--ac-dim)] text-primary [a&]:hover:bg-[var(--ac-soft)]",
        muted:
          "border-border bg-secondary text-muted-foreground [a&]:hover:bg-[var(--s3)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
