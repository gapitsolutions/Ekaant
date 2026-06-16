"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CreditCard,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Printer,
  Search,
  Shield,
  ShieldOff,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  createSupplier,
  deactivateSupplier,
  getInventoryMedicines,
  getSupplier,
  getSupplierLedger,
  getSupplierSummary,
  listPurchaseInvoices,
  listSuppliers,
  recordSupplierPayment,
  updateInventoryMedicine,
  updatePurchaseInvoiceForm6,
  updateSupplier,
  type Medicine,
  type PurchaseInvoiceListItem,
  type Supplier,
  type SupplierCategory,
  type SupplierLedgerResponse,
  type SupplierSummary,
  type SupplierWritePayload,
} from "@/lib/pharmacy-api";
import { generatePurchaseOrderPdf } from "@/lib/export/generatePurchaseOrderPdf";
import { generateSupplierLedgerPdf } from "@/lib/export/generateSupplierLedgerPdf";
import { PurchaseInvoiceForm } from "@/components/pharmacy/purchase-invoice-form";
import { MedicineFormDialog } from "@/components/pharmacy/medicine-form-dialog";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import { FieldError } from "@/components/ui/field-error";
import { ListPagination } from "@/components/ui/list-pagination";


const CATEGORY_OPTIONS: SupplierCategory[] = ["BUP", "Rx", "NRx"];


type CategoryFilter = "all" | SupplierCategory;
type StatusFilter = "active" | "inactive" | "all";


export default function SuppliersPage() {
  const [items, setItems] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  // The "Outstanding Dues" KPI card toggles a server-side has_dues filter.
  const [duesOnly, setDuesOnly] = useState(false);
  const [summary, setSummary] = useState<SupplierSummary | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [globalInvoiceOpen, setGlobalInvoiceOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  // When set, the page swaps the directory for the per-supplier vendor
  // console (Products + Invoice History tabs).
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(
    null,
  );
  const [deactivateTarget, setDeactivateTarget] = useState<Supplier | null>(
    null,
  );
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
  });

  const load = useCallback(
    async (overrides?: { page?: number }) => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await listSuppliers({
          q: searchQuery || undefined,
          category:
            categoryFilter === "all" ? undefined : categoryFilter,
          is_active:
            statusFilter === "all"
              ? undefined
              : statusFilter === "active",
          has_dues: duesOnly || undefined,
          page: overrides?.page ?? 1,
          pageSize: 50,
        });
        setItems(data.items || []);
        setPagination(data.pagination);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load suppliers.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, categoryFilter, statusFilter, duesOnly],
  );

  // KPI cards come from a dedicated aggregate (not the paginated list).
  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getSupplierSummary());
    } catch {
      /* non-fatal — the cards just stay blank */
    }
  }, []);

  useEffect(() => {
    // Filter change → always reset to the first page.
    setPage(1);
    load({ page: 1 });
    // load is captured each render; this is intentional — we want the latest
    // filters in scope when load fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter, duesOnly]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const goToPage = (next: number) => {
    setPage(next);
    load({ page: next });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    load({ page: 1 });
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivateSupplier(deactivateTarget.id);
      toast.success(
        `Supplier "${deactivateTarget.company_name}" deactivated.`,
      );
      setDeactivateTarget(null);
      load();
      loadSummary();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to deactivate",
      );
    }
  };

  const handleReactivate = async (supplier: Supplier) => {
    try {
      await updateSupplier(supplier.id, { is_active: true });
      toast.success(`Supplier "${supplier.company_name}" reactivated.`);
      load();
      loadSummary();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reactivate",
      );
    }
  };

  if (selectedSupplier) {
    return (
      <SupplierDetailView
        initialSupplier={selectedSupplier}
        onBack={() => {
          setSelectedSupplier(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <PageHeader
        icon={<Building2 className="h-7 w-7 text-primary" />}
        title="Suppliers"
        subtitle="Pharmaceutical wholesalers and distributors. Soft-deactivate removes from selection without affecting historical invoices."
        actions={
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setGlobalInvoiceOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl h-10 px-4 shadow-md flex items-center gap-2 hover:scale-[1.01] transition-transform"
            >
              <FileText className="h-4 w-4 mr-1" />
              Add Invoice
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-primary hover:bg-primary-dark text-white font-extrabold rounded-xl h-10 px-4 shadow-md shadow-teal-900/10 flex items-center gap-2 hover:scale-[1.01] transition-transform"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add supplier
            </Button>
          </div>
        }
      />

      {/* KPI filter cards — totals come from the summary aggregate, not the page. */}
      <div className="grid gap-6 md:grid-cols-3">
        <KpiCard
          active={categoryFilter === "all" && !duesOnly && statusFilter === "active"}
          onClick={() => {
            setCategoryFilter("all");
            setStatusFilter("active");
            setDuesOnly(false);
          }}
          label="Total Vendors"
          value={summary ? String(summary.active) : "—"}
          hint="Active registered suppliers"
          icon={<Building2 className="h-5 w-5" />}
          accent="primary"
        />
        <KpiCard
          active={categoryFilter === "BUP" && !duesOnly}
          onClick={() => {
            setCategoryFilter("BUP");
            setStatusFilter("active");
            setDuesOnly(false);
          }}
          label="BUP Controlled"
          value={summary ? String(summary.by_category?.BUP ?? 0) : "—"}
          hint="Suppliers of controlled meds"
          icon={<Shield className="h-5 w-5" />}
          accent="rose"
        />
        <KpiCard
          active={duesOnly}
          onClick={() => {
            setDuesOnly(true);
            setCategoryFilter("all");
            setStatusFilter("active");
          }}
          label="Outstanding Dues"
          value={summary ? money(summary.outstanding_total) : "—"}
          hint={
            summary
              ? `${summary.suppliers_with_dues} supplier${summary.suppliers_with_dues === 1 ? "" : "s"} require action`
              : ""
          }
          icon={<CreditCard className="h-5 w-5" />}
          accent="amber"
        />
      </div>

      <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/30 border-b border-slate-100 py-6 px-6">
          <CardTitle className="text-xl font-bold text-slate-800 tracking-tight">Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 p-6">
          <div className="flex flex-wrap gap-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search company / contact / GST / mobile"
                  className="pl-8 bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
              <Button type="submit" variant="outline" className="rounded-xl border-slate-200">
                Search
              </Button>
            </form>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
            >
              <SelectTrigger className="w-[160px] rounded-xl border-slate-200 bg-slate-50">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CATEGORY_OPTIONS.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as StatusFilter)}
            >
              <SelectTrigger className="w-[140px] rounded-xl border-slate-200 bg-slate-50">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {errorMessage && (
            <div className="flex items-center gap-2 text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-xl px-4 py-3">
              <AlertTriangle className="h-4 w-4" /> {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              className="py-24"
              icon={
                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                  <Building2 className="h-7 w-7 text-slate-300" />
                </div>
              }
              title="No suppliers found"
              description="No suppliers match the current filters."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-100">
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Company Name &amp; Info</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Contact Incharge</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Mapped Products</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Outstanding Dues</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                      <TableCell className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedSupplier(s)}
                          className="text-left font-extrabold text-primary hover:underline inline-flex items-center gap-1 group/name text-base"
                        >
                          {s.company_name}
                          <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover/name:opacity-100 group-hover/name:translate-x-0.5 transition-all" />
                        </button>
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {s.categories.map((cat) => (
                            <Badge key={cat} variant="outline" className="border-slate-200 text-slate-600 text-[9px] font-bold uppercase px-1.5 py-0 h-4 leading-none">
                              {cat}
                            </Badge>
                          ))}
                        </div>
                        {s.full_address && (
                          <p className="text-xs text-slate-400 font-medium flex items-center gap-1 mt-1.5">
                            <MapPin className="h-3 w-3 text-slate-300 shrink-0" /> {s.full_address}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="py-4 px-4 align-top">
                        <p className="font-bold text-slate-700 text-sm">
                          {s.contact_person || <span className="text-slate-400 font-normal">—</span>}
                        </p>
                        <div className="flex flex-col gap-0.5 mt-1">
                          {s.mobile_number ? (
                            <p className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                              <Phone className="h-3 w-3 text-slate-300" /> {s.mobile_number}
                            </p>
                          ) : (
                            <p className="text-xs text-amber-600 font-semibold">needs mobile</p>
                          )}
                          {s.email && (
                            <p className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                              <Mail className="h-3 w-3 text-slate-300" /> {s.email}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4 px-4 text-center align-top">
                        <span className="inline-flex px-2.5 py-1 text-xs font-bold text-slate-500 bg-slate-50 border border-slate-200 rounded-xl">
                          {s.product_count ?? 0} Products
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-4 px-4 align-top">
                        <span
                          className={`inline-flex px-3 py-1 rounded-xl text-sm font-extrabold border ${
                            parseFloat(s.outstanding_payable) > 0
                              ? "bg-rose-50 text-rose-600 border-rose-100"
                              : "bg-slate-50 text-slate-500 border-slate-200"
                          }`}
                        >
                          {money(s.outstanding_payable)}
                        </span>
                      </TableCell>
                      <TableCell className="py-4 px-4 align-top">
                        {s.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50 text-[10px] font-bold uppercase">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right py-4 px-4">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-lg hover:bg-slate-100"
                            onClick={() => setEditTarget(s)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4 text-slate-500" />
                          </Button>
                          {s.is_active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-lg hover:bg-rose-50"
                              onClick={() => setDeactivateTarget(s)}
                              title="Deactivate"
                            >
                              <ShieldOff className="h-4 w-4 text-rose-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-lg hover:bg-emerald-50"
                              onClick={() => handleReactivate(s)}
                              title="Reactivate"
                            >
                              <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ListPagination
                page={page}
                pageSize={pagination.pageSize}
                total={pagination.total}
                noun="supplier"
                onPrev={() => goToPage(page - 1)}
                onNext={() => goToPage(page + 1)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <SupplierFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false);
          load();
          loadSummary();
        }}
      />
      <SupplierFormDialog
        open={editTarget !== null}
        existing={editTarget}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        onSaved={() => {
          setEditTarget(null);
          load();
          loadSummary();
        }}
      />
      <InvoiceFormDialog
        open={globalInvoiceOpen}
        onOpenChange={setGlobalInvoiceOpen}
        onSaved={() => {
          setGlobalInvoiceOpen(false);
          load();
          loadSummary();
        }}
      />

      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeactivateTarget(null);
        }}
      >
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Deactivate supplier?</DialogTitle>
            <DialogDescription className="text-slate-500">
              {deactivateTarget?.company_name} will be hidden from the supplier
              picker in the purchase invoice form. Historical invoices remain
              linked. You can reactivate the supplier any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl border-slate-200"
              onClick={() => setDeactivateTarget(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleDeactivate} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl">
              <ShieldOff className="h-4 w-4 mr-2" />
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


const KPI_ACCENTS = {
  primary: {
    ring: "ring-primary/20 border-primary/30 bg-primary/5",
    value: "text-slate-900",
    iconActive: "bg-primary text-white",
  },
  rose: {
    ring: "ring-rose-500/20 border-rose-200 bg-rose-50/60",
    value: "text-rose-600",
    iconActive: "bg-rose-600 text-white",
  },
  amber: {
    ring: "ring-amber-500/20 border-amber-200 bg-amber-50/60",
    value: "text-amber-600",
    iconActive: "bg-amber-500 text-white",
  },
} as const;

function KpiCard({
  active,
  onClick,
  label,
  value,
  hint,
  icon,
  accent,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent: keyof typeof KPI_ACCENTS;
}) {
  const a = KPI_ACCENTS[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border shadow-sm transition-all hover:scale-[1.01] hover:shadow-md ${
        active ? `ring-2 ${a.ring}` : "bg-white border-slate-100 opacity-80 hover:opacity-100"
      }`}
    >
      <div className="p-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-extrabold mt-1 ${active ? a.value : "text-slate-900"}`}>{value}</p>
          {hint && <p className="text-xs text-slate-400 font-medium pt-1">{hint}</p>}
        </div>
        <div className={`p-3 rounded-2xl transition-all ${active ? a.iconActive : "bg-slate-50 text-slate-600"}`}>
          {icon}
        </div>
      </div>
    </button>
  );
}

function SupplierFormDialog({
  open,
  existing,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  existing?: Supplier | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = existing != null;
  const [form, setForm] = useState<SupplierWritePayload>({
    company_name: "",
    mobile_number: "",
    contact_person: "",
    email: "",
    full_address: "",
    gst_number: "",
    drug_license_number: "",
    categories: [],
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiErrors = useApiErrors();

  useEffect(() => {
    apiErrors.clear();
    if (existing) {
      setForm({
        company_name: existing.company_name,
        mobile_number: existing.mobile_number ?? "",
        contact_person: existing.contact_person,
        email: existing.email ?? "",
        full_address: existing.full_address,
        gst_number: existing.gst_number ?? "",
        drug_license_number: existing.drug_license_number ?? "",
        categories: existing.categories,
      });
    } else if (open) {
      setForm({
        company_name: "",
        mobile_number: "",
        contact_person: "",
        email: "",
        full_address: "",
        gst_number: "",
        drug_license_number: "",
        categories: [],
      });
    }
    // apiErrors is stable across renders via useCallback; we only re-run on
    // open/existing changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, open]);

  const set = useCallback(
    <K extends keyof SupplierWritePayload>(
      key: K,
      value: SupplierWritePayload[K],
    ) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const toggleCategory = (cat: SupplierCategory) => {
    setForm((prev) => ({
      ...prev,
      categories: prev.categories?.includes(cat)
        ? prev.categories.filter((c) => c !== cat)
        : [...(prev.categories ?? []), cat],
    }));
  };

  const handleSubmit = async () => {
    if (!form.company_name?.trim()) {
      toast.error("Company name is required");
      return;
    }
    if (!form.mobile_number?.trim()) {
      toast.error("Mobile number is required");
      return;
    }
    apiErrors.clear();
    setIsSubmitting(true);
    try {
      if (isEdit && existing) {
        await updateSupplier(existing.id, {
          company_name: form.company_name.trim(),
          mobile_number: form.mobile_number.trim(),
          contact_person: form.contact_person?.trim() || "",
          email: form.email?.trim() || null,
          full_address: form.full_address?.trim() || "",
          gst_number: form.gst_number?.trim() || null,
          drug_license_number: form.drug_license_number?.trim() || null,
          categories: form.categories ?? [],
        });
        toast.success("Supplier updated");
      } else {
        await createSupplier({
          company_name: form.company_name.trim(),
          mobile_number: form.mobile_number.trim(),
          contact_person: form.contact_person?.trim() || "",
          email: form.email?.trim() || null,
          full_address: form.full_address?.trim() || "",
          gst_number: form.gst_number?.trim() || null,
          drug_license_number: form.drug_license_number?.trim() || null,
          categories: form.categories ?? [],
        });
        toast.success("Supplier added");
      }
      onSaved();
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(
        error,
        isEdit ? "Failed to update supplier" : "Failed to add supplier",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-2xl rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800">{isEdit ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          <DialogDescription className="text-slate-500">
            Required: company name and mobile number. Optional fields can be
            filled later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label className="font-bold text-slate-700">Company name *</Label>
            <Input
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
            />
            <FieldError message={apiErrors.get("company_name")} />
          </div>
          <div>
            <Label className="font-bold text-slate-700">Mobile number *</Label>
            <Input
              value={form.mobile_number}
              onChange={(e) => set("mobile_number", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
            />
            <FieldError message={apiErrors.get("mobile_number")} />
          </div>
          <div>
            <Label className="font-bold text-slate-700">Contact person</Label>
            <Input
              value={form.contact_person ?? ""}
              onChange={(e) => set("contact_person", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
            />
            <FieldError message={apiErrors.get("contact_person")} />
          </div>
          <div>
            <Label className="font-bold text-slate-700">Email</Label>
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
            />
            <FieldError message={apiErrors.get("email")} />
          </div>
          <div>
            <Label className="font-bold text-slate-700">GST number</Label>
            <Input
              value={form.gst_number ?? ""}
              onChange={(e) => set("gst_number", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
            />
            <FieldError message={apiErrors.get("gst_number")} />
          </div>
          <div>
            <Label className="font-bold text-slate-700">Drug license number</Label>
            <Input
              value={form.drug_license_number ?? ""}
              onChange={(e) => set("drug_license_number", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
            />
            <FieldError message={apiErrors.get("drug_license_number")} />
          </div>
          <div className="md:col-span-2">
            <Label className="font-bold text-slate-700">Full address</Label>
            <Textarea
              value={form.full_address ?? ""}
              onChange={(e) => set("full_address", e.target.value)}
              className="mt-1.5 bg-slate-50 border-slate-200"
              rows={2}
            />
            <FieldError message={apiErrors.get("full_address")} />
          </div>
          <div className="md:col-span-2">
            <Label className="font-bold text-slate-700">Categories supplied</Label>
            <div className="flex gap-4 mt-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 text-sm cursor-pointer font-medium text-slate-600"
                >
                  <Checkbox
                    checked={(form.categories ?? []).includes(cat)}
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
            className="rounded-xl border-slate-200"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-primary hover:bg-primary-dark text-white rounded-xl">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


// ──────────────────────────────────────────────────────────────────────────
// Supplier detail / vendor console
// ──────────────────────────────────────────────────────────────────────────

function money(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? parseFloat(value) : value ?? 0;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function SupplierDetailView({
  initialSupplier,
  onBack,
}: {
  initialSupplier: Supplier;
  onBack: () => void;
}) {
  const [supplier, setSupplier] = useState<Supplier>(initialSupplier);
  const [editOpen, setEditOpen] = useState(false);

  const [products, setProducts] = useState<Medicine[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [invoices, setInvoices] = useState<PurchaseInvoiceListItem[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("ledger");

  const [addProductOpen, setAddProductOpen] = useState(false);
  const [registerMedicineOpen, setRegisterMedicineOpen] = useState(false);
  const [addInvoiceOpen, setAddInvoiceOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [poOpen, setPoOpen] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  const [invoiceDetail, setInvoiceDetail] =
    useState<PurchaseInvoiceListItem | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [ledger, setLedger] = useState<SupplierLedgerResponse | null>(null);
  const [isLoadingLedger, setIsLoadingLedger] = useState(true);
  const [ledgerFilter, setLedgerFilter] = useState<"all" | "invoice" | "payment">("all");
  const [ledgerSearch, setLedgerSearch] = useState("");

  const reloadSupplier = useCallback(async () => {
    try {
      const fresh = await getSupplier(supplier.id);
      setSupplier(fresh);
    } catch {
      /* keep stale copy on failure */
    }
  }, [supplier.id]);

  const handleDeactivate = async () => {
    setIsTogglingActive(true);
    try {
      await deactivateSupplier(supplier.id);
      toast.success(`Supplier "${supplier.company_name}" deactivated.`);
      setConfirmDeactivateOpen(false);
      await reloadSupplier();
    } catch (error) {
      toastApiError(error, "Failed to deactivate supplier");
    } finally {
      setIsTogglingActive(false);
    }
  };

  const handleReactivate = async () => {
    setIsTogglingActive(true);
    try {
      await updateSupplier(supplier.id, { is_active: true });
      toast.success(`Supplier "${supplier.company_name}" reactivated.`);
      await reloadSupplier();
    } catch (error) {
      toastApiError(error, "Failed to reactivate supplier");
    } finally {
      setIsTogglingActive(false);
    }
  };

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    try {
      const data = await getInventoryMedicines({ supplier: supplier.id });
      setProducts(data.items || []);
      setProductsLoaded(true);
    } catch (error) {
      toastApiError(error, "Failed to load products");
    } finally {
      setIsLoadingProducts(false);
    }
  }, [supplier.id]);

  const loadInvoices = useCallback(async () => {
    setIsLoadingInvoices(true);
    try {
      const data = await listPurchaseInvoices({ supplier: supplier.id });
      setInvoices(data.items || []);
      setInvoicesLoaded(true);
    } catch (error) {
      toastApiError(error, "Failed to load invoices");
    } finally {
      setIsLoadingInvoices(false);
    }
  }, [supplier.id]);

  const loadLedger = useCallback(async () => {
    setIsLoadingLedger(true);
    try {
      const data = await getSupplierLedger(supplier.id);
      setLedger(data);
    } catch (error) {
      toastApiError(error, "Failed to load ledger");
    } finally {
      setIsLoadingLedger(false);
    }
  }, [supplier.id]);

  // Products feed the Products tab AND the Add-Invoice / Order-Generator
  // dialogs; fetch once, on first need. Invoices feed only their tab.
  const ensureProducts = useCallback(() => {
    if (!productsLoaded) void loadProducts();
  }, [productsLoaded, loadProducts]);

  const ensureInvoices = useCallback(() => {
    if (!invoicesLoaded) void loadInvoices();
  }, [invoicesLoaded, loadInvoices]);

  // Ledger is eager — it backs the always-visible Financial Summary and the
  // default Ledger tab. Products/invoices load lazily (see ensure* above).
  useEffect(() => {
    loadLedger();
  }, [loadLedger]);

  const filteredLedger = (ledger?.entries || []).filter((e) => {
    if (ledgerFilter === "invoice" && e.entry_type !== "invoice") return false;
    if (ledgerFilter === "payment" && e.entry_type !== "payment") return false;
    // Client-side search (no backend call) over the already-loaded rows —
    // description, invoice no., reference, payment mode, and type.
    const q = ledgerSearch.trim().toLowerCase();
    if (!q) return true;
    return [
      e.note,
      e.invoice_number,
      e.reference,
      e.payment_mode,
      e.entry_type,
    ]
      .filter(Boolean)
      .some((field) => field.toLowerCase().includes(q));
  });

  const handleToggleForm6 = async (
    inv: PurchaseInvoiceListItem,
    next: boolean,
  ) => {
    setTogglingId(inv.id);
    try {
      const updated = await updatePurchaseInvoiceForm6(inv.id, next);
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? updated : i)));
      toast.success(`Form 6 set to ${next ? "YES" : "NO"} for ${inv.invoice_number}`);
    } catch (error) {
      toastApiError(error, "Failed to update Form 6");
    } finally {
      setTogglingId(null);
    }
  };

  const totalInvoiced = invoices.reduce(
    (sum, i) => sum + (parseFloat(i.total_amount) || 0),
    0,
  );

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors w-fit"
      >
        <ArrowLeft className="h-4 w-4" /> Back to suppliers
      </button>

      {/* Header */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white shadow-sm">
        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-16 w-16 shrink-0 rounded-full bg-primary flex items-center justify-center text-xl font-bold border-4 border-white/10 shadow-inner uppercase">
              {supplier.company_name.substring(0, 2)}
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">
                {supplier.company_name}
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-2">
                {supplier.is_active ? (
                  <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold uppercase">
                    Active
                  </Badge>
                ) : (
                  <Badge className="bg-rose-500/20 text-rose-200 border border-rose-400/30 text-[10px] font-bold uppercase">
                    Inactive
                  </Badge>
                )}
                {supplier.categories.map((cat) => (
                  <Badge
                    key={cat}
                    variant="outline"
                    className="border-white/20 text-slate-200 text-[10px] font-bold uppercase"
                  >
                    {cat}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Consolidated action bar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => {
                ensureProducts();
                setPoOpen(true);
              }}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl h-10 px-3.5 border-0"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" /> Order Generator
            </Button>
            <Button
              onClick={() => {
                ensureProducts();
                setAddInvoiceOpen(true);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl h-10 px-3.5 border-0"
            >
              <FileText className="h-4 w-4 mr-1.5" /> Add Invoice
            </Button>
            <Button
              onClick={() => setPaymentOpen(true)}
              className="bg-primary hover:bg-primary-dark text-white font-bold rounded-xl h-10 px-3.5 border-0"
            >
              <CreditCard className="h-4 w-4 mr-1.5" /> Make Payment
            </Button>
            <Button
              onClick={() => setAddProductOpen(true)}
              className="bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl h-10 px-3.5 border-0"
            >
              <Plus className="h-4 w-4 mr-1.5 text-primary" /> Add Product
            </Button>
            <div className="hidden xl:block w-px h-8 bg-white/10 mx-1" />
            <Button
              onClick={() => setEditOpen(true)}
              variant="ghost"
              size="icon"
              title="Edit supplier"
              className="h-10 w-10 rounded-xl bg-white/5 text-slate-300 hover:text-white hover:bg-white/10 border border-white/10"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            {supplier.is_active ? (
              <Button
                onClick={() => setConfirmDeactivateOpen(true)}
                variant="ghost"
                size="icon"
                title="Deactivate supplier"
                className="h-10 w-10 rounded-xl bg-white/5 text-slate-300 hover:text-rose-400 hover:bg-rose-500/10 border border-white/10"
              >
                <ShieldOff className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                onClick={handleReactivate}
                disabled={isTogglingActive}
                variant="ghost"
                size="icon"
                title="Reactivate supplier"
                className="h-10 w-10 rounded-xl bg-white/5 text-slate-300 hover:text-emerald-300 hover:bg-emerald-500/10 border border-white/10"
              >
                <ShieldCheck className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 border-t border-white/10 pt-6">
          <DetailMeta icon={<Building2 className="h-3 w-3" />} label="Incharge" value={supplier.contact_person || "—"} />
          <DetailMeta icon={<Phone className="h-3 w-3" />} label="Contact" value={supplier.mobile_number || "—"} />
          <DetailMeta icon={<Mail className="h-3 w-3" />} label="Email" value={supplier.email || "—"} />
          <DetailMeta icon={<MapPin className="h-3 w-3" />} label="Address" value={supplier.full_address || "—"} />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2 px-4 py-3 bg-slate-50/50">
            <Shield className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold text-slate-900">License Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-2 gap-4 items-center min-h-[88px]">
            <div className="bg-slate-50/60 border border-slate-100 p-3 rounded-xl flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider leading-none">GST Number (Tax ID)</span>
                <strong className="text-[11px] sm:text-xs font-extrabold text-slate-800 block mt-1.5 leading-none font-mono truncate">
                  {supplier.gst_number || "N/A"}
                </strong>
              </div>
            </div>
            <div className="bg-slate-50/60 border border-slate-100 p-3 rounded-xl flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-500 shrink-0">
                <Shield className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wider leading-none">Drug License No.</span>
                <strong className="text-[11px] sm:text-xs font-extrabold text-slate-800 block mt-1.5 leading-none font-mono truncate">
                  {supplier.drug_license_number || "N/A"}
                </strong>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
          <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2 px-4 py-3 bg-slate-50/50">
            <CreditCard className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold text-slate-900">Financial Summary</CardTitle>
          </CardHeader>
          <CardContent className="p-4 grid grid-cols-3 gap-2 text-center divide-x divide-slate-100">
            <div className="px-1">
              <p className="text-xl font-extrabold text-rose-500">{money(ledger?.summary.outstanding ?? supplier.outstanding_payable)}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Pending</p>
            </div>
            <div className="px-1">
              <p className="text-xl font-extrabold text-emerald-600">{money(ledger?.summary.total_paid ?? "0")}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Total Paid</p>
            </div>
            <div className="px-1">
              <p className="text-xl font-extrabold text-slate-900">{money(ledger?.summary.total_invoiced ?? totalInvoiced)}</p>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">Total Invoiced</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Card className="rounded-2xl border-slate-200 shadow-sm bg-white overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => {
            setActiveTab(v);
            if (v === "products") ensureProducts();
            else if (v === "invoices") ensureInvoices();
          }}
          className="w-full"
        >
          <TabsList className="w-full justify-start rounded-none border-b border-slate-200 bg-white p-0 h-auto gap-2 px-2 pt-2">
            <TabsTrigger value="ledger" className="rounded-t-lg rounded-b-none border-0 data-[state=active]:bg-slate-800 data-[state=active]:text-white px-6 py-3 font-bold text-slate-500">
              <CreditCard className="h-4 w-4 mr-2" /> Ledger
            </TabsTrigger>
            <TabsTrigger value="products" className="rounded-t-lg rounded-b-none border-0 data-[state=active]:bg-slate-800 data-[state=active]:text-white px-6 py-3 font-bold text-slate-500">
              <Package className="h-4 w-4 mr-2" /> Products
            </TabsTrigger>
            <TabsTrigger value="invoices" className="rounded-t-lg rounded-b-none border-0 data-[state=active]:bg-slate-800 data-[state=active]:text-white px-6 py-3 font-bold text-slate-500">
              <FileText className="h-4 w-4 mr-2" /> Invoice History
            </TabsTrigger>
          </TabsList>

          {/* Ledger tab */}
          <TabsContent value="ledger" className="m-0">
            <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
              <div className="flex bg-slate-200/60 p-1 rounded-xl gap-1">
                {(["all", "invoice", "payment"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setLedgerFilter(f)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg capitalize transition-all ${ledgerFilter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                  >
                    {f === "all" ? "All" : f + "s"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                  <Input
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search ledger…"
                    className="pl-8 h-9 w-[200px] bg-white border-slate-200 rounded-xl text-xs"
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (!ledger) return;
                    void generateSupplierLedgerPdf({
                      supplier: {
                        company_name: supplier.company_name,
                        gst_number: supplier.gst_number,
                        full_address: supplier.full_address,
                      },
                      summary: ledger.summary,
                      rows: filteredLedger,
                    });
                  }}
                  disabled={!ledger || filteredLedger.length === 0}
                  className="h-9 rounded-xl border-slate-200 text-xs font-bold text-slate-600"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" /> Print Ledger
                </Button>
              </div>
            </div>
            {isLoadingLedger ? (
              <div className="flex items-center justify-center py-16">
                <Spinner className="h-6 w-6 text-primary" />
              </div>
            ) : filteredLedger.length === 0 ? (
              <EmptyState
                className="py-16"
                icon={
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                    <CreditCard className="h-7 w-7 text-slate-300" />
                  </div>
                }
                title="No ledger entries"
                description="Booking an invoice or recording a payment creates ledger rows here."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Date</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Description</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-emerald-600 text-right">Debit (Paid)</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-rose-500 text-right">Credit (Invoice)</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLedger.map((e) => {
                      const debit = parseFloat(e.debit) || 0;
                      const credit = parseFloat(e.credit) || 0;
                      const desc =
                        e.entry_type === "invoice"
                          ? e.note || `Invoice ${e.invoice_number}`
                          : `Payment${e.payment_mode ? ` via ${e.payment_mode}` : ""}${e.reference ? ` (Ref: ${e.reference})` : ""}${e.note ? ` — ${e.note}` : ""}`;
                      return (
                        <TableRow key={e.id} className="hover:bg-slate-50/50">
                          <TableCell className="py-3.5 px-4 font-semibold text-slate-800">
                            {new Date(e.date).toLocaleDateString("en-IN")}
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-slate-600">{desc}</TableCell>
                          <TableCell className="py-3.5 px-4 text-right font-bold text-emerald-600 font-mono">{debit > 0 ? money(debit) : "—"}</TableCell>
                          <TableCell className="py-3.5 px-4 text-right font-bold text-rose-500 font-mono">{credit > 0 ? money(credit) : "—"}</TableCell>
                          <TableCell className="py-3.5 px-4 text-right font-extrabold text-slate-900 font-mono">{money(e.balance)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Products tab */}
          <TabsContent value="products" className="m-0">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-sm font-bold text-slate-700">
                Price catalog / Products mapped
              </span>
              <Badge className="bg-primary text-white px-3 py-1 font-semibold rounded-full text-xs border-0">
                {products.length} Products
              </Badge>
            </div>
            {isLoadingProducts ? (
              <div className="flex items-center justify-center py-16">
                <Spinner className="h-6 w-6 text-primary" />
              </div>
            ) : products.length === 0 ? (
              <EmptyState
                className="py-16"
                icon={
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                    <Package className="h-7 w-7 text-slate-300" />
                  </div>
                }
                title="No products yet"
                description="Add a product supplied by this vendor, or link existing medicines."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Product</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Salt</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Category</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">MRP</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-primary text-right">Selling</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Reorder</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Balance Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((m) => {
                      const stock = (m.batches || []).reduce(
                        (sum, b) => sum + (b.quantity || 0),
                        0,
                      );
                      return (
                        <TableRow key={m.id} className="hover:bg-slate-50/50">
                          <TableCell className="py-3.5 px-4 font-bold text-slate-800">{m.name}</TableCell>
                          <TableCell className="py-3.5 px-4 text-slate-600">{m.salt}</TableCell>
                          <TableCell className="py-3.5 px-4 text-center">
                            <Badge variant="outline" className="border-slate-200 text-slate-600 text-[10px] font-bold uppercase">
                              {m.category}
                              {m.bup_category ? ` · ${m.bup_category}` : ""}
                            </Badge>
                          </TableCell>
                          <TableCell className="py-3.5 px-4 text-right font-mono text-slate-700">{money(m.mrp)}</TableCell>
                          <TableCell className="py-3.5 px-4 text-right font-mono font-bold text-primary">{money(m.selling_price)}</TableCell>
                          <TableCell className="py-3.5 px-4 text-center font-mono text-slate-500 text-xs">{m.reorder_level}</TableCell>
                          <TableCell className="py-3.5 px-4 text-center">
                            <span className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-lg border ${stock <= m.reorder_level ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}`}>
                              {stock} tabs
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Invoice History tab */}
          <TabsContent value="invoices" className="m-0">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-sm font-bold text-slate-700">
                Purchase invoices from this supplier
              </span>
              <Badge className="bg-slate-100 text-slate-600 px-3 py-1 font-semibold rounded-full text-xs border-0">
                {invoices.length} Invoices
              </Badge>
            </div>
            {isLoadingInvoices ? (
              <div className="flex items-center justify-center py-16">
                <Spinner className="h-6 w-6 text-primary" />
              </div>
            ) : invoices.length === 0 ? (
              <EmptyState
                className="py-16"
                icon={
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                    <FileText className="h-7 w-7 text-slate-300" />
                  </div>
                }
                title="No purchase invoices yet"
                description="Record a purchase invoice to load stock from this vendor."
              />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/50">
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Invoice & Date</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Delivery</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Form 6</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Amount</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Document</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-slate-50/50">
                        <TableCell className="py-3.5 px-4 font-bold text-slate-900">
                          {inv.invoice_number}
                          <div className="text-[10px] text-slate-400 font-mono font-medium mt-0.5">{inv.invoice_date}</div>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-slate-600">{inv.delivery_date || "—"}</TableCell>
                        <TableCell className="py-3.5 px-4">
                          <div className="flex items-center justify-center gap-2">
                            <span className={`text-[10px] font-black ${!inv.form6 ? "text-rose-500" : "text-slate-300"}`}>NO</span>
                            <Switch
                              checked={inv.form6}
                              disabled={togglingId === inv.id}
                              onCheckedChange={(c) => handleToggleForm6(inv, c)}
                              className="data-[state=checked]:bg-emerald-600 scale-75"
                            />
                            <span className={`text-[10px] font-black ${inv.form6 ? "text-emerald-600" : "text-slate-300"}`}>YES</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">{money(inv.total_amount)}</TableCell>
                        <TableCell className="py-3.5 px-4 text-center">
                          {inv.invoice_document_url ? (
                            <a
                              href={inv.invoice_document_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-8 px-2 items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg transition-colors"
                            >
                              <Eye className="h-3 w-3" /> View
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">None</span>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5 px-4 text-center">
                          <Button
                            onClick={() => setInvoiceDetail(inv)}
                            className="h-8 px-3 text-[10px] font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg"
                          >
                            <Eye className="h-3 w-3 mr-1" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </Card>

      {/* Dialogs */}
      <SupplierFormDialog
        open={editOpen}
        existing={supplier}
        onOpenChange={setEditOpen}
        onSaved={() => {
          setEditOpen(false);
          void reloadSupplier();
        }}
      />
      <AddProductDialog
        open={addProductOpen}
        supplier={supplier}
        onOpenChange={setAddProductOpen}
        onLinked={() => void loadProducts()}
        onRegisterNew={() => {
          setAddProductOpen(false);
          setRegisterMedicineOpen(true);
        }}
      />
      <MedicineFormDialog
        open={registerMedicineOpen}
        editTarget={null}
        presetSupplier={supplier}
        suppliers={[supplier]}
        onOpenChange={setRegisterMedicineOpen}
        onSupplierCreated={() => {}}
        onSuccess={() => {
          setRegisterMedicineOpen(false);
          void loadProducts();
        }}
      />
      <InvoiceFormDialog
        open={addInvoiceOpen}
        lockedSupplier={supplier}
        onOpenChange={setAddInvoiceOpen}
        onSaved={() => {
          setAddInvoiceOpen(false);
          void loadInvoices();
          void loadProducts();
          // Booking an invoice posts a payable ledger entry + updates the
          // cached balance — refresh both the ledger and the header copy.
          void loadLedger();
          void reloadSupplier();
        }}
      />
      <MakePaymentDialog
        open={paymentOpen}
        supplier={supplier}
        outstanding={ledger?.summary.outstanding ?? supplier.outstanding_payable}
        onOpenChange={setPaymentOpen}
        onSaved={() => {
          setPaymentOpen(false);
          void loadLedger();
          void reloadSupplier();
        }}
      />
      <GeneratePoDialog
        open={poOpen}
        supplier={supplier}
        products={products}
        onOpenChange={setPoOpen}
      />
      <InvoiceDetailDialog
        invoice={invoiceDetail}
        onClose={() => setInvoiceDetail(null)}
      />
      <Dialog open={confirmDeactivateOpen} onOpenChange={setConfirmDeactivateOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Deactivate supplier?</DialogTitle>
            <DialogDescription className="text-slate-500">
              {supplier.company_name} will be hidden from the supplier picker in
              the purchase invoice form. Historical invoices and the payables
              ledger remain intact. You can reactivate any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="rounded-xl border-slate-200"
              onClick={() => setConfirmDeactivateOpen(false)}
              disabled={isTogglingActive}
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeactivate}
              disabled={isTogglingActive}
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl"
            >
              {isTogglingActive && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <ShieldOff className="h-4 w-4 mr-2" />
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailMeta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon} {label}
      </p>
      <p className="text-sm text-slate-100 font-medium break-words">{value}</p>
    </div>
  );
}


function InvoiceFormDialog({
  open,
  onOpenChange,
  lockedSupplier,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lockedSupplier?: Supplier;
  onSaved: () => void;
}) {
  // Supplier console's single invoice entry point. Wraps the SHARED
  // PurchaseInvoiceForm (global medicine catalogue + search + document upload).
  // With `lockedSupplier` the form is pinned to that supplier (profile Add
  // Invoice); without it the form's own supplier selector drives a global add.
  // Booking auto-maps the supplier onto each medicine server-side.
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);

  const loadMedicines = useCallback(
    () => getInventoryMedicines().then((d) => setMedicines(d.items || [])),
    [],
  );

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    const tasks: Promise<unknown>[] = [loadMedicines()];
    if (!lockedSupplier) {
      tasks.push(
        listSuppliers({ is_active: true, pageSize: 200 }).then((d) =>
          setSuppliers(d.items || []),
        ),
      );
    }
    Promise.all(tasks)
      .catch((e) => toastApiError(e, "Failed to load invoice data"))
      .finally(() => setIsLoading(false));
  }, [open, lockedSupplier, loadMedicines]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[97vw] sm:max-w-6xl rounded-2xl p-0 overflow-hidden max-h-[92vh] overflow-y-auto">
        <DialogTitle className="sr-only">Enter purchase invoice</DialogTitle>
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Spinner className="h-6 w-6 text-primary" />
          </div>
        ) : (
          <PurchaseInvoiceForm
            key={lockedSupplier?.id ?? "global"}
            medicines={medicines}
            suppliers={suppliers}
            lockedSupplier={lockedSupplier}
            onSupplierCreated={(s) => setSuppliers((prev) => [s, ...prev])}
            onRegisterMedicine={() => setRegisterOpen(true)}
            onSuccess={onSaved}
            title={
              lockedSupplier
                ? `Add Invoice — ${lockedSupplier.company_name}`
                : "Enter Purchase Invoice"
            }
          />
        )}
        {/* Inline "New medicine" from the invoice flow (Option B). Newly
            registered medicines are refetched so they're immediately
            selectable; presetSupplier links it to the pinned supplier. */}
        <MedicineFormDialog
          open={registerOpen}
          editTarget={null}
          presetSupplier={lockedSupplier}
          suppliers={lockedSupplier ? [lockedSupplier] : suppliers}
          onOpenChange={setRegisterOpen}
          onSupplierCreated={(s) => setSuppliers((prev) => [s, ...prev])}
          onSuccess={() => {
            setRegisterOpen(false);
            void loadMedicines();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}


function InvoiceDetailDialog({
  invoice,
  onClose,
}: {
  invoice: PurchaseInvoiceListItem | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={invoice !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[95vw] sm:max-w-2xl rounded-2xl max-h-[85vh] overflow-y-auto">
        {invoice && (
          <>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> Invoice #{invoice.invoice_number}
              </DialogTitle>
              <DialogDescription className="text-slate-500">
                Billed {invoice.invoice_date}
                {invoice.order_date ? ` · Ordered ${invoice.order_date}` : ""}
                {invoice.delivery_date ? ` · Delivered ${invoice.delivery_date}` : ""}
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Badge className={`text-[10px] font-bold border-0 ${invoice.form6 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>
                Form 6: {invoice.form6 ? "CLEARED" : "PENDING"}
              </Badge>
              {invoice.invoice_document_url && (
                <a href={invoice.invoice_document_url} target="_blank" rel="noreferrer" className="inline-flex h-7 px-2 items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 hover:bg-primary/20 rounded-lg">
                  <Download className="h-3 w-3" /> Document
                </a>
              )}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase">
                    <th className="py-2.5 px-3">Item & Batch</th>
                    <th className="py-2.5 px-3 text-center">Expiry</th>
                    <th className="py-2.5 px-3 text-center">Qty / Price</th>
                    <th className="py-2.5 px-3 text-center">GST</th>
                    <th className="py-2.5 px-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50">
                      <td className="py-3 px-3">
                        <p className="font-bold text-slate-800">{item.medicine_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">Batch: {item.batch_number}</p>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-600 font-mono">{item.expiry_date}</td>
                      <td className="py-3 px-3 text-center text-slate-600">
                        <p>{item.quantity}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{money(item.purchase_price)}/ea</p>
                      </td>
                      <td className="py-3 px-3 text-center text-slate-500 font-mono">{item.gst_percentage}%</td>
                      <td className="py-3 px-3 text-right font-bold text-slate-800 font-mono">{money(item.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 pt-4">
              <div>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Grand Total</span>
                <span className="text-lg font-black text-primary font-mono">{money(invoice.total_amount)}</span>
              </div>
              <Button onClick={onClose} className="bg-slate-800 hover:bg-slate-900 text-white rounded-xl">Close</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}


// Add Product — first asks whether to link a PREDEFINED medicine (search the
// global catalogue → link to this supplier via the Medicine.suppliers M2M) or
// REGISTER a brand-new one (delegates to the shared MedicineFormDialog via
// onRegisterNew). Linking reuses updateInventoryMedicine with a merged
// supplier_ids list so other links aren't dropped.
function AddProductDialog({
  open,
  supplier,
  onOpenChange,
  onLinked,
  onRegisterNew,
}: {
  open: boolean;
  supplier: Supplier;
  onOpenChange: (open: boolean) => void;
  onLinked: () => void;
  onRegisterNew: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "existing">("choose");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode("choose");
    setSearch("");
    setIsLoading(true);
    getInventoryMedicines()
      .then((d) => setMedicines(d.items || []))
      .catch((e) => toastApiError(e, "Failed to load medicines"))
      .finally(() => setIsLoading(false));
  }, [open]);

  const isLinked = (m: Medicine) =>
    (m.suppliers || []).some((s) => s.id === supplier.id);

  const filtered = medicines.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) || m.salt.toLowerCase().includes(q)
    );
  });

  const linkMedicine = async (m: Medicine) => {
    if (isLinked(m)) return;
    setLinkingId(m.id);
    try {
      const merged = Array.from(
        new Set([...(m.suppliers || []).map((s) => s.id), supplier.id]),
      );
      await updateInventoryMedicine(m.id, { supplier_ids: merged });
      toast.success(`${m.name} linked to ${supplier.company_name}`);
      setMedicines((prev) =>
        prev.map((x) =>
          x.id === m.id
            ? {
                ...x,
                suppliers: [
                  ...(x.suppliers || []),
                  {
                    id: supplier.id,
                    company_name: supplier.company_name,
                    is_active: supplier.is_active,
                    categories: supplier.categories,
                  },
                ],
              }
            : x,
        ),
      );
      onLinked();
    } catch (e) {
      toastApiError(e, "Failed to link medicine");
    } finally {
      setLinkingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] rounded-2xl bg-white p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3 border-b border-slate-100">
          <DialogTitle className="text-base font-black text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Add Product
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Link a product to {supplier.company_name}.
          </DialogDescription>
        </DialogHeader>

        {mode === "choose" ? (
          <div className="p-6 grid sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className="text-left rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-primary/40 hover:bg-primary/5 transition-all p-5 group"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Package className="h-5 w-5" />
              </div>
              <p className="font-bold text-slate-800 text-sm">Predefined formulation</p>
              <p className="text-xs text-slate-400 mt-1">
                Pick an existing medicine from the catalogue and link it to this supplier.
              </p>
            </button>
            <button
              type="button"
              onClick={onRegisterNew}
              className="text-left rounded-2xl border border-slate-200 bg-slate-50/50 hover:border-primary/40 hover:bg-primary/5 transition-all p-5 group"
            >
              <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Plus className="h-5 w-5" />
              </div>
              <p className="font-bold text-slate-800 text-sm">Register new medicine</p>
              <p className="text-xs text-slate-400 mt-1">
                Create a brand-new medicine; it will be linked to this supplier.
              </p>
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search catalogue by name or salt…"
                autoFocus
                className="pl-9 h-10 rounded-xl bg-slate-50 border-slate-200 text-xs"
              />
            </div>
            <div className="max-h-[340px] overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
              {isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Spinner className="h-5 w-5 text-primary" />
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-8 text-center text-xs text-slate-400 font-bold">
                  No medicines match your search.
                </p>
              ) : (
                filtered.map((m) => {
                  const linked = isLinked(m);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50/60"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate">{m.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {m.salt} · {m.category}
                          {m.bup_category ? ` · ${m.bup_category}` : ""}
                        </p>
                      </div>
                      {linked ? (
                        <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold shrink-0">
                          Linked
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => void linkMedicine(m)}
                          disabled={linkingId === m.id}
                          className="h-8 rounded-lg bg-primary hover:bg-primary-dark text-white text-xs font-bold shrink-0"
                        >
                          {linkingId === m.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5 mr-1" /> Link
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        <DialogFooter className="p-4 border-t border-slate-100 bg-white">
          {mode === "existing" && (
            <Button
              variant="outline"
              className="rounded-xl border-slate-200 font-bold mr-auto"
              onClick={() => setMode("choose")}
            >
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
          )}
          <Button
            variant="outline"
            className="rounded-xl border-slate-200 font-bold"
            onClick={() => onOpenChange(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MakePaymentDialog({
  open,
  supplier,
  outstanding,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier;
  outstanding: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "online" | "bank">("online");
  const [paymentDate, setPaymentDate] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setMode("online");
      setPaymentDate(today);
      setReference("");
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const due = parseFloat(outstanding) || 0;

  const handleSubmit = async () => {
    const value = parseFloat(amount);
    if (Number.isNaN(value) || value <= 0) {
      toast.error("Enter a valid payment amount");
      return;
    }
    if (value > due + 0.01) {
      toast.error("Payment cannot exceed the outstanding balance");
      return;
    }
    if (!paymentDate) {
      toast.error("Select a payment date");
      return;
    }
    setIsSubmitting(true);
    try {
      await recordSupplierPayment(supplier.id, {
        amount: value.toFixed(2),
        payment_mode: mode,
        payment_date: paymentDate,
        reference: reference.trim(),
        note: note.trim(),
      });
      toast.success("Payment recorded");
      onSaved();
    } catch (error) {
      toastApiError(error, "Failed to record payment");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px] rounded-2xl bg-white p-0 overflow-hidden">
        <DialogHeader className="p-6 pb-3 border-b border-slate-100">
          <DialogTitle className="text-base font-black text-slate-800 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Make Payment
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Record a payment made to {supplier.company_name}.
          </DialogDescription>
        </DialogHeader>
        <div className="p-6 pt-4 space-y-4">
          <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${due > 0 ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100"}`}>
            <p className={`text-xs font-bold uppercase tracking-wider ${due > 0 ? "text-rose-500" : "text-emerald-600"}`}>
              {due > 0 ? "Outstanding Balance" : "No Outstanding Balance"}
            </p>
            <p className={`text-lg font-extrabold ${due > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(due)}</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Amount (₹) *</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="h-10 rounded-xl bg-slate-50 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Payment Date *</Label>
              <Input type="date" value={paymentDate} max={today} onChange={(e) => setPaymentDate(e.target.value)} className="h-10 rounded-xl bg-slate-50 border-slate-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Payment Mode *</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "cash" | "online" | "bank")}>
                <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="online">Online</SelectItem>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-500 uppercase">Reference / UTR</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. UTR123456" className="h-10 rounded-xl bg-slate-50 border-slate-200 font-mono" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-bold text-slate-500 uppercase">Note (Optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Payment for invoice SUN-0091" className="h-10 rounded-xl bg-slate-50 border-slate-200" />
            </div>
          </div>
        </div>
        <DialogFooter className="p-4 border-t border-slate-100 bg-white">
          <Button variant="outline" className="rounded-xl border-slate-200 font-bold" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || due <= 0} className="bg-primary hover:bg-primary-dark text-white rounded-xl font-bold">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record Payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


interface PoLineDraft {
  medicineId: string;
  selected: boolean;
  quantity: string;
  price: string;
  gst: string;
}

function GeneratePoDialog({
  open,
  supplier,
  products,
  onOpenChange,
}: {
  open: boolean;
  supplier: Supplier;
  products: Medicine[];
  onOpenChange: (open: boolean) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [expectedDate, setExpectedDate] = useState(today);
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [dispatchMethod, setDispatchMethod] = useState("Courier");
  const [draft, setDraft] = useState<Record<string, PoLineDraft>>({});
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (open) {
      setOrderNumber(`PO-${Date.now().toString().slice(-6)}`);
      setOrderDate(today);
      setExpectedDate(today);
      setPaymentTerms("Net 30");
      setDispatchMethod("Courier");
      const init: Record<string, PoLineDraft> = {};
      products.forEach((m) => {
        init[m.id] = {
          medicineId: m.id,
          selected: false,
          quantity: "100",
          price: m.mrp,
          gst: "12",
        };
      });
      setDraft(init);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const update = (id: string, patch: Partial<PoLineDraft>) =>
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const selectedCount = Object.values(draft).filter((d) => d.selected).length;
  const grandTotal = Object.values(draft)
    .filter((d) => d.selected)
    .reduce((sum, d) => {
      const base = (parseInt(d.quantity) || 0) * (parseFloat(d.price) || 0);
      return sum + base + base * ((parseFloat(d.gst) || 0) / 100);
    }, 0);

  const handleGenerate = async () => {
    const items = Object.values(draft)
      .filter((d) => d.selected && (parseInt(d.quantity) || 0) > 0)
      .map((d) => {
        const med = products.find((m) => m.id === d.medicineId);
        return {
          name: med?.name || "",
          quantity: parseInt(d.quantity) || 0,
          price: parseFloat(d.price) || 0,
          gstPercentage: parseFloat(d.gst) || 0,
        };
      });
    if (items.length === 0) {
      toast.error("Select at least one product with a quantity");
      return;
    }
    setIsGenerating(true);
    try {
      await generatePurchaseOrderPdf({
        orderNumber,
        orderDate,
        expectedDate,
        paymentTerms,
        dispatchMethod,
        supplier: {
          company_name: supplier.company_name,
          contact_person: supplier.contact_person,
          mobile_number: supplier.mobile_number,
          email: supplier.email,
          full_address: supplier.full_address,
          gst_number: supplier.gst_number,
        },
        items,
      });
      toast.success("Purchase order PDF generated");
      onOpenChange(false);
    } catch (error) {
      toastApiError(error, "Failed to generate PO");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-5xl rounded-2xl bg-white p-0 overflow-hidden max-h-[92vh] flex flex-col gap-0">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
          <DialogTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="h-6 w-6 text-violet-600" /> Purchase Order Generator
          </DialogTitle>
          <DialogDescription className="text-sm font-semibold text-slate-500 mt-1">
            Select items and quantities to generate a print-ready Purchase Order
            for {supplier.company_name}. (PO PDF only — not stored.)
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 space-y-6 overflow-y-auto bg-slate-50/30">
          {/* Meta inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">PO Number</Label>
              <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="rounded-xl border-slate-200 h-9 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Order Date</Label>
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="rounded-xl border-slate-200 h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Expected Delivery</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="rounded-xl border-slate-200 h-9 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Payment Terms</Label>
              <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Net 30">Net 30</SelectItem>
                  <SelectItem value="Net 15">Net 15</SelectItem>
                  <SelectItem value="COD">COD</SelectItem>
                  <SelectItem value="Advance">Advance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-bold text-slate-500 uppercase">Dispatch Method</Label>
              <Select value={dispatchMethod} onValueChange={setDispatchMethod}>
                <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Courier">Courier</SelectItem>
                  <SelectItem value="Road Transporter">Road Transporter</SelectItem>
                  <SelectItem value="Self Pickup">Self Pickup</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Catalog items */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Select Catalog Items</h4>
            <div className="border border-slate-200 rounded-2xl bg-white overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[680px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="py-2.5 px-4 text-center w-12">Select</th>
                    <th className="py-2.5 px-4">Item &amp; Composition</th>
                    <th className="py-2.5 px-4 text-center">Stock / Reorder</th>
                    <th className="py-2.5 px-4 text-center w-24">Order Qty</th>
                    <th className="py-2.5 px-4 text-right w-28">Unit Price (₹)</th>
                    <th className="py-2.5 px-4 text-center w-20">GST %</th>
                    <th className="py-2.5 px-4 text-right w-28">Total (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {products.map((m) => {
                    const d = draft[m.id];
                    if (!d) return null;
                    const stock = (m.batches || []).reduce((s, b) => s + (b.quantity || 0), 0);
                    const base = d.selected ? (parseInt(d.quantity) || 0) * (parseFloat(d.price) || 0) : 0;
                    const lineTotal = base + base * ((parseFloat(d.gst) || 0) / 100);
                    return (
                      <tr key={m.id} className={d.selected ? "bg-violet-50/40" : "hover:bg-slate-50/50"}>
                        <td className="py-3 px-4 text-center">
                          <Checkbox
                            checked={d.selected}
                            onCheckedChange={(c) => update(m.id, { selected: c === true })}
                            className="data-[state=checked]:bg-violet-600 data-[state=checked]:border-violet-600"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-extrabold text-slate-800">{m.name}</p>
                          <p className="text-[10px] text-slate-400 font-mono mt-0.5">{m.salt}</p>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <p className={`font-bold ${stock <= m.reorder_level ? "text-amber-600" : "text-slate-600"}`}>
                            {stock} / {m.reorder_level}
                          </p>
                          <p className="text-[9px] text-slate-400">Current / Target</p>
                        </td>
                        <td className="py-3 px-4">
                          <Input type="number" min={1} value={d.quantity} disabled={!d.selected} onChange={(e) => update(m.id, { quantity: e.target.value })} className="h-8 rounded-lg border-slate-200 text-center text-xs font-semibold" />
                        </td>
                        <td className="py-3 px-4">
                          <Input type="number" min={0} value={d.price} disabled={!d.selected} onChange={(e) => update(m.id, { price: e.target.value })} className="h-8 rounded-lg border-slate-200 text-center text-xs font-semibold" />
                        </td>
                        <td className="py-3 px-4">
                          <Input type="number" min={0} value={d.gst} disabled={!d.selected} onChange={(e) => update(m.id, { gst: e.target.value })} className="h-8 rounded-lg border-slate-200 text-center text-xs font-semibold" />
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-800 font-mono">
                          {d.selected ? money(lineTotal) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-white flex items-center justify-between gap-4">
          <div className="text-xs">
            <span className="text-slate-400 font-bold uppercase tracking-wider block leading-none">Order Grand Total</span>
            <span className="text-lg font-black text-violet-600 block mt-1 leading-none font-mono">{money(grandTotal)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl border-slate-200 font-bold" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
            <Button onClick={handleGenerate} disabled={isGenerating || selectedCount === 0} className="bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold">
              {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Generate PDF ({selectedCount})
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
