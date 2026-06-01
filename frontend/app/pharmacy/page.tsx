"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { navigate } from "@/lib/navigation";
import {
  getDispenseHistory,
  getExpiryReport,
  getInventoryStats,
  getLowStockReport,
  getPharmacyQueue,
  type DispenseHistoryItem,
  type ExpiryReportRow,
  type InventoryStats,
  type LowStockReportItem,
  type PharmacyQueueItem,
} from "@/lib/pharmacy-api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  IndianRupee,
  Pill,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getAvatarColor(name: string): string {
  const colors = [
    "bg-emerald-500",
    "bg-blue-500",
    "bg-violet-500",
    "bg-amber-500",
    "bg-rose-500",
    "bg-teal-500",
    "bg-cyan-500",
    "bg-fuchsia-500",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return colors[hash % colors.length];
}

function formatCurrency(value?: string | number | null): string {
  if (value === null || value === undefined) return "₹0";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(num)) return "₹0";
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PharmacyDashboard() {
  const [stats, setStats] = useState<InventoryStats | null>(null);
  const [queueItems, setQueueItems] = useState<PharmacyQueueItem[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingQueue, setIsLoadingQueue] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  // Drill-down dialog state — Expired and Near Expiry are now SEPARATE
  // dialogs so each card opens only its own subset (fixes mixed-data popup).
  const [isLowStockDialogOpen, setIsLowStockDialogOpen] = useState(false);
  const [isExpiredDialogOpen, setIsExpiredDialogOpen] = useState(false);
  const [isNearExpiryDialogOpen, setIsNearExpiryDialogOpen] = useState(false);
  const [isPendingDispenseDialogOpen, setIsPendingDispenseDialogOpen] =
    useState(false);
  const [isDispensedTodayDialogOpen, setIsDispensedTodayDialogOpen] =
    useState(false);

  // Lazy-loaded detail data (fetched only when dialog opens)
  const [lowStockItems, setLowStockItems] = useState<LowStockReportItem[]>([]);
  const [isLoadingLowStock, setIsLoadingLowStock] = useState(false);
  // Expired and Near Expiry both come from /reports/expiry/ in a single
  // request that returns them as separate arrays. We cache both and route
  // each to its own dialog.
  const [expiredRows, setExpiredRows] = useState<ExpiryReportRow[]>([]);
  const [nearExpiryRows, setNearExpiryRows] = useState<ExpiryReportRow[]>([]);
  const [isLoadingExpiry, setIsLoadingExpiry] = useState(false);
  const [expiryDataLoaded, setExpiryDataLoaded] = useState(false);
  const [dispensedTodayItems, setDispensedTodayItems] = useState<
    DispenseHistoryItem[]
  >([]);
  const [dispensedTodayTotal, setDispensedTodayTotal] = useState(0);
  const [dispensedTodayPage, setDispensedTodayPage] = useState(1);
  const [isLoadingDispensedToday, setIsLoadingDispensedToday] = useState(false);
  const DISPENSED_TODAY_PAGE_SIZE = 50;

  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const data = await getInventoryStats();
      setStats(data);
      setErrorMessage("");
    } catch (error: unknown) {
      setStats(null);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to load inventory stats.",
      );
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const fetchQueue = useCallback(async () => {
    setIsLoadingQueue(true);
    try {
      const data = await getPharmacyQueue();
      setQueueItems(data.items || []);
    } catch {
      setQueueItems([]);
    } finally {
      setIsLoadingQueue(false);
    }
  }, []);

  // Initial fetch + queue polling
  useEffect(() => {
    void fetchStats();
    void fetchQueue();
    const interval = window.setInterval(fetchQueue, 15000);
    return () => window.clearInterval(interval);
  }, [fetchStats, fetchQueue]);

  // ── Drill-down loaders (lazy on dialog open) ──

  const openLowStockDialog = async () => {
    setIsLowStockDialogOpen(true);
    if (lowStockItems.length === 0 && !isLoadingLowStock) {
      setIsLoadingLowStock(true);
      try {
        const data = await getLowStockReport();
        setLowStockItems(data.items || []);
      } catch {
        toast.error("Failed to load low stock data");
      } finally {
        setIsLoadingLowStock(false);
      }
    }
  };

  // Shared fetch — backend returns both arrays in one /reports/expiry/ call.
  // Use ``expiryDataLoaded`` instead of array-length checks so the fetch
  // still runs even when one side is legitimately empty.
  const ensureExpiryDataLoaded = async () => {
    if (expiryDataLoaded || isLoadingExpiry) return;
    setIsLoadingExpiry(true);
    try {
      const data = await getExpiryReport();
      setExpiredRows(data.expired || []);
      setNearExpiryRows(data.near_expiry || []);
      setExpiryDataLoaded(true);
    } catch {
      toast.error("Failed to load expiry data");
    } finally {
      setIsLoadingExpiry(false);
    }
  };

  const openExpiredDialog = async () => {
    setIsExpiredDialogOpen(true);
    await ensureExpiryDataLoaded();
  };

  const openNearExpiryDialog = async () => {
    setIsNearExpiryDialogOpen(true);
    await ensureExpiryDataLoaded();
  };

  // Dispensed-today list is paginated: large pharmacies can easily exceed
  // 100 dispenses in a day. KPI count comes from the stats aggregate, so it
  // stays correct at any scale; the dialog just walks pages of the same
  // ``dispense-history`` queryset (ordered by ``-dispense_time``).
  const loadDispensedTodayPage = async (page: number) => {
    setIsLoadingDispensedToday(true);
    try {
      const data = await getDispenseHistory({
        today_only: true,
        status: "success",
        page,
        pageSize: DISPENSED_TODAY_PAGE_SIZE,
      });
      setDispensedTodayItems(data.items || []);
      setDispensedTodayTotal(data.pagination?.total ?? 0);
      setDispensedTodayPage(page);
    } catch {
      toast.error("Failed to load today's dispenses");
    } finally {
      setIsLoadingDispensedToday(false);
    }
  };

  const openDispensedTodayDialog = async () => {
    setIsDispensedTodayDialogOpen(true);
    if (dispensedTodayItems.length === 0 && !isLoadingDispensedToday) {
      await loadDispensedTodayPage(1);
    }
  };

  // ── Derived values ──

  const today = useMemo(
    () =>
      new Date().toLocaleDateString("en-IN", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    [],
  );

  const nearExpiryAlertCount =
    (stats?.expired_count ?? 0) + (stats?.near_expiry_count ?? 0);

  // ── KPI Cards (4 daily-ops metrics) ──
  const kpiCards = [
    {
      label: "Pending Dispense",
      value: queueItems.length,
      icon: Clock,
      iconBg: "bg-orange-100",
      iconColor: "text-orange-500",
      accent: "bg-orange-400",
      onClick: () => setIsPendingDispenseDialogOpen(true),
    },
    {
      label: "Dispensed Today",
      value: stats?.dispensed_today_count ?? 0,
      icon: CheckCircle2,
      iconBg: "bg-emerald-100",
      iconColor: "text-emerald-500",
      accent: "bg-emerald-500",
      onClick: () => void openDispensedTodayDialog(),
    },
    {
      label: "Low Stock Items",
      value: stats?.low_stock_count ?? 0,
      icon: AlertTriangle,
      iconBg: "bg-rose-100",
      iconColor: "text-rose-500",
      accent: "bg-rose-500",
      onClick: () => void openLowStockDialog(),
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(stats?.todays_revenue),
      icon: IndianRupee,
      iconBg: "bg-blue-100",
      iconColor: "text-blue-500",
      accent: "bg-blue-500",
      onClick: undefined as undefined | (() => void),
    },
  ];

  // ── Quick Actions (3 navigation + 1 primary) ──
  type QuickAction = {
    title: string;
    desc: string;
    icon: typeof Pill;
    iconBg: string;
    iconColor: string;
    primary: boolean;
    href: string | null;
    onClick?: () => void;
  };

  const quickActions: QuickAction[] = [
    {
      title: "Prescription Queue",
      desc: "View all pending prescriptions",
      icon: Pill,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      primary: false,
      href: "/pharmacy/prescription-queue",
    },
    {
      title: "Manage Inventory",
      desc: "Stock levels and medicine management",
      icon: Boxes,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      primary: false,
      href: "/pharmacy/inventory",
    },
    {
      title: "Invoice History",
      desc: "View past invoices and payments",
      icon: FileText,
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      primary: false,
      href: "/pharmacy/dispense-data",
    },
    {
      title: "Dispense Next",
      desc:
        queueItems.length > 0
          ? queueItems[0].patient_name
          : "No patients in queue",
      icon: Pill,
      iconBg: "bg-white/20",
      iconColor: "text-white",
      primary: true,
      href: null,
      onClick: () => {
        if (queueItems.length > 0) {
          navigate(`/pharmacy/dispense/${queueItems[0].session_id}`);
        } else {
          toast.info("No patients in queue");
        }
      },
    },
  ];

  // ── Expiry section sub-blocks ──
  const expiryBlocks = [
    {
      label: "EXPIRED",
      sub: "Remove immediately",
      value: stats?.expired_count ?? 0,
      dot: "bg-red-500",
      bg: (stats?.expired_count ?? 0) > 0 ? "bg-red-50" : "bg-white",
      textColor:
        (stats?.expired_count ?? 0) > 0 ? "text-red-600" : "text-slate-800",
      onClick: () => void openExpiredDialog(),
    },
    {
      label: "NEAR EXPIRY",
      sub: "Within 180 days",
      value: stats?.near_expiry_count ?? 0,
      dot: "bg-orange-400",
      bg: "bg-white",
      textColor: "text-slate-800",
      onClick: () => void openNearExpiryDialog(),
    },
    {
      label: "LOW STOCK",
      sub: "Below reorder level",
      value: stats?.low_stock_count ?? 0,
      dot: "bg-amber-400",
      bg: "bg-white",
      textColor: "text-slate-800",
      onClick: () => void openLowStockDialog(),
    },
    {
      label: "TOTAL",
      sub: "Registered medicines",
      value: stats?.total_medicines ?? 0,
      dot: "bg-slate-300",
      bg: "bg-white",
      textColor: "text-slate-800",
      onClick: () => navigate("/pharmacy/inventory"),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-6 py-8 space-y-8 pb-20">
        {/* ── Header ── */}
        <PageHeader
          title="Pharmacy Dashboard"
          subtitle="Manage prescriptions and inventory"
          actions={
            <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
              <Clock className="h-4 w-4" />
              <span>{today}</span>
            </div>
          }
        />

        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {kpiCards.map((card) => {
            const Icon = card.icon;
            const interactive = Boolean(card.onClick);
            return (
              <button
                key={card.label}
                onClick={card.onClick}
                disabled={!interactive}
                className={`bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden transition-all text-left flex flex-col group relative ${
                  interactive
                    ? "hover:shadow-md hover:border-slate-300 cursor-pointer"
                    : "cursor-default"
                }`}
              >
                {interactive ? (
                  <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="bg-slate-50 text-slate-400 p-1.5 rounded-lg border border-slate-200">
                      <Eye className="h-3.5 w-3.5" />
                    </div>
                  </div>
                ) : null}
                <div className={`h-1 w-full flex-shrink-0 ${card.accent}`} />
                <div className="p-5 w-full flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-2xl font-bold text-slate-800">
                        {isLoadingStats && card.label !== "Pending Dispense"
                          ? "—"
                          : card.value}
                      </p>
                      <p className="text-sm text-slate-500 mt-0.5">
                        {card.label}
                      </p>
                    </div>
                    <div
                      className={`w-10 h-10 rounded-full ${card.iconBg} flex items-center justify-center ${
                        interactive ? "group-hover:opacity-0" : ""
                      } transition-opacity`}
                    >
                      <Icon className={`h-5 w-5 ${card.iconColor}`} />
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Prescription Queue + Quick Actions ── */}
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
                View All <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="divide-y divide-slate-50">
              {isLoadingQueue ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  Loading…
                </div>
              ) : queueItems.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="h-7 w-7 text-slate-200" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">
                    Queue is currently empty
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    Checked-in patients will appear here
                  </p>
                </div>
              ) : (
                queueItems.slice(0, 6).map((item) => {
                  const outstanding = Number(item.outstanding_debt) || 0;
                  return (
                    <button
                      key={item.session_id}
                      onClick={() =>
                        navigate(`/pharmacy/dispense/${item.session_id}`)
                      }
                      className="w-full flex items-center justify-between px-6 py-4 hover:bg-teal-50/50 transition-colors group cursor-pointer text-left"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full ${getAvatarColor(item.patient_name)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0 group-hover:scale-105 transition-transform`}
                        >
                          {getInitials(item.patient_name)}
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
                          <span className="border border-rose-200 text-rose-700 bg-rose-50 text-[10px] font-bold px-2 py-0.5 rounded">
                            Debt ₹{outstanding.toLocaleString("en-IN")}
                          </span>
                        ) : null}
                        <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-slate-400 group-hover:text-primary transition-colors">
                          Open Invoice <ChevronRight className="h-3.5 w-3.5" />
                        </span>
                      </div>
                    </button>
                  );
                })
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
              {quickActions.map((action) => {
                const Icon = action.icon;
                if (action.primary) {
                  return (
                    <button
                      key={action.title}
                      onClick={action.onClick}
                      className="w-full flex items-center gap-4 p-4 rounded-xl bg-primary hover:bg-[#0a5c5f] text-white transition-colors text-left"
                    >
                      <div
                        className={`w-9 h-9 rounded-lg ${action.iconBg} flex items-center justify-center flex-shrink-0`}
                      >
                        <Icon className={`h-5 w-5 ${action.iconColor}`} />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{action.title}</p>
                        <p className="text-xs text-white/70">{action.desc}</p>
                      </div>
                    </button>
                  );
                }
                return (
                  <button
                    key={action.title}
                    onClick={() => action.href && navigate(action.href)}
                    className="w-full flex items-center gap-4 p-4 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors text-left border border-slate-100"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg ${action.iconBg} border border-teal-100 flex items-center justify-center flex-shrink-0`}
                    >
                      <Icon className={`h-5 w-5 ${action.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">
                        {action.title}
                      </p>
                      <p className="text-xs text-slate-400">{action.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Inventory Health Section ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center">
                <Calendar className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-slate-800">
                    Inventory Health
                  </h2>
                  {nearExpiryAlertCount > 0 ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-bold">
                      {nearExpiryAlertCount} alert
                      {nearExpiryAlertCount !== 1 ? "s" : ""}
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Stock and expiry status across formulations
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate("/pharmacy/reports")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              <Eye className="h-4 w-4" />
              View Full Report
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-slate-100">
            {expiryBlocks.map((block) => (
              <button
                key={block.label}
                onClick={block.onClick}
                className={`p-6 ${block.bg} hover:bg-slate-50 transition-colors text-left flex flex-col items-start group relative`}
              >
                <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-slate-100 text-slate-400 p-1 rounded border border-slate-200">
                    <Eye className="h-3 w-3" />
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${block.dot}`} />
                  <span className="text-xs font-semibold text-slate-500 tracking-wider">
                    {block.label}
                  </span>
                </div>
                <p className={`text-3xl font-bold ${block.textColor}`}>
                  {isLoadingStats ? "—" : block.value}
                </p>
                <p className="text-xs text-slate-400 mt-1">{block.sub}</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Low Stock Alert Banner ── */}
        {!isLoadingStats && (stats?.low_stock_count ?? 0) > 0 ? (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between px-6 py-5">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <div>
                  <h3 className="font-semibold text-amber-800">
                    Low Stock Alert
                  </h3>
                  <p className="text-sm text-amber-700 mt-0.5">
                    {stats?.low_stock_count} medicine
                    {stats?.low_stock_count !== 1 ? "s" : ""} below reorder
                    level. Please restock soon.
                  </p>
                </div>
              </div>
              <button
                onClick={() => void openLowStockDialog()}
                className="flex-shrink-0 px-4 py-2 rounded-lg border border-amber-300 text-amber-800 text-sm font-medium hover:bg-amber-100 transition-colors"
              >
                View Details
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── Pending Dispense Dialog ── */}
      <Dialog
        open={isPendingDispenseDialogOpen}
        onOpenChange={setIsPendingDispenseDialogOpen}
      >
        <DialogContent className="sm:max-w-[600px] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-orange-400 to-orange-500 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <Clock className="h-6 w-6 text-orange-100" />
                Pending Dispense Queue
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 bg-slate-50 max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-100">
                <TableRow>
                  <TableHead className="font-bold text-slate-500 text-xs">
                    Patient Name
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 text-xs">
                    File No.
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 text-xs">
                    Checked In
                  </TableHead>
                  <TableHead className="font-bold text-slate-500 text-xs text-right">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100 bg-white">
                {queueItems.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-6 text-slate-400"
                    >
                      No pending prescriptions.
                    </TableCell>
                  </TableRow>
                ) : (
                  queueItems.map((item) => (
                    <TableRow key={item.session_id}>
                      <TableCell className="font-semibold text-sm text-slate-700">
                        {item.patient_name}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-slate-600">
                        {item.patient?.file_number || "—"}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {formatTime(item.checked_in_at)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setIsPendingDispenseDialogOpen(false);
                            navigate(`/pharmacy/dispense/${item.session_id}`);
                          }}
                          className="text-xs bg-primary/10 text-primary hover:bg-primary/20 border-0 font-bold"
                        >
                          Open <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dispensed Today Dialog (paginated) ── */}
      <Dialog
        open={isDispensedTodayDialogOpen}
        onOpenChange={setIsDispensedTodayDialogOpen}
      >
        <DialogContent className="sm:max-w-[750px] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-emerald-400 to-emerald-500 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <CheckCircle2 className="h-6 w-6 text-emerald-100" />
                Dispensed Today
                <span className="ml-2 text-sm font-medium bg-white/20 px-2 py-0.5 rounded">
                  {dispensedTodayTotal}
                </span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-emerald-100 mt-2">
              All successful dispenses today, newest first.
            </p>
          </div>
          <div className="p-6 bg-slate-50 max-h-[55vh] overflow-y-auto">
            {isLoadingDispensedToday && dispensedTodayItems.length === 0 ? (
              <p className="py-12 text-center text-slate-400 italic">
                Loading dispense history…
              </p>
            ) : dispensedTodayTotal === 0 ? (
              <div className="py-12 text-center">
                <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </div>
                <p className="text-slate-800 font-bold text-lg">
                  No items dispensed today yet.
                </p>
                <p className="text-slate-500 text-sm mt-1">
                  Dispense history will appear here once you process
                  prescriptions.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-100">
                  <TableRow>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Invoice
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Patient
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Time
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Pharmacist
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Amount
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 bg-white">
                  {dispensedTodayItems.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-sm font-bold text-primary">
                        {inv.invoice_number}
                      </TableCell>
                      <TableCell className="text-sm">
                        <p className="font-semibold text-slate-700">
                          {inv.patient}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">
                          {inv.file_number || "—"}
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {inv.time}
                      </TableCell>
                      <TableCell className="text-sm text-slate-500">
                        {inv.pharmacist}
                      </TableCell>
                      <TableCell className="text-right text-sm font-bold text-emerald-600">
                        {formatCurrency(inv.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          {dispensedTodayTotal > 0 ? (
            <div className="border-t border-slate-100 bg-white px-6 py-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Showing{" "}
                <span className="font-bold text-slate-700">
                  {(dispensedTodayPage - 1) * DISPENSED_TODAY_PAGE_SIZE + 1}
                  &ndash;
                  {Math.min(
                    dispensedTodayPage * DISPENSED_TODAY_PAGE_SIZE,
                    dispensedTodayTotal,
                  )}
                </span>{" "}
                of{" "}
                <span className="font-bold text-slate-700">
                  {dispensedTodayTotal}
                </span>
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    dispensedTodayPage <= 1 || isLoadingDispensedToday
                  }
                  onClick={() =>
                    void loadDispensedTodayPage(dispensedTodayPage - 1)
                  }
                  className="text-xs"
                >
                  Previous
                </Button>
                <span className="text-xs text-slate-400 px-1">
                  Page {dispensedTodayPage} of{" "}
                  {Math.max(
                    1,
                    Math.ceil(
                      dispensedTodayTotal / DISPENSED_TODAY_PAGE_SIZE,
                    ),
                  )}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    dispensedTodayPage * DISPENSED_TODAY_PAGE_SIZE >=
                      dispensedTodayTotal || isLoadingDispensedToday
                  }
                  onClick={() =>
                    void loadDispensedTodayPage(dispensedTodayPage + 1)
                  }
                  className="text-xs"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* ── Low Stock Dialog ── */}
      <Dialog open={isLowStockDialogOpen} onOpenChange={setIsLowStockDialogOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <AlertTriangle className="h-6 w-6 text-amber-100" />
                Low Stock Details
              </DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-6 bg-slate-50 max-h-[60vh] overflow-y-auto">
            {isLoadingLowStock ? (
              <p className="py-12 text-center text-slate-400 italic">
                Loading low-stock data…
              </p>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-100">
                  <TableRow>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Medicine
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Category
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Current Stock
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Reorder Level
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 bg-white">
                  {lowStockItems.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center py-6 text-slate-400"
                      >
                        No low stock medicines.
                      </TableCell>
                    </TableRow>
                  ) : (
                    lowStockItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-semibold text-sm text-slate-700">
                          <p>{item.name}</p>
                          <p className="text-xs text-slate-400">{item.salt}</p>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">
                            {item.category}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-amber-600">
                          {item.current_stock}
                        </TableCell>
                        <TableCell className="text-right text-sm text-slate-500">
                          Min: {item.reorder_level}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Expired Medicines Dialog (expiry_date < today) ── */}
      <Dialog
        open={isExpiredDialogOpen}
        onOpenChange={setIsExpiredDialogOpen}
      >
        <DialogContent className="sm:max-w-[700px] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-red-500 to-red-600 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <Calendar className="h-6 w-6 text-red-100" />
                Expired Medicines
                <span className="ml-2 text-sm font-medium bg-white/20 px-2 py-0.5 rounded">
                  {stats?.expired_count ?? expiredRows.length}
                </span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-red-100 mt-2">
              Batches with expiry date before today — remove immediately.
            </p>
          </div>
          <div className="p-6 bg-slate-50 max-h-[60vh] overflow-y-auto">
            {isLoadingExpiry ? (
              <p className="py-12 text-center text-slate-400 italic">
                Loading expired batches…
              </p>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-100">
                  <TableRow>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Medicine
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Batch No.
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Expired On
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Days Overdue
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 bg-white">
                  {expiredRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-6 text-slate-400"
                      >
                        No expired batches.
                      </TableCell>
                    </TableRow>
                  ) : (
                    expiredRows.map((row) => (
                      <TableRow key={`${row.medicine_id}-${row.batch_number}`}>
                        <TableCell className="font-semibold text-sm text-slate-700">
                          {row.medicine_name}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-slate-600">
                          {row.batch_number}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-red-600">
                          {new Date(row.expiry_date).toLocaleDateString(
                            "en-IN",
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-red-600">
                          {row.days_overdue ?? "—"} d
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-slate-700">
                          {row.quantity}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Near Expiry Dialog (today ≤ expiry_date ≤ today + 180 days) ── */}
      <Dialog
        open={isNearExpiryDialogOpen}
        onOpenChange={setIsNearExpiryDialogOpen}
      >
        <DialogContent className="sm:max-w-[700px] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-orange-400 to-orange-500 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <Calendar className="h-6 w-6 text-orange-100" />
                Near Expiry Medicines
                <span className="ml-2 text-sm font-medium bg-white/20 px-2 py-0.5 rounded">
                  {stats?.near_expiry_count ?? nearExpiryRows.length}
                </span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-orange-100 mt-2">
              Batches expiring within the next 180 days.
            </p>
          </div>
          <div className="p-6 bg-slate-50 max-h-[60vh] overflow-y-auto">
            {isLoadingExpiry ? (
              <p className="py-12 text-center text-slate-400 italic">
                Loading near-expiry batches…
              </p>
            ) : (
              <Table>
                <TableHeader className="bg-slate-50 border-b border-slate-100">
                  <TableRow>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Medicine
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Batch No.
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs">
                      Expiry Date
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Days Left
                    </TableHead>
                    <TableHead className="font-bold text-slate-500 text-xs text-right">
                      Quantity
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100 bg-white">
                  {nearExpiryRows.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center py-6 text-slate-400"
                      >
                        No near-expiry batches.
                      </TableCell>
                    </TableRow>
                  ) : (
                    nearExpiryRows.map((row) => (
                      <TableRow key={`${row.medicine_id}-${row.batch_number}`}>
                        <TableCell className="font-semibold text-sm text-slate-700">
                          {row.medicine_name}
                        </TableCell>
                        <TableCell className="text-sm font-mono text-slate-600">
                          {row.batch_number}
                        </TableCell>
                        <TableCell className="text-sm font-semibold text-orange-600">
                          {new Date(row.expiry_date).toLocaleDateString(
                            "en-IN",
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-orange-600">
                          {row.days_until_expiry ?? "—"} d
                        </TableCell>
                        <TableCell className="text-right text-sm font-bold text-slate-700">
                          {row.quantity}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
