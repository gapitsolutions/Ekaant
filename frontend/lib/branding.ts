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
  /** Accent color paired with ``primary`` — the second stop of the
   *  two-tone brand gradient and the standalone "lighter teal" used in
   *  badges, icons, and gradient ends. */
  primaryAccent: string;
  /** Darker accent, used for hover states on accent-colored surfaces. */
  primaryAccentDark: string;
  /** Two-stop brand gradient ``[primary, primaryAccent]``. Derived. */
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

function requirePublicEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

const BRANDING_NAME = requirePublicEnv(
  process.env.NEXT_PUBLIC_BRANDING_NAME,
  "NEXT_PUBLIC_BRANDING_NAME",
);
const BRANDING_SHORT_NAME = requirePublicEnv(
  process.env.NEXT_PUBLIC_BRANDING_SHORT_NAME,
  "NEXT_PUBLIC_BRANDING_SHORT_NAME",
);
const BRANDING_SUBTITLE = requirePublicEnv(
  process.env.NEXT_PUBLIC_BRANDING_SUBTITLE,
  "NEXT_PUBLIC_BRANDING_SUBTITLE",
);
const BRANDING_TAGLINE = requirePublicEnv(
  process.env.NEXT_PUBLIC_BRANDING_TAGLINE,
  "NEXT_PUBLIC_BRANDING_TAGLINE",
);
const BRANDING_LOGO_PATH = requirePublicEnv(
  process.env.NEXT_PUBLIC_BRANDING_LOGO_PATH,
  "NEXT_PUBLIC_BRANDING_LOGO_PATH",
);
const BRANDING_FAVICON_PATH = requirePublicEnv(
  process.env.NEXT_PUBLIC_BRANDING_FAVICON_PATH,
  "NEXT_PUBLIC_BRANDING_FAVICON_PATH",
);

export const BRANDING: HospitalBranding = {
  name: BRANDING_NAME,
  shortName: BRANDING_SHORT_NAME,
  subtitle: BRANDING_SUBTITLE,
  tagline: BRANDING_TAGLINE,

  logoPath: BRANDING_LOGO_PATH,
  faviconPath: BRANDING_FAVICON_PATH,

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
    primaryAccent: "#14919b",
    primaryAccentDark: "#0f6f77",
    primaryGradient: ["#0d7377", "#14919b"] as const,
  },
};
