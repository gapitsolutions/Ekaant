"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
} from "lucide-react";
import { navigate } from "@/lib/navigation";
import { FieldError } from "@/components/ui/field-error";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import {
  getInventoryMedicines,
  addInventoryMedicine,
  deleteInventoryMedicine,
  submitPurchaseInvoice,
  auditStockRemoval,
  listSuppliers,
  createSupplier,
  BUP_STRENGTHS,
  type Medicine,
  type MedicineCategory,
  type BupStrength,
  type RemovalReason,
  type Supplier,
  type SupplierCategory,
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
  const [deleteTarget, setDeleteTarget] = useState<Medicine | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

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
          error instanceof Error
            ? error.message
            : "Unable to load inventory.",
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
          m.name.toLowerCase().includes(q) ||
          m.salt.toLowerCase().includes(q),
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

  const handleDelete = async (reason: string, notes: string) => {
    if (!deleteTarget) return;
    try {
      await deleteInventoryMedicine(deleteTarget.id, { reason, notes });
      toast.success("Medicine removed from active inventory");
      setDeleteTarget(null);
      await loadMedicines();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete medicine",
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            Inventory Workstation
          </h1>
          <p className="text-muted-foreground">
            {medicines.length} active formulation
            {medicines.length === 1 ? "" : "s"} registered
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Register Medicine
        </Button>
      </div>

      {/* Stat Filter Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {(
          [
            {
              key: "all",
              title: "All Formulations",
              count: counts.all,
              ring: "ring-primary",
              icon: Pill,
              iconColor: "text-primary",
            },
            {
              key: "BUP",
              title: "BUP (Controlled)",
              count: counts.BUP,
              ring: "ring-rose-500",
              icon: AlertTriangle,
              iconColor: "text-rose-600",
            },
            {
              key: "Rx",
              title: "Rx Formulations",
              count: counts.Rx,
              ring: "ring-blue-500",
              icon: Package,
              iconColor: "text-blue-600",
            },
            {
              key: "NRx",
              title: "NRx Formulations",
              count: counts.NRx,
              ring: "ring-amber-500",
              icon: Package,
              iconColor: "text-amber-600",
            },
          ] as const
        ).map((stat) => {
          const active = categoryFilter === stat.key;
          return (
            <button
              key={stat.key}
              type="button"
              onClick={() => {
                setCategoryFilter(stat.key as CategoryFilter);
                if (stat.key !== "BUP") setBupFilter("all");
              }}
              className="text-left"
            >
              <Card
                className={`border-0 shadow-md hover:shadow-lg transition-all ${
                  active ? `ring-2 ${stat.ring}` : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-3xl font-bold">{stat.count}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {stat.title}
                      </p>
                    </div>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      {/* Alerts */}
      {(lowStockMedicines.length > 0 || nearExpiryBatches.length > 0) &&
      tab === "list" ? (
        <div className="grid gap-3 md:grid-cols-2">
          {lowStockMedicines.length > 0 ? (
            <Card className="border-rose-200 bg-rose-50">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                  <div>
                    <p className="font-semibold text-rose-900">
                      Low Stock Alerts
                    </p>
                    <p className="text-sm text-rose-700">
                      {lowStockMedicines.length} medicine
                      {lowStockMedicines.length === 1 ? "" : "s"} at or below
                      reorder level
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
          {nearExpiryBatches.length > 0 ? (
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <CalendarClock className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-semibold text-amber-900">Near Expiry</p>
                    <p className="text-sm text-amber-700">
                      {nearExpiryBatches.length} batch
                      {nearExpiryBatches.length === 1 ? "" : "es"} expiring
                      within 180 days
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="list">Registered List</TabsTrigger>
          <TabsTrigger value="invoice">Enter New Invoice</TabsTrigger>
          <TabsTrigger value="audit">Audit Stock Removal</TabsTrigger>
        </TabsList>

        {/* Registered List Tab */}
        <TabsContent value="list" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Medicine Registry</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or salt"
                    className="pl-9"
                  />
                </div>
                <Select
                  value={categoryFilter}
                  onValueChange={(v) => {
                    setCategoryFilter(v as CategoryFilter);
                    if (v !== "BUP") setBupFilter("all");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="BUP">BUP</SelectItem>
                    <SelectItem value="Rx">Rx</SelectItem>
                    <SelectItem value="NRx">NRx</SelectItem>
                  </SelectContent>
                </Select>
                {categoryFilter === "BUP" ? (
                  <Select
                    value={bupFilter}
                    onValueChange={(v) => setBupFilter(v as BupStrength | "all")}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Strength" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Strengths</SelectItem>
                      {BUP_STRENGTHS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div />
                )}
              </div>

              {errorMessage ? (
                <p className="text-sm text-destructive">{errorMessage}</p>
              ) : null}

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredMedicines.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-muted-foreground font-medium">
                    No medicines found
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Try adjusting your filters or register a new medicine
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Medicine &amp; Salt</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Active Batches</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Stock</TableHead>
                        <TableHead className="text-right">Manage</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredMedicines.map((m) => {
                        const stock = stockFor(m);
                        const isLow = stock <= m.reorder_level;
                        return (
                          <TableRow key={m.id}>
                            <TableCell>
                              <div className="font-medium">{m.name}</div>
                              <div className="text-xs text-muted-foreground">
                                {m.salt}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-col gap-1">
                                <Badge
                                  variant="outline"
                                  className={
                                    m.category === "BUP"
                                      ? "border-rose-500 text-rose-700 bg-rose-50"
                                      : m.category === "Rx"
                                        ? "border-blue-500 text-blue-700 bg-blue-50"
                                        : "border-amber-500 text-amber-700 bg-amber-50"
                                  }
                                >
                                  {m.category}
                                </Badge>
                                {m.bup_category ? (
                                  <span className="text-xs text-muted-foreground">
                                    {m.bup_category}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell>
                              {m.batches && m.batches.length > 0 ? (
                                <div className="space-y-0.5">
                                  {m.batches.slice(0, 2).map((b) => (
                                    <div
                                      key={b.batch_number}
                                      className="text-xs"
                                    >
                                      <span className="font-mono">
                                        {b.batch_number}
                                      </span>{" "}
                                      <span className="text-muted-foreground">
                                        ·{" "}
                                        {new Date(
                                          b.expiry_date,
                                        ).toLocaleDateString("en-IN", {
                                          month: "short",
                                          year: "numeric",
                                        })}{" "}
                                        · {b.quantity}u
                                      </span>
                                    </div>
                                  ))}
                                  {m.batches.length > 2 ? (
                                    <span className="text-xs text-muted-foreground">
                                      +{m.batches.length - 2} more
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">
                                  No batches
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="text-sm">
                                ₹{parseFloat(m.selling_price).toFixed(2)}
                              </div>
                              <div className="text-xs text-muted-foreground line-through">
                                MRP ₹{parseFloat(m.mrp).toFixed(2)}
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="outline"
                                className={
                                  isLow
                                    ? "border-rose-500 text-rose-700 bg-rose-50"
                                    : "border-emerald-500 text-emerald-700 bg-emerald-50"
                                }
                              >
                                {stock} u
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    navigate(`/pharmacy/inventory/${m.id}`)
                                  }
                                  aria-label="View history"
                                >
                                  <History className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-rose-600 hover:bg-rose-50"
                                  onClick={() => setDeleteTarget(m)}
                                  aria-label="Delete medicine"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Invoice Tab */}
        <TabsContent value="invoice" className="mt-4">
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
        <TabsContent value="audit" className="mt-4">
          <AuditRemovalView
            medicines={medicines}
            onSuccess={() => loadMedicines()}
          />
        </TabsContent>
      </Tabs>

      <AddMedicineDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onSuccess={() => {
          setAddDialogOpen(false);
          loadMedicines();
        }}
      />

      <DeleteMedicineDialog
        target={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

// ────────── Add Medicine Dialog ──────────

function AddMedicineDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
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
      await addInventoryMedicine({
        name: name.trim(),
        salt: salt.trim(),
        category,
        bup_category: category === "BUP" ? bupCategory : null,
        manufacturer: manufacturer.trim(),
        reorder_level: parseInt(reorderLevel) || 0,
        tablets_per_strip: parseInt(tabletsPerStrip) || 10,
        mrp: mrpNum.toFixed(2),
        selling_price: spNum.toFixed(2),
      });
      toast.success("Medicine registered successfully");
      resetForm();
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to register medicine",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Register New Medicine</DialogTitle>
          <DialogDescription>
            Add a new formulation to the active inventory registry
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Category</Label>
              <Select
                value={category}
                onValueChange={(v) => setCategory(v as MedicineCategory)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUP">BUP (Controlled)</SelectItem>
                  <SelectItem value="Rx">Rx</SelectItem>
                  <SelectItem value="NRx">NRx</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {category === "BUP" ? (
              <div>
                <Label className="text-xs text-muted-foreground">
                  BUP Strength
                </Label>
                <Select
                  value={bupCategory}
                  onValueChange={(v) => setBupCategory(v as BupStrength)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BUP_STRENGTHS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div />
            )}
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Medicine Name
            </Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Olanzapine 5mg"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Salt Composition
            </Label>
            <Input
              value={salt}
              onChange={(e) => setSalt(e.target.value)}
              placeholder="e.g. Olanzapine"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Manufacturer
            </Label>
            <Input
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              placeholder="e.g. Sun Pharma"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">MRP (₹)</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={mrp}
                onChange={(e) => setMrp(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Selling Price (₹)
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Reorder Level
              </Label>
              <Input
                type="number"
                min={0}
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Tablets / Strip
              </Label>
              <Input
                type="number"
                min={1}
                value={tabletsPerStrip}
                onChange={(e) => setTabletsPerStrip(e.target.value)}
                className="mt-1"
              />
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
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" /> Saving…
              </>
            ) : (
              "Register Medicine"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ────────── Delete Medicine Dialog ──────────

function DeleteMedicineDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: Medicine | null;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("destroyed");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (target) {
      setReason("destroyed");
      setNotes("");
    }
  }, [target]);

  const handleConfirm = async () => {
    setIsSubmitting(true);
    try {
      await onConfirm(reason, notes);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Medicine</DialogTitle>
          <DialogDescription>
            This will soft-delete <span className="font-semibold">{target?.name}</span>.
            Historical batches and dispense records remain intact.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground">
              Deletion Reason
            </Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="destroyed">Destroyed</SelectItem>
                <SelectItem value="returned">Returned to Supplier</SelectItem>
                <SelectItem value="defect">Manufacturing Defect</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Compliance Notes
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional explanation for audit log"
              className="mt-1"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            className="bg-rose-600 hover:bg-rose-700 text-white"
            onClick={handleConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" /> Removing…
              </>
            ) : (
              "Confirm Removal"
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
  const [deliveryDate, setDeliveryDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
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
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    );
  };

  const summary = useMemo(() => {
    const formCount = items.length;
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const gstTotal = items.reduce(
      (s, i) =>
        s + (i.quantity * i.purchasePrice * i.gstPercentage) / 100,
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
        invoice_date: invoiceDate,
        delivery_date: deliveryDate || null,
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
    <Card>
      <CardHeader>
        <CardTitle>Enter New Purchase Invoice</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <Label className="text-xs text-muted-foreground">
              Invoice / Challan No.
            </Label>
            <Input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              placeholder="SUP-2026-0042"
              className="mt-1"
            />
            <FieldError message={apiErrors.get("invoice_number")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Supplier Company
            </Label>
            <div className="flex gap-2 mt-1">
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
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
          <div>
            <Label className="text-xs text-muted-foreground">
              Invoice Date
            </Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="mt-1"
            />
            <FieldError message={apiErrors.get("invoice_date")} />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">
              Delivery Date
            </Label>
            <Input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="mt-1"
            />
            <FieldError message={apiErrors.get("delivery_date")} />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Invoice Items</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Select Medicines
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="border rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No items added yet. Click &quot;Select Medicines&quot; to choose
              from your registry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Batch No.</TableHead>
                  <TableHead>Expiry</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Purchase ₹</TableHead>
                  <TableHead>GST %</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>
                      <div className="font-medium text-sm">
                        {i.medicineName}
                      </div>
                      <div className="text-xs text-muted-foreground">
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
                        className="h-8"
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
                        className="h-8"
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
                        className="h-8 w-20"
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
                        className="h-8 w-24"
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
                        className="h-8 w-20"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                        onClick={() => handleRemove(i.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Unique Formulations</p>
            <p className="text-lg font-semibold">{summary.formulations}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Loaded Volume</p>
            <p className="text-lg font-semibold">{summary.totalQty} units</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">GST Total</p>
            <p className="text-lg font-semibold">
              ₹{summary.gstTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Grand Total</p>
            <p className="text-lg font-bold text-primary">
              ₹{summary.grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || items.length === 0}
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Select Medicines</DialogTitle>
            <DialogDescription>
              Pick medicines to include in this invoice
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto space-y-1">
            {medicines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No medicines registered yet
              </p>
            ) : (
              medicines.map((m) => {
                const checked = selectedIds.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
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
                    />
                    <div className="flex-1">
                      <p className="font-medium text-sm">{m.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {m.salt} · {m.category}
                        {m.bup_category ? ` · ${m.bup_category}` : ""}
                      </p>
                    </div>
                  </label>
                );
              })
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedIds([]);
                setSelectDialogOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmSelection}>
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
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle>Audit Stock Removal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs text-muted-foreground">
              Choose Medicine
            </Label>
            <Select
              value={selectedMedId}
              onValueChange={(v) => {
                setSelectedMedId(v);
                setBatchNo("");
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select a medicine" />
              </SelectTrigger>
              <SelectContent>
                {medicines.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} ({m.salt})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError message={apiErrors.get("medicine_id")} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
                Target Batch
              </Label>
              <Select
                value={batchNo}
                onValueChange={setBatchNo}
                disabled={!selectedMed}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
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
            <div>
              <Label className="text-xs text-muted-foreground">
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
                className="mt-1 bg-muted"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">
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
                className="mt-1"
              />
              <FieldError message={apiErrors.get("quantity")} />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Deletion Reason
              </Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as RemovalReason)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="destroyed">Destroyed</SelectItem>
                  <SelectItem value="returned">Returned</SelectItem>
                  <SelectItem value="damaged">Damaged</SelectItem>
                  <SelectItem value="defect">Manufacturing Defect</SelectItem>
                </SelectContent>
              </Select>
              <FieldError message={apiErrors.get("reason")} />
            </div>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">
              Compliance Notes
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Document reasoning for audit log"
              className="mt-1"
              rows={3}
            />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !selectedMedId || !batchNo}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4 mr-2" /> Removing…
              </>
            ) : (
              "Confirm Stock Removal"
            )}
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-start gap-3">
            <FileWarning className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-amber-900">
                Near-Expiry Awareness
              </p>
              <p className="text-xs text-amber-700 mt-1">
                Use this workflow for batches expiring soon to maintain regulatory
                compliance.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-600 mt-0.5" />
            <div>
              <p className="font-semibold text-sm text-rose-900">
                Expired Stock Safeguard
              </p>
              <p className="text-xs text-rose-700 mt-1">
                All removals create immutable StockMovement records (BUP removals
                are flagged for NDPS audit).
              </p>
            </div>
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
            New suppliers become immediately available in the picker.
            Required: company name & mobile number.
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
