"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import {
  Plus,
  Search,
  Trash2,
  History,
  Pill,
  AlertTriangle,
  CalendarClock,
  Loader2,
  Package,
  FileWarning,
  Boxes,
  Sparkles,
  Calendar,
  Layers,
  ShieldCheck,
  Archive,
  FileSpreadsheet,
  FileInput,
  TrendingDown,
  Pencil,
  Eye,
  Building2,
} from "lucide-react";
import { navigate } from "@/lib/navigation";
import { FieldError } from "@/components/ui/field-error";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import {
  getInventoryMedicines,
  auditStockRemoval,
  listSuppliers,
  getLowStockReport,
  getExpiryReport,
  BUP_STRENGTHS,
  type Medicine,
  type MedicineCategory,
  type BupStrength,
  type RemovalReason,
  type Supplier,
  type LowStockReportItem,
  type ExpiryReportRow,
} from "@/lib/pharmacy-api";
import { ImportMedicinesDialog } from "@/components/pharmacy/import-medicines-dialog";
import { PurchaseInvoiceForm } from "@/components/pharmacy/purchase-invoice-form";
import { MedicineFormDialog } from "@/components/pharmacy/medicine-form-dialog";

type TabValue = "list" | "invoice" | "audit";
type CategoryFilter = "all" | MedicineCategory;

export default function InventoryWorkstationPage() {
  const [tab, setTab] = useState<TabValue>("list");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [bupFilter, setBupFilter] = useState<BupStrength | "all">("all");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Medicine | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Alert drill-down dialogs (reuse same pattern as pharmacy dashboard)
  const [lowStockDialogOpen, setLowStockDialogOpen] = useState(false);
  const [lowStockItems, setLowStockItems] = useState<LowStockReportItem[]>([]);
  const [isLoadingLowStock, setIsLoadingLowStock] = useState(false);

  const [nearExpiryDialogOpen, setNearExpiryDialogOpen] = useState(false);
  const [nearExpiryRows, setNearExpiryRows] = useState<ExpiryReportRow[]>([]);
  const [isLoadingNearExpiry, setIsLoadingNearExpiry] = useState(false);

  const loadSuppliers = useCallback(() => {
    return listSuppliers({ is_active: true, pageSize: 200 })
      .then((data) => setSuppliers(data.items || []))
      .catch(() => {
        /* non-fatal — the dropdown shows an empty state */
      });
  }, []);

  const loadMedicines = useCallback(() => {
    setIsLoading(true);
    setErrorMessage("");
    return getInventoryMedicines()
      .then((data) => setMedicines(data.items || []))
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load inventory.",
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadMedicines();
    loadSuppliers();
  }, [loadMedicines, loadSuppliers]);

  const filteredMedicines = useMemo(() => {
    let list = medicines;
    if (categoryFilter !== "all") {
      list = list.filter((m) => m.category === categoryFilter);
    }
    if (categoryFilter === "BUP" && bupFilter !== "all") {
      list = list.filter((m) => m.bup_category === bupFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) || m.salt.toLowerCase().includes(q),
      );
    }
    return list;
  }, [medicines, categoryFilter, bupFilter, searchQuery]);

  const counts = useMemo(() => {
    const result = { all: 0, BUP: 0, Rx: 0, NRx: 0 };
    medicines.forEach((m) => {
      result.all += 1;
      result[m.category] = (result[m.category] || 0) + 1;
    });
    return result;
  }, [medicines]);

  const stockFor = (m: Medicine) =>
    m.batches?.reduce((sum, b) => sum + (b.quantity || 0), 0) || 0;

  const lowStockMedicines = useMemo(
    () => medicines.filter((m) => stockFor(m) <= m.reorder_level),
    [medicines],
  );

  const nearExpiryBatches = useMemo(() => {
    const now = Date.now();
    const horizon = 180 * 86400000;
    const results: Array<{
      medicine: Medicine;
      batch: Medicine["batches"][number];
    }> = [];
    medicines.forEach((m) => {
      m.batches?.forEach((b) => {
        const t = new Date(b.expiry_date).getTime();
        if (!Number.isNaN(t) && t - now <= horizon && t - now >= 0) {
          results.push({ medicine: m, batch: b });
        }
      });
    });
    return results;
  }, [medicines]);

  const openLowStockDialog = async () => {
    setLowStockDialogOpen(true);
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

  const openNearExpiryDialog = async () => {
    setNearExpiryDialogOpen(true);
    if (nearExpiryRows.length === 0 && !isLoadingNearExpiry) {
      setIsLoadingNearExpiry(true);
      try {
        const data = await getExpiryReport();
        setNearExpiryRows(data.near_expiry || []);
      } catch {
        toast.error("Failed to load near-expiry data");
      } finally {
        setIsLoadingNearExpiry(false);
      }
    }
  };

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6 pb-24">
      <PageHeader
        icon={<Boxes className="h-7 w-7 text-primary" />}
        title={
          <span className="flex items-center gap-2">
            Inventory Workstation
            <Badge className="bg-teal-50 border border-teal-100 text-primary font-bold text-[10px] uppercase px-2 py-0.5 rounded-lg flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Audit Compliant
            </Badge>
          </span>
        }
        subtitle={`${medicines.length} active formulation${
          medicines.length === 1 ? "" : "s"
        } registered`}
        actions={
          <>
            <div className="bg-white text-slate-600 font-extrabold px-3.5 py-2 rounded-xl border border-slate-100 shadow-sm flex items-center gap-2 text-xs">
              <Calendar className="h-4 w-4 text-primary" />
              <span>{medicines.length} Predefined Formulations</span>
            </div>
            <Button
              variant="outline"
              onClick={() => setImportDialogOpen(true)}
              className="bg-white text-primary border-primary/30 hover:bg-teal-50 font-extrabold rounded-xl h-10 px-4 shadow-sm flex items-center gap-2"
            >
              <FileInput className="h-4 w-4" />
              Import CSV
            </Button>
            <Button
              onClick={() => setAddDialogOpen(true)}
              className="bg-primary hover:bg-primary-dark text-white font-extrabold rounded-xl h-10 px-4 shadow-md shadow-teal-900/10 flex items-center gap-2 hover:scale-[1.01] transition-transform"
            >
              <Plus className="h-4 w-4" />
              Register Medicine
            </Button>
          </>
        }
      />

      {/* Stat Filter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {(
          [
            {
              key: "all",
              title: "All Formulations",
              count: counts.all,
              labelColor: "text-slate-500",
              activeBg: "bg-teal-50/30",
              activeBorder: "border-primary",
              activeRing: "ring-primary/20",
              badgeClass: "bg-primary text-white",
              icon: Layers,
              subtitle: "Predefined stock",
            },
            {
              key: "BUP",
              title: "BUP (Controlled)",
              count: counts.BUP,
              labelColor: "text-rose-600",
              activeBg: "bg-rose-50/30",
              activeBorder: "border-rose-500",
              activeRing: "ring-rose-500/20",
              badgeClass: "bg-rose-500 text-white",
              icon: AlertTriangle,
              subtitle: "Controlled substances",
            },
            {
              key: "Rx",
              title: "Rx Formulations",
              count: counts.Rx,
              labelColor: "text-blue-600",
              activeBg: "bg-blue-50/30",
              activeBorder: "border-blue-500",
              activeRing: "ring-blue-500/20",
              badgeClass: "bg-blue-500 text-white",
              icon: ShieldCheck,
              subtitle: "Prescribed items",
            },
            {
              key: "NRx",
              title: "NRx Formulations",
              count: counts.NRx,
              labelColor: "text-amber-600",
              activeBg: "bg-amber-50/30",
              activeBorder: "border-amber-500",
              activeRing: "ring-amber-500/20",
              badgeClass: "bg-amber-500 text-white",
              icon: Archive,
              subtitle: "Over-the-counter",
            },
          ] as const
        ).map((stat) => {
          const active = categoryFilter === stat.key;
          return (
            <div
              key={stat.key}
              role="button"
              tabIndex={0}
              onClick={() => {
                setCategoryFilter(stat.key as CategoryFilter);
                if (stat.key !== "BUP") setBupFilter("all");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  setCategoryFilter(stat.key as CategoryFilter);
                  if (stat.key !== "BUP") setBupFilter("all");
                }
              }}
              className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 group hover:shadow-sm ${
                active
                  ? `${stat.activeBg} ${stat.activeBorder} ring-1 ${stat.activeRing}`
                  : "bg-white border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div
                  className={`text-xs font-bold ${stat.labelColor} uppercase tracking-wider`}
                >
                  {stat.title}
                </div>
                {active && (
                  <Badge
                    className={`${stat.badgeClass} border-0 font-bold text-[9px] px-1.5 py-0 rounded shadow-sm`}
                  >
                    Active
                  </Badge>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800 tracking-tight">
                  {stat.count}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium mt-1 flex items-center gap-1.5">
                <stat.icon className="h-3 w-3 text-slate-400" /> {stat.subtitle}
              </p>
            </div>
          );
        })}
      </div>

      {/* Alerts */}
      {(lowStockMedicines.length > 0 || nearExpiryBatches.length > 0) &&
      tab === "list" ? (
        <div className="space-y-3">
          {lowStockMedicines.length > 0 ? (
            <button
              type="button"
              onClick={() => void openLowStockDialog()}
              className="w-full bg-rose-50 border border-rose-100 rounded-2xl p-4 flex items-center justify-between gap-3.5 shadow-sm cursor-pointer hover:bg-rose-100/60 transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-rose-800 uppercase tracking-widest">
                    Low Stock Alert
                  </p>
                  <p className="text-[11px] text-rose-600 font-bold leading-relaxed mt-0.5">
                    {lowStockMedicines.length} medicine
                    {lowStockMedicines.length === 1 ? "" : "s"} at or below
                    reorder level
                  </p>
                </div>
              </div>
              <Eye className="h-4 w-4 text-rose-400" />
            </button>
          ) : null}
          {nearExpiryBatches.length > 0 ? (
            <button
              type="button"
              onClick={() => void openNearExpiryDialog()}
              className="w-full bg-orange-50 border border-orange-100 rounded-2xl p-4 flex items-center justify-between gap-3.5 shadow-sm cursor-pointer hover:bg-orange-100/60 transition-colors text-left"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center flex-shrink-0">
                  <CalendarClock className="h-5 w-5 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black text-orange-800 uppercase tracking-widest">
                    Near Expiry Alert
                  </p>
                  <p className="text-[11px] text-orange-600 font-bold leading-relaxed mt-0.5">
                    {nearExpiryBatches.length} batch
                    {nearExpiryBatches.length === 1 ? "" : "es"} expiring within
                    180 days
                  </p>
                </div>
              </div>
              <Eye className="h-4 w-4 text-orange-400" />
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Mode selector bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab("list")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              tab === "list"
                ? "bg-primary text-white shadow-md shadow-teal-900/10"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <Pill className="h-4 w-4" /> Registered List
          </button>
          <button
            type="button"
            onClick={() => setTab("invoice")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              tab === "invoice"
                ? "bg-primary text-white shadow-md shadow-teal-900/10"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <FileSpreadsheet className="h-4 w-4" /> Enter New Invoice
          </button>
          <button
            type="button"
            onClick={() => setTab("audit")}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
              tab === "audit"
                ? "bg-rose-600 text-white shadow-md shadow-rose-900/10"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <Trash2 className="h-4 w-4" /> Audit Stock Removal
          </button>
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList className="hidden">
          <TabsTrigger value="list">Registered List</TabsTrigger>
          <TabsTrigger value="invoice">Enter New Invoice</TabsTrigger>
          <TabsTrigger value="audit">Audit Stock Removal</TabsTrigger>
        </TabsList>

        {/* Registered List Tab */}
        <TabsContent value="list" className="mt-0 outline-none space-y-6">
          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="py-4 px-6 border-b border-slate-100 bg-white">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-1 w-full md:w-auto relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search registered composition, salt or name..."
                    className="pl-9 h-10 bg-white border-slate-200 rounded-lg focus:ring-primary/10 focus:border-primary font-medium text-slate-700 text-sm w-full md:max-w-md"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                  <Select
                    value={categoryFilter}
                    onValueChange={(v) => {
                      setCategoryFilter(v as CategoryFilter);
                      if (v !== "BUP") setBupFilter("all");
                    }}
                  >
                    <SelectTrigger className="w-36 h-10 rounded-lg border-slate-200 bg-white font-medium text-sm text-slate-700">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent className="rounded-lg border-slate-200 text-sm">
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="BUP">BUP (Controlled)</SelectItem>
                      <SelectItem value="Rx">Rx (Prescribed)</SelectItem>
                      <SelectItem value="NRx">NRx (General)</SelectItem>
                    </SelectContent>
                  </Select>
                  {categoryFilter === "BUP" ? (
                    <Select
                      value={bupFilter}
                      onValueChange={(v) =>
                        setBupFilter(v as BupStrength | "all")
                      }
                    >
                      <SelectTrigger className="w-40 h-10 rounded-lg border-slate-200 bg-white font-medium text-sm text-primary">
                        <SelectValue placeholder="Strength" />
                      </SelectTrigger>
                      <SelectContent className="rounded-lg border-slate-200 text-sm">
                        <SelectItem value="all">All Strengths</SelectItem>
                        {BUP_STRENGTHS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0 overflow-x-auto">
              {errorMessage ? (
                <p className="text-sm text-destructive px-6 py-4">
                  {errorMessage}
                </p>
              ) : null}

              {isLoading ? (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50/80">
                      <TableHead className="px-6 h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Medicine &amp; Salt
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Category
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Active Batches &amp; Expiry
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">
                        Price
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">
                        Stock
                      </TableHead>
                      <TableHead className="px-6 h-10 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Manage
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <TableRow key={`skel-${i}`}>
                        <TableCell className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-slate-100 animate-pulse flex-shrink-0" />
                            <div className="space-y-2 flex-1">
                              <div className="h-3.5 bg-slate-100 rounded w-48 animate-pulse" />
                              <div className="h-2.5 bg-slate-50 rounded w-32 animate-pulse" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="h-5 bg-slate-100 rounded w-16 animate-pulse" />
                        </TableCell>
                        <TableCell>
                          <div className="h-8 bg-slate-50 rounded w-48 animate-pulse" />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="h-4 bg-slate-100 rounded w-12 mx-auto animate-pulse" />
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="h-6 bg-slate-50 rounded w-16 mx-auto animate-pulse" />
                        </TableCell>
                        <TableCell className="px-6">
                          <div className="h-8 bg-slate-50 rounded w-8 ml-auto animate-pulse" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : filteredMedicines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Package className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-500">
                    No registered formulations found.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Try adjusting your filters or register a new medicine
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50/80">
                      <TableHead className="px-6 h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Medicine &amp; Salt
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Category
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Active Batches &amp; Expiry
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">
                        Price
                      </TableHead>
                      <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">
                        Stock
                      </TableHead>
                      <TableHead className="px-6 h-10 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500">
                        Manage
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {filteredMedicines.map((m) => {
                      const stock = stockFor(m);
                      const isLow = stock <= m.reorder_level;
                      return (
                        <TableRow
                          key={m.id}
                          className="group hover:bg-slate-50/50 transition-colors border-slate-100"
                        >
                          <TableCell className="px-6 py-3">
                            <div className="min-w-0">
                              <p className="font-bold text-slate-800 text-sm tracking-tight">
                                {m.name}
                              </p>
                              <p className="text-[10px] text-slate-500 uppercase mt-0.5 tracking-wide">
                                {m.salt}
                              </p>
                              {/* Supplier chips — Option B. Capped at 2
                                  inline; the rest collapse into "+N more"
                                  with a title attribute listing the
                                  remaining company names. */}
                              {m.suppliers && m.suppliers.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                  <Building2 className="h-2.5 w-2.5 text-slate-400" />
                                  {m.suppliers.slice(0, 2).map((s) => (
                                    <span
                                      key={s.id}
                                      className={`inline-flex items-center gap-1 text-[9px] font-semibold rounded-full px-1.5 py-0.5 border ${
                                        s.is_active
                                          ? "bg-slate-50 text-slate-600 border-slate-200"
                                          : "bg-slate-100 text-slate-400 border-slate-200 italic"
                                      }`}
                                      title={
                                        s.is_active
                                          ? s.company_name
                                          : `${s.company_name} (inactive)`
                                      }
                                    >
                                      {s.company_name}
                                    </span>
                                  ))}
                                  {m.suppliers.length > 2 && (
                                    <span
                                      className="text-[9px] font-bold text-slate-400 px-1"
                                      title={m.suppliers
                                        .slice(2)
                                        .map((s) => s.company_name)
                                        .join(", ")}
                                    >
                                      +{m.suppliers.length - 2} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 items-start">
                              <Badge
                                variant="outline"
                                className={`font-bold text-[9px] uppercase px-1.5 py-0 rounded ${
                                  m.category === "BUP"
                                    ? "text-rose-600 border-rose-200 bg-rose-50"
                                    : m.category === "Rx"
                                      ? "text-blue-600 border-blue-200 bg-blue-50"
                                      : "text-amber-600 border-amber-200 bg-amber-50"
                                }`}
                              >
                                {m.category}
                              </Badge>
                              {m.bup_category ? (
                                <span className="text-[10px] text-slate-500">
                                  {m.bup_category}
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                          <TableCell className="py-2">
                            {m.batches && m.batches.length > 0 ? (
                              <div className="flex flex-col gap-1 max-w-[280px]">
                                {m.batches.slice(0, 3).map((b) => {
                                  const expDate = new Date(b.expiry_date);
                                  const diffTime =
                                    expDate.getTime() - Date.now();
                                  const diffDays = Math.ceil(
                                    diffTime / 86400000,
                                  );
                                  const isNearExpiry =
                                    diffDays > 0 && diffDays <= 180;
                                  const isExpired = diffDays <= 0;
                                  return (
                                    <div
                                      key={b.batch_number}
                                      className="flex items-center justify-between text-[11px] font-medium"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="text-slate-700 font-mono">
                                          {b.batch_number}
                                        </span>
                                        <span className="text-slate-300">
                                          &middot;
                                        </span>
                                        <span
                                          className={`flex items-center gap-1 ${
                                            isExpired
                                              ? "text-rose-600 font-bold"
                                              : isNearExpiry
                                                ? "text-amber-600 font-bold"
                                                : "text-slate-500"
                                          }`}
                                        >
                                          Exp:{" "}
                                          {expDate.toLocaleDateString("en-GB", {
                                            day: "2-digit",
                                            month: "short",
                                            year: "2-digit",
                                          })}
                                          {isNearExpiry && (
                                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                                          )}
                                          {isExpired && (
                                            <AlertTriangle className="h-3 w-3 text-rose-500" />
                                          )}
                                        </span>
                                      </div>
                                      <span className="text-slate-600 font-semibold">
                                        {b.quantity} Tabs
                                      </span>
                                    </div>
                                  );
                                })}
                                {m.batches.length > 3 ? (
                                  <span className="text-[10px] text-slate-400">
                                    +{m.batches.length - 3} more
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">
                                No batches
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="font-bold text-slate-800 text-sm">
                              ₹{parseFloat(m.selling_price).toFixed(2)}
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              MRP: ₹{parseFloat(m.mrp).toFixed(2)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex flex-col items-center justify-center">
                              <span
                                className={`text-sm font-black ${isLow ? "text-rose-600" : "text-slate-800"}`}
                              >
                                {stock} Tabs
                              </span>
                              {isLow ? (
                                <span className="text-[9px] text-rose-500 font-bold uppercase mt-0.5 flex items-center gap-1">
                                  <TrendingDown className="h-3 w-3" /> Reorder
                                </span>
                              ) : (
                                <span className="text-[9px] text-slate-400 mt-0.5">
                                  Min: {m.reorder_level}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="px-6 text-right">
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-primary hover:bg-teal-50"
                                onClick={() => setEditTarget(m)}
                                aria-label="Edit medicine"
                                title="Edit Medicine"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50"
                                onClick={() =>
                                  navigate(`/pharmacy/inventory/${m.id}`)
                                }
                                aria-label="View history"
                                title="View Dispense History"
                              >
                                <History className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoice Tab */}
        <TabsContent value="invoice" className="mt-0 outline-none">
          <PurchaseInvoiceForm
            medicines={medicines}
            suppliers={suppliers}
            onSupplierCreated={(s) => setSuppliers((prev) => [s, ...prev])}
            onRegisterMedicine={() => setAddDialogOpen(true)}
            onSuccess={() => {
              loadMedicines();
              setTab("list");
            }}
          />
        </TabsContent>

        {/* Audit Tab */}
        <TabsContent value="audit" className="mt-0 outline-none">
          <AuditRemovalView
            medicines={medicines}
            onSuccess={() => loadMedicines()}
          />
        </TabsContent>
      </Tabs>

      <MedicineFormDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        editTarget={null}
        onSuccess={() => {
          setAddDialogOpen(false);
          loadMedicines();
        }}
        suppliers={suppliers}
        onSupplierCreated={(s) => setSuppliers((prev) => [s, ...prev])}
      />

      <ImportMedicinesDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onSuccess={() => loadMedicines()}
        suppliers={suppliers}
        onSupplierCreated={(s) => setSuppliers((prev) => [s, ...prev])}
      />

      <MedicineFormDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
        editTarget={editTarget}
        onSuccess={() => {
          setEditTarget(null);
          loadMedicines();
        }}
        suppliers={suppliers}
        onSupplierCreated={(s) => setSuppliers((prev) => [s, ...prev])}
      />

      {/* Low Stock Dialog */}
      <Dialog open={lowStockDialogOpen} onOpenChange={setLowStockDialogOpen}>
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
                          {item.current_stock} Tabs
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

      {/* Near Expiry Dialog */}
      <Dialog
        open={nearExpiryDialogOpen}
        onOpenChange={setNearExpiryDialogOpen}
      >
        <DialogContent className="sm:max-w-[700px] rounded-2xl p-0 overflow-hidden bg-white">
          <div className="bg-gradient-to-r from-orange-400 to-orange-500 p-6 text-white">
            <DialogHeader>
              <DialogTitle className="text-white text-xl flex items-center gap-2">
                <CalendarClock className="h-6 w-6 text-orange-100" />
                Near Expiry Medicines
                <span className="ml-2 text-sm font-medium bg-white/20 px-2 py-0.5 rounded">
                  {nearExpiryRows.length}
                </span>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-orange-100 mt-2">
              Batches expiring within the next 180 days.
            </p>
          </div>
          <div className="p-6 bg-slate-50 max-h-[60vh] overflow-y-auto">
            {isLoadingNearExpiry ? (
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
                      Stock
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
                        <TableCell className="text-xs font-mono text-slate-600">
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
                          {row.quantity} Tabs
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

// ────────── Medicine Form Dialog (Add + Edit) ──────────

// ────────── Audit Removal View ──────────

function AuditRemovalView({
  medicines,
  onSuccess,
}: {
  medicines: Medicine[];
  onSuccess: () => void;
}) {
  const [selectedMedId, setSelectedMedId] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [quantity, setQuantity] = useState<number | "">("");
  const [reason, setReason] = useState<RemovalReason>("destroyed");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiErrors = useApiErrors();

  const selectedMed = medicines.find((m) => m.id === selectedMedId) || null;
  const batches = selectedMed?.batches || [];
  const currentBatch = batches.find((b) => b.batch_number === batchNo);

  const handleSubmit = async () => {
    if (!selectedMedId || !batchNo) {
      toast.error("Select a medicine and batch");
      return;
    }
    apiErrors.clear();
    setIsSubmitting(true);
    try {
      await auditStockRemoval({
        medicine_id: selectedMedId,
        batch_number: batchNo,
        quantity: quantity === "" ? undefined : Number(quantity),
        reason,
        notes,
      });
      toast.success("Stock removed successfully");
      setSelectedMedId("");
      setBatchNo("");
      setQuantity("");
      setNotes("");
      onSuccess();
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, "Failed to remove stock");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Expiry Auditing overview panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="border-0 shadow-sm rounded-2xl bg-amber-50/50 border-l-4 border-l-amber-500 overflow-hidden">
          <CardContent className="p-5 flex items-start gap-3">
            <FileWarning className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-amber-900">
                Near-Expiry Awareness
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Use this workflow for batches expiring soon to maintain
                regulatory compliance.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm rounded-2xl bg-rose-50/50 border-l-4 border-l-rose-500 overflow-hidden">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-rose-900">
                Expired Stock Safeguard
              </p>
              <p className="text-xs text-rose-700 mt-1">
                All removals create immutable StockMovement records (BUP
                removals are flagged for NDPS audit).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Audited Removal form */}
      <div className="max-w-2xl mx-auto">
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/20">
            <CardTitle className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
              <AlertTriangle className="h-5 w-5 text-rose-600" /> Controlled
              Stock Audited Removal
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="bg-rose-50/70 border border-rose-100 p-3 rounded-xl text-xs font-semibold text-rose-700 leading-normal">
              Controlled deletion is strictly audited. All entries write
              directly to clinic compliance records.
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">
                Choose Medicine
              </Label>
              <Select
                value={selectedMedId}
                onValueChange={(v) => {
                  setSelectedMedId(v);
                  setBatchNo("");
                }}
              >
                <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs text-slate-700">
                  <SelectValue placeholder="-- Choose Medicine to Remove --" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 text-xs">
                  {medicines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.salt})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={apiErrors.get("medicine_id")} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500">
                  Target Batch
                </Label>
                <Select
                  value={batchNo}
                  onValueChange={setBatchNo}
                  disabled={!selectedMed}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs text-slate-700">
                    <SelectValue placeholder="Select batch" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 text-xs">
                    {batches.length === 0 ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">
                        No batches
                      </div>
                    ) : (
                      batches.map((b) => (
                        <SelectItem key={b.batch_number} value={b.batch_number}>
                          {b.batch_number} · Stock {b.quantity}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <FieldError message={apiErrors.get("batch_number")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-400">
                  Batch Expiry
                </Label>
                <Input
                  value={
                    currentBatch?.expiry_date
                      ? new Date(currentBatch.expiry_date).toLocaleDateString(
                          "en-IN",
                        )
                      : ""
                  }
                  disabled
                  className="h-11 rounded-xl bg-slate-100 border-slate-200 font-bold text-slate-400 text-center text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500">
                  Quantity (optional — empty = full batch)
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={currentBatch?.quantity || undefined}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      e.target.value === ""
                        ? ""
                        : Math.max(0, parseInt(e.target.value) || 0),
                    )
                  }
                  placeholder={
                    currentBatch
                      ? `Up to ${currentBatch.quantity}`
                      : "Select batch first"
                  }
                  className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-xs"
                />
                <FieldError message={apiErrors.get("quantity")} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500">
                  Deletion Reason
                </Label>
                <Select
                  value={reason}
                  onValueChange={(v) => setReason(v as RemovalReason)}
                >
                  <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs text-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 text-xs">
                    <SelectItem value="destroyed">Destroyed</SelectItem>
                    <SelectItem value="returned">Returned</SelectItem>
                    <SelectItem value="damaged">Damaged</SelectItem>
                    <SelectItem value="defect">Manufacturing Defect</SelectItem>
                  </SelectContent>
                </Select>
                <FieldError message={apiErrors.get("reason")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500">
                Compliance Notes
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Document reasoning for audit log"
                className="rounded-xl bg-slate-50/50 border-slate-200 text-xs min-h-[80px] resize-none font-semibold text-slate-700"
                rows={3}
              />
            </div>

            <Button
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedMedId || !batchNo}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white font-extrabold rounded-xl h-12 shadow-md shadow-rose-900/10 flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform text-xs"
            >
              {isSubmitting ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Removing…
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" /> Confirm Stock Removal
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
