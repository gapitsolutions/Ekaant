"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  ArrowLeft,
  Trash2,
  Plus,
  Save,
  XCircle,
  AlertTriangle,
  Phone,
  User,
  CalendarDays,
} from "lucide-react";
import { navigate } from "@/lib/navigation";
import { getPatientById, type PatientDetailResponse } from "@/lib/hms-api";
import {
  getInventoryMedicines,
  getPharmacyQueue,
  createDispense,
  cancelDispense,
  parseDoseToNumeric,
  generateInvoiceNumber,
  BUP_STRENGTHS,
  type Medicine,
  type MedicineBatch,
  type MedicineCategory,
  type BupStrength,
  type PaymentMethod,
  type PharmacyQueueItem,
} from "@/lib/pharmacy-api";

interface LineItem {
  id: string;
  medicineId: string;
  medicineName: string;
  salt: string;
  category: MedicineCategory;
  batchNumber: string;
  expiryDate: string;
  dose: string;
  days: number;
  qty: number;
  unitPrice: number;
  total: number;
}

const DEFAULT_BUP_STRENGTH: BupStrength = "2.0mg + 0.5mg";

export default function DispenseWorkstationPage() {
  const params = useParams();
  const sessionId = String(params?.sessionId || "");

  const [queueItem, setQueueItem] = useState<PharmacyQueueItem | null>(null);
  const [patient, setPatient] = useState<PatientDetailResponse | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [invoiceNo] = useState(() => generateInvoiceNumber());

  // Form state
  const [formCategory, setFormCategory] = useState<MedicineCategory>("BUP");
  const [formSubcategory, setFormSubcategory] =
    useState<BupStrength>(DEFAULT_BUP_STRENGTH);
  const [formMedicineId, setFormMedicineId] = useState("");
  const [formBatchNumber, setFormBatchNumber] = useState("");
  const [formDose, setFormDose] = useState("1-0-1");
  const [formDays, setFormDays] = useState(7);
  const [formQty, setFormQty] = useState(0);
  const [formPrice, setFormPrice] = useState(0);

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Settlement
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [cashAmount, setCashAmount] = useState(0);
  const [onlineAmount, setOnlineAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [notes, setNotes] = useState("");

  // Follow-up
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextVisitDays, setNextVisitDays] = useState<number | "">("");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);

  // ── Data load ──
  useEffect(() => {
    if (!sessionId) return;

    let isCancelledLoad = false;
    setIsLoadingData(true);
    setErrorMessage("");

    Promise.all([getPharmacyQueue(), getInventoryMedicines()])
      .then(async ([queueData, medicineData]) => {
        if (isCancelledLoad) return;
        const found =
          queueData.items?.find((item) => item.session_id === sessionId) || null;
        setQueueItem(found);
        setMedicines(medicineData.items || []);
        if (found?.patient_id) {
          try {
            const patientDetail = await getPatientById(found.patient_id);
            if (!isCancelledLoad) setPatient(patientDetail);
          } catch {
            if (!isCancelledLoad) setPatient(null);
          }
        }
      })
      .catch((error: unknown) => {
        if (isCancelledLoad) return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load dispense workstation data.",
        );
      })
      .finally(() => {
        if (!isCancelledLoad) setIsLoadingData(false);
      });

    return () => {
      isCancelledLoad = true;
    };
  }, [sessionId]);

  // ── Cascading dropdowns ──
  const filteredMedicines = useMemo(() => {
    return medicines.filter((m) => {
      if (m.category !== formCategory) return false;
      if (formCategory === "BUP" && m.bup_category !== formSubcategory) {
        return false;
      }
      return m.is_active;
    });
  }, [medicines, formCategory, formSubcategory]);

  const selectedMedicine = useMemo(
    () => medicines.find((m) => m.id === formMedicineId) || null,
    [medicines, formMedicineId],
  );

  const availableBatches: MedicineBatch[] = useMemo(() => {
    return selectedMedicine?.batches?.filter((b) => b.quantity > 0) || [];
  }, [selectedMedicine]);

  const currentBatch = useMemo(
    () =>
      availableBatches.find((b) => b.batch_number === formBatchNumber) || null,
    [availableBatches, formBatchNumber],
  );

  // Cascade resets
  const handleCategoryChange = (cat: MedicineCategory) => {
    setFormCategory(cat);
    if (cat === "BUP") {
      setFormSubcategory(DEFAULT_BUP_STRENGTH);
    }
    setFormMedicineId("");
    setFormBatchNumber("");
    setFormPrice(0);
  };

  const handleSubcategoryChange = (sub: BupStrength) => {
    setFormSubcategory(sub);
    setFormMedicineId("");
    setFormBatchNumber("");
    setFormPrice(0);
  };

  const handleMedicineChange = (id: string) => {
    setFormMedicineId(id);
    const med = medicines.find((m) => m.id === id);
    if (med) {
      const firstBatch = med.batches?.find((b) => b.quantity > 0);
      setFormBatchNumber(firstBatch?.batch_number || "");
      setFormPrice(parseFloat(med.selling_price) || 0);
    } else {
      setFormBatchNumber("");
      setFormPrice(0);
    }
  };

  // Auto-calc qty from dose × days
  useEffect(() => {
    const daily = parseDoseToNumeric(formDose);
    const calc = Math.ceil(daily * (formDays || 0));
    setFormQty(calc || 0);
  }, [formDose, formDays]);

  // ── Add to list ──
  const handleAddToList = () => {
    if (!selectedMedicine) {
      toast.error("Select a medicine first");
      return;
    }
    if (!currentBatch) {
      toast.error("Select a valid batch");
      return;
    }
    if (formQty <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }
    if (formQty > currentBatch.quantity) {
      toast.error(
        `Insufficient stock. Batch has only ${currentBatch.quantity} units`,
      );
      return;
    }

    const existingIdx = lineItems.findIndex(
      (li) =>
        li.medicineId === selectedMedicine.id &&
        li.batchNumber === currentBatch.batch_number,
    );

    if (existingIdx >= 0) {
      const existing = lineItems[existingIdx];
      const newQty = existing.qty + formQty;
      if (newQty > currentBatch.quantity) {
        toast.error(
          `Stacking would exceed stock. Available: ${currentBatch.quantity}`,
        );
        return;
      }
      const updated = [...lineItems];
      updated[existingIdx] = {
        ...existing,
        qty: newQty,
        days: existing.days + formDays,
        total: newQty * existing.unitPrice,
      };
      setLineItems(updated);
    } else {
      const item: LineItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        medicineId: selectedMedicine.id,
        medicineName: selectedMedicine.name,
        salt: selectedMedicine.salt,
        category: selectedMedicine.category,
        batchNumber: currentBatch.batch_number,
        expiryDate: currentBatch.expiry_date,
        dose: formDose,
        days: formDays,
        qty: formQty,
        unitPrice: formPrice,
        total: formQty * formPrice,
      };
      setLineItems((prev) => [...prev, item]);
    }
    toast.success("Added to dispensing list");
  };

  const handleRemoveLine = (id: string) => {
    setLineItems((prev) => prev.filter((li) => li.id !== id));
  };

  // ── Pricing ──
  const subtotal = useMemo(
    () => lineItems.reduce((sum, li) => sum + li.total, 0),
    [lineItems],
  );
  const discountAmount = useMemo(
    () => Math.round(subtotal * (discount / 100)),
    [subtotal, discount],
  );
  const grandTotal = useMemo(
    () => Math.max(0, subtotal - discountAmount),
    [subtotal, discountAmount],
  );

  // Sync payment amounts with method/total
  useEffect(() => {
    if (paymentMethod === "Cash") {
      setCashAmount(grandTotal);
      setOnlineAmount(0);
    } else if (paymentMethod === "Online") {
      setCashAmount(0);
      setOnlineAmount(grandTotal);
    } else {
      // Split: default 50/50
      const half = Math.round(grandTotal / 2);
      setCashAmount(half);
      setOnlineAmount(grandTotal - half);
    }
  }, [paymentMethod, grandTotal]);

  const handleSplitCashChange = (val: number) => {
    const clean = Math.max(0, Math.min(val, grandTotal));
    setCashAmount(clean);
    setOnlineAmount(Math.max(0, grandTotal - clean));
  };

  // ── Next visit scheduling ──
  const handleDaysPreset = (days: number) => {
    setNextVisitDays(days);
    const d = new Date();
    d.setDate(d.getDate() + days);
    setNextVisitDate(d.toISOString().slice(0, 10));
  };

  const handleNextVisitDateChange = (dateStr: string) => {
    setNextVisitDate(dateStr);
    if (dateStr) {
      const target = new Date(dateStr);
      const today = new Date();
      const diffMs = target.setHours(0, 0, 0, 0) - today.setHours(0, 0, 0, 0);
      const diffDays = Math.round(diffMs / 86400000);
      setNextVisitDays(diffDays);
    } else {
      setNextVisitDays("");
    }
  };

  const handleClearNextVisit = () => {
    setNextVisitDate("");
    setNextVisitDays("");
  };

  // ── Save ──
  const handleSaveInvoice = async () => {
    if (lineItems.length === 0) {
      toast.error("Add at least one medicine to the list");
      return;
    }
    if (!sessionId) {
      toast.error("Missing session ID");
      return;
    }

    setIsSaving(true);
    try {
      await createDispense({
        session_id: sessionId,
        display_invoice_number: invoiceNo,
        line_items: lineItems.map((li) => ({
          medicine_id: li.medicineId,
          batch_number: li.batchNumber,
          dose: li.dose,
          days: li.days,
          qty: li.qty,
          unit_price: li.unitPrice,
        })),
        payment: {
          payment_method: paymentMethod,
          cash_amount: cashAmount,
          online_amount: onlineAmount,
          discount,
          notes,
        },
        next_followup_date: nextVisitDate || null,
      });
      toast.success("Dispense invoice saved successfully");
      window.setTimeout(() => navigate("/pharmacy/prescription-queue"), 600);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save invoice",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelDispense = async () => {
    if (!sessionId) return;
    if (!cancelReason.trim()) {
      toast.error("Cancellation reason is required");
      return;
    }
    setIsCancelling(true);
    try {
      await cancelDispense(sessionId, cancelReason.trim());
      toast.success("Prescription cancelled");
      window.setTimeout(() => navigate("/pharmacy/prescription-queue"), 600);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel prescription",
      );
    } finally {
      setIsCancelling(false);
      setCancelDialogOpen(false);
    }
  };

  // ── Derived ──
  const calculateAge = (dob?: string | null) => {
    if (!dob) return "-";
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return "-";
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return `${age}y`;
  };

  const initials = queueItem?.patient_name
    ? queueItem.patient_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  if (isLoadingData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pharmacy/prescription-queue")}
            aria-label="Back to queue"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Dispense Medicines &amp; Bill
            </h1>
            <p className="text-muted-foreground">
              Invoice #{" "}
              <span className="font-mono text-primary">{invoiceNo}</span>
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="border-rose-500 text-rose-600 hover:bg-rose-50"
          onClick={() => setCancelDialogOpen(true)}
        >
          <XCircle className="h-4 w-4 mr-2" />
          Cancel Prescription
        </Button>
      </div>

      {errorMessage ? (
        <p className="text-sm text-destructive">{errorMessage}</p>
      ) : null}

      {/* Patient Banner */}
      {queueItem ? (
        <Card className="border-0 shadow-md bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-primary/15 flex items-center justify-center">
                  <span className="text-lg font-bold text-primary">
                    {initials}
                  </span>
                </div>
                <div>
                  <p className="text-lg font-semibold">
                    {queueItem.patient_name}
                  </p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {calculateAge(patient?.date_of_birth)}{" "}
                      {patient?.sex === "male"
                        ? "/ M"
                        : patient?.sex === "female"
                          ? "/ F"
                          : ""}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {patient?.phone_number || queueItem.patient?.phone || "—"}
                    </span>
                    <Badge variant="outline" className="font-mono">
                      {queueItem.patient?.file_number ||
                        queueItem.patient?.registration_number ||
                        "—"}
                    </Badge>
                  </div>
                </div>
              </div>
              {Number(queueItem.outstanding_debt) > 0 ? (
                <Badge
                  variant="outline"
                  className="border-rose-500 text-rose-700 bg-rose-50 text-sm px-3 py-1"
                >
                  Outstanding ₹
                  {Number(queueItem.outstanding_debt).toLocaleString("en-IN")}
                </Badge>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <p className="text-sm text-amber-800">
              Session not found in the pharmacy queue. The visit may already be
              completed.
            </p>
          </CardContent>
        </Card>
      )}

      {/* 4-Panel Grid */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* TOP-LEFT: Medicine Entry */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Medicine Entry</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {/* Category Tabs */}
            <Tabs
              value={formCategory}
              onValueChange={(v) => handleCategoryChange(v as MedicineCategory)}
            >
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="BUP">BUP</TabsTrigger>
                <TabsTrigger value="Rx">Rx</TabsTrigger>
                <TabsTrigger value="NRx">NRx</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* BUP Strength */}
            {formCategory === "BUP" ? (
              <div>
                <Label className="text-xs text-muted-foreground">
                  BUP Strength
                </Label>
                <Select
                  value={formSubcategory}
                  onValueChange={(v) => handleSubcategoryChange(v as BupStrength)}
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
            ) : null}

            {/* Medicine */}
            <div>
              <Label className="text-xs text-muted-foreground">Medicine</Label>
              <Select
                value={formMedicineId}
                onValueChange={handleMedicineChange}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a medicine" />
                </SelectTrigger>
                <SelectContent>
                  {filteredMedicines.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No medicines available
                    </div>
                  ) : (
                    filteredMedicines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.salt})
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Batch */}
            <div>
              <Label className="text-xs text-muted-foreground">Batch</Label>
              <Select
                value={formBatchNumber}
                onValueChange={setFormBatchNumber}
                disabled={!selectedMedicine}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select batch" />
                </SelectTrigger>
                <SelectContent>
                  {availableBatches.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No available batches
                    </div>
                  ) : (
                    availableBatches.map((b) => (
                      <SelectItem key={b.batch_number} value={b.batch_number}>
                        {b.batch_number} · Exp{" "}
                        {new Date(b.expiry_date).toLocaleDateString("en-IN")} ·
                        Stock {b.quantity}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Dose / Days / Qty */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Dose</Label>
                <Input
                  value={formDose}
                  onChange={(e) => setFormDose(e.target.value)}
                  placeholder="1-0-1"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Days</Label>
                <Input
                  type="number"
                  min={1}
                  value={formDays}
                  onChange={(e) =>
                    setFormDays(Math.max(1, parseInt(e.target.value) || 0))
                  }
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Qty</Label>
                <Input
                  type="number"
                  min={0}
                  value={formQty}
                  onChange={(e) =>
                    setFormQty(Math.max(0, parseInt(e.target.value) || 0))
                  }
                  className="mt-1"
                />
              </div>
            </div>

            {/* Unit Price */}
            <div>
              <Label className="text-xs text-muted-foreground">
                Unit Price (₹)
              </Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={formPrice}
                onChange={(e) =>
                  setFormPrice(Math.max(0, parseFloat(e.target.value) || 0))
                }
                className="mt-1"
              />
            </div>

            <Button onClick={handleAddToList} className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add to List
            </Button>
          </CardContent>
        </Card>

        {/* TOP-RIGHT: Dispensing List */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Dispensing List</CardTitle>
              <Badge variant="secondary">{lineItems.length} items</Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {lineItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <p className="text-sm text-muted-foreground">
                  No medicines added yet
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use the entry form on the left to add items
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {lineItems.map((li) => (
                  <div
                    key={li.id}
                    className="border rounded-lg p-3 hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium truncate">
                            {li.medicineName}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {li.category}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {li.salt}
                        </p>
                        <div className="mt-1 grid grid-cols-4 gap-2 text-xs">
                          <span>
                            <span className="text-muted-foreground">
                              Batch:
                            </span>{" "}
                            {li.batchNumber}
                          </span>
                          <span>
                            <span className="text-muted-foreground">Dose:</span>{" "}
                            {li.dose}
                          </span>
                          <span>
                            <span className="text-muted-foreground">Days:</span>{" "}
                            {li.days}
                          </span>
                          <span>
                            <span className="text-muted-foreground">Qty:</span>{" "}
                            {li.qty}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <p className="font-semibold text-primary">
                          ₹{li.total.toLocaleString("en-IN")}
                        </p>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-rose-600 hover:bg-rose-50"
                          onClick={() => handleRemoveLine(li.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BOTTOM-LEFT: Schedule Next Visit + Notes */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Schedule Next Visit
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Quick Presets
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {[7, 10, 15, 30, 45].map((d) => (
                  <Button
                    key={d}
                    variant={nextVisitDays === d ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleDaysPreset(d)}
                  >
                    {d} days
                  </Button>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearNextVisit}
                  className="text-muted-foreground"
                >
                  Clear
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Days</Label>
                <Input
                  type="number"
                  min={1}
                  value={nextVisitDays}
                  onChange={(e) => {
                    const days = parseInt(e.target.value) || 0;
                    if (days > 0) {
                      handleDaysPreset(days);
                    } else {
                      handleClearNextVisit();
                    }
                  }}
                  placeholder="—"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Date</Label>
                <Input
                  type="date"
                  value={nextVisitDate}
                  onChange={(e) => handleNextVisitDateChange(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Ledger Remarks / Notes
              </Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this dispense"
                className="mt-1"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* BOTTOM-RIGHT: Settlement */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Settlement &amp; Pricing</CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">
                Payment Method
              </Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Online">Online</SelectItem>
                  <SelectItem value="Split">Split</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground">
                Discount (%)
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.1"
                value={discount}
                onChange={(e) =>
                  setDiscount(
                    Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                  )
                }
                className="mt-1"
              />
            </div>

            {paymentMethod === "Split" ? (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      handleSplitCashChange(Math.round(grandTotal / 2))
                    }
                  >
                    50 / 50 Split
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSplitCashChange(grandTotal)}
                  >
                    100% Cash
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSplitCashChange(0)}
                  >
                    100% Online
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Cash Amount (₹)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      value={cashAmount}
                      onChange={(e) =>
                        handleSplitCashChange(parseFloat(e.target.value) || 0)
                      }
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Online Amount (₹)
                    </Label>
                    <Input
                      type="number"
                      value={onlineAmount}
                      readOnly
                      className="mt-1 bg-muted"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            <div className="border-t pt-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">
                  ₹{subtotal.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Discount ({discount}%)
                </span>
                <span className="font-medium text-rose-600">
                  − ₹{discountAmount.toLocaleString("en-IN")}
                </span>
              </div>
              <div className="flex justify-between text-base pt-2 border-t">
                <span className="font-semibold">Net Payable</span>
                <span className="font-bold text-primary">
                  ₹{grandTotal.toLocaleString("en-IN")}
                </span>
              </div>
            </div>

            <Button
              className="w-full"
              size="lg"
              onClick={handleSaveInvoice}
              disabled={isSaving || lineItems.length === 0}
            >
              {isSaving ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Saving…
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Dispense &amp; Save Invoice
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Prescription</DialogTitle>
            <DialogDescription>
              This will complete the visit with a cancelled outcome. Provide a
              reason for cancellation.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label className="text-xs text-muted-foreground">Reason</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Patient declined treatment"
              className="mt-1"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={isCancelling}
            >
              Close
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleCancelDispense}
              disabled={isCancelling || !cancelReason.trim()}
            >
              {isCancelling ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Cancelling…
                </>
              ) : (
                "Confirm Cancel"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
