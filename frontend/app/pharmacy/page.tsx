"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
      gradient: "from-primary to-primary/80",
    },
    {
      title: "Low Stock Alerts",
      value: stats?.low_stock_count ?? 0,
      icon: AlertTriangle,
      gradient: "from-rose-500 to-rose-600",
    },
    {
      title: "Near Expiry",
      value: stats?.near_expiry_count ?? 0,
      icon: CalendarClock,
      gradient: "from-amber-500 to-amber-600",
    },
    {
      title: "Expired Batches",
      value: stats?.expired_count ?? 0,
      icon: XCircle,
      gradient: "from-orange-500 to-orange-600",
    },
    {
      title: "Today's Revenue",
      value: formatCurrency(stats?.todays_revenue),
      icon: IndianRupee,
      gradient: "from-emerald-500 to-emerald-600",
      trend: "Live",
    },
  ];

  const quickActions = [
    {
      title: "Prescription Queue",
      description: "Process patients waiting at the pharmacy",
      href: "/pharmacy/prescription-queue",
      icon: ClipboardList,
      gradient: "from-primary/20 to-primary/5",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      title: "Inventory",
      description: "Manage medicines, batches and purchase invoices",
      href: "/pharmacy/inventory",
      icon: Package,
      gradient: "from-sky-500/20 to-sky-500/5",
      iconBg: "bg-sky-500/15",
      iconColor: "text-sky-600",
    },
    {
      title: "Invoice History",
      description: "View dispensed invoices and audit logs",
      href: "/pharmacy/dispense-data",
      icon: FileText,
      gradient: "from-indigo-500/20 to-indigo-500/5",
      iconBg: "bg-indigo-500/15",
      iconColor: "text-indigo-600",
    },
    {
      title: "Reports",
      description: "Revenue, consumption, low stock & expiry reports",
      href: "/pharmacy/reports",
      icon: BarChart3,
      gradient: "from-emerald-500/20 to-emerald-500/5",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Pharmacy Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage prescriptions, inventory, and dispense workflow
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {statCards.map((stat) => (
          <Card
            key={stat.title}
            className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-all duration-300"
          >
            <div className={`h-1.5 bg-gradient-to-r ${stat.gradient}`} />
            <CardContent className="p-4 min-h-[132px] flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-3xl font-bold">
                    {isLoadingStats ? "—" : stat.value}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {stat.title}
                  </p>
                </div>
                <div
                  className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} text-white`}
                >
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
              {stat.trend ? (
                <div className="flex items-center gap-1 mt-2 text-xs text-emerald-600">
                  <TrendingUp className="h-3 w-3" />
                  {stat.trend}
                </div>
              ) : (
                <div className="h-[18px] mt-2" />
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Card
              key={action.href}
              className={`group hover:shadow-lg transition-all duration-300 border-0 shadow-md bg-gradient-to-br ${action.gradient} overflow-hidden`}
            >
              <CardHeader className="pb-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.iconBg} group-hover:scale-110 transition-transform duration-300`}
                >
                  <action.icon className={`h-6 w-6 ${action.iconColor}`} />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base mb-1 group-hover:text-primary transition-colors">
                  {action.title}
                </CardTitle>
                <CardDescription className="text-sm mb-4 line-clamp-2">
                  {action.description}
                </CardDescription>
                <Button
                  asChild
                  variant="ghost"
                  className="p-0 h-auto group-hover:translate-x-1 transition-transform"
                >
                  <span
                    onClick={() => navigate(action.href)}
                    className="flex items-center gap-1 text-primary font-medium cursor-pointer"
                  >
                    Open <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Today's Prescription Queue */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                Today&apos;s Prescription Queue
              </CardTitle>
              <CardDescription>
                Patients currently waiting at the pharmacy stage
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-base px-3 py-1">
                {queueItems.length}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/pharmacy/prescription-queue")}
              >
                View All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoadingQueue ? (
            <div className="flex items-center justify-center py-12">
              <p className="text-sm text-muted-foreground">
                Loading queue&hellip;
              </p>
            </div>
          ) : queueItems.length > 0 ? (
            <div className="divide-y">
              {queueItems.slice(0, 6).map((item) => {
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
                    className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">
                          {initials}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{item.patient_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.patient?.file_number || item.patient?.registration_number || "—"}
                          {" · "}
                          Checked in at {formatTime(item.checked_in_at)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {outstanding > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-rose-500 text-rose-700 bg-rose-50"
                        >
                          Debt ₹{outstanding.toLocaleString("en-IN")}
                        </Badge>
                      ) : null}
                      <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">
                        Pharmacy
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() =>
                          navigate(`/pharmacy/dispense/${item.session_id}`)
                        }
                      >
                        Dispense
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">
                No patients in the queue
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Checked-in patients waiting at pharmacy will appear here
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
