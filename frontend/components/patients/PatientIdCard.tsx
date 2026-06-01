"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Download, Printer, Loader2, AlertCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CreditCard } from "lucide-react";
import {
  renderIdCardCanvas,
  idCardPdfFromCanvas,
  type IdCardPatientData,
} from "@/lib/export/generatePatientIdCardPdf";

export type { IdCardPatientData };

interface PatientIdCardProps {
  patient: IdCardPatientData;
}

/**
 * Patient ID Card panel.
 *
 * The card is rendered once to a canvas (the single source of truth in
 * `generatePatientIdCardPdf`). The preview <img>, the downloaded PDF and the
 * printed PDF are all derived from that same canvas, so they match exactly.
 */
export function PatientIdCard({ patient }: PatientIdCardProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(true);
  const [renderFailed, setRenderFailed] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Holds the most recently rendered canvas so Download/Print reuse it
  // without re-fetching the photo.
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Re-render whenever the patient (or their photo) changes.
  useEffect(() => {
    let cancelled = false;
    setIsRendering(true);
    setRenderFailed(false);

    renderIdCardCanvas(patient)
      .then((canvas) => {
        if (cancelled) return;
        canvasRef.current = canvas;
        setPreviewUrl(canvas.toDataURL("image/png"));
      })
      .catch(() => {
        if (cancelled) return;
        canvasRef.current = null;
        setRenderFailed(true);
      })
      .finally(() => {
        if (!cancelled) setIsRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    patient.file_number,
    patient.full_name,
    patient.photo_url,
    patient.date_of_birth,
    patient.gender,
    patient.phone,
    patient.registration_date,
    patient.blood_group,
    patient.address,
    patient.city,
    patient.district,
    patient.state,
    patient.pincode,
  ]);

  // Ensure a fresh canvas exists (renders one if the cached canvas is gone).
  const ensureCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (canvasRef.current) return canvasRef.current;
    const canvas = await renderIdCardCanvas(patient);
    canvasRef.current = canvas;
    return canvas;
  }, [patient]);

  const handleDownload = useCallback(async () => {
    if (isExporting || isRendering) return;
    setIsExporting(true);
    try {
      const canvas = await ensureCanvas();
      const doc = idCardPdfFromCanvas(canvas);
      doc.save(`patient-id-card-${patient.file_number || "patient"}.pdf`);
    } finally {
      setIsExporting(false);
    }
  }, [ensureCanvas, isExporting, isRendering, patient.file_number]);

  const handlePrint = useCallback(async () => {
    if (isExporting || isRendering) return;
    setIsExporting(true);
    try {
      const canvas = await ensureCanvas();
      const doc = idCardPdfFromCanvas(canvas);
      const blobUrl = doc.output("bloburl") as unknown as string;
      const printWindow = window.open(blobUrl, "_blank");
      if (printWindow) {
        printWindow.addEventListener("load", () => {
          printWindow.focus();
          printWindow.print();
        });
      }
    } finally {
      setIsExporting(false);
    }
  }, [ensureCanvas, isExporting, isRendering]);

  const actionsDisabled = isExporting || isRendering || renderFailed;

  return (
    <Card>
      <CardHeader className="pb-4 flex flex-row items-center justify-between border-b">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#0d7377]" />
            Patient ID Card
          </CardTitle>
          <CardDescription className="mt-1.5">
            Preview, print or download the patient&apos;s identity card
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={actionsDisabled}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Printer className="h-4 w-4 mr-2" />
            )}
            Print
          </Button>
          <Button
            className="bg-[#0d7377] hover:bg-[#0a5c5f] text-white"
            onClick={handleDownload}
            disabled={actionsDisabled}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PDF
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex justify-center bg-slate-50/50 py-10 rounded-b-lg">
        <div
          className="w-full max-w-[460px]"
          style={{ aspectRatio: "5 / 3" }}
        >
          {isRendering ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-white text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d7377]" />
              <span className="text-sm">Generating ID card…</span>
            </div>
          ) : renderFailed ? (
            <div className="h-full w-full flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-white text-muted-foreground">
              <AlertCircle className="h-6 w-6 text-red-500" />
              <span className="text-sm">Could not generate the ID card.</span>
            </div>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={`ID card for ${patient.full_name}`}
              className="w-full h-full object-contain rounded-xl shadow-lg transition-transform duration-300 hover:scale-[1.02]"
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
