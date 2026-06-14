"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import type { UserRole } from "@/lib/types";
import {
  ClipboardList,
  Fingerprint,
  LayoutDashboard,
  LogOut,
  UserPlus,
  Users,
  BarChart3,
  Phone,
  Pill,
  Package,
  FileText,
  Building2,
  Wallet,
  Menu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { BRANDING } from "@/lib/branding";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
}

const navigationByRole: Record<UserRole, NavItem[]> = {
  admin: [
    { title: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
    { title: "Suppliers", href: "/admin/suppliers", icon: Building2 },
    { title: "Billing Settings", href: "/admin/billing", icon: Wallet },
  ],
  reception: [
    {
      title: "Dashboard",
      href: "/reception",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      title: "Patient Check-in",
      href: "/reception/checkin",
      icon: Fingerprint,
    },
    { title: "Register Patient", href: "/reception/register", icon: UserPlus },
    { title: "Patient Data", href: "/reception/patients", icon: Users },
    {
      title: "Check-in History",
      href: "/reception/queue",
      icon: ClipboardList,
    },
    {
      title: "Follow-Up Calls",
      href: "/reception/follow-up",
      icon: Phone,
    },
    { title: "Reports", href: "/reception/reports", icon: BarChart3 },
  ],
  counsellor: [],
  doctor: [],
  pharmacist: [
    {
      title: "Dashboard",
      href: "/pharmacy",
      icon: LayoutDashboard,
      exact: true,
    },
    {
      title: "Prescription Queue",
      href: "/pharmacy/prescription-queue",
      icon: ClipboardList,
    },
    {
      title: "Inventory",
      href: "/pharmacy/inventory",
      icon: Package,
    },
    {
      title: "Invoice History",
      href: "/pharmacy/dispense-data",
      icon: FileText,
    },
    {
      title: "Reports",
      href: "/pharmacy/reports",
      icon: BarChart3,
    },
  ],
};

// Navigation link component that uses regular anchor tags
function NavLink({
  href,
  isActive,
  children,
}: {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    window.location.href = href;
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
        isActive
          ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
      )}
    >
      {children}
    </a>
  );
}

export function DashboardSidebar({
  mobileOpen = false,
  onClose,
}: {
  mobileOpen?: boolean;
  onClose?: () => void;
} = {}) {
  const [isMounted, setIsMounted] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  const { user, logout } = useAuth();

  useEffect(() => {
    setIsMounted(true);
    setCurrentPath(window.location.pathname);
  }, []);

  useEffect(() => {
    if (!isMounted) return;

    const handlePathChange = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener("popstate", handlePathChange);

    const interval = setInterval(() => {
      if (window.location.pathname !== currentPath) {
        setCurrentPath(window.location.pathname);
      }
    }, 100);

    return () => {
      window.removeEventListener("popstate", handlePathChange);
      clearInterval(interval);
    };
  }, [isMounted, currentPath]);

  if (!isMounted || !user) return null;

  const navigation = navigationByRole[user.role] || [];

  const initials = user.full_name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-50 h-screen w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 ease-in-out lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo and Hospital Name */}
        <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-4">
          <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-xl bg-white/10 p-1">
            <Image
              src={BRANDING.logoPath}
              alt={`${BRANDING.name} Logo`}
              fill
              className="object-contain"
              priority
            />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-sm font-bold leading-tight text-sidebar-foreground truncate">
              {BRANDING.shortName}
            </span>
            <span className="text-xs text-sidebar-foreground/70 leading-tight">
              {BRANDING.subtitle}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="ml-auto h-9 w-9 text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close menu</span>
          </Button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 px-3 py-4">
          <nav className="space-y-1.5">
            {navigation.map((item) => {
              const isActive = item.exact
                ? currentPath === item.href
                : currentPath === item.href ||
                  currentPath.startsWith(item.href + "/");
              return (
                <NavLink key={item.href} href={item.href} isActive={isActive}>
                  <item.icon
                    className={cn(
                      "h-4 w-4",
                      isActive && "text-sidebar-primary-foreground",
                    )}
                  />
                  {item.title}
                </NavLink>
              );
            })}
          </nav>
        </ScrollArea>

        {/* User Info */}
        <div className="border-t border-sidebar-border p-4">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 ring-2 ring-sidebar-accent">
              <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.full_name}</p>
              <p className="text-xs text-sidebar-foreground/60 capitalize">
                {user.role}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={logout}
              className="h-9 w-9 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent rounded-lg"
            >
              <LogOut className="h-4 w-4" />
              <span className="sr-only">Logout</span>
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile / tablet top bar (hidden on lg+ where the sidebar is fixed) */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(true)}
          aria-label="Open menu"
          className="h-9 w-9"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <div className="relative h-8 w-8 overflow-hidden rounded-lg bg-primary/10 p-1">
          <Image
            src={BRANDING.logoPath}
            alt={`${BRANDING.name} Logo`}
            fill
            className="object-contain"
          />
        </div>
        <span className="truncate text-sm font-bold">{BRANDING.shortName}</span>
      </header>

      {/* Backdrop when the slide-over sidebar is open on small screens */}
      {mobileOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <DashboardSidebar
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <main className="lg:pl-64">
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
