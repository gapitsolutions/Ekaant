"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/ui/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { FieldError } from "@/components/ui/field-error";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import { Wallet } from "lucide-react";
import {
  getBillingSettings,
  updateBillingSettings,
} from "@/lib/pharmacy-api";

export default function BillingSettingsPage() {
  const [fee, setFee] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const apiErrors = useApiErrors();

  useEffect(() => {
    let cancelled = false;
    getBillingSettings()
      .then((s) => {
        if (!cancelled) setFee(s.default_consultation_fee ?? "0");
      })
      .catch((error) => {
        if (!cancelled) toastApiError(error, "Failed to load billing settings");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    const value = parseFloat(fee);
    if (Number.isNaN(value) || value < 0) {
      toast.error("Enter a valid consultation fee (₹0 or more).");
      return;
    }
    apiErrors.clear();
    setIsSaving(true);
    try {
      const updated = await updateBillingSettings({
        default_consultation_fee: value,
      });
      setFee(updated.default_consultation_fee);
      toast.success("Billing settings updated.");
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, "Failed to update billing settings");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        icon={<Wallet className="h-7 w-7 text-primary" />}
        title="Billing Settings"
        subtitle="Hospital-wide financial defaults"
      />

      <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/30">
          <CardTitle className="text-slate-800 font-bold text-sm">
            Default Consultation Fee
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Pre-filled on every new dispense invoice. Pharmacists can still
            edit or waive it per invoice; existing invoices keep their original
            fee.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          {isLoading ? (
            <div className="flex items-center gap-2 text-slate-400 text-sm">
              <Spinner className="h-4 w-4" /> Loading…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5 max-w-xs">
                <Label className="text-xs font-bold text-slate-500">
                  Default Consultation Fee (₹)
                </Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    ₹
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    onWheel={(e) => e.currentTarget.blur()}
                    className="h-11 rounded-xl border-slate-200 bg-slate-50/50 pl-7 font-bold text-slate-700"
                  />
                </div>
                <FieldError message={apiErrors.get("default_consultation_fee")} />
              </div>
              <Button
                onClick={handleSave}
                disabled={isSaving}
                className="bg-primary hover:bg-primary-dark text-white font-extrabold rounded-xl h-11 px-6"
              >
                {isSaving ? (
                  <>
                    <Spinner className="h-4 w-4 mr-2" /> Saving…
                  </>
                ) : (
                  "Save Settings"
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
