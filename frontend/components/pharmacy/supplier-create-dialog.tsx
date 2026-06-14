"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/ui/field-error";
import { Loader2, Plus } from "lucide-react";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import {
  createSupplier,
  type Supplier,
  type SupplierCategory,
} from "@/lib/pharmacy-api";

export const SUPPLIER_CATEGORY_OPTIONS: SupplierCategory[] = ["BUP", "Rx", "NRx"];

/**
 * Create-supplier modal. Shared across the inventory Register Medicine flow,
 * the purchase-invoice supplier picker, and the CSV import review grid so a
 * new supplier can be added without leaving any of those workflows. On
 * success it returns the created supplier via ``onCreated``.
 */
export function SupplierCreateDialog({
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
