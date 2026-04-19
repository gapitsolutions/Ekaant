export interface BiometricResult {
  success: boolean;
  data?: string;
  error?: string;
}

export interface RDServiceInfo {
  available: boolean;
  secure: boolean;
  endpoint: string;
  sdkLoaded: boolean;
  deviceInfo?: {
    name: string;
    serial: string;
    status: string;
  };
  error?: string;
}

type JQueryLike = {
  support?: { cors?: boolean };
  ajax?: (...args: unknown[]) => unknown;
};

type Mfs100Envelope<T> = {
  httpStaus?: boolean;
  data?: T;
  err?: string;
};

type Mfs100CaptureData = Record<string, unknown>;
type Mfs100InfoData = Record<string, unknown>;

type StoredFingerprintPayload = {
  template?: string;
  raw?: Record<string, unknown>;
  format?: string;
  capturedAt?: string;
  secure?: boolean;
  endpoint?: string;
};

declare global {
  interface Window {
    $?: JQueryLike;
    jQuery?: JQueryLike;
    MFS100_CONFIG?: {
      secure?: boolean;
      uri?: string;
    };
    SetMFS100Uri?: (uri: string) => void;
    GetMFS100Uri?: () => string;
    GetMFS100Info?: () => Mfs100Envelope<Mfs100InfoData>;
    CaptureFinger?: (
      quality: number,
      timeout: number,
    ) => Mfs100Envelope<Mfs100CaptureData>;
    VerifyFinger?: (
      probeTemplate: string,
      galleryTemplate: string,
    ) => Mfs100Envelope<Record<string, unknown>>;
  }
}

const SDK_JQUERY_PATH = "/fingerprint-sdk/jquery-1.8.2.js";
const SDK_MFS100_PATH = "/fingerprint-sdk/mfs100.js";
const DEFAULT_HOST = process.env.NEXT_PUBLIC_MFS100_HOST || "localhost";
const USE_SECURE_CHANNEL = process.env.NEXT_PUBLIC_MFS100_SECURE === "true";
const SECURE_PORT = process.env.NEXT_PUBLIC_MFS100_SECURE_PORT || "8003";
const INSECURE_PORT = process.env.NEXT_PUBLIC_MFS100_INSECURE_PORT || "8004";

let sdkLoadPromise: Promise<void> | null = null;

function getSdkBaseUrl() {
  const protocol = USE_SECURE_CHANNEL ? "https" : "http";
  const port = USE_SECURE_CHANNEL ? SECURE_PORT : INSECURE_PORT;
  return `${protocol}://${DEFAULT_HOST}:${port}/mfs100/`;
}

function fingerprintServiceUnavailable(error?: string): RDServiceInfo {
  return {
    available: false,
    secure: USE_SECURE_CHANNEL,
    endpoint: getSdkBaseUrl(),
    sdkLoaded:
      typeof window !== "undefined" &&
      typeof window.GetMFS100Info === "function",
    error:
      error ||
      "Fingerprint service is unavailable. Ensure the Mantra local service is running.",
  };
}

function scriptLoaded(id: string) {
  return typeof document !== "undefined"
    ? document.querySelector<HTMLScriptElement>(`script[data-sdk-id="${id}"]`)
    : null;
}

function loadScript(src: string, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = scriptLoaded(id);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error(`Failed to load ${src}`)),
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.dataset.sdkId = id;
    script.addEventListener("load", () => {
      script.dataset.loaded = "true";
      resolve();
    });
    script.addEventListener("error", () => {
      reject(new Error(`Failed to load ${src}`));
    });
    document.head.appendChild(script);
  });
}

async function ensureFingerprintSdkLoaded(): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Fingerprint SDK can only be used in the browser.");
  }

  if (
    typeof window.GetMFS100Info === "function" &&
    typeof window.CaptureFinger === "function"
  ) {
    window.SetMFS100Uri?.(getSdkBaseUrl());
    return;
  }

  if (!sdkLoadPromise) {
    sdkLoadPromise = (async () => {
      window.MFS100_CONFIG = {
        secure: USE_SECURE_CHANNEL,
        uri: getSdkBaseUrl(),
      };
      await loadScript(SDK_JQUERY_PATH, "mfs100-jquery");
      await loadScript(SDK_MFS100_PATH, "mfs100-sdk");
      window.SetMFS100Uri?.(getSdkBaseUrl());
    })().catch((error) => {
      sdkLoadPromise = null;
      throw error;
    });
  }

  await sdkLoadPromise;
}

function parseErrorCode(payload: Record<string, unknown> | undefined) {
  const rawCode = payload?.ErrorCode ?? payload?.errorCode;
  if (rawCode === undefined || rawCode === null || rawCode === "") {
    return 0;
  }
  const value = Number(rawCode);
  return Number.isFinite(value) ? value : 0;
}

function parseErrorMessage(
  response?: Mfs100Envelope<Record<string, unknown>>,
  fallback?: string,
) {
  return (
    (typeof response?.data?.ErrorDescription === "string"
      ? response.data.ErrorDescription
      : undefined) ||
    response?.err ||
    fallback ||
    "Fingerprint service request failed."
  );
}

function getDeviceInfo(payload: Record<string, unknown> | undefined) {
  if (!payload) return undefined;
  return {
    name:
      (typeof payload.DeviceInfo === "string" && payload.DeviceInfo) ||
      (typeof payload.DeviceName === "string" && payload.DeviceName) ||
      (typeof payload.Model === "string" && payload.Model) ||
      "Mantra MFS100",
    serial:
      (typeof payload.SerialNo === "string" && payload.SerialNo) ||
      (typeof payload.SerialNumber === "string" && payload.SerialNumber) ||
      "Unknown",
    status:
      (typeof payload.ErrorDescription === "string" && payload.ErrorDescription) ||
      "READY",
  };
}

function extractTemplate(payload?: Record<string, unknown>) {
  if (!payload) return "";
  const candidateKeys = [
    "TemplateBase64",
    "Template",
    "IsoTemplate",
    "ISOTemplate",
    "AnsiTemplate",
    "ANSITemplate",
    "FingerData",
  ];

  for (const key of candidateKeys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return "";
}

function serializeCapturePayload(payload: Record<string, unknown>): string {
  const template = extractTemplate(payload);
  const normalized: StoredFingerprintPayload = {
    template: template || undefined,
    raw: payload,
    format: template ? "template" : "raw",
    capturedAt: new Date().toISOString(),
    secure: USE_SECURE_CHANNEL,
    endpoint: getSdkBaseUrl(),
  };
  return JSON.stringify(normalized);
}

function parseStoredPayload(value: string): StoredFingerprintPayload {
  try {
    const parsed = JSON.parse(value) as
      | StoredFingerprintPayload
      | Record<string, unknown>;
    if (
      parsed &&
      typeof parsed === "object" &&
      ("template" in parsed || "raw" in parsed || "format" in parsed)
    ) {
      return parsed as StoredFingerprintPayload;
    }

    return {
      template: extractTemplate(parsed as Record<string, unknown>) || value,
      raw: parsed as Record<string, unknown>,
    };
  } catch {
    return { template: value };
  }
}

function interpretVerifySuccess(payload: Record<string, unknown> | undefined) {
  if (!payload) return false;

  const directValue =
    payload.Status ??
    payload.status ??
    payload.Verified ??
    payload.verified ??
    payload.Authenticated ??
    payload.authenticated ??
    payload.Success ??
    payload.success;

  if (typeof directValue === "boolean") {
    return directValue;
  }

  if (typeof directValue === "string") {
    const normalized = directValue.toLowerCase();
    if (["true", "matched", "success", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["false", "mismatch", "failed", "0", "no"].includes(normalized)) {
      return false;
    }
  }

  const score = Number(
    payload.MatchingScore ?? payload.MatchScore ?? payload.Score ?? NaN,
  );
  if (Number.isFinite(score)) {
    return score > 0;
  }

  return false;
}

export async function checkRDService(): Promise<RDServiceInfo> {
  try {
    await ensureFingerprintSdkLoaded();
  } catch (error) {
    return fingerprintServiceUnavailable(
      error instanceof Error ? error.message : undefined,
    );
  }

  try {
    const response = window.GetMFS100Info?.();
    if (!response?.httpStaus) {
      return fingerprintServiceUnavailable(
        parseErrorMessage(response, "Unable to reach the Mantra local service."),
      );
    }

    const errorCode = parseErrorCode(response.data);
    if (errorCode !== 0) {
      return fingerprintServiceUnavailable(parseErrorMessage(response));
    }

    return {
      available: true,
      secure: USE_SECURE_CHANNEL,
      endpoint: window.GetMFS100Uri?.() || getSdkBaseUrl(),
      sdkLoaded: true,
      deviceInfo: getDeviceInfo(response.data),
    };
  } catch (error) {
    return fingerprintServiceUnavailable(
      error instanceof Error ? error.message : undefined,
    );
  }
}

export async function captureFingerprint(): Promise<BiometricResult> {
  const serviceInfo = await checkRDService();
  if (!serviceInfo.available) {
    return { success: false, error: serviceInfo.error };
  }

  try {
    const response = window.CaptureFinger?.(60, 10000);

    if (!response?.httpStaus || !response.data) {
      return {
        success: false,
        error: parseErrorMessage(response, "Fingerprint capture failed."),
      };
    }

    const errorCode = parseErrorCode(response.data);
    if (errorCode !== 0) {
      return {
        success: false,
        error: parseErrorMessage(response),
      };
    }

    return {
      success: true,
      data: serializeCapturePayload(response.data),
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Fingerprint capture failed. Please try again.",
    };
  }
}

export async function verifyFingerprint(
  captured: string,
  stored: string,
): Promise<boolean> {
  const capturedPayload = parseStoredPayload(captured);
  const storedPayload = parseStoredPayload(stored);
  const capturedTemplate =
    capturedPayload.template || extractTemplate(capturedPayload.raw);
  const storedTemplate =
    storedPayload.template || extractTemplate(storedPayload.raw);

  if (!capturedTemplate || !storedTemplate) {
    return captured === stored;
  }

  try {
    await ensureFingerprintSdkLoaded();
    const response = window.VerifyFinger?.(capturedTemplate, storedTemplate);
    if (!response?.httpStaus || !response.data) {
      return capturedTemplate === storedTemplate;
    }

    const errorCode = parseErrorCode(response.data);
    if (errorCode !== 0) {
      return false;
    }

    return (
      interpretVerifySuccess(response.data) || capturedTemplate === storedTemplate
    );
  } catch {
    return capturedTemplate === storedTemplate;
  }
}

export const matchFingerprint = verifyFingerprint;
