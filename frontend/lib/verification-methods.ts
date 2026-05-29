/**
 * Centralized verification method definitions.
 *
 * Every piece of UI that renders, filters, counts, or formats a
 * verification method imports from this single module. Adding a new
 * method (e.g. "face_recognition", "qr", "rfid") requires only:
 *
 *   1. Add the string to the `VerificationMethod` union type.
 *   2. Add an entry to `VERIFICATION_METHOD_CONFIG`.
 *
 * No other file needs to change.
 *
 * The type is kept in sync with the backend Django TextChoices:
 *   class CheckinVerificationMethod(models.TextChoices):
 *       FINGERPRINT = "fingerprint", "Fingerprint"
 *       PHOTO       = "photo",       "Photo"
 *       MANUAL      = "manual",      "Manual"
 */

import {
  ShieldCheck,
  Camera,
  UserCheck,
  type LucideIcon,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Canonical type — mirrors backend CheckinVerificationMethod TextChoices
// ---------------------------------------------------------------------------

export type VerificationMethod = "fingerprint" | "photo" | "manual";

// ---------------------------------------------------------------------------
// Per-method display configuration
// ---------------------------------------------------------------------------

export interface VerificationMethodMeta {
  /** Human-readable label (badges, filters, detail panels). */
  label: string;
  /** Lucide icon component. */
  icon: LucideIcon;
  /** Tailwind badge classes. */
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  /** Tailwind class for the stat-card header icon. */
  iconColor: string;
  /** Sentence shown in the detail-panel when this method was used. */
  detailText: string;
}

export const VERIFICATION_METHOD_CONFIG: Record<
  VerificationMethod,
  VerificationMethodMeta
> = {
  fingerprint: {
    label: "Fingerprint",
    icon: ShieldCheck,
    badgeBg: "bg-blue-50",
    badgeText: "text-blue-700",
    badgeBorder: "border-blue-100",
    iconColor: "text-blue-600",
    detailText: "Fingerprint verification was used for this visit.",
  },
  photo: {
    label: "Photo",
    icon: Camera,
    badgeBg: "bg-purple-50",
    badgeText: "text-purple-700",
    badgeBorder: "border-purple-100",
    iconColor: "text-purple-600",
    detailText:
      "Photo verification with timestamp was used for this visit.",
  },
  manual: {
    label: "Manual",
    icon: UserCheck,
    badgeBg: "bg-amber-50",
    badgeText: "text-amber-700",
    badgeBorder: "border-amber-100",
    iconColor: "text-amber-600",
    detailText:
      "Manual identity verification was used for this visit.",
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Ordered list of every known verification method key. */
export const ALL_VERIFICATION_METHODS: VerificationMethod[] = Object.keys(
  VERIFICATION_METHOD_CONFIG,
) as VerificationMethod[];

/**
 * Look up display config for a method string.
 *
 * Returns a sensible fallback for any *unknown* value so the UI never
 * crashes if the backend adds a method before the frontend is updated.
 */
export function getMethodMeta(method: string): VerificationMethodMeta {
  if (method in VERIFICATION_METHOD_CONFIG) {
    return VERIFICATION_METHOD_CONFIG[method as VerificationMethod];
  }
  // Graceful fallback — capitalise the raw string.
  return {
    label: method.charAt(0).toUpperCase() + method.slice(1).replace(/_/g, " "),
    icon: ShieldCheck,
    badgeBg: "bg-slate-50",
    badgeText: "text-slate-700",
    badgeBorder: "border-slate-200",
    iconColor: "text-slate-600",
    detailText: `${method} verification was used for this visit.`,
  };
}
