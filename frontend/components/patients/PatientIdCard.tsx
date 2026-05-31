"use client";

import { useState, useCallback } from "react";
import { createRoot } from "react-dom/client";
import { User, Download, Printer, Loader2 } from "lucide-react";
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
  HOSPITAL_SHORT_NAME,
  HOSPITAL_SUBTITLE,
  HOSPITAL_LOGO_PATH,
} from "@/lib/export/hospital-branding";
import {
  captureElementAsPng,
  captureElementForPrint,
} from "@/lib/export/generateIdCardImage";
import {
  PatientIdCardExport,
  type IdCardPatientData,
} from "./PatientIdCardExport";

interface PatientIdCardProps {
  patient: IdCardPatientData;
}

function getAge(dob: string): number | string {
  if (!dob) return "N/A";
  const today = new Date();
  const birthDate = new Date(dob);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
}

function formatDate(date: string | undefined): string {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function buildShortAddress(patient: IdCardPatientData): string {
  const parts = [patient.city, patient.district, patient.state].filter(Boolean);
  if (parts.length > 0) return parts.join(", ");
  return patient.address || "N/A";
}

/**
 * Wait until every <img> inside a DOM subtree has loaded (or errored).
 * Falls back after `timeoutMs` so we never hang forever.
 */
function waitForImages(root: HTMLElement, timeoutMs = 3000): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return Promise.resolve();

  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    let loaded = 0;
    const total = imgs.length;
    const onDone = () => {
      loaded++;
      if (loaded >= total) finish();
    };

    for (const img of imgs) {
      if (img.complete) {
        onDone();
      } else {
        img.addEventListener("load", onDone, { once: true });
        img.addEventListener("error", onDone, { once: true });
      }
    }

    setTimeout(finish, timeoutMs);
  });
}

/**
 * Render the export card off-screen, wait for all images to load,
 * run the capture callback, then clean up.
 */
async function renderExportCardAndCapture(
  patient: IdCardPatientData,
  captureFn: (el: HTMLElement) => Promise<void>,
): Promise<void> {
  // Off-screen container — positioned off-screen but NOT display:none
  // (html2canvas needs the element to be in the layout).
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;left:-9999px;top:-9999px;z-index:-1;pointer-events:none;";
  document.body.appendChild(container);

  const root = createRoot(container);
  const cardRef: { current: HTMLDivElement | null } = { current: null };

  // Render and wait for ref
  await new Promise<void>((resolve) => {
    root.render(
      <PatientIdCardExport
        patient={patient}
        ref={(el) => {
          cardRef.current = el;
          if (el) resolve();
        }}
      />,
    );
  });

  // Wait for patient photo, hospital logo, and watermark to load
  if (cardRef.current) {
    await waitForImages(cardRef.current);
  }

  try {
    if (cardRef.current) {
      await captureFn(cardRef.current);
    }
  } finally {
    root.unmount();
    document.body.removeChild(container);
  }
}

export function PatientIdCard({ patient }: PatientIdCardProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handlePrint = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await renderExportCardAndCapture(patient, (el) =>
        captureElementForPrint(el, `Patient ID Card - ${patient.full_name}`),
      );
    } finally {
      setIsExporting(false);
    }
  }, [patient, isExporting]);

  const handleDownload = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await renderExportCardAndCapture(patient, (el) =>
        captureElementAsPng(
          el,
          `patient-id-card-${patient.file_number}.png`,
        ),
      );
    } finally {
      setIsExporting(false);
    }
  }, [patient, isExporting]);

  const shortAddress = buildShortAddress(patient);

  return (
    <Card>
      <CardHeader className="pb-4 flex flex-row items-center justify-between border-b">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[#0d7377]" />
            Patient ID Card
          </CardTitle>
          <CardDescription className="mt-1.5">
            Preview and download the patient&apos;s identity card
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handlePrint}
            disabled={isExporting}
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
            disabled={isExporting}
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Download PNG
          </Button>
        </div>
      </CardHeader>

      {/* On-screen preview — scaled-down version for display only */}
      <CardContent className="flex justify-center bg-slate-50/50 py-10 rounded-b-lg">
        <div
          className="hover:scale-[1.03] transition-transform duration-300"
          style={{
            width: "420px",
            height: "260px",
            background: "white",
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)",
            border: "1px solid #e2e8f0",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          {/* Preview Header */}
          <div
            style={{
              height: 48,
              background: "linear-gradient(135deg, #0d7377 0%, #14919b 100%)",
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "8px" }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: "50%",
                  background: "white",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 2,
                  flexShrink: 0,
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={HOSPITAL_LOGO_PATH}
                  alt="Logo"
                  style={{
                    width: 18,
                    height: 18,
                    objectFit: "contain",
                  }}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display =
                      "none";
                  }}
                />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#ffffff",
                    lineHeight: 1.2,
                  }}
                >
                  {HOSPITAL_SHORT_NAME}
                </div>
                <div
                  style={{
                    fontSize: 8,
                    color: "rgba(255,255,255,0.75)",
                    fontWeight: 500,
                  }}
                >
                  {HOSPITAL_SUBTITLE}
                </div>
              </div>
            </div>
            <div
              style={{
                fontSize: 7,
                color: "rgba(255,255,255,0.6)",
                fontWeight: 500,
              }}
            >
              Patient ID Card
            </div>
          </div>

          {/* Preview Body */}
          <div
            style={{
              flex: 1,
              padding: "12px 16px",
              display: "flex",
              gap: 12,
              minHeight: 0,
            }}
          >
            {/* Photo column */}
            <div
              style={{
                width: 90,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  width: 90,
                  height: 110,
                  border: "2px solid rgba(13,115,119,0.2)",
                  borderRadius: 4,
                  overflow: "hidden",
                  background: "#f8fafc",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {patient.photo_url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={patient.photo_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <User
                    style={{ width: 32, height: 32, color: "#cbd5e1" }}
                  />
                )}
              </div>
              <div
                style={{
                  marginTop: 4,
                  background: "rgba(13,115,119,0.1)",
                  color: "#0d7377",
                  border: "1px solid rgba(13,115,119,0.2)",
                  borderRadius: 3,
                  padding: "1px 6px",
                  fontSize: 9,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  textAlign: "center",
                  width: "100%",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {patient.file_number}
              </div>
            </div>

            {/* Details column */}
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: 6,
                minWidth: 0,
              }}
            >
              <div>
                <div style={previewLabelStyle}>Patient Name</div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#1e293b",
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {patient.full_name}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div>
                  <div style={previewLabelStyle}>Age/Sex</div>
                  <div style={previewValueStyle}>
                    {getAge(patient.date_of_birth)} /{" "}
                    {patient.gender?.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div>
                  <div style={previewLabelStyle}>Mobile</div>
                  <div style={previewValueStyle}>
                    {patient.phone || "N/A"}
                  </div>
                </div>
                <div>
                  <div style={previewLabelStyle}>Reg. Date</div>
                  <div style={previewValueStyle}>
                    {formatDate(patient.registration_date)}
                  </div>
                </div>
              </div>
              <div>
                <div style={previewLabelStyle}>Address</div>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 500,
                    color: "#334155",
                    lineHeight: 1.3,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shortAddress}
                </div>
              </div>
            </div>
          </div>

          {/* Preview Footer */}
          <div
            style={{
              height: 4,
              background: "linear-gradient(to right, #0d7377, #14919b)",
              flexShrink: 0,
            }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

const previewLabelStyle: React.CSSProperties = {
  fontSize: 7,
  color: "#0d7377",
  textTransform: "uppercase",
  fontWeight: 700,
  letterSpacing: "0.05em",
  marginBottom: 1,
};

const previewValueStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: "#334155",
};
