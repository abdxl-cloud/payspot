"use client";

import { Button } from "@/components/ui/button";

export function LogoutButton() {
  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  }

  return (
    <Button variant="outline" className="h-11 bg-white/90" onClick={handleLogout}>
      Logout
    </Button>
  );
}

