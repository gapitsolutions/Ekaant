"use client";

import { type ChangeEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Boxes,
  FileImage,
  FileSpreadsheet,
  Layers,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { FieldError } from "@/components/ui/field-error";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import {
  submitPurchaseInvoice,
  type Medicine,
  type MedicineCategory,
  type Supplier,
} from "@/lib/pharmacy-api";
import { SupplierCreateDialog } from "@/components/pharmacy/supplier-create-dialog";

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

const todayIso = () => new Date().toISOString().slice(0, 10);

/**
 * Canonical purchase-invoice entry form — global medicine catalogue + search,
 * multi-batch line items, document upload (PDF/JPG/PNG/WEBP). Shared by the
 * Pharmacy inventory workstation and the Admin supplier console so there is one
 * invoice workflow, one validation set, and one backend contract.
 *
 * - `lockedSupplier` pins the form to one supplier (the supplier-profile case):
 *   the supplier selector is replaced by a read-only chip.
 * - `onRegisterMedicine` (optional) surfaces a "Register new medicine" action
 *   in the Select-Medicines dialog; the parent owns the medicine-create dialog
 *   and refreshes `medicines` on success (Option B — create a medicine inline).
 */
export function PurchaseInvoiceForm({
  medicines,
  suppliers,
  onSupplierCreated,
  onSuccess,
  lockedSupplier,
  onRegisterMedicine,
  title = "Enter Purchase Invoice (Bulk Stock Entry)",
}: {
  medicines: Medicine[];
  suppliers: Supplier[];
  onSupplierCreated: (s: Supplier) => void;
  onSuccess: () => void;
  lockedSupplier?: Supplier;
  onRegisterMedicine?: () => void;
  title?: string;
}) {
  const [invoiceNo, setInvoiceNo] = useState("");
  const [supplierId, setSupplierId] = useState(lockedSupplier?.id ?? "");
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [orderDate, setOrderDate] = useState(todayIso());
  const [deliveryDate, setDeliveryDate] = useState(todayIso());
  const [form6, setForm6] = useState(false);
  const [invoiceDocument, setInvoiceDocument] =
    useState<InvoiceDocumentDraft | null>(null);
  const [items, setItems] = useState<InvoiceItemDraft[]>([]);
  const [selectDialogOpen, setSelectDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [medicineSearch, setMedicineSearch] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const apiErrors = useApiErrors();

  const filteredMedicines = useMemo(() => {
    const q = medicineSearch.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter(
      (m) =>
        m.name.toLowerCase().includes(q) || m.salt.toLowerCase().includes(q),
    );
  }, [medicines, medicineSearch]);

  const makeDraftId = () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const createDraft = (med: Medicine): InvoiceItemDraft => ({
    id: makeDraftId(),
    medicineId: med.id,
    medicineName: med.name,
    category: med.category,
    subcategory: med.bup_category || null,
    batchNumber: "",
    expiryDate: "",
    quantity: 0,
    purchasePrice: 0,
    gstPercentage: 12,
  });

  const handleConfirmSelection = () => {
    const newDrafts: InvoiceItemDraft[] = selectedIds
      .map((id) => medicines.find((m) => m.id === id))
      .filter((m): m is Medicine => Boolean(m))
      .map(createDraft);
    setItems((prev) => [...prev, ...newDrafts]);
    setSelectedIds([]);
    setSelectDialogOpen(false);
  };

  const handleAddBatch = (sourceId: string) => {
    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === sourceId);
      if (idx === -1) return prev;
      const source = prev[idx];
      const clone: InvoiceItemDraft = {
        ...source,
        id: makeDraftId(),
        batchNumber: "",
        expiryDate: "",
        quantity: 0,
      };
      const next = [...prev];
      next.splice(idx + 1, 0, clone);
      return next;
    });
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
    const batchLines = items.length;
    const formulations = new Set(items.map((i) => i.medicineId)).size;
    const totalQty = items.reduce((s, i) => s + i.quantity, 0);
    const gstTotal = items.reduce(
      (s, i) => s + (i.quantity * i.purchasePrice * i.gstPercentage) / 100,
      0,
    );
    const subtotal = items.reduce((s, i) => s + i.quantity * i.purchasePrice, 0);
    return {
      formulations,
      batchLines,
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
    const seenBatchKeys = new Set<string>();
    for (const i of items) {
      const key = `${i.medicineId}::${i.batchNumber.trim().toUpperCase()}`;
      if (seenBatchKeys.has(key)) {
        toast.error(
          `Batch "${i.batchNumber.trim().toUpperCase()}" is listed more than once for ${i.medicineName}. Use a different batch number or combine the quantities into one row.`,
        );
        return;
      }
      seenBatchKeys.add(key);
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
        form6,
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
      setSupplierId(lockedSupplier?.id ?? "");
      setOrderDate(todayIso());
      setInvoiceDate(todayIso());
      setDeliveryDate(todayIso());
      setForm6(false);
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
          <FileSpreadsheet className="h-5 w-5 text-primary" /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-12 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100">
          <div className="space-y-1.5 min-w-0 xl:col-span-2">
            <Label className="text-xs font-bold text-slate-500">
              Invoice / Challan No.
            </Label>
            <Input
              value={invoiceNo}
              onChange={(e) => setInvoiceNo(e.target.value)}
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs uppercase"
            />
            <FieldError message={apiErrors.get("invoice_number")} />
          </div>
          <div className="space-y-1.5 min-w-0 xl:col-span-4">
            <Label className="text-xs font-bold text-slate-500">
              Supplier Company
            </Label>
            {lockedSupplier ? (
              <div className="h-11 rounded-xl bg-slate-100 border border-slate-200 px-3 flex items-center font-bold text-xs text-slate-700 truncate">
                {lockedSupplier.company_name}
              </div>
            ) : (
              <>
                <div className="flex gap-2 min-w-0">
                  <Select value={supplierId} onValueChange={setSupplierId}>
                    <SelectTrigger
                      title={
                        suppliers.find((s) => s.id === supplierId)
                          ?.company_name || undefined
                      }
                      className="flex-1 min-w-0 h-11 rounded-xl bg-white border-slate-200 font-bold text-xs text-slate-700"
                    >
                      <SelectValue placeholder="Select supplier" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl border-slate-200 text-xs min-w-[16rem] max-w-[min(22rem,90vw)]">
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
              </>
            )}
            <FieldError message={apiErrors.get("supplier_id")} />
          </div>
          <div className="space-y-1.5 min-w-0 xl:col-span-2">
            <Label className="text-xs font-bold text-slate-500">Order Date</Label>
            <Input
              type="date"
              value={orderDate}
              onChange={(e) => setOrderDate(e.target.value)}
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs text-center"
            />
            <FieldError message={apiErrors.get("order_date")} />
          </div>
          <div className="space-y-1.5 min-w-0 xl:col-span-2">
            <Label className="text-xs font-bold text-slate-500">Invoice Date</Label>
            <Input
              type="date"
              value={invoiceDate}
              onChange={(e) => setInvoiceDate(e.target.value)}
              className="h-11 rounded-xl bg-white border-slate-200 font-bold text-slate-700 text-xs text-center"
            />
            <FieldError message={apiErrors.get("invoice_date")} />
          </div>
          <div className="space-y-1.5 min-w-0 xl:col-span-2">
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
              // eslint-disable-next-line @next/next/no-img-element
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

        {/* Form 6 — controlled-substance register compliance flag. */}
        <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-5 py-3 cursor-pointer">
          <div>
            <p className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Form 6 cleared
            </p>
            <p className="text-[10px] text-slate-400 font-bold mt-0.5">
              Mark if this purchase is recorded in the Form 6 register (controlled
              substances).
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] font-black ${form6 ? "text-slate-300" : "text-rose-500"}`}
            >
              NO
            </span>
            <Switch
              checked={form6}
              onCheckedChange={setForm6}
              className="data-[state=checked]:bg-primary"
            />
            <span
              className={`text-[10px] font-black ${form6 ? "text-primary" : "text-slate-300"}`}
            >
              YES
            </span>
          </div>
        </label>

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
            <p className="text-sm font-bold text-slate-400">No items added yet.</p>
            <p className="text-xs text-slate-400 mt-1">
              Click &quot;Select Medicines&quot; to pick items from the registry.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border border-slate-100 rounded-t-2xl">
                <div className="col-span-4">Medicine &amp; Formulation</div>
                <div className="col-span-2 text-center">Batch / Expiry</div>
                <div className="col-span-2 text-center">Qty / Price</div>
                <div className="col-span-1 text-center">GST %</div>
                <div className="col-span-2 text-right">Total Values</div>
                <div className="col-span-1" />
              </div>
              <div className="divide-y divide-slate-100 bg-white border-x border-b border-slate-100 rounded-b-2xl">
                {items.map((i) => {
                  const base = (i.quantity || 0) * (i.purchasePrice || 0);
                  const gstAmount = (base * (i.gstPercentage || 0)) / 100;
                  const lineTotal = base + gstAmount;
                  return (
                    <div
                      key={i.id}
                      className="grid grid-cols-12 gap-3 px-5 py-4 items-center hover:bg-slate-50/40 transition-colors group"
                    >
                      <div className="col-span-4 pr-2 min-w-0">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="font-extrabold text-slate-800 text-sm leading-none truncate">
                            {i.medicineName}
                          </span>
                          <Badge
                            variant="outline"
                            className="text-[9px] uppercase font-bold text-slate-400 px-1.5 py-0 h-4 flex items-center border-slate-200"
                          >
                            {i.category}
                          </Badge>
                        </div>
                        {i.subcategory ? (
                          <p className="text-[9px] text-slate-400 mt-0.5">
                            {i.subcategory}
                          </p>
                        ) : null}
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Input
                          placeholder="Batch No."
                          value={i.batchNumber}
                          onChange={(e) =>
                            updateItem(i.id, {
                              batchNumber: e.target.value.toUpperCase(),
                            })
                          }
                          className="h-8 rounded-lg bg-slate-50 border-slate-200 font-black text-slate-700 text-xs text-center uppercase focus:bg-white"
                        />
                        <Input
                          type="date"
                          value={i.expiryDate}
                          onChange={(e) =>
                            updateItem(i.id, { expiryDate: e.target.value })
                          }
                          className="h-8 rounded-lg bg-slate-50 border-slate-200 font-bold text-slate-700 text-xs text-center px-1 focus:bg-white"
                        />
                      </div>
                      <div className="col-span-2 space-y-1.5">
                        <Input
                          type="number"
                          min={0}
                          placeholder="Qty"
                          value={i.quantity || ""}
                          onChange={(e) =>
                            updateItem(i.id, {
                              quantity: parseInt(e.target.value) || 0,
                            })
                          }
                          className="h-8 rounded-lg bg-slate-50 border-slate-200 font-black text-slate-700 text-xs text-center focus:bg-white"
                        />
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">
                            ₹
                          </span>
                          <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="Price"
                            value={i.purchasePrice || ""}
                            onChange={(e) =>
                              updateItem(i.id, {
                                purchasePrice: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="h-8 rounded-lg bg-slate-50 border-slate-200 font-black text-primary text-xs text-center pl-5 focus:bg-white"
                          />
                        </div>
                      </div>
                      <div className="col-span-1">
                        <div className="relative">
                          <Input
                            type="number"
                            min={0}
                            max={100}
                            step="0.1"
                            placeholder="0"
                            value={i.gstPercentage || ""}
                            onChange={(e) =>
                              updateItem(i.id, {
                                gstPercentage: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="h-8 rounded-lg bg-slate-50 border-slate-200 font-black text-purple-600 text-xs text-center pr-4 focus:bg-white"
                          />
                          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-purple-400">
                            %
                          </span>
                        </div>
                      </div>
                      <div className="col-span-2 text-right flex flex-col justify-center">
                        <p className="font-extrabold text-emerald-600 text-sm">
                          ₹
                          {lineTotal.toLocaleString("en-IN", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </p>
                        <div className="mt-1 flex flex-col gap-0.5">
                          <p className="text-[9px] font-bold text-slate-400 leading-none">
                            Base: ₹{base.toFixed(2)}
                          </p>
                          <p className="text-[9px] font-bold text-purple-400 leading-none">
                            GST: ₹{gstAmount.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="col-span-1 flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleAddBatch(i.id)}
                          title={`Add another batch of ${i.medicineName}`}
                          className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-primary hover:bg-teal-50 hover:border-teal-100 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                        >
                          <Layers className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(i.id)}
                          title="Remove item"
                          className="w-8 h-8 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 hover:border-rose-100 transition-all shadow-sm opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-100 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full md:w-auto">
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block">
                Formulations / Batches
              </span>
              <strong className="text-xs text-slate-800 block mt-1">
                {summary.formulations} med · {summary.batchLines} batch
                {summary.batchLines === 1 ? "" : "es"}
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
            className="w-full md:w-auto bg-primary hover:bg-primary-dark text-white font-extrabold rounded-xl h-12 px-8 shadow-md shadow-teal-900/10 flex items-center justify-center gap-2 hover:scale-[1.01] transition-transform text-xs flex-shrink-0"
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
      <Dialog
        open={selectDialogOpen}
        onOpenChange={(o) => {
          if (!o) setMedicineSearch("");
          setSelectDialogOpen(o);
        }}
      >
        <DialogContent className="sm:max-w-[600px] bg-white rounded-2xl border-slate-100 p-0 overflow-hidden shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="text-lg font-black text-slate-800">
              Select Medicines for Invoice
            </DialogTitle>
            <DialogDescription className="text-xs font-semibold text-slate-500">
              Check all the items that are present on this invoice. Re-select a
              medicine (or use the layers icon on a row) to add another batch of
              it.
            </DialogDescription>
            <div className="flex items-center gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={medicineSearch}
                  onChange={(e) => setMedicineSearch(e.target.value)}
                  placeholder="Search by name or salt…"
                  aria-label="Search medicines"
                  autoFocus
                  className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs font-semibold text-slate-700"
                />
                {medicineSearch && (
                  <button
                    type="button"
                    onClick={() => setMedicineSearch("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {onRegisterMedicine && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSelectDialogOpen(false);
                    onRegisterMedicine();
                  }}
                  className="h-10 rounded-xl border-primary/30 bg-teal-50/50 hover:bg-teal-50 text-xs font-black text-primary flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="h-4 w-4" /> New medicine
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className="p-2 max-h-[350px] overflow-y-auto bg-slate-50/30">
            {medicines.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold">
                No medicines registered yet
              </div>
            ) : filteredMedicines.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs font-bold">
                No medicines match &ldquo;{medicineSearch}&rdquo;.
              </div>
            ) : (
              <div className="space-y-1 px-4 py-2">
                {filteredMedicines.map((m) => {
                  const checked = selectedIds.includes(m.id);
                  const addedCount = items.filter(
                    (i) => i.medicineId === m.id,
                  ).length;
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
                        <div className="text-sm font-black text-slate-800 truncate flex items-center gap-1.5">
                          {m.name}
                          {addedCount > 0 ? (
                            <span className="text-[9px] font-bold text-primary bg-teal-50 border border-teal-100 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                              {addedCount} batch{addedCount === 1 ? "" : "es"}{" "}
                              added
                            </span>
                          ) : null}
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
              className="rounded-xl bg-primary hover:bg-primary-dark text-xs font-bold text-white"
            >
              Add {selectedIds.length} medicine(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
