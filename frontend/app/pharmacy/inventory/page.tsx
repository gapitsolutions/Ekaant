"use client";

import {
  type ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
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
  FileImage,
  TrendingDown,
  Pencil,
  Eye,
  Upload,
  X,
} from "lucide-react";
import { navigate } from "@/lib/navigation";
import { FieldError } from "@/components/ui/field-error";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import {
  getInventoryMedicines,
  addInventoryMedicine,
  updateInventoryMedicine,
  submitPurchaseInvoice,
  auditStockRemoval,
  listSuppliers,
  createSupplier,
  getLowStockReport,
  getExpiryReport,
  BUP_STRENGTHS,
  type Medicine,
  type MedicineCategory,
  type BupStrength,
  type RemovalReason,
  type Supplier,
  type SupplierCategory,
  type LowStockReportItem,
  type ExpiryReportRow,
} from "@/lib/pharmacy-api";

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
              onClick={() => setAddDialogOpen(true)}
              className="bg-primary hover:bg-[#0a5c5f] text-white font-extrabold rounded-xl h-10 px-4 shadow-md shadow-teal-900/10 flex items-center gap-2 hover:scale-[1.01] transition-transform"
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

function MedicineFormDialog({
  open,
  onOpenChange,
  editTarget,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget: Medicine | null;
  onSuccess: () => void;
}) {
  const isEdit = !!editTarget;
  const [category, setCategory] = useState<MedicineCategory>("Rx");
  const [bupCategory, setBupCategory] = useState<BupStrength>("2.0mg + 0.5mg");
  const [name, setName] = useState("");
  const [salt, setSalt] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [mrp, setMrp] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [reorderLevel, setReorderLevel] = useState("50");
  const [tabletsPerStrip, setTabletsPerStrip] = useState("10");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Pre-fill form when editing
  useEffect(() => {
    if (editTarget) {
      setCategory(editTarget.category);
      setBupCategory(editTarget.bup_category || "2.0mg + 0.5mg");
      setName(editTarget.name);
      setSalt(editTarget.salt);
      setManufacturer(editTarget.manufacturer);
      setMrp(editTarget.mrp);
      setSellingPrice(editTarget.selling_price);
      setReorderLevel(String(editTarget.reorder_level));
      setTabletsPerStrip(String(editTarget.tablets_per_strip));
    } else {
      resetForm();
    }
  }, [editTarget]);

  const resetForm = () => {
    setCategory("Rx");
    setBupCategory("2.0mg + 0.5mg");
    setName("");
    setSalt("");
    setManufacturer("");
    setMrp("");
    setSellingPrice("");
    setReorderLevel("50");
    setTabletsPerStrip("10");
  };

  const handleSubmit = async () => {
    if (!name.trim() || !salt.trim() || !manufacturer.trim()) {
      toast.error("Name, salt, and manufacturer are required");
      return;
    }
    const mrpNum = parseFloat(mrp);
    const spNum = parseFloat(sellingPrice);
    if (Number.isNaN(mrpNum) || Number.isNaN(spNum)) {
      toast.error("Prices must be valid numbers");
      return;
    }
    if (spNum > mrpNum) {
      toast.error("Selling price cannot exceed MRP");
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = {
        name: name.trim(),
        salt: salt.trim(),
        category,
        bup_category: category === "BUP" ? bupCategory : null,
        manufacturer: manufacturer.trim(),
        reorder_level: parseInt(reorderLevel) || 0,
        tablets_per_strip: parseInt(tabletsPerStrip) || 10,
        mrp: mrpNum.toFixed(2),
        selling_price: spNum.toFixed(2),
      };
      if (isEdit && editTarget) {
        await updateInventoryMedicine(editTarget.id, payload);
        toast.success("Medicine updated successfully");
      } else {
        await addInventoryMedicine(payload);
        toast.success("Medicine registered successfully");
      }
      resetForm();
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isEdit
            ? "Failed to update medicine"
            : "Failed to register medicine",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] rounded-2xl p-6 bg-white border border-slate-100">
        <DialogHeader className="pb-3 border-b border-slate-50">
          <DialogTitle className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            {isEdit ? "Edit Medicine" : "Register New Medicine"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            {isEdit
              ? "Update medicine details. Changes apply to future dispenses."
              : "Configure standard chemical salts, dosage constraints and reorder alert levels."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Formulation Category
            </Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as MedicineCategory)}
            >
              <SelectTrigger className="h-11 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs text-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-xl border-slate-200 text-xs">
                <SelectItem value="BUP">BUP Category (Controlled)</SelectItem>
                <SelectItem value="Rx">Rx Category (Prescription)</SelectItem>
                <SelectItem value="NRx">NRx Category (General)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {category === "BUP" ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-primary">
                BUP Strength Subcategory
              </Label>
              <Select
                value={bupCategory}
                onValueChange={(v) => setBupCategory(v as BupStrength)}
              >
                <SelectTrigger className="h-11 rounded-xl bg-teal-50/50 border-teal-200 text-primary font-black text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-teal-100 text-xs">
                  {BUP_STRENGTHS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1.5 opacity-60">
              <Label className="text-xs font-bold text-slate-400">
                BUP Strength Subcategory
              </Label>
              <div className="h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center px-4 text-slate-400 text-xs font-bold">
                N/A
              </div>
            </div>
          )}

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-bold text-slate-500">
              Medicine Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Olanzapine 5mg"
              className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-xs"
            />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-bold text-slate-500">
              Salt Composition
            </Label>
            <Input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="e.g. Olanzapine"
              className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-xs"
            />
          </div>

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-bold text-slate-500">
              Manufacturer
            </Label>
            <Input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. Sun Pharma"
              className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              MRP price (₹)
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={mrp}
              onChange={(e) => setMrp(e.target.value)}
              className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-center text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-primary">
              Dispense Selling Price (₹)
            </Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
              className="h-11 rounded-xl bg-teal-50/30 border-teal-200 font-black text-primary text-center text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Reorder Level
            </Label>
            <Input
              type="number"
              min={0}
              value={reorderLevel}
              onChange={(e) => setReorderLevel(e.target.value)}
              className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-center text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Tablets / Strip
            </Label>
            <Input
              type="number"
              min={1}
              value={tabletsPerStrip}
              onChange={(e) => setTabletsPerStrip(e.target.value)}
              className="h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-center text-xs"
            />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t border-slate-50">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            className="rounded-xl h-11 font-bold text-slate-400 hover:bg-slate-50 text-xs"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="bg-primary hover:bg-[#0a5c5f] font-extrabold rounded-xl h-11 px-6 shadow-md shadow-teal-900/10 text-xs"
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" /> Saving…
              </>
            ) : isEdit ? (
              "Update Medicine"
            ) : (
              "Register Medicine"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────── Purchase Invoice Form ──────────

interface InvoiceItemDraft {
  id: string;
  medicineId: string;
  medicineName: string;
  category: MedicineCategory;
  subcategory: string | null;
  batchNumber: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  gstPercentage: number;
}

interface InvoiceDocumentDraft {
  filename: string;
  mimeType: string;
  base64: string;
  previewUrl: string | null;
}

const PURCHASE_INVOICE_DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;
const PURCHASE_INVOICE_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Unable to read selected file"));
    reader.readAsDataURL(file);
  });
}

function parseDataUrl(
  dataUrl: string,
): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

function PurchaseInvoiceForm({
  medicines,
  suppliers,
  onSupplierCreated,
  onSuccess,
}: {
  medicines: Medicine[];
  suppliers: Supplier[];
  onSupplierCreated: (s: Supplier) => void;
  onSuccess: () => void;
}) {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [orderDate, setOrderDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [invoiceDocument, setInvoiceDocument] =
    useState<InvoiceDocumentDraft | null>(null);
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);
  const [selectDialogOpen, setSelectDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiErrors = useApiErrors();

  const handleConfirmSelection = () => {
    const newDrafts: InvoiceItemDraft[] = selectedIds
      .filter((id) => !items.some((i) => i.medicineId === id))
      .map((id) => {
        const med = medicines.find((m) => m.id === id);
        return {
          id: `${id}-${Date.now()}`,
          medicineId: id,
          medicineName: med?.name || "",
          category: med?.category || "Rx",
          subcategory: med?.bup_category || null,
          batchNumber: "",
          expiryDate: "",
          quantity: 0,
          purchasePrice: 0,
          gstPercentage: 12,
        };
      });
    setItems((prev) => [...prev, ...newDrafts]);
    setSelectedIds([]);
    setSelectDialogOpen(false);
  };

  const handleRemove = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const updateItem = (id: string, patch: Partial<InvoiceItemDraft>) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const handleDocumentChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!PURCHASE_INVOICE_DOCUMENT_MIME_TYPES.has(file.type)) {
      toast.error("Upload a PDF, JPG, PNG, or WEBP invoice document.");
      return;
    }

    if (file.size > PURCHASE_INVOICE_DOCUMENT_MAX_BYTES) {
      toast.error("Invoice document must be 5 MB or smaller.");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const parsed = parseDataUrl(dataUrl);
      if (!parsed) {
        toast.error("Unable to read the selected invoice document.");
        return;
      }
      setInvoiceDocument({
        filename: file.name,
        mimeType: parsed.mimeType,
        base64: parsed.base64,
        previewUrl: file.type.startsWith("image/") ? dataUrl : null,
      });
    } catch {
      toast.error("Unable to read the selected invoice document.");
    }
  };

  const summary = useMemo(() => {
    const formCount = items.length;
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const gstTotal = items.reduce(
      (s, i) => s + (i.quantity * i.purchasePrice * i.gstPercentage) / 100,
      0,
    );
    const subtotal = items.reduce(
      (s, i) => s + i.quantity * i.purchasePrice,
      0,
    );
    return {
      formulations: formCount,
      totalQty,
      gstTotal,
      grandTotal: subtotal + gstTotal,
    };
  }, [items]);

  const handleSubmit = async () => {
    if (!invoiceNo.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (!supplierId) {
      toast.error("Supplier is required");
      return;
    }
    if (!orderDate) {
      toast.error("Order date is required");
      return;
    }
    if (!invoiceDate) {
      toast.error("Invoice date is required");
      return;
    }
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }
    for (const i of items) {
      if (!i.batchNumber.trim() || !i.expiryDate) {
        toast.error(`Complete batch & expiry for ${i.medicineName}`);
        return;
      }
      if (i.quantity <= 0 || i.purchasePrice < 0 || i.gstPercentage < 0) {
        toast.error(`Check qty, price, GST for ${i.medicineName}`);
        return;
      }
    }

    apiErrors.clear();
    setIsSubmitting(true);
    try {
      await submitPurchaseInvoice({
        invoice_number: invoiceNo.trim(),
        supplier_id: supplierId,
        order_date: orderDate,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate || null,
        invoice_document_base64: invoiceDocument?.base64,
        invoice_document_mime_type: invoiceDocument?.mimeType,
        invoice_document_filename: invoiceDocument?.filename,
        items: items.map((i) => ({
          medicine_id: i.medicineId,
          category: i.category,
          subcategory: i.subcategory,
          batch_number: i.batchNumber.trim().toUpperCase(),
          expiry_date: i.expiryDate,
          quantity: i.quantity,
          purchase_price: i.purchasePrice,
          gst_percentage: i.gstPercentage,
        })),
      });
      toast.success("Purchase invoice submitted successfully");
      setInvoiceNo("");
      setSupplierId("");
      setOrderDate(new Date().toISOString().slice(0, 10));
      setInvoiceDate(new Date().toISOString().slice(0, 10));
      setDeliveryDate(new Date().toISOString().slice(0, 10));
      setInvoiceDocument(null);
      setItems([]);
      onSuccess();
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, "Failed to submit invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
      <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/20">
        <CardTitle className="text-base font-bold text-slate-800 tracking-tight flex items-center gap-1.5">
          <FileSpreadsheet className="h-5 w-5 text-primary" /> Enter Purchase
          Invoice (Bulk Stock Entry)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        {/* Invoice Metadata Header */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Invoice / Challan No.
            </Label>
            <Input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="SUP-2026-0042"
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs uppercase"
            />
            <FieldError message={apiErrors.get("invoice_number")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Supplier Company
            </Label>
            <div className="flex gap-2">
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="flex-1 h-11 rounded-xl bg-white border-slate-200 font-bold text-xs text-slate-700">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 text-xs">
                  {suppliers.length === 0 ? (
                    <div className="px-2 py-1.5 text-xs text-muted-foreground">
                      No active suppliers yet.
                    </div>
                  ) : (
                    suppliers
                      .filter((s) => s.is_active)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.company_name}
                          {!s.mobile_number ? " (needs mobile)" : ""}
                        </SelectItem>
                      ))
                  )}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setSupplierDialogOpen(true)}
                title="Add new supplier"
                className="h-11 w-11 rounded-xl border-slate-200 bg-white hover:bg-slate-50 flex-shrink-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <SupplierCreateDialog
              open={supplierDialogOpen}
              onOpenChange={setSupplierDialogOpen}
              onCreated={(s) => {
                onSupplierCreated(s);
                setSupplierId(s.id);
                setSupplierDialogOpen(false);
              }}
            />
            <FieldError message={apiErrors.get("supplier_id")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Order Date
            </Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs text-center"
            />
            <FieldError message={apiErrors.get("order_date")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Invoice Date
            </Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs text-center"
            />
            <FieldError message={apiErrors.get("invoice_date")} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500">
              Delivery Date
            </Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs text-center"
            />
            <FieldError message={apiErrors.get("delivery_date")} />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px] gap-4 rounded-2xl border border-slate-100 bg-white p-5">
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-bold text-slate-500">
                Supplier Invoice Document
              </Label>
              <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                PDF, JPG, PNG, or WEBP. Maximum 5 MB.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Input
                id="purchase-invoice-document"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleDocumentChange}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  document.getElementById("purchase-invoice-document")?.click()
                }
                className="h-10 rounded-xl border-primary/30 bg-teal-50/50 hover:bg-teal-50 text-xs font-black text-primary flex items-center gap-2"
              >
                <Upload className="h-4 w-4" />
                {invoiceDocument ? "Replace Document" : "Upload Document"}
              </Button>
              {invoiceDocument ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setInvoiceDocument(null)}
                  className="h-10 rounded-xl text-xs font-bold text-slate-500 hover:text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  Remove
                </Button>
              ) : null}
            </div>
            <FieldError message={apiErrors.get("invoice_document_base64")} />
            <FieldError message={apiErrors.get("invoice_document_mime_type")} />
          </div>
          <div className="min-h-[104px] rounded-xl border border-dashed border-slate-200 bg-slate-50/60 flex items-center justify-center overflow-hidden">
            {invoiceDocument?.previewUrl ? (
              /// eslint-disable-next-line @next/next/no-img-element
              <img
                src={invoiceDocument.previewUrl}
                alt={invoiceDocument.filename}
                className="h-full max-h-32 w-full object-cover"
              />
            ) : invoiceDocument ? (
              <div className="px-4 text-center">
                <FileSpreadsheet className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700 truncate max-w-[220px]">
                  {invoiceDocument.filename}
                </p>
                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">
                  {invoiceDocument.mimeType}
                </p>
              </div>
            ) : (
              <div className="px-4 text-center">
                <FileImage className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-400">
                  No document selected
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Invoice Items Header */}
        <div className="flex justify-between items-center px-1">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Invoice Batch Details
            </h3>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              Fill batch details, prices and GST for the selected items.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectDialogOpen(true)}
            className="h-9 px-3 rounded-xl border-primary/30 bg-teal-50/50 hover:bg-teal-50 text-xs font-black text-primary flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Select Medicines
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="py-12 border-2 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center bg-slate-50/50">
            <Boxes className="h-10 w-10 text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-400">
              No items added yet.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Select Medicines&quot; to pick items from the
              registry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50/80">
                  <TableHead className="px-4 h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                    Medicine
                  </TableHead>
                  <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                    Batch No.
                  </TableHead>
                  <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                    Expiry
                  </TableHead>
                  <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                    Qty
                  </TableHead>
                  <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                    Purchase ₹
                  </TableHead>
                  <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                    GST %
                  </TableHead>
                  <TableHead className="h-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {items.map((i) => (
                  <TableRow
                    key={i.id}
                    className="group hover:bg-slate-50/40 transition-colors"
                  >
                    <TableCell className="px-4">
                      <div className="font-extrabold text-slate-800 text-sm">
                        {i.medicineName}
                      </div>
                      <div className="text-[10px] text-slate-400 font-medium">
                        {i.category}
                        {i.subcategory ? ` · ${i.subcategory}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        value={i.batchNumber}
                        onChange={(e) =>
                          updateItem(i.id, {
                            batchNumber: e.target.value.toUpperCase(),
                          })
                        }
                        className="h-8 rounded-lg bg-slate-50 border-slate-200 font-black text-slate-700 text-xs text-center uppercase"
                        placeholder="BAT-XXXX"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={i.expiryDate}
                        onChange={(e) =>
                          updateItem(i.id, { expiryDate: e.target.value })
                        }
                        className="h-8 rounded-lg bg-slate-50 border-slate-200 font-bold text-slate-700 text-xs text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        value={i.quantity}
                        onChange={(e) =>
                          updateItem(i.id, {
                            quantity: parseInt(e.target.value) || 0,
                          })
                        }
                        className="h-8 w-20 rounded-lg bg-slate-50 border-slate-200 font-black text-slate-700 text-xs text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={i.purchasePrice}
                        onChange={(e) =>
                          updateItem(i.id, {
                            purchasePrice: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 w-24 rounded-lg bg-slate-50 border-slate-200 font-black text-primary text-xs text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.1"
                        value={i.gstPercentage}
                        onChange={(e) =>
                          updateItem(i.id, {
                            gstPercentage: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="h-8 w-20 rounded-lg bg-slate-50 border-slate-200 font-black text-purple-600 text-xs text-center"
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                        onClick={() => handleRemove(i.id)}
                        title="Remove item"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Financial Summary & Save */}
        <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">
                Unique Formulations
              </span>
              <strong className="text-xs text-slate-800 block mt-1">
                {summary.formulations} Items
              </strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">
                Loaded Volume
              </span>
              <strong className="text-xs text-teal-600 block mt-1">
                {summary.totalQty} units
              </strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-[8px] font-bold text-purple-400 uppercase tracking-wider block">
                GST Total
              </span>
              <strong className="text-xs text-purple-600 block mt-1">
                ₹
                {summary.gstTotal.toLocaleString("en-IN", {
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-[8px] font-black text-primary uppercase tracking-wider block">
                Grand Total
              </span>
              <strong className="text-sm font-black text-primary block mt-0.5">
                ₹
                {summary.grandTotal.toLocaleString("en-IN", {
                  maximumFractionDigits: 2,
                })}
              </strong>
            </div>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || items.length === 0}
            className="w-full md:w-auto bg-primary hover:bg-[#0a5c5f] text-white font-extrabold rounded-xl h-12 px-8 shadow-md shadow-teal-900/10 flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform text-xs flex-shrink-0"
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" /> Submitting…
              </>
            ) : (
              "Submit Invoice"
            )}
          </Button>
        </div>
      </CardContent>

      {/* Medicine Selection Dialog */}
      <Dialog open={selectDialogOpen} onOpenChange={setSelectDialogOpen}>
        <DialogContent className="sm:max-w-[600px] bg-white rounded-2xl border-slate-100 p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="text-lg font-black text-slate-800">
              Select Medicines for Invoice
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              Check all the items that are present on this invoice.
            </DialogDescription>
          </DialogHeader>
          <div className="p-2 max-h-[350px] overflow-y-auto bg-slate-50/30">
            {medicines.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold">
                No medicines registered yet
              </div>
            ) : (
              <div className="space-y-1 px-4 py-2">
                {medicines.map((m) => {
                  const checked = selectedIds.includes(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex items-start gap-3 p-3 hover:bg-slate-50 rounded-xl cursor-pointer border border-transparent hover:border-slate-200 transition-all"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(c) => {
                          if (c) {
                            setSelectedIds((prev) => [...prev, m.id]);
                          } else {
                            setSelectedIds((prev) =>
                              prev.filter((id) => id !== m.id),
                            );
                          }
                        }}
                        className="mt-0.5 rounded-md border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-black text-slate-800 truncate">
                          {m.name}
                        </div>
                        <div className="text-xs text-slate-500 truncate">
                          {m.salt} · {m.category}
                          {m.bup_category ? ` · ${m.bup_category}` : ""}
                        </div>
                      </div>
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase font-bold text-slate-500"
                      >
                        {m.category}
                      </Badge>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          <DialogFooter className="p-4 border-t border-slate-100 bg-white">
            <Button
              variant="ghost"
              onClick={() => {
                setSelectedIds([]);
                setSelectDialogOpen(false);
              }}
              className="rounded-xl text-xs font-bold"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSelection}
              className="rounded-xl bg-primary hover:bg-[#0a5c5f] text-xs font-bold text-white"
            >
              Add {selectedIds.length} medicine(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

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

const SUPPLIER_CATEGORY_OPTIONS: SupplierCategory[] = ["BUP", "Rx", "NRx"];

function SupplierCreateDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (supplier: Supplier) => void;
}) {
  const [companyName, setCompanyName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [fullAddress, setFullAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [drugLicenseNumber, setDrugLicenseNumber] = useState("");
  const [categories, setCategories] = useState<SupplierCategory[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiErrors = useApiErrors();

  const reset = () => {
    apiErrors.clear();
    setCompanyName("");
    setMobileNumber("");
    setContactPerson("");
    setEmail("");
    setFullAddress("");
    setGstNumber("");
    setDrugLicenseNumber("");
    setCategories([]);
  };

  const toggleCategory = (cat: SupplierCategory) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  };

  const handleSubmit = async () => {
    if (!companyName.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (!mobileNumber.trim()) {
      toast.error("Mobile number is required");
      return;
    }
    apiErrors.clear();
    setIsSubmitting(true);
    try {
      const created = await createSupplier({
        company_name: companyName.trim(),
        mobile_number: mobileNumber.trim(),
        contact_person: contactPerson.trim(),
        email: email.trim() || null,
        full_address: fullAddress.trim(),
        gst_number: gstNumber.trim() || null,
        drug_license_number: drugLicenseNumber.trim() || null,
        categories,
      });
      toast.success(`Supplier "${created.company_name}" added.`);
      reset();
      onCreated(created);
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, "Failed to add supplier");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Supplier</DialogTitle>
          <DialogDescription>
            New suppliers become immediately available in the picker. Required:
            company name & mobile number.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Company name *</Label>
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Abbott Healthcare Ltd"
              className="mt-1"
            />
            <FieldError message={apiErrors.get("company_name")} />
          </div>
          <div>
            <Label>Mobile number *</Label>
            <Input
              value={mobileNumber}
              onChange={(e) => setMobileNumber(e.target.value)}
              placeholder="10-digit mobile"
              className="mt-1"
            />
            <FieldError message={apiErrors.get("mobile_number")} />
          </div>
          <div>
            <Label>Contact person</Label>
            <Input
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
              className="mt-1"
            />
            <FieldError message={apiErrors.get("contact_person")} />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
            />
            <FieldError message={apiErrors.get("email")} />
          </div>
          <div>
            <Label>GST number</Label>
            <Input
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className="mt-1"
            />
            <FieldError message={apiErrors.get("gst_number")} />
          </div>
          <div>
            <Label>Drug license number</Label>
            <Input
              value={drugLicenseNumber}
              onChange={(e) => setDrugLicenseNumber(e.target.value)}
              className="mt-1"
            />
            <FieldError message={apiErrors.get("drug_license_number")} />
          </div>
          <div className="md:col-span-2">
            <Label>Full address</Label>
            <Textarea
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              className="mt-1"
              rows={2}
            />
            <FieldError message={apiErrors.get("full_address")} />
          </div>
          <div className="md:col-span-2">
            <Label>Categories supplied</Label>
            <div className="flex gap-3 mt-2">
              {SUPPLIER_CATEGORY_OPTIONS.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={categories.includes(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  {cat}
                </label>
              ))}
            </div>
            <FieldError message={apiErrors.get("categories")} />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Add supplier
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
