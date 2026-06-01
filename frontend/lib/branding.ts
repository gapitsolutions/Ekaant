/**
 * Hospital branding — SINGLE SOURCE OF TRUTH.
 *
 * Every piece of hospital identity (name, logo, colors, contact details) lives
 * here. UI surfaces (sidebar, login, headers, empty states) and exports
 * (ID card, invoice, PDFs) should read from this object instead of hardcoding
 * strings, so a new deployment only needs to edit THIS file.
 *
 * NOTE: `lib/export/hospital-branding.ts` re-exports from here for backward
 * compatibility — existing imports keep working unchanged.
 */

export interface HospitalBrandingColors {
  /** Primary brand color (hex). */
  primary: string;
  /** Darker primary, used for hover states (hex). */
  primaryDark: string;
  /** Two-stop brand gradient [from, to] (hex). */
  primaryGradient: readonly [string, string];
}

export interface HospitalBranding {
  /** Full legal name — used in titles, metadata, document headers. */
  name: string;
  /** Short name for tight spaces (sidebar, ID card header). */
  shortName: string;
  /** Secondary line shown under the name. */
  subtitle: string;
  /** Optional marketing tagline. */
  tagline: string;

  /** Public path to the logo (in /public). */
  logoPath: string;
  /** Public path to the favicon (in /public). */
  faviconPath: string;

  /** Postal address (single line). Empty until configured per deployment. */
  address: string;
  phone: string;
  email: string;
  website: string;
  /** GST identification number, if applicable. */
  gstin: string;

  /** Footer line printed on invoices/receipts. */
  invoiceFooter: string;
  /** Where staff should direct support questions. */
  supportContact: string;

  colors: HospitalBrandingColors;
}

export const BRANDING: HospitalBranding = {
  name: "Aggarwal Psychiatric & De-Addiction Centre",
  shortName: "Aggarwal Psychiatric",
  subtitle: "& De-Addiction Centre",
  tagline: "Comprehensive patient management system",

  logoPath: "/logo.png",
  faviconPath: "/logo.png",

  // Contact details are intentionally blank until provided for a deployment.
  // They are NOT currently rendered anywhere, so leaving them empty changes
  // nothing; fill them in to enable future invoice/letterhead usage.
  address: "",
  phone: "",
  email: "",
  website: "",
  gstin: "",

  invoiceFooter: "",
  supportContact: "",

  colors: {
    primary: "#0d7377",
    primaryDark: "#0a5c5f",
    primaryGradient: ["#0d7377", "#14919b"] as const,
  },
};
