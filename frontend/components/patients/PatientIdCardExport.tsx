"use client";

import { forwardRef } from "react";
import {
  HOSPITAL_SHORT_NAME,
  HOSPITAL_SUBTITLE,
  HOSPITAL_LOGO_PATH,
} from "@/lib/export/hospital-branding";

/**
 * Export-optimized Patient ID Card.
 *
 * Fixed pixel dimensions (1200 × 720). Designed exclusively for
 * html2canvas capture — NOT rendered on-screen. Uses only inline styles
 * with safe hex colors so html2canvas never encounters oklch/lab.
 *
 * IMPORTANT — no `crossOrigin` attribute on <img> tags. The patient photo
 * is served from a same-origin API endpoint (/api/v1/patients/<id>/photo/)
 * and the logo is a local static file (/logo.png). Adding `crossOrigin`
 * triggers a CORS preflight that the image endpoints don't support,
 * causing images to silently fail to load.
 */

export interface IdCardPatientData {
  full_name: string;
  file_number: string;
  date_of_birth: string;
  gender: string;
  phone: string;
  address?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  photo_url?: string;
  registration_date?: string;
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

function buildAddress(patient: IdCardPatientData): string {
  const parts = [
    patient.address,
    patient.city,
    patient.district,
    patient.state,
    patient.pincode,
  ].filter(Boolean);
  return parts.join(", ") || "N/A";
}

// ── Fixed dimensions ──
const CARD_W = 1200;
const CARD_H = 720;
const HEADER_H = 116;
const FOOTER_H = 8;

export const PatientIdCardExport = forwardRef<
  HTMLDivElement,
  { patient: IdCardPatientData }
>(function PatientIdCardExport({ patient }, ref) {
  const address = buildAddress(patient);

  return (
    <div
      ref={ref}
      style={{
        width: CARD_W,
        height: CARD_H,
        backgroundColor: "#ffffff",
        borderRadius: 16,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        position: "relative",
        boxShadow: "0 4px 24px rgba(0,0,0,0.12)",
        border: "1px solid #e2e8f0",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          height: HEADER_H,
          flexShrink: 0,
          background: "linear-gradient(135deg, #0d7377 0%, #14919b 100%)",
          borderRadius: "16px 16px 0 0",
          padding: "0 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* Circular logo — image fills container, container clips to circle */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 9999,
              backgroundColor: "#ffffff",
              flexShrink: 0,
              boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              overflow: "hidden",
              padding: 6,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HOSPITAL_LOGO_PATH}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                display: "block",
              }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          </div>
          <div>
            <div
              style={{
                fontSize: 26,
                fontWeight: 800,
                color: "#ffffff",
                lineHeight: 1.2,
                letterSpacing: "-0.01em",
              }}
            >
              {HOSPITAL_SHORT_NAME}
            </div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: "rgba(255,255,255,0.8)",
                marginTop: 2,
              }}
            >
              {HOSPITAL_SUBTITLE}
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 16,
            fontWeight: 600,
            color: "rgba(255,255,255,0.7)",
            letterSpacing: "0.02em",
          }}
        >
          Patient ID Card
        </div>
      </div>

      {/* ── Body ── */}
      <div
        style={{
          flex: 1,
          padding: "32px 40px",
          display: "flex",
          gap: 36,
          position: "relative",
          overflow: "visible",
        }}
      >
        {/* Watermark — bottom-right, behind content */}
        <div
          style={{
            position: "absolute",
            bottom: 20,
            right: 40,
            opacity: 0.035,
            pointerEvents: "none",
            zIndex: 0,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HOSPITAL_LOGO_PATH}
            alt=""
            style={{ width: 180, height: 180, filter: "grayscale(1)" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        {/* Left column: Photo + File number */}
        <div
          style={{
            width: 230,
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            position: "relative",
            zIndex: 1,
          }}
        >
          {/* Photo — NO crossOrigin (same-origin API endpoint) */}
          <div
            style={{
              width: 230,
              flex: 1,
              border: "3px solid rgba(13,115,119,0.2)",
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: "#f8fafc",
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
                  display: "block",
                }}
              />
            ) : (
              <svg
                width="90"
                height="90"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            )}
          </div>

          {/* File number badge */}
          <div
            style={{
              marginTop: 12,
              backgroundColor: "rgba(13,115,119,0.1)",
              color: "#0d7377",
              border: "2px solid rgba(13,115,119,0.2)",
              borderRadius: 8,
              padding: "6px 16px",
              fontSize: 18,
              fontWeight: 800,
              fontFamily: "monospace",
              textAlign: "center",
              width: "100%",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {patient.file_number}
          </div>
        </div>

        {/* Right column: Patient details — space-between for even distribution */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            minWidth: 0,
            position: "relative",
            zIndex: 1,
            paddingTop: 4,
            paddingBottom: 4,
          }}
        >
          {/* Patient Name */}
          <div>
            <div style={exportLabelStyle}>Patient Name</div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                color: "#1e293b",
                lineHeight: 1.25,
                wordBreak: "break-word",
                whiteSpace: "normal",
              }}
            >
              {patient.full_name}
            </div>
          </div>

          {/* Info row: Age/Sex, Mobile, Reg Date */}
          <div style={{ display: "flex", gap: 40 }}>
            <div style={{ minWidth: 0 }}>
              <div style={exportLabelStyle}>Age/Sex</div>
              <div style={exportValueStyle}>
                {getAge(patient.date_of_birth)} /{" "}
                {patient.gender?.charAt(0).toUpperCase()}
              </div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={exportLabelStyle}>Mobile</div>
              <div style={exportValueStyle}>{patient.phone || "N/A"}</div>
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={exportLabelStyle}>Reg. Date</div>
              <div style={exportValueStyle}>
                {formatDate(patient.registration_date)}
              </div>
            </div>
          </div>

          {/* Address — no truncation, no overflow hidden */}
          <div>
            <div style={exportLabelStyle}>Address</div>
            <div
              style={{
                fontSize: 17,
                fontWeight: 500,
                color: "#334155",
                lineHeight: 1.45,
                wordBreak: "break-word",
                whiteSpace: "normal",
              }}
            >
              {address}
            </div>
          </div>
        </div>
      </div>

      {/* ── Footer gradient bar ── */}
      <div
        style={{
          height: FOOTER_H,
          flexShrink: 0,
          background: "linear-gradient(to right, #0d7377, #14919b)",
          borderRadius: "0 0 16px 16px",
        }}
      />
    </div>
  );
});

const exportLabelStyle: React.CSSProperties = {
  fontSize: 14,
  color: "#0d7377",
  textTransform: "uppercase",
  fontWeight: 700,
  letterSpacing: "0.06em",
  marginBottom: 4,
};

const exportValueStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 600,
  color: "#334155",
};
