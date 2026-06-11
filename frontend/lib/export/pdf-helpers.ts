import { jsPDF } from "jspdf";
import {
  HOSPITAL_NAME,
  HOSPITAL_LOGO_PATH,
  HOSPITAL_PRIMARY_COLOR,
} from "./hospital-branding";

/**
 * Load the hospital logo as a base64 data URL.
 * Returns null if the logo cannot be loaded.
 */
export async function loadLogoBase64(): Promise<string | null> {
  try {
    const response = await fetch(HOSPITAL_LOGO_PATH);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Fetch an auth-protected image (typically a patient photo) and return it
 * as a base64 data URL suitable for jsPDF's ``addImage``. The fetch goes
 * through the same ``credentials: "include"`` channel the rest of the app
 * uses, so the session cookie is honoured and the response is not
 * cross-origin-tainted. Returns ``{ dataUrl, format, width, height }`` —
 * natural pixel dimensions are decoded via ``<img>`` so callers can size
 * the layout box to the photo's aspect ratio instead of forcing a square
 * (which squeezes portrait/landscape photos). Returns null on any failure.
 */
export async function fetchAuthedImageAsDataUrl(
  url: string | undefined,
): Promise<{
  dataUrl: string;
  format: "JPEG" | "PNG";
  width: number;
  height: number;
} | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    // Default to JPEG (covers most camera uploads); only PNG needs a
    // different hint because jsPDF rejects mismatched format strings.
    const format = blob.type === "image/png" ? "PNG" : "JPEG";
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
    if (!dataUrl) return null;

    // Decode the image to read its natural width/height. We don't draw
    // the <img>; it exists only so the browser can populate naturalWidth
    // / naturalHeight from the encoded bytes.
    const dims = await new Promise<{ width: number; height: number } | null>(
      (resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({
            width: img.naturalWidth || img.width || 0,
            height: img.naturalHeight || img.height || 0,
          });
        img.onerror = () => resolve(null);
        img.src = dataUrl;
      },
    );
    if (!dims || dims.width <= 0 || dims.height <= 0) return null;

    return { dataUrl, format, width: dims.width, height: dims.height };
  } catch {
    return null;
  }
}

/**
 * Add a standard hospital header to a jsPDF document.
 * Returns the Y coordinate after the header for subsequent content.
 */
export function addPdfHeader(
  doc: jsPDF,
  logoBase64: string | null,
  options?: { subtitle?: string },
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 14, y - 3, 12, 12);
    } catch {
      // logo failed to render, skip
    }
  }

  // Hospital name
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(HOSPITAL_PRIMARY_COLOR);
  doc.text(HOSPITAL_NAME, logoBase64 ? 30 : 14, y + 3);

  // Subtitle
  if (options?.subtitle) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor("#64748b");
    doc.text(options.subtitle, logoBase64 ? 30 : 14, y + 9);
  }

  // Divider line
  y += 16;
  doc.setDrawColor(HOSPITAL_PRIMARY_COLOR);
  doc.setLineWidth(0.5);
  doc.line(14, y, pageWidth - 14, y);

  return y + 6;
}

/**
 * Add a section title to the PDF.
 */
export function addSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(HOSPITAL_PRIMARY_COLOR);
  doc.text(title, 14, y);
  return y + 6;
}

/**
 * Add a labeled field row (label + value side by side).
 */
export function addField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
): number {
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor("#94a3b8");
  doc.text(label, x, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor("#1e293b");
  doc.text(value || "N/A", x, y + 4);

  return y + 10;
}

/**
 * Check if we need a page break, and add one if so.
 * Returns the new Y position.
 */
export function checkPageBreak(
  doc: jsPDF,
  y: number,
  margin: number = 25,
): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y > pageHeight - margin) {
    doc.addPage();
    return 20;
  }
  return y;
}

/**
 * Open a PDF in a new window for print/download.
 */
export function openPdfForPrint(doc: jsPDF, filename: string): void {
  const pdfBlob = doc.output("blob");
  const url = URL.createObjectURL(pdfBlob);
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
    });
  }
  // Clean up after a delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Download a PDF file.
 */
export function downloadPdf(doc: jsPDF, filename: string): void {
  doc.save(filename);
}
