"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Package,
  Ticket,
  Users,
  Key,
  Receipt,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Package,
  Ticket,
  Users,
  Key,
  Receipt,
  Settings,
};

export type MobileNavItem = {
  id: string;
  label: string;
  href: string;
  icon: string;
};

type Props = {
  items: MobileNavItem[];
  basePath?: string;
};

export function MobileNav({ items, basePath = "" }: Props) {
  const pathname = usePathname();

  // Show max 5 items on mobile (more would be too cramped)
  const visibleItems = items.slice(0, 5);

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-inner">
        {visibleItems.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const href = basePath ? `${basePath}#${item.id}` : `#${item.id}`;
          const isActive =
            pathname.includes(item.id) ||
            (typeof window !== "undefined" &&
              window.location.hash === `#${item.id}`);

          return (
            <Link
              key={item.id}
              href={href}
              className="mobile-nav-item"
              data-active={isActive}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Admin-specific mobile nav that tracks section via hash
 */
type AdminMobileNavProps = {
  items: MobileNavItem[];
  activeSection: string;
  onSectionChange: (section: string) => void;
};

export function AdminMobileNav({
  items,
  activeSection,
  onSectionChange,
}: AdminMobileNavProps) {
  // Show max 5 items on mobile
  const visibleItems = items.slice(0, 5);

  return (
    <nav className="mobile-nav">
      <div className="mobile-nav-inner">
        {visibleItems.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className="mobile-nav-item"
              data-active={isActive}
            >
              <Icon className="size-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Desktop sidebar navigation for admin panels
 */
type AdminSidebarProps = {
  items: MobileNavItem[];
  activeSection: string;
  onSectionChange: (section: string) => void;
  header?: React.ReactNode;
};

export function AdminSidebar({
  items,
  activeSection,
  onSectionChange,
  header,
}: AdminSidebarProps) {
  return (
    <aside className="admin-sidebar">
      {header && (
        <div className="admin-sidebar-header">{header}</div>
      )}
      <nav className="admin-sidebar-nav">
        {items.map((item) => {
          const Icon = iconMap[item.icon] || LayoutDashboard;
          const isActive = activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={cn(
                "admin-sidebar-item relative",
                isActive && "bg-sidebar-accent text-foreground"
              )}
              data-active={isActive}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-1 rounded-r-full bg-primary" />
              )}
              <Icon className="size-5" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
