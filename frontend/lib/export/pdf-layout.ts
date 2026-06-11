/**
 * Shared layout primitives for paginated A4 reports.
 *
 * Used by the pharmacy report PDFs (revenue, consumption, low stock,
 * expiry). The patient profile PDF uses its own copy of these helpers
 * for historical reasons — they can be deduped later, but the
 * signatures here are deliberately compatible.
 *
 * Layout contract:
 * - Every section / row / table calls ``ensureSpace`` BEFORE drawing so
 *   the body never crosses into the footer zone.
 * - Footers are drawn ONCE at the end (``drawFootersOnAllPages``) so the
 *   "Page X of N" count is accurate after all page breaks.
 */
import { jsPDF } from "jspdf";
import { addPdfHeader } from "./pdf-helpers";
import { HOSPITAL_PRIMARY_COLOR } from "./hospital-branding";

// ── Constants ──────────────────────────────────────────────────────────────
export const PAGE_MARGIN_X = 14;
export const PAGE_MARGIN_BOTTOM = 16;

// Palette tints reused across reports.
export const INK = "#1e293b";
export const INK_SOFT = "#475569";
export const MUTED = "#64748b";
export const LIGHT = "#94a3b8";
export const HAIRLINE = "#e2e8f0";
export const BG_TINT = "#f1f5f9";

// ── Types ──────────────────────────────────────────────────────────────────
export interface Layout {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  contentWidth: number;
  y: number;
  subtitle: string;
  logo: string | null;
}

export interface TableColumn {
  header: string;
  width: number; // mm
  align?: "left" | "right" | "center";
}

// ── Page management ────────────────────────────────────────────────────────
export function newPage(
  doc: jsPDF,
  logo: string | null,
  subtitle: string,
): Layout {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const y = addPdfHeader(doc, logo, { subtitle });
  return {
    doc,
    pageWidth,
    pageHeight,
    contentWidth: pageWidth - PAGE_MARGIN_X * 2,
    y,
    subtitle,
    logo,
  };
}

/**
 * Guarantee ``needed`` mm of vertical space above the footer reserve.
 * Adds a page (re-emitting the header) when there's not enough room.
 * Mutates ``layout.y`` in place.
 */
export function ensureSpace(layout: Layout, needed: number): void {
  if (layout.y + needed > layout.pageHeight - PAGE_MARGIN_BOTTOM) {
    layout.doc.addPage();
    const next = newPage(layout.doc, layout.logo, layout.subtitle);
    layout.y = next.y;
  }
}

// ── Visual primitives ──────────────────────────────────────────────────────
export function drawSectionTitle(layout: Layout, title: string): void {
  ensureSpace(layout, 12);
  const { doc } = layout;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(HOSPITAL_PRIMARY_COLOR);
  doc.text(title.toUpperCase(), PAGE_MARGIN_X, layout.y);
  layout.y += 2.5;
  doc.setDrawColor(HOSPITAL_PRIMARY_COLOR);
  doc.setLineWidth(0.4);
  doc.line(PAGE_MARGIN_X, layout.y, PAGE_MARGIN_X + 30, layout.y);
  layout.y += 5;
}

/** Filled pill — used for period / category chips under section titles. */
export function drawBadge(
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
  return w;
}

/** Row of small KPI tiles (Revenue tab's 4 cards). */
export function drawKpiBand(
  layout: Layout,
  kpis: { label: string; value: string; accent?: string }[],
): void {
  if (kpis.length === 0) return;
  const cardH = 18;
  const gap = 4;
  const cardW = (layout.contentWidth - gap * (kpis.length - 1)) / kpis.length;
  ensureSpace(layout, cardH + 4);
  const { doc } = layout;
  kpis.forEach((kpi, idx) => {
    const x = PAGE_MARGIN_X + idx * (cardW + gap);
    const y = layout.y;
    doc.setFillColor(BG_TINT);
    doc.roundedRect(x, y, cardW, cardH, 2, 2, "F");
    // Label.
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(LIGHT);
    doc.text(kpi.label.toUpperCase(), x + 4, y + 6);
    // Value.
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(kpi.accent || INK);
    doc.text(kpi.value, x + 4, y + 14);
  });
  layout.y += cardH + 6;
}

// ── Tables ─────────────────────────────────────────────────────────────────

/** Resolve cell text alignment to a left/right anchor x. */
function alignedTextX(
  colX: number,
  colW: number,
  align: "left" | "right" | "center" | undefined,
): { x: number; opts: { align: "left" | "right" | "center" } } {
  const a = align || "left";
  if (a === "right") return { x: colX + colW - 2, opts: { align: "right" } };
  if (a === "center")
    return { x: colX + colW / 2, opts: { align: "center" } };
  return { x: colX + 2, opts: { align: "left" } };
}

/**
 * Generic table — header redraws on every page break so multi-page tables
 * stay readable. Pass ``totalRow`` to render a bold totals row at the
 * bottom (useful for the consumption breakdown).
 */
export function drawTable(
  layout: Layout,
  columns: TableColumn[],
  rows: string[][],
  options: {
    emptyMessage?: string;
    totalRow?: string[];
  } = {},
): void {
  const { doc } = layout;

  // Pre-compute column X positions.
  const colX: number[] = [];
  let cursor = PAGE_MARGIN_X;
  for (const c of columns) {
    colX.push(cursor);
    cursor += c.width;
  }

  const drawHeader = (): void => {
    ensureSpace(layout, 10);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(LIGHT);
    columns.forEach((col, i) => {
      const { x, opts } = alignedTextX(colX[i], col.width, col.align);
      doc.text(col.header.toUpperCase(), x, layout.y, opts);
    });
    layout.y += 2;
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(
      PAGE_MARGIN_X,
      layout.y,
      PAGE_MARGIN_X + layout.contentWidth,
      layout.y,
    );
    layout.y += 4;
  };

  drawHeader();

  if (rows.length === 0) {
    ensureSpace(layout, 10);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(LIGHT);
    doc.text(
      options.emptyMessage || "No records.",
      PAGE_MARGIN_X + layout.contentWidth / 2,
      layout.y,
      { align: "center" },
    );
    layout.y += 8;
    return;
  }

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");

  for (const row of rows) {
    if (layout.y + 6 > layout.pageHeight - PAGE_MARGIN_BOTTOM) {
      doc.addPage();
      const next = newPage(doc, layout.logo, layout.subtitle);
      layout.y = next.y;
      drawHeader();
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
    }
    doc.setTextColor(INK);
    columns.forEach((col, i) => {
      const { x, opts } = alignedTextX(colX[i], col.width, col.align);
      const text = row[i] || "";
      doc.text(text, x, layout.y, opts);
    });
    layout.y += 6;
  }

  if (options.totalRow) {
    ensureSpace(layout, 8);
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.3);
    doc.line(
      PAGE_MARGIN_X,
      layout.y - 2,
      PAGE_MARGIN_X + layout.contentWidth,
      layout.y - 2,
    );
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(HOSPITAL_PRIMARY_COLOR);
    columns.forEach((col, i) => {
      const { x, opts } = alignedTextX(colX[i], col.width, col.align);
      const text = options.totalRow![i] || "";
      doc.text(text, x, layout.y, opts);
    });
    layout.y += 6;
  }

  layout.y += 2;
}

// ── Footer ─────────────────────────────────────────────────────────────────
export function drawFootersOnAllPages(doc: jsPDF, generatedAt: string): void {
  const pageCount = doc.internal.pages.length - 1;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = pageHeight - 10;
    doc.setDrawColor(HAIRLINE);
    doc.setLineWidth(0.2);
    doc.line(
      PAGE_MARGIN_X,
      footerY - 4,
      pageWidth - PAGE_MARGIN_X,
      footerY - 4,
    );
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(LIGHT);
    doc.text(
      `Generated ${generatedAt}`,
      PAGE_MARGIN_X,
      footerY,
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - PAGE_MARGIN_X, footerY, {
      align: "right",
    });
  }
}

// ── Generation timestamp helper ────────────────────────────────────────────
export function formatGeneratedAt(): string {
  return new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Filename helper ────────────────────────────────────────────────────────
export function sanitiseFilenamePart(value: string): string {
  return value
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}
