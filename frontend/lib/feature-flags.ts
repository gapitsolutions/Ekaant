/**
 * Centralized feature flags for configurable biometric & photo capture.
 *
 * These flags are driven by `NEXT_PUBLIC_*` environment variables and
 * allow each deployment centre to enable/disable fingerprint scanners
 * and cameras independently.
 *
 * IMPORTANT: Next.js inlines `process.env.NEXT_PUBLIC_*` at build time
 * via static string replacement. Dynamic lookups like `process.env[key]`
 * do NOT work — the references must be literal.
 *
 * Environment variables (all default to "true" when absent):
 *
 *   NEXT_PUBLIC_ENABLE_FINGERPRINT  – show fingerprint UI & allow capture
 *   NEXT_PUBLIC_ENABLE_CAMERA       – show camera/photo UI & allow capture
 *   NEXT_PUBLIC_FINGERPRINT_REQUIRED – block registration without fingerprint
 *   NEXT_PUBLIC_CAMERA_REQUIRED      – block registration without photo
 */

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw === "") return fallback;
  return raw.toLowerCase() === "true" || raw === "1";
}

// Each env var must be referenced as a literal string so Next.js can
// statically replace it at compile time.

/** Whether the fingerprint scanner UI should be shown at all. */
export const ENABLE_FINGERPRINT = parseBool(
  process.env.NEXT_PUBLIC_ENABLE_FINGERPRINT,
  true,
);

/** Whether the camera / photo-capture UI should be shown at all. */
export const ENABLE_CAMERA = parseBool(
  process.env.NEXT_PUBLIC_ENABLE_CAMERA,
  true,
);

/**
 * Whether a fingerprint scan is mandatory before registration.
 * Only meaningful when `ENABLE_FINGERPRINT` is true — if the scanner
 * is disabled this flag is automatically treated as false.
 */
export const FINGERPRINT_REQUIRED = ENABLE_FINGERPRINT
  ? parseBool(process.env.NEXT_PUBLIC_FINGERPRINT_REQUIRED, false)
  : false;

/**
 * Whether a photo capture is mandatory before registration.
 * Only meaningful when `ENABLE_CAMERA` is true.
 */
export const CAMERA_REQUIRED = ENABLE_CAMERA
  ? parseBool(process.env.NEXT_PUBLIC_CAMERA_REQUIRED, false)
  : false;

/**
 * True when at least one biometric/identification method is available.
 * Used to decide whether the check-in page can offer any verification at all.
 */
export const HAS_ANY_VERIFICATION_METHOD =
  ENABLE_FINGERPRINT || ENABLE_CAMERA;

/**
 * The default verification method for check-in, based on what's enabled.
 * Falls back to "manual" when neither fingerprint nor camera is available.
 */
export const DEFAULT_CHECKIN_VERIFICATION_METHOD: "fingerprint" | "photo" | "manual" =
  ENABLE_FINGERPRINT ? "fingerprint" : ENABLE_CAMERA ? "photo" : "manual";
