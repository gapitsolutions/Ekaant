import { jsPDF } from "jspdf";
import {
  HOSPITAL_SHORT_NAME,
  HOSPITAL_SUBTITLE,
  HOSPITAL_LOGO_PATH,
} from "./hospital-branding";

/**
 * Patient ID Card — single source of truth.
 *
 * The card is drawn ONCE onto an HTML5 canvas (`renderIdCardCanvas`). The
 * preview, the downloaded PDF and the printed output all derive from that
 * same canvas, so they are pixel-identical by construction.
 *
 * Why a canvas (and not html2canvas):
 *  - The patient photo is served from an AUTH-PROTECTED, cross-origin backend
 *    endpoint. html2canvas re-requests it with `crossOrigin="anonymous"`,
 *    which drops the session cookie (→ 403) and/or taints the canvas
 *    (→ toDataURL throws). Either way the photo vanishes from the export.
 *    Here we fetch the photo through the same `credentials:"include"` channel
 *    the rest of the app uses, then draw it from a `blob:` URL — the canvas is
 *    never tainted and the photo always renders.
 *  - Canvas `arc()` gives a guaranteed-perfect circular logo clip (html2canvas
 *    renders border-radius + overflow clipping unreliably).
 *  - No oklch/lab parsing problems — we only ever use plain hex colors.
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
  blood_group?: string;
}

// ── Card geometry ──────────────────────────────────────────────────────────
// Logical design units. The card is a 5:3 ID card. We render at SUPERSAMPLE×
// these dimensions for crisp text, then embed into a 100×60 mm PDF page
// (≈ 600 DPI), which prints sharply on any printer.
const CARD_W = 600;
const CARD_H = 360;
const SUPERSAMPLE = 4;
const CARD_W_MM = 100;
const CARD_H_MM = 60;

const HEADER_H = 82;
const FOOTER_H = 8;
const PAD_X = 28;

// Colors (plain hex only).
const TEAL = "#0d7377";
const TEAL_LIGHT = "#14919b";
const TEAL_TINT = "#e7f1f1";
const INK = "#1e293b";
const INK_SOFT = "#334155";
const PHOTO_BG = "#f8fafc";
const WHITE = "#ffffff";

const FONT_STACK = "'Segoe UI', system-ui, -apple-system, Roboto, sans-serif";

// ── Date / age helpers ───────────────────────────────────────────────────────
function getAge(dob: string): string {
  if (!dob) return "N/A";
  const today = new Date();
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return "N/A";
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return String(age);
}

function formatDate(date: string | undefined): string {
  if (!date) return "N/A";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleDateString("en-IN", {
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

// ── Image loading ─────────────────────────────────────────────────────────
/** Load a same-origin image (the hospital logo from /public). */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/**
 * The logo PNG is opaque with a neutral light background (≈ rgb(213,214,215)).
 * To place it directly on the teal header with no tile/border, we knock that
 * background out to transparency using an edge flood-fill (only the background
 * *connected to the border* is removed, so interior detail of the crest is
 * preserved).
 *
 * This is a pure, conservative transform: it returns `null` if the result
 * would be too aggressive (almost everything removed) so the caller can fall
 * back to the untouched logo. It NEVER returns a blank/empty canvas.
 */
function removeNeutralBackground(
  img: HTMLImageElement,
): HTMLCanvasElement | null {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  if (!w || !h) return null;

  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d");
  if (!cx) return null;
  cx.drawImage(img, 0, 0, w, h);

  let imageData: ImageData;
  try {
    imageData = cx.getImageData(0, 0, w, h);
  } catch {
    // Would only happen if the canvas were tainted (it isn't — same origin).
    return null;
  }

  const d = imageData.data;
  const isBackground = (i: number): boolean => {
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    const min = Math.min(r, g, b);
    const max = Math.max(r, g, b);
    return r >= 185 && g >= 185 && b >= 185 && max - min <= 36;
  };

  const visited = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) {
    stack.push(x, (h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w, y * w + (w - 1));
  }
  while (stack.length) {
    const p = stack.pop() as number;
    if (visited[p]) continue;
    visited[p] = 1;
    const i = p * 4;
    if (!isBackground(i)) continue;
    d[i + 3] = 0; // make transparent
    const px = p % w;
    const py = (p / w) | 0;
    if (px > 0) stack.push(p - 1);
    if (px < w - 1) stack.push(p + 1);
    if (py > 0) stack.push(p - w);
    if (py < h - 1) stack.push(p + w);
  }

  // Validate: bail out if the crest would be (nearly) gone. The logo's crest
  // is ~17% of the image; anything under 3% visible means the threshold ate
  // too much, so we reject and let the caller use the original logo.
  let visible = 0;
  for (let i = 3; i < d.length; i += 4) {
    if (d[i] > 0) visible++;
  }
  if (visible < w * h * 0.03) return null;

  cx.putImageData(imageData, 0, 0);
  return c;
}

/**
 * Resolve the header/watermark logo, cached as a PROMISE so that concurrent
 * callers (e.g. React StrictMode double-invokes the effect on mount) share a
 * single resolution instead of racing — the previous flag-based cache returned
 * `null` to the second caller while the first was still in flight, which made
 * the logo disappear.
 *
 * Falls back to the original (untouched) logo image if background removal
 * rejects or fails, so the logo is NEVER hidden.
 */
let logoPromise: Promise<HTMLImageElement | HTMLCanvasElement | null> | null =
  null;

async function resolveHeaderLogo(): Promise<
  HTMLImageElement | HTMLCanvasElement | null
> {
  const img = await loadImage(HOSPITAL_LOGO_PATH);
  if (!img) return null;
  try {
    const processed = removeNeutralBackground(img);
    if (processed) return processed;
  } catch {
    // fall through to the original logo
  }
  return img;
}

function getHeaderLogo(): Promise<
  HTMLImageElement | HTMLCanvasElement | null
> {
  if (!logoPromise) {
    logoPromise = resolveHeaderLogo().then((result) => {
      // If the asset failed to load, clear the cache so a later attempt can
      // retry (don't permanently cache a null).
      if (!result) logoPromise = null;
      return result;
    });
  }
  return logoPromise;
}

/**
 * Fetch the auth-protected patient photo through the app's authenticated
 * channel and load it as an <img>. Drawing from the resulting `blob:` URL
 * does NOT taint the canvas. Returns null on any failure (missing photo,
 * 403, network error) so the card falls back to a placeholder.
 */
async function loadAuthedImage(
  url: string | undefined,
): Promise<HTMLImageElement | null> {
  if (!url) return null;
  let objectUrl: string | null = null;
  try {
    const res = await fetch(url, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    objectUrl = URL.createObjectURL(blob);
    const img = await loadImage(objectUrl);
    return img;
  } catch {
    return null;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

// ── Canvas drawing helpers ────────────────────────────────────────────────
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (imgRatio > boxRatio) {
    sw = img.height * boxRatio;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / boxRatio;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawImageContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const imgRatio = img.width / img.height;
  const boxRatio = w / h;
  let dw = w;
  let dh = h;
  if (imgRatio > boxRatio) {
    dh = w / imgRatio;
  } else {
    dw = h * imgRatio;
  }
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Draw a label (small, uppercase, teal) + value, top-aligned at `top`. */
function drawField(
  ctx: CanvasRenderingContext2D,
  label: string,
  value: string,
  x: number,
  top: number,
  opts?: { valueSize?: number; maxWidth?: number },
): void {
  const valueSize = opts?.valueSize ?? 15;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";

  ctx.font = `700 9px ${FONT_STACK}`;
  ctx.fillStyle = TEAL;
  ctx.fillText(label.toUpperCase(), x, top, opts?.maxWidth);

  ctx.font = `600 ${valueSize}px ${FONT_STACK}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(value, x, top + 12, opts?.maxWidth);
}

/** Word-wrap `text` to `maxWidth`, returning up to `maxLines` lines. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  // Ellipsize the last line if content was truncated.
  if (lines.length === maxLines) {
    let last = lines[maxLines - 1];
    const remainingWordsExist =
      words.join(" ").length > lines.join(" ").length;
    if (remainingWordsExist) {
      while (
        last.length > 0 &&
        ctx.measureText(`${last}…`).width > maxWidth
      ) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = `${last.trimEnd()}…`;
    }
  }
  return lines;
}

// ── Main renderer (single source of truth) ──────────────────────────────────
/**
 * Render the complete patient ID card onto a high-resolution canvas.
 * This is the ONLY place the card is drawn — preview, PDF and print all
 * consume the output of this function.
 */
export async function renderIdCardCanvas(
  patient: IdCardPatientData,
): Promise<HTMLCanvasElement> {
  const [headerLogo, watermarkLogo, photo] = await Promise.all([
    loadImage(HOSPITAL_LOGO_PATH),
    getHeaderLogo(),
    loadAuthedImage(patient.photo_url),
  ]);

  const canvas = document.createElement("canvas");
  canvas.width = CARD_W * SUPERSAMPLE;
  canvas.height = CARD_H * SUPERSAMPLE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to acquire 2D canvas context");

  ctx.scale(SUPERSAMPLE, SUPERSAMPLE);
  ctx.textBaseline = "alphabetic";

  // Card background.
  ctx.fillStyle = WHITE;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  // ── Header band (teal gradient) ──
  const headerGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  headerGrad.addColorStop(0, TEAL);
  headerGrad.addColorStop(1, TEAL_LIGHT);
  ctx.fillStyle = headerGrad;
  ctx.fillRect(0, 0, CARD_W, HEADER_H);

  // Logo: the original asset (no background processing) inside a clean white
  // rounded container — a deliberate brand element on the teal header.
  const tileSize = 52;
  const tileX = PAD_X;
  const tileY = (HEADER_H - tileSize) / 2;
  const tilePad = 7;
  const tileRadius = 10;

  // White rounded container with a soft shadow for a premium look.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.20)";
  ctx.shadowBlur = 9;
  ctx.shadowOffsetY = 2;
  roundRectPath(ctx, tileX, tileY, tileSize, tileSize, tileRadius);
  ctx.fillStyle = WHITE;
  ctx.fill();
  ctx.restore();

  // Original logo, contained and centered inside the container — no crop,
  // clip-off, or distortion; aspect ratio preserved.
  ctx.save();
  roundRectPath(ctx, tileX, tileY, tileSize, tileSize, tileRadius);
  ctx.clip();
  if (headerLogo) {
    drawImageContain(
      ctx,
      headerLogo,
      tileX + tilePad,
      tileY + tilePad,
      tileSize - tilePad * 2,
      tileSize - tilePad * 2,
    );
  }
  ctx.restore();

  // Hospital name + subtitle (centered two-line block beside the container).
  const textX = tileX + tileSize + 16;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = WHITE;
  ctx.font = `800 22px ${FONT_STACK}`;
  ctx.fillText(HOSPITAL_SHORT_NAME, textX, HEADER_H / 2 - 4);
  ctx.font = `500 13px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText(HOSPITAL_SUBTITLE, textX, HEADER_H / 2 + 16);

  // "PATIENT ID CARD" tag (right, vertically centered).
  ctx.textAlign = "right";
  ctx.font = `600 11px ${FONT_STACK}`;
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.fillText("PATIENT ID CARD", CARD_W - PAD_X, HEADER_H / 2 + 4);

  // ── Faint logo watermark (behind body content) ──
  if (watermarkLogo) {
    ctx.save();
    // Subtle but visible. The background-removed crest is fainter than the
    // original opaque square, so the alpha is a touch higher than a typical
    // watermark.
    ctx.globalAlpha = 0.07;
    drawImageContain(ctx, watermarkLogo, CARD_W - 162, CARD_H - 162, 132, 132);
    ctx.restore();
  }

  // ── Body: photo column ──
  const bodyTop = HEADER_H + 18;
  const photoW = 128;
  const photoH = 166;
  const photoX = PAD_X;
  const photoY = bodyTop;

  // Photo frame.
  ctx.save();
  roundRectPath(ctx, photoX, photoY, photoW, photoH, 8);
  ctx.fillStyle = PHOTO_BG;
  ctx.fill();
  ctx.clip();
  if (photo) {
    drawImageCover(ctx, photo, photoX, photoY, photoW, photoH);
  } else {
    // Placeholder person glyph.
    ctx.fillStyle = "#cbd5e1";
    const cx = photoX + photoW / 2;
    const headCy = photoY + photoH * 0.4;
    ctx.beginPath();
    ctx.arc(cx, headCy, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, photoY + photoH * 0.95, 42, Math.PI, 0);
    ctx.fill();
  }
  ctx.restore();
  // Photo border.
  ctx.save();
  roundRectPath(ctx, photoX, photoY, photoW, photoH, 8);
  ctx.strokeStyle = "rgba(13,115,119,0.25)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  // File-number badge under the photo.
  const badgeY = photoY + photoH + 11;
  const badgeH = 28;
  roundRectPath(ctx, photoX, badgeY, photoW, badgeH, 6);
  ctx.fillStyle = TEAL_TINT;
  ctx.fill();
  ctx.strokeStyle = "rgba(13,115,119,0.25)";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = TEAL;
  ctx.font = `700 15px 'Courier New', monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(patient.file_number || "—", photoX + photoW / 2, badgeY + badgeH / 2 + 1, photoW - 12);

  // ── Body: details column (top-aligned to photo top) ──
  const detailX = photoX + photoW + 28;
  const detailRight = CARD_W - PAD_X;
  const detailW = detailRight - detailX;

  // Patient name.
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `700 9px ${FONT_STACK}`;
  ctx.fillStyle = TEAL;
  ctx.fillText("PATIENT NAME", detailX, photoY);

  ctx.font = `800 23px ${FONT_STACK}`;
  ctx.fillStyle = INK;
  const nameLines = wrapText(ctx, patient.full_name || "—", detailW, 1);
  ctx.fillText(nameLines[0], detailX, photoY + 13, detailW);

  // Symmetric 2×2 info grid — identical column widths, equal row rhythm,
  // consistent label/value styling for all four fields.
  //   Row 1:  AGE / SEX     MOBILE
  //   Row 2:  REG. DATE     BLOOD GROUP
  const colGap = 18;
  const colW = (detailW - colGap) / 2;
  const col1X = detailX;
  const col2X = detailX + colW + colGap;
  const gridRow1Top = photoY + 58;
  const gridRow2Top = gridRow1Top + 50;

  const ageSex = `${getAge(patient.date_of_birth)} / ${
    patient.gender ? patient.gender.charAt(0).toUpperCase() : "—"
  }`;
  const bloodGroup =
    patient.blood_group && patient.blood_group.trim()
      ? patient.blood_group
      : "—";

  drawField(ctx, "Age / Sex", ageSex, col1X, gridRow1Top, { maxWidth: colW });
  drawField(ctx, "Mobile", patient.phone || "N/A", col2X, gridRow1Top, {
    maxWidth: colW,
  });
  drawField(
    ctx,
    "Reg. Date",
    formatDate(patient.registration_date),
    col1X,
    gridRow2Top,
    { maxWidth: colW },
  );
  drawField(ctx, "Blood Group", bloodGroup, col2X, gridRow2Top, {
    maxWidth: colW,
  });

  // Address (wrapped, up to 2 lines).
  const addrTop = gridRow2Top + 50;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `700 9px ${FONT_STACK}`;
  ctx.fillStyle = TEAL;
  ctx.fillText("ADDRESS", detailX, addrTop);

  ctx.font = `500 13px ${FONT_STACK}`;
  ctx.fillStyle = INK_SOFT;
  const addrLines = wrapText(ctx, buildAddress(patient), detailW, 2);
  addrLines.forEach((line, i) => {
    ctx.fillText(line, detailX, addrTop + 13 + i * 16, detailW);
  });

  // ── Footer bar ──
  const footerGrad = ctx.createLinearGradient(0, 0, CARD_W, 0);
  footerGrad.addColorStop(0, TEAL);
  footerGrad.addColorStop(1, TEAL_LIGHT);
  ctx.fillStyle = footerGrad;
  ctx.fillRect(0, CARD_H - FOOTER_H, CARD_W, FOOTER_H);

  return canvas;
}

// ── PDF construction ─────────────────────────────────────────────────────────
/** Build a card-sized (100×60 mm) PDF from an already-rendered canvas. */
export function idCardPdfFromCanvas(canvas: HTMLCanvasElement): jsPDF {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [CARD_W_MM, CARD_H_MM],
  });
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  // JPEG keeps the file small; the card is fully opaque so no alpha is lost.
  const imgData = canvas.toDataURL("image/jpeg", 0.95);
  doc.addImage(imgData, "JPEG", 0, 0, pw, ph, undefined, "FAST");
  return doc;
}

/** Render + build the PDF in one step. */
export async function buildPatientIdCardPdf(
  patient: IdCardPatientData,
): Promise<jsPDF> {
  const canvas = await renderIdCardCanvas(patient);
  return idCardPdfFromCanvas(canvas);
}

/** Download the patient ID card as a PDF. */
export async function downloadPatientIdCardPdf(
  patient: IdCardPatientData,
): Promise<void> {
  const doc = await buildPatientIdCardPdf(patient);
  doc.save(`patient-id-card-${patient.file_number || "patient"}.pdf`);
}

/**
 * Open the patient ID card PDF in a new tab and trigger the print dialog.
 * Print output is identical to the preview/download — all come from the
 * same canvas embedded in the same PDF.
 */
export async function printPatientIdCardPdf(
  patient: IdCardPatientData,
): Promise<void> {
  const doc = await buildPatientIdCardPdf(patient);
  const blobUrl = doc.output("bloburl");
  const printWindow = window.open(blobUrl as unknown as string, "_blank");
  if (printWindow) {
    printWindow.addEventListener("load", () => {
      printWindow.focus();
      printWindow.print();
    });
  }
}
