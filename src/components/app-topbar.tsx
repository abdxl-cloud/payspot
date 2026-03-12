import Link from "next/link";
import type { ReactNode } from "react";
import { Wifi } from "lucide-react";

type Props = {
  breadcrumb: string;
  environment?: string;
  accountLabel?: string;
  action?: ReactNode;
};

export function AppTopbar({
  breadcrumb,
  environment = "Production",
  accountLabel = "Guest",
  action,
}: Props) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-left">
        <Link href="/" className="app-topbar-brand">
          <Wifi className="size-4 shrink-0 text-sky-300" />
          PaySpot
        </Link>
        <span className="app-topbar-divider" />
        <p className="app-topbar-breadcrumb">{breadcrumb}</p>
      </div>
      <div className="app-topbar-right">
        <span className="app-topbar-pill">{environment}</span>
        <span className="app-topbar-account">{accountLabel}</span>
        {action}
      </div>
    </header>
  );
}
