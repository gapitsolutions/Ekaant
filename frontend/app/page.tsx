"use client";

import { useEffect } from "react";
import { Spinner } from "@/components/ui/spinner";
import { roleRoutes, useAuth } from "@/lib/auth-context";

export default function HomePage() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!user) {
      window.location.replace("/login");
      return;
    }

    const destination = roleRoutes[user.role] || "/reception";
    window.location.replace(destination);
  }, [isLoading, user]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Spinner className="h-8 w-8" />
    </div>
  );
}
