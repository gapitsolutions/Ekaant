import { jsPDF } from "jspdf";
import { loadLogoBase64, downloadPdf } from "./pdf-helpers";
import {
  PAGE_MARGIN_X,
  INK,
  INK_SOFT,
  LIGHT,
  HAIRLINE,
  drawFootersOnAllPages,
  drawSectionTitle,
  drawTable,
  formatGeneratedAt,
  newPage,
  sanitiseFilenamePart,
  type TableColumn,
} from "./pdf-layout";
import { HOSPITAL_PRIMARY_COLOR } from "./hospital-branding";

// Decimal fields arrive as strings from the API; whole-number fields as numbers.
export interface PayslipPdfData {
  staff_name: string;
  staff_code: string;
  designation: string;
  year: number;
  month: number; // 1-12
  monthly_salary: string;
  days_in_month: number;
  sundays_in_month: number;
  sunday_holiday: boolean;
  holiday_allowed: number;
  present_days: string;
  absent_days: string;
  half_days: number;
  paid_leave_used: string;
  unpaid_absent: string;
  per_day_rate: string;
  deduction: string;
  net_pay: string;
  generated_by_name?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function rupees(value: number): string {
  if (Number.isNaN(value)) return "Rs. 0.00";
  return `Rs. ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ── Indian-system number → words (for the net-pay line). ──
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? " " + ONES[o] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

function numberToWords(value: number): string {
  const rupeesPart = Math.floor(value);
  const paise = Math.round((value - rupeesPart) * 100);
  if (rupeesPart === 0 && paise === 0) return "Zero Rupees";

  const segments: { div: number; label: string }[] = [
    { div: 10000000, label: "Crore" },
    { div: 100000, label: "Lakh" },
    { div: 1000, label: "Thousand" },
  ];
  let remaining = rupeesPart;
  const words: string[] = [];
  for (const seg of segments) {
    if (remaining >= seg.div) {
      const count = Math.floor(remaining / seg.div);
      words.push(`${threeDigits(count)} ${seg.label}`);
      remaining %= seg.div;
    }
  }
  if (remaining > 0) words.push(threeDigits(remaining));

  let result = words.length ? `${words.join(" ")} Rupees` : "Zero Rupees";
  if (paise > 0) result += ` and ${twoDigits(paise)} Paise`;
  return `${result} Only`;
}

/**
 * Client-side payslip PDF. The authoritative record is the stored Payslip
 * snapshot (audit); this is a printable rendering of that snapshot. Regenerating
 * always reflects the snapshot's figures, never a fresh recompute.
 */
export async function generatePayslipPdf(data: PayslipPdfData): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const period = `${MONTHS[data.month - 1] ?? ""} ${data.year}`;
  const layout = newPage(doc, logo, `Payslip — ${period}`);
  const { doc: d } = layout;

  // ── Employee meta ──
  drawSectionTitle(layout, `Payslip for ${period}`);

  const colGap = 6;
  const colW = (layout.contentWidth - colGap) / 2;
  const leftX = PAGE_MARGIN_X;
  const rightX = PAGE_MARGIN_X + colW + colGap;
  const top = layout.y;

  const metaLine = (label: string, value: string, x: number, y: number) => {
    d.setFontSize(7);
    d.setFont("helvetica", "bold");
    d.setTextColor(LIGHT);
    d.text(label.toUpperCase(), x, y);
    d.setFontSize(9);
    d.setFont("helvetica", "normal");
    d.setTextColor(INK);
    d.text(value || "—", x, y + 4);
  };

  d.setFontSize(8);
  d.setFont("helvetica", "bold");
  d.setTextColor(INK_SOFT);
  d.text("EMPLOYEE", leftX, top);
  metaLine("Name", data.staff_name, leftX, top + 6);
  metaLine("Staff Code", data.staff_code, leftX, top + 16);
  metaLine("Designation", data.designation, leftX, top + 26);

  d.setFontSize(8);
  d.setFont("helvetica", "bold");
  d.setTextColor(INK_SOFT);
  d.text("PERIOD", rightX, top);
  metaLine("Month", period, rightX, top + 6);
  metaLine(
    "Days in Month",
    `${data.days_in_month} (Sundays: ${data.sundays_in_month})`,
    rightX,
    top + 16,
  );
  metaLine("Per-Day Rate", rupees(Number(data.per_day_rate)), rightX, top + 26);

  layout.y = top + 38;

  // ── Attendance summary ──
  drawSectionTitle(layout, "Attendance Summary");
  const attCols: TableColumn[] = [
    { header: "Metric", width: 120 },
    { header: "Value", width: 62, align: "right" },
  ];
  drawTable(layout, attCols, [
    ["Present days (incl. half-day credit)", data.present_days],
    ["Absent days", data.absent_days],
    ["Half days", String(data.half_days)],
    ["Paid leave allowance", String(data.holiday_allowed)],
    ["Paid leave used", data.paid_leave_used],
    ["Unpaid absences", data.unpaid_absent],
  ]);

  // ── Earnings / deductions ──
  drawSectionTitle(layout, "Salary Computation");
  const payCols: TableColumn[] = [
    { header: "Description", width: 120 },
    { header: "Amount", width: 62, align: "right" },
  ];
  const net = Number(data.net_pay);
  drawTable(
    layout,
    payCols,
    [
      ["Gross monthly salary", rupees(Number(data.monthly_salary))],
      [
        `Deduction (${data.unpaid_absent} unpaid x ${rupees(Number(data.per_day_rate))})`,
        `- ${rupees(Number(data.deduction))}`,
      ],
    ],
    { totalRow: ["Net Pay", rupees(net)] },
  );

  // ── Amount in words ──
  layout.y += 2;
  d.setFontSize(8);
  d.setFont("helvetica", "bold");
  d.setTextColor(HOSPITAL_PRIMARY_COLOR);
  d.text("NET PAY IN WORDS", PAGE_MARGIN_X, layout.y);
  layout.y += 5;
  d.setFontSize(9);
  d.setFont("helvetica", "italic");
  d.setTextColor(INK);
  const words = doc.splitTextToSize(
    numberToWords(net),
    layout.contentWidth,
  ) as string[];
  d.text(words, PAGE_MARGIN_X, layout.y);
  layout.y += words.length * 5 + 6;

  // ── Note ──
  d.setDrawColor(HAIRLINE);
  d.setLineWidth(0.2);
  d.line(PAGE_MARGIN_X, layout.y, PAGE_MARGIN_X + layout.contentWidth, layout.y);
  layout.y += 5;
  d.setFontSize(7);
  d.setFont("helvetica", "italic");
  d.setTextColor(LIGHT);
  d.text(
    "This is a computer-generated payslip and does not require a signature.",
    PAGE_MARGIN_X,
    layout.y,
  );

  drawFootersOnAllPages(doc, formatGeneratedAt());
  downloadPdf(
    doc,
    `payslip-${sanitiseFilenamePart(data.staff_code)}-${data.year}-${String(
      data.month,
    ).padStart(2, "0")}.pdf`,
  );
}
