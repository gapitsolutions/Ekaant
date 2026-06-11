import { jsPDF } from "jspdf";
import {
  loadLogoBase64,
  addPdfHeader,
  fetchAuthedImageAsDataUrl,
  downloadPdf,
} from "./pdf-helpers";
import { HOSPITAL_PRIMARY_COLOR } from "./hospital-branding";
import {
  EMPLOYMENT_STATUS_LABELS,
  EDUCATION_LABELS,
  MARITAL_STATUS_LABELS,
  LIVING_ARRANGEMENT_LABELS,
  SUBSTANCE_TYPE_LABELS,
  PATIENT_CATEGORY_LABELS,
} from "@/lib/types";
import type { Patient, PatientCategory, Visit } from "@/lib/types";

// ── Layout constants (A4 portrait, mm) ──────────────────────────────────────
const PAGE_MARGIN_X = 14;
const PAGE_MARGIN_TOP = 15;
const PAGE_MARGIN_BOTTOM = 16; // reserved for the footer
// Photo box: height is fixed so the hero band has predictable vertical
// rhythm; width is derived from the photo's natural aspect ratio so
// portrait/landscape originals are not squeezed. Width is clamped so
// neither a very tall portrait nor a very wide landscape consumes the
// whole hero band.
const HERO_PHOTO_HEIGHT = 32;
const HERO_PHOTO_MIN_WIDTH = 22;
const HERO_PHOTO_MAX_WIDTH = 44;
const HERO_GAP = 8;

// Palette (kept inline so a single edit re-tints the report — branding
// colours live in hospital-branding.ts but the slate-greys below are
// generic UI tints shared with the Patient ID Card / Invoice PDFs).
const INK = "#1e293b";
const INK_SOFT = "#475569";
const MUTED = "#64748b";
const LIGHT = "#94a3b8";
const HAIRLINE = "#e2e8f0";
const BG_TINT = "#f1f5f9";
const PSYCH_BG = "#f5f3ff";
const PSYCH_TEXT = "#6d28d9";
const DEADD_BG = "#fef3c7";
const DEADD_TEXT = "#b45309";
const STATUS_ACTIVE_BG = "#dcfce7";
const STATUS_ACTIVE_TEXT = "#15803d";
const STATUS_OTHER_BG = "#f1f5f9";
const STATUS_OTHER_TEXT = "#475569";

function fmtDate(d: string | undefined): string {
  if (!d) return "N/A";
  const parsed = new Date(d);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getAge(dob: string): string {
  if (!dob) return "—";
  const today = new Date();
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "—";
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return `${age}y`;
}

function buildAddress(p: Patient): string {
  const parts = [
    p.address,
    p.block_mc,
    p.city,
    p.district,
    p.state,
    p.pincode,
  ].filter(Boolean);
  return parts.join(", ") || "—";
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "?"
  );
}

function capitalise(value: string | undefined): string {
  if (!value) return "—";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// ── Drawing primitives ──────────────────────────────────────────────────────

interface Layout {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  y: number;
}

/**
 * Initialise a page layout. Header is drawn once per page; the caller
 * advances ``y`` from the returned offset.
 */
function newPage(doc: jsPDF, logo: string | null): Layout {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = addPdfHeader(doc, logo, { subtitle: "Patient Profile Report" });
  return {
    doc,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - PAGE_MARGIN_X * 2,
    y,
  };
}

/**
 * Guarantee at least ``needed`` mm of vertical space remain above the
 * footer reserve. Otherwise, add a new page and re-emit the header. This
 * is the contract that fixes the original "footer overlaps with data"
 * bug — every layout step asks for the space it actually needs.
 */
function ensureSpace(layout: Layout, needed: number, logo: string | null): void {
  if (layout.y + needed > layout.pageHeight - PAGE_MARGIN_BOTTOM) {
    layout.doc.addPage();
    const next = newPage(layout.doc, logo);
    layout.y = next.y;
  }
}

function drawSectionTitle(layout: Layout, title: string, logo: string | null): void {
  ensureSpace(layout, 12, logo);
  const { doc } = layout;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(HOSPITAL_PRIMARY_COLOR);
  doc.text(title.toUpperCase(), PAGE_MARGIN_X, layout.y);
  layout.y += 2.5;
  doc.setDrawColor(HOSPITAL_PRIMARY_COLOR);
  doc.setLineWidth(0.4);
  doc.line(
    PAGE_MARGIN_X,
    layout.y,
    PAGE_MARGIN_X + 30,
    layout.y,
  );
  layout.y += 5;
}

/**
 * Draw label + (possibly multi-line) value at (x, y). Returns the height
 * consumed (label + 1.5mm gap + value lines + 3mm spacing).
 */
function drawField(
  doc: jsPDF,
  label: string,
  value: string | undefined,
  x: number,
  y: number,
  width: number,
): number {
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(LIGHT);
  doc.text(label.toUpperCase(), x, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK);
  const text = value && value.trim() ? value : "N/A";
  const lines = doc.splitTextToSize(text, width) as string[];
  doc.text(lines, x, y + 4);

  return 4 + lines.length * 4 + 2; // label baseline + each line ≈4mm + spacing
}

/**
 * Two-column field row. Either side may wrap; the row's height is the
 * taller of the two so subsequent rows align cleanly.
 */
function drawFieldRow(
  layout: Layout,
  logo: string | null,
  left: { label: string; value: string | undefined },
  right?: { label: string; value: string | undefined },
): void {
  const { doc } = layout;
  const colGap = 8;
  const colWidth = (layout.contentWidth - colGap) / 2;
  const rightX = PAGE_MARGIN_X + colWidth + colGap;

  // Pre-measure so ``ensureSpace`` sees the true row height before draw.
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const leftLines = doc.splitTextToSize(
    left.value && left.value.trim() ? left.value : "N/A",
    colWidth,
  ) as string[];
  const rightLines = right
    ? (doc.splitTextToSize(
        right.value && right.value.trim() ? right.value : "N/A",
        colWidth,
      ) as string[])
    : [];
  const rowHeight =
    4 + Math.max(leftLines.length, rightLines.length) * 4 + 2;
  ensureSpace(layout, rowHeight, logo);

  drawField(doc, left.label, left.value, PAGE_MARGIN_X, layout.y, colWidth);
  if (right) {
    drawField(doc, right.label, right.value, rightX, layout.y, colWidth);
  }
  layout.y += rowHeight;
}

/** Full-width single field (for long values like address). */
function drawWideField(
  layout: Layout,
  logo: string | null,
  label: string,
  value: string | undefined,
): void {
  const { doc } = layout;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  const lines = doc.splitTextToSize(
    value && value.trim() ? value : "N/A",
    layout.contentWidth,
  ) as string[];
  const rowHeight = 4 + lines.length * 4 + 2;
  ensureSpace(layout, rowHeight, logo);
  drawField(doc, label, value, PAGE_MARGIN_X, layout.y, layout.contentWidth);
  layout.y += rowHeight;
}

/** Filled rounded pill used for category / status badges. */
function drawBadge(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  bg: string,
  fg: string,
): number {
  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const textWidth = doc.getTextWidth(text);
  const padX = 3;
  const w = textWidth + padX * 2;
  const h = 5.5;
  doc.setFillColor(bg);
  doc.setDrawColor(bg);
  doc.roundedRect(x, y - h + 1.5, w, h, 1.5, 1.5, "F");
  doc.setTextColor(fg);
  doc.text(text, x + padX, y);
  return w; // for chaining badges horizontally
}

// ── Hero band ───────────────────────────────────────────────────────────────
function drawHeroBand(
  layout: Layout,
  patient: Patient,
  photo: {
    dataUrl: string;
    format: "JPEG" | "PNG";
    width: number;
    height: number;
  } | null,
): void {
  const { doc, contentWidth } = layout;
  const heroTop = layout.y;
  const heroHeight = HERO_PHOTO_HEIGHT + 8; // photo + breathing room

  // Background tile.
  doc.setFillColor(BG_TINT);
  doc.roundedRect(
    PAGE_MARGIN_X,
    heroTop,
    contentWidth,
    heroHeight,
    2,
    2,
    "F",
  );

  // Photo box dimensions — height fixed, width follows the photo's
  // natural aspect ratio. Falls back to a square for the initials
  // placeholder (no source aspect to derive).
  const photoX = PAGE_MARGIN_X + 4;
  const photoY = heroTop + 4;
  let photoBoxW = HERO_PHOTO_HEIGHT; // square fallback
  if (photo) {
    const aspect = photo.width / photo.height;
    photoBoxW = Math.max(
      HERO_PHOTO_MIN_WIDTH,
      Math.min(HERO_PHOTO_MAX_WIDTH, HERO_PHOTO_HEIGHT * aspect),
    );
    try {
      doc.addImage(
        photo.dataUrl,
        photo.format,
        photoX,
        photoY,
        photoBoxW,
        HERO_PHOTO_HEIGHT,
        undefined,
        "FAST",
      );
    } catch {
      photoBoxW = HERO_PHOTO_HEIGHT;
      drawInitialsPlaceholder(doc, patient, photoX, photoY);
    }
  } else {
    drawInitialsPlaceholder(doc, patient, photoX, photoY);
  }

  // Text column starts after the actual rendered photo width.
  const textX = photoX + photoBoxW + HERO_GAP;
  let cy = photoY + 5;

  // Patient name.
  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(INK);
  const nameLines = doc.splitTextToSize(
    patient.full_name || "Unnamed Patient",
    contentWidth - (textX - PAGE_MARGIN_X) - 4,
  ) as string[];
  doc.text(nameLines[0], textX, cy);
  cy += 5;

  // Badges row (category + status).
  let badgeX = textX;
  if (patient.patient_category) {
    const isPsych = patient.patient_category === "psychiatric";
    badgeX +=
      drawBadge(
        doc,
        PATIENT_CATEGORY_LABELS[patient.patient_category as PatientCategory] ||
          patient.patient_category,
        badgeX,
        cy,
        isPsych ? PSYCH_BG : DEADD_BG,
        isPsych ? PSYCH_TEXT : DEADD_TEXT,
      ) + 3;
  }
  if (patient.status) {
    const isActive = patient.status === "active";
    drawBadge(
      doc,
      patient.status.replace(/_/g, " ").toUpperCase(),
      badgeX,
      cy,
      isActive ? STATUS_ACTIVE_BG : STATUS_OTHER_BG,
      isActive ? STATUS_ACTIVE_TEXT : STATUS_OTHER_TEXT,
    );
  }
  cy += 5;

  // Inline meta line.
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(INK_SOFT);
  const metaLeft = `File: ${patient.file_number || "—"}`;
  const metaHdams = patient.hdams_id ? `   HDAMS: ${patient.hdams_id}` : "";
  doc.text(metaLeft + metaHdams, textX, cy);
  cy += 4;

  const ageGender = `${getAge(patient.date_of_birth)} · ${capitalise(patient.gender)}`;
  const phone = patient.phone ? `   ·   ${patient.phone}` : "";
  doc.text(ageGender + phone, textX, cy);

  layout.y = heroTop + heroHeight + 6;
}

function drawInitialsPlaceholder(
  doc: jsPDF,
  patient: Patient,
  x: number,
  y: number,
): void {
  // Square placeholder — no source image to derive an aspect ratio from.
  doc.setFillColor(HOSPITAL_PRIMARY_COLOR);
  doc.roundedRect(x, y, HERO_PHOTO_HEIGHT, HERO_PHOTO_HEIGHT, 2, 2, "F");
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#ffffff");
  const initials = getInitials(patient.full_name || "");
  const textWidth = doc.getTextWidth(initials);
  doc.text(
    initials,
    x + HERO_PHOTO_HEIGHT / 2 - textWidth / 2,
    y + HERO_PHOTO_HEIGHT / 2 + 3,
  );
}

// ── Visits table ────────────────────────────────────────────────────────────
function drawVisitsTable(
  layout: Layout,
  visits: Visit[],
  logo: string | null,
): void {
  if (visits.length === 0) return;

  drawSectionTitle(layout, `Visit Summary (${visits.length} visits)`, logo);
  const { doc, contentWidth } = layout;

  // Column geometry (5 columns: #, Date, Check-in, Stage, Status).
  const colX = [
    PAGE_MARGIN_X,
    PAGE_MARGIN_X + 10,
    PAGE_MARGIN_X + 45,
    PAGE_MARGIN_X + 90,
    PAGE_MARGIN_X + 140,
  ];

  const drawHeader = () => {
    ensureSpace(layout, 10, logo);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(LIGHT);
    doc.text("#", colX[0], layout.y);
    doc.text("DATE", colX[1], layout.y);
    doc.text("CHECK-IN", colX[2], layout.y);
    doc.text("STAGE", colX[3], layout.y);
    doc.text("STATUS", colX[4], layout.y);
    layout.y += 2;
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN_X, layout.y, PAGE_MARGIN_X + contentWidth, layout.y);
    layout.y += 4;
  };

  drawHeader();

  const recent = visits.slice(0, 20);
  for (let i = 0; i < recent.length; i++) {
    // Each row needs ~6mm; if there's not enough space, force a page
    // break AND re-emit the column header so the table stays readable.
    if (layout.y + 6 > layout.pageHeight - PAGE_MARGIN_BOTTOM) {
      doc.addPage();
      const next = newPage(doc, logo);
      layout.y = next.y;
      drawSectionTitle(layout, "Visit Summary (continued)", logo);
      drawHeader();
    }

    const v = recent[i];
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(MUTED);
    doc.text(`${i + 1}`, colX[0], layout.y);
    doc.setTextColor(INK);
    doc.text(fmtDate(v.visit_date), colX[1], layout.y);
    doc.setTextColor(INK_SOFT);
    doc.text(
      v.checkin_time
        ? new Date(v.checkin_time).toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "—",
      colX[2],
      layout.y,
    );
    doc.text(capitalise(v.current_stage), colX[3], layout.y);
    doc.text(
      v.status === "completed" ? "Completed" : "In Progress",
      colX[4],
      layout.y,
    );
    layout.y += 6;
  }

  if (visits.length > 20) {
    ensureSpace(layout, 6, logo);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(LIGHT);
    doc.text(
      `… and ${visits.length - 20} more earlier visits not shown.`,
      PAGE_MARGIN_X,
      layout.y,
    );
    layout.y += 5;
  }
}

// ── Footer (drawn once for every page after layout is final) ────────────────
function drawFootersOnAllPages(doc: jsPDF, generatedAt: string): void {
  const pageCount = doc.internal.pages.length - 1; // jsPDF stores a leading null
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Thin divider above the footer.
    const footerY = pageHeight - 10;
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(PAGE_MARGIN_X, footerY - 4, pageWidth - PAGE_MARGIN_X, footerY - 4);

    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(LIGHT);
    doc.text(
      `Confidential Medical Record · Generated ${generatedAt}`,
      PAGE_MARGIN_X,
      footerY,
    );
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth - PAGE_MARGIN_X,
      footerY,
      { align: "right" },
    );
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────
export async function generatePatientProfilePdf(
  patient: Patient,
  visits: Visit[],
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Both fetches in parallel — header logo from /public, patient photo
  // (if any) through the auth channel. ``photo`` falls back to null
  // silently so a missing/forbidden image never blocks the report.
  const [logo, photo] = await Promise.all([
    loadLogoBase64(),
    fetchAuthedImageAsDataUrl(patient.photo_url),
  ]);

  const layout = newPage(doc, logo);

  // 1. Hero band — photo + name + category + status + identifiers.
  drawHeroBand(layout, patient, photo);

  // 2. Patient Information.
  drawSectionTitle(layout, "Patient Information", logo);
  drawFieldRow(
    layout,
    logo,
    { label: "Aadhaar Number", value: patient.aadhaar_number },
    {
      label: "Date of Birth",
      value: patient.date_of_birth ? fmtDate(patient.date_of_birth) : undefined,
    },
  );
  drawFieldRow(
    layout,
    logo,
    { label: "Mobile", value: patient.phone },
    { label: "Relative Mobile", value: patient.relative_phone },
  );
  drawFieldRow(
    layout,
    logo,
    {
      label: "Registration Date",
      value: patient.registration_date
        ? fmtDate(patient.registration_date)
        : undefined,
    },
    {
      label: "First Visit",
      value: patient.first_visit_date
        ? fmtDate(patient.first_visit_date)
        : undefined,
    },
  );
  drawWideField(layout, logo, "Address", buildAddress(patient));

  // 3. Demographics.
  drawSectionTitle(layout, "Demographics", logo);
  drawFieldRow(
    layout,
    logo,
    { label: "Blood Group", value: patient.blood_group },
    { label: "Nationality", value: patient.nationality },
  );
  drawFieldRow(
    layout,
    logo,
    { label: "Religion", value: patient.religion },
    {
      label: "Education",
      value: patient.education ? EDUCATION_LABELS[patient.education] : undefined,
    },
  );
  drawFieldRow(
    layout,
    logo,
    {
      label: "Employment",
      value: patient.employment_status
        ? EMPLOYMENT_STATUS_LABELS[patient.employment_status]
        : undefined,
    },
    { label: "Occupation", value: patient.occupation },
  );
  drawFieldRow(
    layout,
    logo,
    {
      label: "Marital Status",
      value: patient.marital_status
        ? MARITAL_STATUS_LABELS[patient.marital_status]
        : undefined,
    },
    {
      label: "Living Arrangement",
      value: patient.living_arrangement
        ? LIVING_ARRANGEMENT_LABELS[patient.living_arrangement]
        : undefined,
    },
  );

  // 4. Family.
  drawSectionTitle(layout, "Family Details", logo);
  drawFieldRow(
    layout,
    logo,
    { label: "Father's Name", value: patient.father_name },
    { label: "Mother's Name", value: patient.mother_name },
  );
  drawFieldRow(
    layout,
    logo,
    { label: "Spouse Name", value: patient.spouse_name },
    { label: "Grandfather's Name", value: patient.grandfather_name },
  );

  // 5. Emergency contact.
  drawSectionTitle(layout, "Emergency Contact", logo);
  drawFieldRow(
    layout,
    logo,
    { label: "Contact Name", value: patient.emergency_contact_name },
    { label: "Phone", value: patient.emergency_contact_phone },
  );
  drawWideField(layout, logo, "Relation", patient.emergency_contact_relation);

  // 6. Substance use.
  drawSectionTitle(layout, "Substance Use History", logo);
  const currentSubs =
    patient.substance_used_currently
      ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
      .join(", ") || "None specified";
  const everSubs =
    patient.substance_ever_used
      ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
      .join(", ") || "None specified";
  drawWideField(layout, logo, "Currently Using", currentSubs);
  drawWideField(layout, logo, "Ever Used", everSubs);
  drawFieldRow(
    layout,
    logo,
    {
      label: "Injection Use (Ever)",
      value: patient.injection_use_ever ? "Yes" : "No",
    },
    {
      label: "Injection Use (Currently)",
      value: patient.injection_use_currently ? "Yes" : "No",
    },
  );
  drawFieldRow(
    layout,
    logo,
    {
      label: "Syringe Sharing",
      value: patient.syringe_sharing ? "Yes" : "No",
    },
    { label: "Route of Admission", value: patient.route_of_admission },
  );

  // 7. Medical history.
  drawSectionTitle(layout, "Medical History", logo);
  drawFieldRow(
    layout,
    logo,
    { label: "STI / STD", value: patient.sti_std },
    { label: "Jaundice", value: patient.jaundice ? "Yes" : "No" },
  );
  drawFieldRow(
    layout,
    logo,
    {
      label: "HIV Screening",
      value: patient.hiv_screening ? "Yes" : "No",
    },
    { label: "HIV Result", value: patient.hiv_result },
  );
  drawWideField(
    layout,
    logo,
    "Co-morbid Medical Illness",
    patient.comorbid_medical_illness,
  );
  drawWideField(
    layout,
    logo,
    "Co-morbid Psychiatric Illness",
    patient.comorbid_psychiatric_illness,
  );
  drawWideField(layout, logo, "Allergies", patient.allergies);

  // 8. Visits table.
  drawVisitsTable(layout, visits, logo);

  // 9. Footer on every page (drawn last so "Page X of N" knows ``N``).
  const generatedAt = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  drawFootersOnAllPages(doc, generatedAt);

  downloadPdf(doc, `patient-profile-${patient.file_number || "patient"}.pdf`);
}
