import * as React from "react"

import { cn } from "@/lib/utils"

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex flex-col gap-4 rounded-2xl border border-border/50 p-4 shadow-[var(--shadow-sm)]",
        "sm:gap-5 sm:rounded-3xl sm:p-6",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        "[.border-b]:pb-4 sm:[.border-b]:pb-5",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "font-display text-lg font-semibold leading-tight tracking-tight text-foreground",
        "sm:text-xl",
        className
      )}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("", className)}
      {...props}
    />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:gap-4",
        "[.border-t]:pt-4 sm:[.border-t]:pt-5",
        className
      )}
      {...props}
    />
  )
}

interface StatCardProps {
  title?: string;
  label?: string;
  value: string | number;
  icon?: React.ComponentType<{ className?: string }> | React.ReactNode;
  trend?: string | {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

function StatCard({ title, label, value, icon: Icon, trend, className }: StatCardProps) {
  const displayLabel = title || label || "";
  
  // Handle icon - can be a component or a ReactNode
  const renderIcon = () => {
    if (!Icon) return null;
    // Check if it's a component (function) or already rendered JSX
    if (typeof Icon === 'function') {
      const IconComponent = Icon as React.ComponentType<{ className?: string }>;
      return <IconComponent className="h-4 w-4 sm:h-5 sm:w-5" />;
    }
    return Icon;
  };
  
  // Handle trend - can be a string or an object
  const renderTrend = () => {
    if (!trend) return null;
    if (typeof trend === 'string') {
      return (
        <span className="text-xs text-muted-foreground sm:text-sm">
          {trend}
        </span>
      );
    }
    return (
      <span
        className={cn(
          "mb-1 text-xs font-medium sm:text-sm",
          trend.isPositive ? "text-success" : "text-destructive"
        )}
      >
        {trend.isPositive ? "+" : ""}{trend.value}%
      </span>
    );
  };
  
  return (
    <div
      data-slot="stat-card"
      className={cn(
        "flex flex-col gap-2 rounded-2xl border border-border/50 bg-card p-4 shadow-[var(--shadow-sm)]",
        "sm:gap-3 sm:rounded-3xl sm:p-5",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground sm:text-sm">
          {displayLabel}
        </span>
        {Icon && (
          <span className="text-muted-foreground/60">{renderIcon()}</span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {value}
        </span>
        {renderTrend()}
      </div>
    </div>
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
  StatCard,
}
