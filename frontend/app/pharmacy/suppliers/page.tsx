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
    <div className="space-y-6 max-w-7xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            Suppliers
          </h1>
          <p className="text-sm text-muted-foreground">
            Pharmaceutical wholesalers and distributors. Soft-deactivate
            removes from selection without affecting historical invoices.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add supplier
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Directory</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <form onSubmit={handleSearchSubmit} className="flex gap-2 flex-1 min-w-[260px]">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search company / contact / GST / mobile"
                  className="pl-8"
                />
              </div>
              <Button type="submit" variant="outline">
                Search
              </Button>
            </form>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
            >
              <SelectTrigger className="w-[160px]">
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
              <SelectTrigger className="w-[140px]">
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
            <div className="flex items-center gap-2 text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-md px-3 py-2">
              <AlertTriangle className="h-4 w-4" /> {errorMessage}
            </div>
          )}

          {isLoading ? (
            <div className="flex justify-center py-10">
              <Spinner className="h-6 w-6" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-10 text-sm text-muted-foreground">
              No suppliers match the current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>GST</TableHead>
                    <TableHead>Drug License</TableHead>
                    <TableHead className="text-right">Invoices</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">
                        <div>{s.company_name}</div>
                        {s.contact_person && (
                          <div className="text-xs text-muted-foreground">
                            {s.contact_person}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {s.mobile_number ? (
                            <span className="font-mono">{s.mobile_number}</span>
                          ) : (
                            <span className="text-amber-600 text-xs">
                              needs mobile
                            </span>
                          )}
                        </div>
                        {s.email && (
                          <div className="text-xs text-muted-foreground">
                            {s.email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {s.categories.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          ) : (
                            s.categories.map((cat) => (
                              <Badge key={cat} variant="outline">
                                {cat}
                              </Badge>
                            ))
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.gst_number || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {s.drug_license_number || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.invoice_count ?? 0}
                      </TableCell>
                      <TableCell>
                        {s.is_active ? (
                          <Badge className="bg-emerald-600">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditTarget(s)}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {s.is_active ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeactivateTarget(s)}
                              title="Deactivate"
                            >
                              <ShieldOff className="h-4 w-4 text-rose-600" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
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
              <div className="mt-3 text-xs text-muted-foreground">
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate supplier?</DialogTitle>
            <DialogDescription>
              {deactivateTarget?.company_name} will be hidden from the supplier
              picker in the purchase invoice form. Historical invoices remain
              linked. You can reactivate the supplier any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeactivateTarget(null)}
            >
              Cancel
            </Button>
            <Button onClick={handleDeactivate}>
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

  useEffect(() => {
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
      toast.error(
        error instanceof Error
          ? error.message
          : isEdit
            ? "Failed to update supplier"
            : "Failed to add supplier",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Supplier" : "Add Supplier"}</DialogTitle>
          <DialogDescription>
            Required: company name and mobile number. Optional fields can be
            filled later.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label>Company name *</Label>
            <Input
              value={form.company_name}
              onChange={(e) => set("company_name", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Mobile number *</Label>
            <Input
              value={form.mobile_number}
              onChange={(e) => set("mobile_number", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Contact person</Label>
            <Input
              value={form.contact_person ?? ""}
              onChange={(e) => set("contact_person", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>GST number</Label>
            <Input
              value={form.gst_number ?? ""}
              onChange={(e) => set("gst_number", e.target.value)}
              className="mt-1"
            />
          </div>
          <div>
            <Label>Drug license number</Label>
            <Input
              value={form.drug_license_number ?? ""}
              onChange={(e) => set("drug_license_number", e.target.value)}
              className="mt-1"
            />
          </div>
          <div className="md:col-span-2">
            <Label>Full address</Label>
            <Textarea
              value={form.full_address ?? ""}
              onChange={(e) => set("full_address", e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>
          <div className="md:col-span-2">
            <Label>Categories supplied</Label>
            <div className="flex gap-3 mt-2">
              {CATEGORY_OPTIONS.map((cat) => (
                <label
                  key={cat}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <Checkbox
                    checked={(form.categories ?? []).includes(cat)}
                    onCheckedChange={() => toggleCategory(cat)}
                  />
                  {cat}
                </label>
              ))}
            </div>
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
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Add supplier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
