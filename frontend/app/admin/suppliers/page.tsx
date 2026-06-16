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
  Search,
  Shield,
  ShieldOff,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import {
  addInventoryMedicine,
  createSupplier,
  deactivateSupplier,
  getInventoryMedicines,
  getSupplier,
  getSupplierLedger,
  getSupplierSummary,
  listPurchaseInvoices,
  listSuppliers,
  recordSupplierPayment,
  submitPurchaseInvoice,
  updatePurchaseInvoiceForm6,
  updateSupplier,
  type BupStrength,
  type Medicine,
  type MedicineCategory,
  type PurchaseInvoiceItemPayload,
  type PurchaseInvoiceListItem,
  type Supplier,
  type SupplierCategory,
  type SupplierLedgerResponse,
  type SupplierSummary,
  type SupplierWritePayload,
} from "@/lib/pharmacy-api";
import { generatePurchaseOrderPdf } from "@/lib/export/generatePurchaseOrderPdf";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import { FieldError } from "@/components/ui/field-error";


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
    load();
    // load is captured each render; this is intentional — we want the latest
    // filters in scope when load fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter, duesOnly]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    load();
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
              <div className="mt-4 px-2 text-xs text-slate-400 font-medium">
                {pagination.total} supplier{pagination.total === 1 ? "" : "s"} total
              </div>
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
      <GlobalAddInvoiceDialog
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
      <DialogContent className="max-w-2xl rounded-2xl">
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

const BUP_STRENGTHS: BupStrength[] = [
  "0.4mg + 0.1mg",
  "1.0mg + 0.25mg",
  "2.0mg + 0.5mg",
];

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
  const [invoices, setInvoices] = useState<PurchaseInvoiceListItem[]>([]);
  const [isLoadingInvoices, setIsLoadingInvoices] = useState(true);

  const [addProductOpen, setAddProductOpen] = useState(false);
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

  useEffect(() => {
    loadProducts();
    loadInvoices();
    loadLedger();
  }, [loadProducts, loadInvoices, loadLedger]);

  const filteredLedger = (ledger?.entries || []).filter((e) => {
    if (ledgerFilter === "invoice") return e.entry_type === "invoice";
    if (ledgerFilter === "payment") return e.entry_type === "payment";
    return true;
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
              onClick={() => setPoOpen(true)}
              disabled={products.length === 0}
              className="bg-violet-600 hover:bg-violet-700 text-white font-bold rounded-xl h-10 px-3.5 border-0 disabled:opacity-50"
            >
              <ShoppingCart className="h-4 w-4 mr-1.5" /> Order Generator
            </Button>
            <Button
              onClick={() => setAddInvoiceOpen(true)}
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
          <CardContent className="p-4 grid grid-cols-2 gap-4">
            <SummaryTile label="GST Number" value={supplier.gst_number || "N/A"} />
            <SummaryTile label="Drug License" value={supplier.drug_license_number || "N/A"} />
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
        <Tabs defaultValue="ledger" className="w-full">
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
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Stock</TableHead>
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
        onSaved={() => {
          setAddProductOpen(false);
          void loadProducts();
        }}
      />
      <AddInvoiceDialog
        open={addInvoiceOpen}
        supplier={supplier}
        products={products}
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50/60 border border-slate-100 p-3 rounded-xl">
      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <strong className="text-xs font-extrabold text-slate-800 block mt-1 font-mono break-all">{value}</strong>
    </div>
  );
}


function AddProductDialog({
  open,
  supplier,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    salt: "",
    category: "Rx" as MedicineCategory,
    bup_category: "" as BupStrength | "",
    manufacturer: "",
    mrp: "",
    selling_price: "",
    reorder_level: "50",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiErrors = useApiErrors();

  useEffect(() => {
    if (open) {
      setForm({
        name: "",
        salt: "",
        category: "Rx",
        bup_category: "",
        manufacturer: supplier.company_name,
        mrp: "",
        selling_price: "",
        reorder_level: "50",
      });
      apiErrors.clear();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.salt.trim()) {
      toast.error("Name and salt are required");
      return;
    }
    if (form.category === "BUP" && !form.bup_category) {
      toast.error("Select a BUP strength");
      return;
    }
    const mrp = parseFloat(form.mrp) || 0;
    const sp = parseFloat(form.selling_price) || 0;
    if (sp > mrp) {
      toast.error("Selling price cannot exceed MRP");
      return;
    }
    apiErrors.clear();
    setIsSubmitting(true);
    try {
      await addInventoryMedicine({
        name: form.name.trim(),
        salt: form.salt.trim(),
        category: form.category,
        bup_category: form.category === "BUP" ? (form.bup_category as BupStrength) : null,
        manufacturer: form.manufacturer.trim() || supplier.company_name,
        reorder_level: parseInt(form.reorder_level) || 0,
        mrp: mrp.toFixed(2),
        selling_price: sp.toFixed(2),
        // Link to this supplier via the Medicine.suppliers M2M.
        supplier_ids: [supplier.id],
      });
      toast.success("Product added");
      onSaved();
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, "Failed to add product");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Add Product
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Register a product supplied by {supplier.company_name}.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700 text-xs uppercase">Category *</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as MedicineCategory })}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BUP">BUP (Controlled)</SelectItem>
                <SelectItem value="Rx">Rx (Prescription)</SelectItem>
                <SelectItem value="NRx">NRx (General)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.category === "BUP" && (
            <div className="space-y-1.5">
              <Label className="font-bold text-slate-700 text-xs uppercase">BUP Strength *</Label>
              <Select value={form.bup_category} onValueChange={(v) => setForm({ ...form, bup_category: v as BupStrength })}>
                <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {BUP_STRENGTHS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5 col-span-2">
            <Label className="font-bold text-slate-700 text-xs uppercase">Product Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-slate-50 border-slate-200" />
            <FieldError message={apiErrors.get("name")} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="font-bold text-slate-700 text-xs uppercase">Salt Composition *</Label>
            <Input value={form.salt} onChange={(e) => setForm({ ...form, salt: e.target.value })} className="bg-slate-50 border-slate-200" />
            <FieldError message={apiErrors.get("salt")} />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-slate-700 text-xs uppercase">MRP (₹)</Label>
            <Input type="number" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} className="bg-slate-50 border-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label className="font-bold text-primary text-xs uppercase">Selling Price (₹)</Label>
            <Input type="number" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} className="bg-emerald-50/30 border-primary/30 text-primary font-bold" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="font-bold text-slate-700 text-xs uppercase">Reorder Level (tablets)</Label>
            <Input type="number" value={form.reorder_level} onChange={(e) => setForm({ ...form, reorder_level: e.target.value })} className="bg-slate-50 border-slate-200" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-primary hover:bg-primary-dark text-white rounded-xl">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


interface InvoiceLineDraft {
  key: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
  gstPercentage: string;
}

// Shared purchase-invoice form body (no Dialog shell). Used by both the
// per-supplier AddInvoiceDialog and the global GlobalAddInvoiceDialog so the
// line-item editor + submit logic lives in one place. Mount it fresh per use
// (the wrappers remount it) so its draft state always starts clean.
function PurchaseInvoiceEditor({
  supplier,
  products,
  onSaved,
  onCancel,
}: {
  supplier: Supplier;
  products: Medicine[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const today = new Date().toLocaleDateString("en-CA");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderDate, setOrderDate] = useState(today);
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [deliveryDate, setDeliveryDate] = useState(today);
  const [form6, setForm6] = useState(false);
  const [lines, setLines] = useState<InvoiceLineDraft[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        key: `l-${Date.now()}-${prev.length}`,
        medicineId: products[0]?.id || "",
        batchNumber: "",
        expiryDate: "",
        quantity: "1",
        purchasePrice: "",
        gstPercentage: "12",
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<InvoiceLineDraft>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const grandTotal = lines.reduce((sum, l) => {
    const base = (parseFloat(l.purchasePrice) || 0) * (parseInt(l.quantity) || 0);
    return sum + base + base * ((parseFloat(l.gstPercentage) || 0) / 100);
  }, 0);

  const handleSubmit = async () => {
    if (!invoiceNumber.trim()) {
      toast.error("Invoice number is required");
      return;
    }
    if (lines.length === 0) {
      toast.error("Add at least one line item");
      return;
    }
    for (const l of lines) {
      if (!l.medicineId) { toast.error("Select a product for every line"); return; }
      if (!l.batchNumber.trim()) { toast.error("Batch number is required for every line"); return; }
      if (!l.expiryDate) { toast.error("Expiry date is required for every line"); return; }
      if ((parseInt(l.quantity) || 0) < 1) { toast.error("Quantity must be at least 1"); return; }
    }

    const items: PurchaseInvoiceItemPayload[] = lines.map((l) => {
      const med = products.find((m) => m.id === l.medicineId);
      return {
        medicine_id: l.medicineId,
        category: (med?.category || "Rx") as MedicineCategory,
        subcategory: med?.bup_category || null,
        batch_number: l.batchNumber.trim(),
        expiry_date: l.expiryDate,
        quantity: parseInt(l.quantity) || 0,
        purchase_price: (parseFloat(l.purchasePrice) || 0).toFixed(2),
        gst_percentage: (parseFloat(l.gstPercentage) || 0).toFixed(2),
      };
    });

    setIsSubmitting(true);
    try {
      await submitPurchaseInvoice({
        invoice_number: invoiceNumber.trim(),
        supplier_id: supplier.id,
        order_date: orderDate,
        invoice_date: invoiceDate,
        delivery_date: deliveryDate || null,
        form6,
        items,
      });
      toast.success(`Invoice ${invoiceNumber} saved — stock loaded.`);
      onSaved();
    } catch (error) {
      toastApiError(error, "Failed to save invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Enter Purchase Invoice
        </DialogTitle>
        <DialogDescription className="text-slate-500">
          Record a purchase invoice from {supplier.company_name}. Stock loads
          into inventory on save.
        </DialogDescription>
      </DialogHeader>

      {products.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Add at least one product for this supplier before recording an invoice.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="col-span-2 md:col-span-1 space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Invoice No. *</Label>
                <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="bg-slate-50 border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Order Date</Label>
                <Input type="date" value={orderDate} max={invoiceDate} onChange={(e) => setOrderDate(e.target.value)} className="bg-slate-50 border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Invoice Date *</Label>
                <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="bg-slate-50 border-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-500 uppercase">Delivery Date</Label>
                <Input type="date" value={deliveryDate} min={invoiceDate} onChange={(e) => setDeliveryDate(e.target.value)} className="bg-slate-50 border-slate-200" />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <Switch checked={form6} onCheckedChange={setForm6} className="data-[state=checked]:bg-emerald-600" />
              Form 6 cleared for this invoice
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-slate-500 uppercase">Line Items</Label>
                <Button onClick={addLine} variant="outline" className="h-8 rounded-lg border-slate-200 text-xs font-bold">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Line
                </Button>
              </div>
              {lines.length === 0 ? (
                <p className="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-200 rounded-xl">
                  No line items yet. Click &ldquo;Add Line&rdquo;.
                </p>
              ) : (
                lines.map((l) => (
                  <div key={l.key} className="grid grid-cols-12 gap-2 items-end rounded-xl border border-slate-200 bg-slate-50/50 p-3">
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-[10px] text-slate-400">Product</Label>
                      <Select value={l.medicineId} onValueChange={(v) => updateLine(l.key, { medicineId: v })}>
                        <SelectTrigger className="h-9 text-xs bg-white"><SelectValue placeholder="Product" /></SelectTrigger>
                        <SelectContent>
                          {products.map((m) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-[10px] text-slate-400">Batch</Label>
                      <Input value={l.batchNumber} onChange={(e) => updateLine(l.key, { batchNumber: e.target.value })} className="h-9 text-xs bg-white" />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-[10px] text-slate-400">Expiry</Label>
                      <Input type="date" value={l.expiryDate} onChange={(e) => updateLine(l.key, { expiryDate: e.target.value })} className="h-9 text-xs bg-white" />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-[10px] text-slate-400">Qty</Label>
                      <Input type="number" min={1} value={l.quantity} onChange={(e) => updateLine(l.key, { quantity: e.target.value })} className="h-9 text-xs bg-white text-center" />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-[10px] text-slate-400">Price</Label>
                      <Input type="number" min={0} value={l.purchasePrice} onChange={(e) => updateLine(l.key, { purchasePrice: e.target.value })} className="h-9 text-xs bg-white text-center" />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-[10px] text-slate-400">GST%</Label>
                      <Input type="number" min={0} value={l.gstPercentage} onChange={(e) => updateLine(l.key, { gstPercentage: e.target.value })} className="h-9 text-xs bg-white text-center" />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button variant="ghost" size="icon" onClick={() => setLines((prev) => prev.filter((x) => x.key !== l.key))} className="h-9 w-9 text-rose-500 hover:bg-rose-50">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="flex items-center justify-between rounded-xl border border-primary/10 bg-primary/5 px-4 py-3">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Grand Total (incl. GST)</span>
              <span className="text-lg font-black text-primary font-mono">{money(grandTotal)}</span>
            </div>
          </div>
        )}

      <DialogFooter>
        <Button variant="outline" className="rounded-xl border-slate-200" onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button onClick={handleSubmit} disabled={isSubmitting || products.length === 0} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl">
          {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Save Invoice
        </Button>
      </DialogFooter>
    </>
  );
}


// Per-supplier invoice dialog — thin shell around the shared editor. Keyed on
// open so the editor remounts (fresh draft) each time it's opened.
function AddInvoiceDialog({
  open,
  supplier,
  products,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  supplier: Supplier;
  products: Medicine[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto">
        {open && (
          <PurchaseInvoiceEditor
            supplier={supplier}
            products={products}
            onSaved={onSaved}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}


// Global "Add Invoice" — pick any active supplier, then record an invoice
// against it. Loads that supplier's products on selection, then reuses the
// shared editor. Mirrors the new-feat global invoice entry point.
function GlobalAddInvoiceDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [products, setProducts] = useState<Medicine[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplierId("");
    setProducts([]);
    listSuppliers({ is_active: true, pageSize: 200 })
      .then((data) => setSuppliers(data.items || []))
      .catch((error) => toastApiError(error, "Failed to load suppliers"));
  }, [open]);

  useEffect(() => {
    if (!supplierId) {
      setProducts([]);
      return;
    }
    setIsLoadingProducts(true);
    getInventoryMedicines({ supplier: supplierId })
      .then((data) => setProducts(data.items || []))
      .catch((error) => toastApiError(error, "Failed to load products"))
      .finally(() => setIsLoadingProducts(false));
  }, [supplierId]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) || null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" /> Enter Purchase Invoice
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Record a purchase invoice from any vendor. Pick the supplier to begin.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-500 uppercase">Supplier *</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger className="bg-slate-50 border-slate-200">
              <SelectValue placeholder="Select a supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.company_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedSupplier ? (
          <p className="py-8 text-center text-sm text-slate-400">
            Choose a supplier to enter invoice details.
          </p>
        ) : isLoadingProducts ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <PurchaseInvoiceEditor
            key={selectedSupplier.id}
            supplier={selectedSupplier}
            products={products}
            onSaved={onSaved}
            onCancel={() => onOpenChange(false)}
          />
        )}
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
      <DialogContent className="max-w-2xl w-[95vw] rounded-2xl max-h-[85vh] overflow-y-auto">
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
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"cash" | "online" | "bank">("online");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setAmount("");
      setMode("online");
      setReference("");
      setNote("");
    }
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
    setIsSubmitting(true);
    try {
      await recordSupplierPayment(supplier.id, {
        amount: value.toFixed(2),
        payment_mode: mode,
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
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" /> Make Payment
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Record a payment to {supplier.company_name}.
          </DialogDescription>
        </DialogHeader>
        <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${due > 0 ? "bg-rose-50 border-rose-100" : "bg-emerald-50 border-emerald-100"}`}>
          <p className={`text-xs font-bold uppercase tracking-wider ${due > 0 ? "text-rose-500" : "text-emerald-600"}`}>Outstanding</p>
          <p className={`text-lg font-extrabold ${due > 0 ? "text-rose-600" : "text-emerald-600"}`}>{money(due)}</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">Amount (₹) *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-slate-50 border-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">Mode *</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as "cash" | "online" | "bank")}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="bank">Bank</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">Reference / UTR</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} className="bg-slate-50 border-slate-200 font-mono" />
          </div>
          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-bold text-slate-500 uppercase">Note</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-slate-50 border-slate-200" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || due <= 0} className="bg-primary hover:bg-primary-dark text-white rounded-xl">
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
      <DialogContent className="max-w-3xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Generate Purchase Order
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Select products and quantities to send to {supplier.company_name}.
            Downloads a PDF — purchase orders are not stored.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">PO Number</Label>
            <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} className="bg-slate-50 border-slate-200 font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">Order Date</Label>
            <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} className="bg-slate-50 border-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">Expected</Label>
            <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="bg-slate-50 border-slate-200" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">Payment Terms</Label>
            <Select value={paymentTerms} onValueChange={setPaymentTerms}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Net 30">Net 30</SelectItem>
                <SelectItem value="Net 15">Net 15</SelectItem>
                <SelectItem value="COD">COD</SelectItem>
                <SelectItem value="Advance">Advance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-500 uppercase">Dispatch</Label>
            <Select value={dispatchMethod} onValueChange={setDispatchMethod}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Courier">Courier</SelectItem>
                <SelectItem value="Road Transporter">Road Transporter</SelectItem>
                <SelectItem value="Self Pickup">Self Pickup</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase">
                <th className="py-2.5 px-3 w-10"></th>
                <th className="py-2.5 px-3">Product</th>
                <th className="py-2.5 px-3 text-center w-24">Qty</th>
                <th className="py-2.5 px-3 text-center w-28">Unit Price</th>
                <th className="py-2.5 px-3 text-center w-20">GST%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {products.map((m) => {
                const d = draft[m.id];
                if (!d) return null;
                return (
                  <tr key={m.id} className={d.selected ? "bg-primary/5" : "hover:bg-slate-50/50"}>
                    <td className="py-2 px-3 text-center">
                      <Checkbox checked={d.selected} onCheckedChange={(c) => update(m.id, { selected: c === true })} />
                    </td>
                    <td className="py-2 px-3 font-bold text-slate-800">{m.name}</td>
                    <td className="py-2 px-3">
                      <Input type="number" min={1} value={d.quantity} disabled={!d.selected} onChange={(e) => update(m.id, { quantity: e.target.value })} className="h-8 text-xs bg-white text-center" />
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" min={0} value={d.price} disabled={!d.selected} onChange={(e) => update(m.id, { price: e.target.value })} className="h-8 text-xs bg-white text-center" />
                    </td>
                    <td className="py-2 px-3">
                      <Input type="number" min={0} value={d.gst} disabled={!d.selected} onChange={(e) => update(m.id, { gst: e.target.value })} className="h-8 text-xs bg-white text-center" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={isGenerating}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={isGenerating || selectedCount === 0} className="bg-primary hover:bg-primary-dark text-white rounded-xl">
            {isGenerating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Generate PDF ({selectedCount})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
