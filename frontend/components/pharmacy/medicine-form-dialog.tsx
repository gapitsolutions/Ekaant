"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Spinner } from "@/components/ui/spinner";
import { Building2, Pill } from "lucide-react";
import {
  addInventoryMedicine,
  updateInventoryMedicine,
  BUP_STRENGTHS,
  type BupStrength,
  type Medicine,
  type MedicineCategory,
  type MedicineSupplierRef,
  type Supplier,
} from "@/lib/pharmacy-api";
import { SupplierMultiSelect } from "@/components/pharmacy/supplier-multi-select";

/**
 * Register / edit a medicine. Shared by the Pharmacy inventory workstation and
 * the Admin supplier console so there is ONE medicine form + one create/update
 * contract. `presetSupplier` auto-selects (and keeps visible) a supplier in the
 * picker — used by the supplier console's "Add Product" and the invoice-flow
 * "New medicine" so the medicine is linked to the current supplier on save.
 */
export function MedicineFormDialog({
  open,
  onOpenChange,
  editTarget,
  onSuccess,
  suppliers,
  onSupplierCreated,
  presetSupplier,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editTarget: Medicine | null;
  onSuccess: () => void;
  suppliers: Supplier[];
  onSupplierCreated: (s: Supplier) => void;
  presetSupplier?: Supplier;
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
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
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
    setSelectedSupplierIds([]);
  };

  useEffect(() => {
    if (!open) return;
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
      setSelectedSupplierIds((editTarget.suppliers || []).map((s) => s.id));
    } else {
      resetForm();
      // Auto-link the current supplier when registering from a supplier
      // context (Add Product / invoice "New medicine").
      if (presetSupplier) setSelectedSupplierIds([presetSupplier.id]);
    }
  }, [open, editTarget, presetSupplier]);

  // Picker options: the global supplier list, plus any already-linked
  // suppliers and the preset supplier so neither silently disappears.
  const supplierOptions = useMemo(() => {
    const map = new Map<string, MedicineSupplierRef>();
    for (const s of suppliers) {
      map.set(s.id, {
        id: s.id,
        company_name: s.company_name,
        is_active: s.is_active,
        categories: s.categories,
      });
    }
    for (const s of editTarget?.suppliers || []) {
      if (!map.has(s.id)) map.set(s.id, s);
    }
    if (presetSupplier && !map.has(presetSupplier.id)) {
      map.set(presetSupplier.id, {
        id: presetSupplier.id,
        company_name: presetSupplier.company_name,
        is_active: presetSupplier.is_active,
        categories: presetSupplier.categories,
      });
    }
    return Array.from(map.values()).sort((a, b) =>
      a.company_name.localeCompare(b.company_name),
    );
  }, [suppliers, editTarget, presetSupplier]);

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
        supplier_ids: selectedSupplierIds,
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
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl bg-white border border-slate-100">
        <DialogHeader className="p-6 pb-3 border-b border-slate-50 flex-shrink-0">
          <DialogTitle className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" />
            {isEdit ? "Edit Medicine" : "Register New Medicine"}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            {isEdit
              ? "Update medicine details. Changes apply to future dispenses."
              : presetSupplier
                ? `Register a product and link it to ${presetSupplier.company_name}.`
                : "Configure standard chemical salts, dosage constraints and reorder alert levels."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4 px-6 py-4 flex-1 overflow-y-auto">
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

          <div className="space-y-1.5 col-span-2">
            <Label className="text-xs font-bold text-slate-500 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              Suppliers
              <span className="text-[10px] font-normal text-slate-400">
                (optional — for tracking)
              </span>
            </Label>
            <SupplierMultiSelect
              suppliers={supplierOptions}
              selectedIds={selectedSupplierIds}
              onChange={setSelectedSupplierIds}
              onSupplierCreated={onSupplierCreated}
              category={category}
            />
          </div>
        </div>

        <DialogFooter className="p-6 pt-3 border-t border-slate-50 flex-shrink-0 bg-white">
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
            className="bg-primary hover:bg-primary-dark font-extrabold rounded-xl h-11 px-6 shadow-md shadow-teal-900/10 text-xs"
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
