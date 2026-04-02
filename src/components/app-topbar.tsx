"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Wifi, Menu, X, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type NavItem = {
  label: string;
  href: string;
  active?: boolean;
};

type Props = {
  breadcrumb: string;
  environment?: string;
  accountLabel?: string;
  action?: ReactNode;
  navItems?: NavItem[];
  showNav?: boolean;
};

export function AppTopbar({
  breadcrumb,
  environment = "Production",
  accountLabel,
  action,
  navItems = [],
  showNav = false,
}: Props) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      <header className="app-topbar">
        {/* Left: Brand + Breadcrumb */}
        <div className="app-topbar-left">
          <Link href="/" className="app-topbar-brand">
            <div className="flex size-8 items-center justify-center rounded-xl bg-primary/10">
              <Wifi className="size-4 text-primary" />
            </div>
            <span className="hidden sm:inline">PaySpot</span>
          </Link>

          {/* Breadcrumb - hidden on very small screens if nav is shown */}
          <div className={`app-topbar-context ${showNav ? "hidden sm:block" : ""}`}>
            <div className="flex items-center gap-1.5 text-sm">
              <ChevronRight className="size-3.5 text-muted-foreground" />
              <span className="font-medium text-foreground truncate max-w-[150px] sm:max-w-none">
                {breadcrumb}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Desktop Navigation */}
        {showNav && navItems.length > 0 && (
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                  item.active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}

        {/* Right: Meta + Actions */}
        <div className="app-topbar-right">
          {/* Desktop meta */}
          <div className="app-topbar-meta">
            <span className="app-topbar-pill">{environment}</span>
            {accountLabel && (
              <span className="app-topbar-account">{accountLabel}</span>
            )}
          </div>

          {/* Action button */}
          {action}

          {/* Mobile menu toggle */}
          {showNav && navItems.length > 0 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? (
                <X className="size-5" />
              ) : (
                <Menu className="size-5" />
              )}
            </Button>
          )}
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {showNav && mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Slide-out menu */}
          <nav className="fixed inset-y-0 right-0 z-50 w-72 bg-card border-l border-border/50 shadow-xl md:hidden animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between p-4 border-b border-border/50">
              <span className="font-display font-semibold text-foreground">
                Menu
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setMobileMenuOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>

            <div className="p-3 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl transition-colors tap-target ${
                    item.active
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            {/* Account info in mobile menu */}
            {accountLabel && (
              <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-border/50 bg-muted/30">
                <div className="text-xs text-muted-foreground mb-1">
                  Logged in as
                </div>
                <div className="font-medium text-foreground truncate">
                  {accountLabel}
                </div>
              </div>
            )}
          </nav>
        </>
      )}
    </>
  );
}
