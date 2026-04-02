import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/20 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-[var(--shadow-sm)] hover:bg-primary/90",
        destructive:
          "bg-destructive text-white shadow-[var(--shadow-sm)] hover:bg-destructive/90",
        outline:
          "border border-border bg-card text-foreground shadow-[var(--shadow-xs)] hover:bg-secondary",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "text-foreground hover:bg-secondary",
        link: "text-primary underline-offset-4 hover:underline",
        success:
          "bg-[var(--status-success)] text-white shadow-[var(--shadow-sm)] hover:opacity-90",
        warning:
          "bg-[var(--status-warning)] text-white shadow-[var(--shadow-sm)] hover:opacity-90",
      },
      size: {
        // Mobile-first: larger default for touch
        default: "min-h-[48px] px-5 py-3 text-sm sm:min-h-[44px] sm:px-4 sm:py-2.5",
        xs: "min-h-[36px] gap-1 rounded-lg px-2.5 text-xs has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "min-h-[40px] rounded-lg gap-1.5 px-3 text-sm sm:min-h-[36px]",
        lg: "min-h-[52px] rounded-xl px-6 text-base sm:min-h-[48px]",
        xl: "min-h-[56px] rounded-2xl px-8 text-base font-semibold",
        icon: "size-11 sm:size-10",
        "icon-xs": "size-8 rounded-lg [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-10 sm:size-9",
        "icon-lg": "size-12 sm:size-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
