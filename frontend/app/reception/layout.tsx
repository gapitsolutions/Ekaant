'use client';

import { useEffect, useState } from 'react';
import { useAuth, hasRole } from '@/lib/auth-context';
import { DashboardLayout } from '@/components/dashboard-sidebar';
import { Spinner } from '@/components/ui/spinner';

export default function ReceptionLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (isMounted && !isLoading && !hasRole(user, ['reception', 'admin'])) {
      window.location.href = '/login';
    }
  }, [user, isLoading, isMounted]);

  if (!isMounted || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!hasRole(user, ['reception', 'admin'])) {
    return null;
  }

  return <DashboardLayout>{children}</DashboardLayout>;
}
