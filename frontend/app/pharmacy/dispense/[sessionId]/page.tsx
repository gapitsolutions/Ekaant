"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
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
  XCircle,
  AlertTriangle,
  Phone,
  User,
  Pill,
  CreditCard,
  FileText,
  Package,
  ShoppingCart,
  Layers,
  Calendar,
  ShieldCheck,
  Activity,
} from "lucide-react";
import { navigate } from "@/lib/navigation";
import { getPatientById, type PatientDetailResponse } from "@/lib/hms-api";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import { FieldError } from "@/components/ui/field-error";
import {
  getInventoryMedicines,
  getPharmacyQueue,
  createDispense,
  cancelDispense,
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
  qty: number;
  unitPrice: number;
  total: number;
}

const DEFAULT_BUP_STRENGTH: BupStrength = "2.0mg + 0.5mg";

// Dose pattern and number-of-days are no longer captured during dispensing —
// the pharmacist enters the total quantity directly and the amount is
// qty × unit price. The backend DispenseLineItem serializer/model still
// require these descriptive fields, so we persist safe, neutral defaults to
// preserve backward compatibility (they have no effect on any calculation).
const DEFAULT_DISPENSE_DOSE = "-";
const DEFAULT_DISPENSE_DAYS = 1;

export default function DispenseWorkstationPage() {
  const params = useParams();
  const sessionId = String(params?.sessionId || "");

  const [queueItem, setQueueItem] = useState<PharmacyQueueItem | null>(null);
  const [patient, setPatient] = useState<PatientDetailResponse | null>(null);
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");


  // Form state
  const [formCategory, setFormCategory] = useState<MedicineCategory>("BUP");
  const [formSubcategory, setFormSubcategory] =
    useState<BupStrength>(DEFAULT_BUP_STRENGTH);
  const [formMedicineId, setFormMedicineId] = useState("");
  const [formBatchNumber, setFormBatchNumber] = useState("");
  const [formQty, setFormQty] = useState(0);
  const [formPrice, setFormPrice] = useState(0);

  // Line items
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  // Settlement
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [cashAmount, setCashAmount] = useState(0);
  const [onlineAmount, setOnlineAmount] = useState(0);
  const [discount, setDiscount] = useState(0); // percentage — DISPLAY ONLY (not sent)
  const [discountRupees, setDiscountRupees] = useState(0); // amount in ₹ (primary input, sent to backend)
  const [notes, setNotes] = useState("");

  // Follow-up
  const [nextVisitDate, setNextVisitDate] = useState("");
  const [nextVisitDays, setNextVisitDays] = useState<number | "">("");

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const apiErrors = useApiErrors();
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
  // discountRupees is the primary input; clamp it to subtotal
  const discountAmount = Math.min(discountRupees, subtotal);
  const grandTotal = Math.max(0, subtotal - discountAmount);

  // Auto-sync percentage from rupee amount (for backend submission)
  useEffect(() => {
    if (subtotal > 0) {
      const pct = parseFloat(((discountRupees / subtotal) * 100).toFixed(2));
      setDiscount(Math.min(pct, 100));
    } else {
      setDiscount(0);
    }
  }, [discountRupees, subtotal]);

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

    apiErrors.clear();
    setIsSaving(true);
    try {
      await createDispense({
        session_id: sessionId,
        line_items: lineItems.map((li) => ({
          medicine_id: li.medicineId,
          batch_number: li.batchNumber,
          // Dose/days are no longer entered; send neutral defaults the
          // backend still requires (descriptive only, not used in pricing).
          dose: DEFAULT_DISPENSE_DOSE,
          days: DEFAULT_DISPENSE_DAYS,
          qty: li.qty,
          unit_price: li.unitPrice,
        })),
        payment: {
          payment_method: paymentMethod,
          cash_amount: cashAmount,
          online_amount: onlineAmount,
          // Send the discount as a rupee AMOUNT (2 dp). The backend is the
          // authority for net payable and derives cash/online for Cash/Online,
          // so no percentage round-trip is involved.
          discount: Math.round(discountAmount * 100) / 100,
          notes,
        },
        next_followup_date: nextVisitDate || null,
      });
      toast.success("Dispense invoice saved successfully");
      window.setTimeout(() => navigate("/pharmacy/prescription-queue"), 600);
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, "Failed to save invoice");
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
      toastApiError(error, "Failed to cancel prescription");
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
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 font-bold tracking-tight">Loading Dispensing Workstation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/60 pb-20">
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto px-4 sm:px-6 py-6 space-y-6">

      {/* Header */}
      <PageHeader
        leading={
          <button
            onClick={() => navigate("/pharmacy/prescription-queue")}
            aria-label="Back to queue"
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-slate-100 shadow-sm text-slate-500 hover:text-slate-700 transition-all hover:scale-105 active:scale-95"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        }
        icon={<Pill className="h-7 w-7 text-primary" />}
        title="Dispense Medicines & Bill"
        subtitle="Invoice number will be assigned on save."
        actions={
          <Button
            variant="outline"
            className="border-rose-200 text-rose-600 hover:bg-rose-50 font-extrabold rounded-xl px-4 h-10 shadow-sm"
            onClick={() => setCancelDialogOpen(true)}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel Prescription
          </Button>
        }
      />

      {errorMessage ? (
        <p className="text-sm text-red-600 font-medium">{errorMessage}</p>
      ) : null}

      {/* Patient Summary Header */}
      {queueItem ? (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-primary font-black text-lg flex-shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h2 className="font-extrabold text-slate-800 text-lg leading-none">
                  {queueItem.patient_name}
                </h2>
                <Badge variant="outline" className="text-[10px] font-bold text-slate-500 bg-slate-50 border-slate-200 uppercase tracking-wider px-2 py-0 h-5 font-mono">
                  {queueItem.patient?.file_number || "—"}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  {calculateAge(patient?.date_of_birth)}{" "}
                  {patient?.sex === "male"
                    ? "/ M"
                    : patient?.sex === "female"
                      ? "/ F"
                      : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-slate-400" />
                  {patient?.phone_number || queueItem.patient?.phone || "—"}
                </span>
              </div>
            </div>
          </div>
          {Number(queueItem.outstanding_debt) > 0 ? (
            <Badge
              variant="outline"
              className="border-rose-200 text-rose-700 bg-rose-50 text-sm px-3 py-1 font-bold rounded-xl"
            >
              Outstanding ₹
              {Number(queueItem.outstanding_debt).toLocaleString("en-IN")}
            </Badge>
          ) : null}
        </div>
      ) : (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 shadow-sm p-4 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <p className="text-sm text-amber-800 font-medium">
            Session not found in the pharmacy queue. The visit may already be
            completed.
          </p>
        </div>
      )}

      {/* Formulation Entry Panel */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
            <Layers className="h-4 w-4 text-primary" /> Formulation &amp; Quantity
          </h3>
        </div>

        <div className="p-5 space-y-5">
          {/* ROW 1: Category / Subcategory / Medicine */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Medicine Category</Label>
              <Tabs
                value={formCategory}
                onValueChange={(v) => handleCategoryChange(v as MedicineCategory)}
              >
                <TabsList className="grid grid-cols-3 w-full h-10 rounded-xl">
                  <TabsTrigger value="BUP" className="rounded-lg text-xs font-bold">BUP</TabsTrigger>
                  <TabsTrigger value="Rx" className="rounded-lg text-xs font-bold">Rx</TabsTrigger>
                  <TabsTrigger value="NRx" className="rounded-lg text-xs font-bold">NRx</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subcategory</Label>
              {formCategory === "BUP" ? (
                <Select
                  value={formSubcategory}
                  onValueChange={(v) => handleSubcategoryChange(v as BupStrength)}
                >
                  <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 text-xs">
                    {BUP_STRENGTHS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Select disabled value="none">
                  <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 text-slate-400 font-bold text-xs opacity-60">
                    <SelectValue placeholder="N/A" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">N/A</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="md:col-span-6 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Predefined Formulation</Label>
              <Select
                value={formMedicineId}
                onValueChange={handleMedicineChange}
              >
                <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs text-slate-700">
                  <SelectValue placeholder={
                    filteredMedicines.length === 0
                      ? "No matched formulations"
                      : "Select Formulation (Salt)"
                  } />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 text-xs">
                  {filteredMedicines.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-slate-400">
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
          </div>

          {/* ROW 2: Batch / Expiry / Total Quantity / Price */}
          <div className="grid grid-cols-2 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Batch No.</Label>
              <Select
                value={formBatchNumber}
                onValueChange={setFormBatchNumber}
                disabled={!selectedMedicine}
              >
                <SelectTrigger className="h-10 rounded-xl bg-slate-50 border-slate-200 font-bold text-xs">
                  <SelectValue placeholder={selectedMedicine ? "Select Batch" : "—"} />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 text-xs">
                  {availableBatches.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-slate-400">
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

            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Expiry Date</Label>
              <div className="h-10 flex items-center px-2">
                {currentBatch ? (
                  <Badge variant="outline" className="text-xs font-bold text-slate-600 bg-slate-50 border-slate-200 px-2 py-1">
                    {new Date(currentBatch.expiry_date).toLocaleDateString("en-IN")}
                  </Badge>
                ) : (
                  <span className="text-xs font-bold text-slate-400">—</span>
                )}
              </div>
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Quantity (Tablets)</Label>
              <Input
                type="number"
                min={0}
                value={formQty}
                onChange={(e) =>
                  setFormQty(Math.max(0, parseInt(e.target.value) || 0))
                }
                onWheel={(e) => e.currentTarget.blur()}
                placeholder="e.g. 15"
                className="h-10 rounded-xl bg-teal-50/30 border-teal-200 font-bold text-primary text-xs text-center focus:ring-1 focus:ring-primary"
              />
            </div>

            <div className="md:col-span-3 space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Price/Tab</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                <Input
                  type="number"
                  value={formPrice}
                  readOnly
                  tabIndex={-1}
                  className="h-10 rounded-xl bg-slate-100 border-slate-200 font-bold text-slate-700 text-xs pl-6 pr-2 text-center cursor-default"
                />
              </div>
            </div>
          </div>

          {/* Add to List Button */}
          <div className="flex items-center justify-end pt-2">
            <Button
              onClick={handleAddToList}
              className="bg-primary hover:bg-primary-dark text-white font-bold px-6 h-10 rounded-xl shadow-sm flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> Add to List
            </Button>
          </div>
        </div>
      </div>

      {/* Active Dispensing List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/20">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-primary" /> Active Dispensing List
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Below items are verified and will be deducted from active inventory.</p>
          </div>
          {lineItems.length > 0 && (
            <Badge className="bg-primary text-white font-extrabold text-xs px-2.5 py-0.5 rounded-full border-0">
              {lineItems.length} Formulation(s)
            </Badge>
          )}
        </div>

        {lineItems.length === 0 ? (
          <div className="py-16 text-center">
            <Package className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-semibold">Prescription dispensing list is currently empty.</p>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Select a predefined medicine, enter the total quantity above, and add to populate list.</p>
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-2 px-5 py-3 bg-slate-50/50 text-[10px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
              <div className="col-span-5">Medicine &amp; Salt Detail</div>
              <div className="col-span-2 text-center">Batch / Exp</div>
              <div className="col-span-2 text-center">Quantity</div>
              <div className="col-span-2 text-right">Amount</div>
              <div className="col-span-1" />
            </div>

            {/* Line Items */}
            <div className="divide-y divide-slate-100">
              {lineItems.map((li) => (
                <div key={li.id} className="grid grid-cols-12 gap-2 px-5 py-4 items-center hover:bg-slate-50/50 transition-colors">
                  <div className="col-span-5">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-slate-800 text-sm leading-none">{li.medicineName}</span>
                      <Badge variant="outline" className="text-[9px] font-bold py-0.5 px-2 rounded h-4 flex items-center border-slate-200">
                        {li.category}
                      </Badge>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1 italic font-medium">{li.salt}</p>
                  </div>
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-mono font-bold text-slate-700">{li.batchNumber}</p>
                    <p className="text-[9px] font-bold text-slate-400">Exp: {new Date(li.expiryDate).toLocaleDateString("en-IN")}</p>
                  </div>
                  <div className="col-span-2 text-center">
                    <p className="text-xs font-extrabold text-slate-800">{li.qty} Tabs</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <p className="font-extrabold text-slate-800">₹{li.total.toLocaleString("en-IN")}</p>
                    <p className="text-[9px] font-bold text-slate-400">₹{li.unitPrice}/tab</p>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      onClick={() => handleRemoveLine(li.id)}
                      className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Subtotal */}
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/30 flex justify-between items-center">
              <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">Subtotal ({lineItems.length} Formulation{lineItems.length !== 1 ? "s" : ""})</span>
              <span className="text-base font-extrabold text-slate-800">₹{subtotal.toLocaleString("en-IN")}.00</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Section: Next Visit & Billing side-by-side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">

        {/* BOTTOM-LEFT: Schedule Next Visit + Notes */}
        <div className="space-y-6">
          {/* Next Visit */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="font-bold text-slate-800 text-sm">Schedule Next Visit</h3>
              </div>
              <Badge className="bg-teal-50 border border-teal-100 text-primary font-semibold text-[9px] px-2 py-0.5 rounded">
                Clinical scheduler
              </Badge>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Quick Days Preset</Label>
              <div className="flex flex-wrap gap-2">
                {[2, 3, 5, 7, 10, 14].map((d) => (
                  <button
                    key={d}
                    onClick={() => handleDaysPreset(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition-all ${
                      nextVisitDays === d
                        ? "bg-primary text-white border-primary shadow-sm"
                        : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-800"
                    }`}
                  >
                    {d}
                  </button>
                ))}
                <button
                  onClick={handleClearNextVisit}
                  className="px-3 py-1.5 rounded-lg text-xs font-extrabold border bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Follow-up in Days</Label>
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
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="e.g. 7, 10, 14"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50 text-center font-bold text-slate-700 focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Follow-up Date</Label>
                <input
                  type="date"
                  value={nextVisitDate}
                  onChange={(e) => handleNextVisitDateChange(e.target.value)}
                  className="w-full h-11 px-3 border border-slate-200 bg-slate-50 rounded-xl text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/10 focus:border-primary"
                />
                <FieldError message={apiErrors.get("next_followup_date")} />
              </div>
            </div>

            {nextVisitDate && (
              <div className="bg-teal-50/70 border border-teal-100 rounded-xl p-3.5 flex items-center justify-between mt-2">
                <div className="flex items-center gap-2.5 text-primary">
                  <ShieldCheck className="h-5 w-5 flex-shrink-0" />
                  <span className="text-xs font-black tracking-tight leading-snug">
                    Next Follow-up: <span className="underline decoration-wavy decoration-primary/30 ml-0.5">{new Date(nextVisitDate).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}</span>
                  </span>
                </div>
                <Badge className="bg-primary hover:bg-primary-dark text-white font-extrabold text-[9px] px-2 py-0.5 border-0 rounded-lg">
                  {nextVisitDays ? `${nextVisitDays} Days` : "Custom"}
                </Badge>
              </div>
            )}
          </div>

          {/* Remarks / Notes */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-2 pb-2.5 border-b border-slate-50">
              <FileText className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-slate-800 text-sm">Ledger Remarks &amp; Notes</h3>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Remarks / Instructions</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Record any clinical dispense comments, partial payments, or special instructions..."
                className="rounded-xl border-slate-200 bg-slate-50/50 text-sm min-h-[90px] resize-none font-semibold text-slate-700"
                rows={3}
              />
            </div>
          </div>
        </div>

        {/* BOTTOM-RIGHT: Settlement */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-5 relative overflow-hidden">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-50">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h3 className="font-bold text-slate-800 text-sm">Settlement &amp; Pricing</h3>
            </div>
            <Badge className="bg-teal-50 border border-teal-100 text-primary font-semibold text-[9px] px-2 py-0.5 rounded">
              Deductions verified
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Payment Mode */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Settlement Method</Label>
              <Select
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              >
                <SelectTrigger className="h-11 rounded-xl border-slate-200 bg-slate-50/50 font-medium">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Online">Online / Digital Payment</SelectItem>
                  <SelectItem value="Split">Split Payment (Cash &amp; Online)</SelectItem>
                </SelectContent>
              </Select>
              <FieldError
                message={apiErrors.get("payment.payment_method")}
              />
              <FieldError
                message={apiErrors.get("payment.non_field_errors")}
              />
            </div>

            {/* Discount Amount (primary) + Percentage (auto-calc) */}
            <div className="space-y-1.5">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Discount Amount (₹)</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                <Input
                  type="number"
                  min={0}
                  max={subtotal}
                  step="1"
                  value={discountRupees || ""}
                  onChange={(e) =>
                    setDiscountRupees(
                      Math.max(0, Math.min(subtotal, parseFloat(e.target.value) || 0)),
                    )
                  }
                  onWheel={(e) => e.currentTarget.blur()}
                  placeholder="0"
                  className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-7 text-center font-bold text-slate-700"
                />
              </div>
              {discount > 0 && (
                <p className="text-[10px] font-bold text-slate-400 text-center">
                  ≈ {discount.toFixed(1)}% discount
                </p>
              )}
              <FieldError message={apiErrors.get("payment.discount")} />
            </div>
          </div>

          {/* Split Details */}
          {paymentMethod === "Split" ? (
            <div className="bg-slate-50/80 border border-slate-100 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                <span className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5 text-primary" /> Split Payment Portions
                </span>
                <Badge className="bg-primary/10 text-primary font-black text-[10px] py-0.5 px-2 rounded-lg border-0 h-5 flex items-center">
                  Total: ₹{grandTotal}
                </Badge>
              </div>

              <div className="flex gap-1.5">
                {[
                  { label: "50/50 Split", cash: Math.round(grandTotal / 2) },
                  { label: "100% Cash", cash: grandTotal },
                  { label: "100% Online", cash: 0 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handleSplitCashChange(preset.cash)}
                    className="bg-white hover:bg-slate-100 text-slate-600 font-extrabold text-[10px] px-2.5 py-1 rounded border border-slate-200 transition-colors shadow-sm"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-slate-400">Cash Portion (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={cashAmount}
                    onChange={(e) =>
                      handleSplitCashChange(parseFloat(e.target.value) || 0)
                    }
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-10 rounded-lg border-slate-200 bg-white text-center font-bold text-slate-700"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] font-bold text-slate-400">Online Portion (₹)</Label>
                  <Input
                    type="number"
                    value={onlineAmount}
                    readOnly
                    className="h-10 rounded-lg border-slate-200 bg-white text-center font-bold text-slate-700"
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* Pricing Breakdown */}
          <div className="border-t border-slate-100 pt-4 space-y-2.5">
            <div className="flex justify-between text-sm font-semibold text-slate-500">
              <span>Formulation Subtotal</span>
              <span>₹{subtotal.toLocaleString("en-IN")}.00</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm font-bold text-emerald-600 bg-emerald-50/50 px-2.5 py-1 rounded-lg">
                <span>Discount Allowed ({discount.toFixed(1)}%)</span>
                <span>− ₹{discountAmount.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-lg text-slate-800 border-t border-slate-200 pt-3 mt-1 tracking-tight">
              <span>Net Payable</span>
              <span className="text-primary">₹{grandTotal.toLocaleString("en-IN")}.00</span>
            </div>
          </div>

          {/* Surface line-item and any other backend errors */}
          {(() => {
            const surfaceableKeys = Object.keys(apiErrors.fields).filter(
              (k) =>
                ![
                  "payment.payment_method",
                  "payment.discount",
                  "payment.non_field_errors",
                  "next_followup_date",
                ].includes(k),
            );
            if (surfaceableKeys.length === 0) return null;
            return (
              <div className="border border-rose-200 bg-rose-50 rounded-xl p-3 text-xs space-y-1">
                {surfaceableKeys.map((key) => (
                  <div key={key} className="text-rose-700">
                    <span className="font-mono">{key}</span>:{" "}
                    {apiErrors.fields[key].join("; ")}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Dispense & Save Button */}
          <button
            onClick={handleSaveInvoice}
            disabled={isSaving || lineItems.length === 0}
            className="w-full h-12 bg-gradient-to-r from-primary to-teal-700 hover:from-primary-dark hover:to-teal-800 disabled:opacity-60 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-teal-900/10 hover:scale-[1.01] active:scale-95 mt-1"
          >
            {isSaving ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
            {isSaving ? "Finalizing Settlement..." : "Dispense & Save Invoice"}
          </button>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-black text-slate-800">Cancel Prescription</DialogTitle>
            <DialogDescription className="text-slate-500">
              This will complete the visit with a cancelled outcome. Provide a
              reason for cancellation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reason</Label>
            <Textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Patient declined treatment"
              className="rounded-xl border-slate-200 bg-slate-50/50 text-sm font-semibold text-slate-700"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelDialogOpen(false)}
              disabled={isCancelling}
              className="rounded-xl border-slate-200 font-bold"
            >
              Close
            </Button>
            <Button
              className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold"
              onClick={handleCancelDispense}
              disabled={isCancelling || !cancelReason.trim()}
            >
              {isCancelling ? (
                <>
                  <Spinner className="h-4 w-4 mr-2" /> Cancelling...
                </>
              ) : (
                "Confirm Cancel"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </div>
    </div>
  );
}
