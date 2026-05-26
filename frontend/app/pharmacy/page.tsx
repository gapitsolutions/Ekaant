"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { navigate } from "@/lib/navigation";
import {
  getInventoryStats,
  getPharmacyQueue,
  type InventoryStats,
  type PharmacyQueueItem,
} from "@/lib/pharmacy-api";
import {
  Pill,
  Package,
  ClipboardList,
  FileText,
  BarChart3,
  Clock,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CalendarClock,
  XCircle,
  Users,
  IndianRupee,
} from "lucide-react";

export default function PharmacyDashboard() {
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [queueItems, setQueueItems] = useState<PharmacyQueueItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setIsLoadingStats(true);
    getInventoryStats()
      .then((data) => setStats(data))
      .catch((error: unknown) => {
        setStats(null);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load inventory stats.",
        );
      })
      .finally(() => setIsLoadingStats(false));

    const loadQueue = () => {
      setIsLoadingQueue(true);
      getPharmacyQueue()
        .then((data) => setQueueItems(data.items || []))
        .catch(() => setQueueItems([]))
        .finally(() => setIsLoadingQueue(false));
    };

    loadQueue();
    const interval = window.setInterval(loadQueue, 15000);
    return () => window.clearInterval(interval);
  }, []);

  const formatCurrency = (value?: string | number | null) => {
    if (value === null || value === undefined) return "₹0";
    const num = typeof value === "string" ? parseFloat(value) : value;
    if (Number.isNaN(num)) return "₹0";
    return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  const formatTime = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const statCards = [
    {
      title: "Total Formulations",
      value: stats?.total_medicines ?? 0,
      icon: Pill,
      accent: "bg-primary",
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
    },
    {
      title: "Low Stock Alerts",
      value: stats?.low_stock_count ?? 0,
      icon: AlertTriangle,
      accent: "bg-rose-500",
      iconBg: "bg-rose-100",
      iconColor: "text-rose-500",
    },
    {
      title: "Near Expiry",
      value: stats?.near_expiry_count ?? 0,
      icon: CalendarClock,
      accent: "bg-amber-500",
      iconBg: "bg-amber-100",
      iconColor: "text-amber-500",
    },
    {
      title: "Expired Batches",
      value: stats?.expired_count ?? 0,
      icon: XCircle,
      accent: "bg-orange-500",
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(stats?.todays_revenue),
      icon: IndianRupee,
      accent: "bg-emerald-500",
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-500",
      trend: "Live",
    },
  ];

  const quickActions = [
    {
      title: "Prescription Queue",
      description: "Process patients waiting at the pharmacy",
      href: "/pharmacy/prescription-queue",
      icon: ClipboardList,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      borderColor: "border-teal-100",
    },
    {
      title: "Inventory",
      description: "Manage medicines, batches and purchase invoices",
      href: "/pharmacy/inventory",
      icon: Package,
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      borderColor: "border-sky-100",
    },
    {
      title: "Invoice History",
      description: "View dispensed invoices and audit logs",
      href: "/pharmacy/dispense-data",
      icon: FileText,
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      borderColor: "border-indigo-100",
    },
    {
      title: "Reports",
      description: "Revenue, consumption, low stock & expiry reports",
      href: "/pharmacy/reports",
      icon: BarChart3,
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      borderColor: "border-emerald-100",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
            Pharmacy Dashboard
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            Manage prescriptions, inventory, and dispense workflow
          </p>
        </div>
        <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
          <Clock className="h-4 w-4" />
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {/* KPI Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <Card
            key={stat.title}
            className="overflow-hidden border-slate-100 shadow-sm hover:shadow-md hover:border-slate-300 transition-all rounded-2xl"
          >
            <div className={`h-1 w-full ${stat.accent}`} />
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-slate-800">
                    {isLoadingStats ? "—" : stat.value}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {stat.title}
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-full ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </div>
              {stat.trend ? (
                <div className="flex items-center gap-1 text-xs text-emerald-600 font-medium">
                  <TrendingUp className="h-3 w-3" />
                  {stat.trend}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Prescription Queue + Quick Actions (split layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Prescription Queue */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50">
            <div>
              <h2 className="font-semibold text-slate-800">
                Prescription Queue
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Patients waiting for medicine dispense
              </p>
            </div>
            <button
              onClick={() => navigate("/pharmacy/prescription-queue")}
              className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              View All <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <div className="divide-y divide-slate-50">
            {isLoadingQueue ? (
              <div className="py-16 text-center text-sm text-slate-400">
                Loading queue&hellip;
              </div>
            ) : queueItems.length > 0 ? (
              queueItems.slice(0, 6).map((item) => {
                const initials = item.patient_name
                  ? item.patient_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .slice(0, 2)
                      .toUpperCase()
                  : "?";
                const outstanding = Number(item.outstanding_debt) || 0;
                return (
                  <div
                    key={item.session_id}
                    className="flex items-center justify-between px-6 py-4 hover:bg-teal-50/50 transition-colors group cursor-pointer"
                    onClick={() => navigate(`/pharmacy/dispense/${item.session_id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0 group-hover:scale-105 transition-transform">
                        {initials}
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 text-sm group-hover:text-primary transition-colors">
                          {item.patient_name}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item.patient?.file_number || "—"}
                          {" · "}
                          {formatTime(item.checked_in_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {outstanding > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-rose-200 text-rose-700 bg-rose-50 text-[10px] font-bold"
                        >
                          Debt ₹{outstanding.toLocaleString("en-IN")}
                        </Badge>
                      ) : null}
                      <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-primary transition-colors">
                        Open Invoice <ArrowRight className="h-3.5 w-3.5" />
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="py-16 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Users className="h-7 w-7 text-slate-200" />
                </div>
                <p className="text-slate-400 text-sm font-medium">
                  Queue is currently empty
                </p>
                <p className="text-xs text-slate-300 mt-1">
                  Checked-in patients will appear here
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-50">
            <h2 className="font-semibold text-slate-800">Quick Actions</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Common tasks and navigation
            </p>
          </div>
          <div className="p-4 space-y-3">
            {quickActions.map((action) => (
              <button
                key={action.href}
                onClick={() => navigate(action.href)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left border ${action.borderColor}`}
              >
                <div className={`w-9 h-9 rounded-lg ${action.iconBg} border ${action.borderColor} flex items-center justify-center flex-shrink-0`}>
                  <action.icon className={`h-5 w-5 ${action.iconColor}`} />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">
                    {action.title}
                  </p>
                  <p className="text-xs text-slate-400">{action.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
