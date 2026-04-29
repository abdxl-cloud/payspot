import Link from "next/link";
import type { ReactNode } from "react";
import { Wifi } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export function PrototypeDocsShell({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className ?? ""} docs-prototype-shell`}>
      <div className="docs-prototype-container">
        <header className="prototype-nav">
          <Link href="/" className="prototype-brand">
            <Wifi className="size-4" />
            PaySpot Docs
          </Link>
          <div className="prototype-actions">
            <span className="prototype-doc-title">{title}</span>
            <ThemeToggle />
            <Link href="/" className="prototype-nav-button">
              Back to PaySpot
            </Link>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
