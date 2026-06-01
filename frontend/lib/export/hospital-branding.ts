/**
 * Hospital branding constants for exports (PDFs, ID cards, invoices).
 *
 * These now re-export from the single source of truth in `lib/branding.ts`.
 * The named exports below are kept for backward compatibility so existing
 * imports continue to work unchanged.
 */
import { BRANDING } from "@/lib/branding";

export const HOSPITAL_NAME = BRANDING.name;
export const HOSPITAL_SHORT_NAME = BRANDING.shortName;
export const HOSPITAL_SUBTITLE = BRANDING.subtitle;
export const HOSPITAL_LOGO_PATH = BRANDING.logoPath;
export const HOSPITAL_PRIMARY_COLOR = BRANDING.colors.primary;
export const HOSPITAL_PRIMARY_GRADIENT = BRANDING.colors.primaryGradient;
