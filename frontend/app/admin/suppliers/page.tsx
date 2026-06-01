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
import {
  AlertTriangle,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Search,
  ShieldOff,
  ShieldCheck,
} from "lucide-react";
import {
  createSupplier,
  deactivateSupplier,
  listSuppliers,
  updateSupplier,
  type Supplier,
  type SupplierCategory,
  type SupplierWritePayload,
} from "@/lib/pharmacy-api";
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
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
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
    [searchQuery, categoryFilter, statusFilter],
  );

  useEffect(() => {
    load();
    // load is captured each render; this is intentional — we want the latest
    // filters in scope when load fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter]);

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
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reactivate",
      );
    }
  };

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <PageHeader
        icon={<Building2 className="h-7 w-7 text-primary" />}
        title="Suppliers"
        subtitle="Pharmaceutical wholesalers and distributors. Soft-deactivate removes from selection without affecting historical invoices."
        actions={
          <Button
            onClick={() => setCreateOpen(true)}
            className="bg-primary hover:bg-primary-dark text-white font-extrabold rounded-xl h-10 px-4 shadow-md shadow-teal-900/10 flex items-center gap-2 hover:scale-[1.01] transition-transform"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add supplier
          </Button>
        }
      />

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
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Company</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Contact</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Categories</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">GST</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Drug License</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Invoices</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id} className="hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-semibold text-slate-800 py-4 px-4">
                        <div>{s.company_name}</div>
                        {s.contact_person && (
                          <div className="text-xs text-slate-400 font-normal">
                            {s.contact_person}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-4 px-4">
                        <div className="text-sm">
                          {s.mobile_number ? (
                            <span className="font-mono text-slate-700">{s.mobile_number}</span>
                          ) : (
                            <span className="text-amber-600 text-xs font-medium">
                              needs mobile
                            </span>
                          )}
                        </div>
                        {s.email && (
                          <div className="text-xs text-slate-400">
                            {s.email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="py-4 px-4">
                        <div className="flex gap-1 flex-wrap">
                          {s.categories.length === 0 ? (
                            <span className="text-xs text-slate-400">
                              —
                            </span>
                          ) : (
                            s.categories.map((cat) => (
                              <Badge key={cat} variant="outline" className="border-slate-200 text-slate-600 text-[10px] font-bold uppercase">
                                {cat}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 py-4 px-4">
                        {s.gst_number || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-600 py-4 px-4">
                        {s.drug_license_number || "—"}
                      </TableCell>
                      <TableCell className="text-right text-slate-700 font-semibold py-4 px-4">
                        {s.invoice_count ?? 0}
                      </TableCell>
                      <TableCell className="py-4 px-4">
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
