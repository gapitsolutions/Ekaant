"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Camera, Loader2, X, RefreshCw, CheckCircle } from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CapturedPhoto {
  /** Raw base64 string (no data-url prefix). */
  base64: string;
  /** MIME type, e.g. "image/jpeg". */
  mimeType: string;
  /** Full data-url for preview. */
  dataUrl: string;
  /** ISO-8601 timestamp of when the photo was captured. */
  capturedAt: string;
}

export interface PhotoCaptureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called when the user confirms the captured photo. */
  onConfirm: (photo: CapturedPhoto) => void;
  /** Optional title override. */
  title?: string;
  /** Optional description override. */
  description?: string;
  /**
   * When true a human-readable timestamp is burned into the bottom-left
   * corner of the captured image.  Used by check-in verification.
   */
  addTimestamp?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parsePhotoDataUrl(
  dataUrl: string,
): { mimeType: string; base64: string } | null {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PhotoCaptureDialog({
  open,
  onOpenChange,
  onConfirm,
  title = "Capture Photo",
  description = "Select a camera and capture a photo.",
  addTimestamp = false,
}: PhotoCaptureDialogProps) {
  // ---- Camera picker state ----
  const [step, setStep] = useState<"pick" | "capture" | "preview">("pick");
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    [],
  );
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isLoadingCameras, setIsLoadingCameras] = useState(false);

  // ---- Live camera state ----
  const [isCameraReady, setIsCameraReady] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // ---- Captured photo ----
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const capturedAtRef = useRef<string>("");

  // ------------------------------------------------------------------
  // Cleanup helpers
  // ------------------------------------------------------------------

  const stopStream = useCallback(() => {
    setIsCameraReady(false);
    if (videoRef.current) videoRef.current.srcObject = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    stopStream();
    setStep("pick");
    setPhotoPreview(null);
    setIsCameraReady(false);
    capturedAtRef.current = "";
  }, [stopStream]);

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (!open) resetState();
  }, [open, resetState]);

  // ------------------------------------------------------------------
  // Step 1 — enumerate cameras
  // ------------------------------------------------------------------

  const loadCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera is not supported in this browser.");
      return;
    }

    setIsLoadingCameras(true);
    try {
      // Prompt permission so labels are available.
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      tempStream.getTracks().forEach((t) => t.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");

      if (cameras.length === 0) {
        toast.error("No camera devices detected.");
        return;
      }

      setAvailableCameras(cameras);
      setSelectedCameraId((prev) =>
        prev && cameras.some((c) => c.deviceId === prev)
          ? prev
          : cameras[0].deviceId,
      );
    } catch {
      toast.error("Unable to access camera. Please check permissions.");
    } finally {
      setIsLoadingCameras(false);
    }
  }, []);

  // Load cameras when the dialog first opens.
  useEffect(() => {
    if (open && availableCameras.length === 0) {
      void loadCameras();
    }
    /// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ------------------------------------------------------------------
  // Step 2 — open selected camera
  // ------------------------------------------------------------------

  const startCamera = async (deviceId: string) => {
    try {
      stopStream();
      setIsCameraReady(false);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: 640, height: 480 },
      });
      streamRef.current = stream;
      setStep("capture");
    } catch {
      toast.error("Unable to open camera. Please check permissions.");
    }
  };

  // Attach stream to <video> once we're in the "capture" step.
  useEffect(() => {
    if (step !== "capture" || !videoRef.current || !streamRef.current) return;

    const video = videoRef.current;
    video.srcObject = streamRef.current;

    const markReady = () => setIsCameraReady(true);
    video.addEventListener("loadedmetadata", markReady);
    void video
      .play()
      .then(markReady)
      .catch(() => undefined);

    return () => {
      video.removeEventListener("loadedmetadata", markReady);
    };
  }, [step]);

  // ------------------------------------------------------------------
  // Step 3 — capture photo
  // ------------------------------------------------------------------

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    if (!isCameraReady || video.videoWidth === 0 || video.videoHeight === 0) {
      toast.error("Camera is still loading. Please wait a moment.");
      return;
    }

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0);

    // Optionally burn a timestamp watermark into the image.
    if (addTimestamp) {
      const now = new Date();
      const label = `Captured: ${now.toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })}`;

      const padding = Math.max(16, Math.round(canvas.width * 0.02));
      const fontSize = Math.max(18, Math.round(canvas.width * 0.028));
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textBaseline = "bottom";
      const metrics = ctx.measureText(label);
      const boxH = fontSize + 14;
      const boxW = Math.ceil(metrics.width) + 20;
      const boxX = padding;
      const boxY = canvas.height - padding - boxH;

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(label, boxX + 10, canvas.height - padding - 8);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", addTimestamp ? 0.9 : 0.8);
    capturedAtRef.current = new Date().toISOString();
    setPhotoPreview(dataUrl);
    stopStream();
    setStep("preview");
  };

  // ------------------------------------------------------------------
  // Retake / Confirm
  // ------------------------------------------------------------------

  const handleRetake = () => {
    setPhotoPreview(null);
    void startCamera(selectedCameraId);
  };

  const handleConfirm = () => {
    if (!photoPreview) return;

    const parsed = parsePhotoDataUrl(photoPreview);
    if (!parsed) {
      toast.error("Failed to process captured photo.");
      return;
    }

    onConfirm({
      base64: parsed.base64,
      mimeType: parsed.mimeType,
      dataUrl: photoPreview,
      capturedAt: capturedAtRef.current,
    });
    onOpenChange(false);
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-[#0d7377]" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {/* ---- Step: Pick camera ---- */}
        {step === "pick" && (
          <div className="space-y-4">
            {isLoadingCameras ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Detecting cameras…
                </span>
              </div>
            ) : availableCameras.length > 0 ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="photo-camera-source">Available Cameras</Label>
                  <select
                    id="photo-camera-source"
                    value={selectedCameraId}
                    onChange={(e) => setSelectedCameraId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {availableCameras.map((camera, index) => (
                      <option key={camera.deviceId} value={camera.deviceId}>
                        {camera.label || `Camera ${index + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void startCamera(selectedCameraId)}
                    disabled={!selectedCameraId}
                  >
                    Open Camera
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Camera className="h-10 w-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">No cameras detected.</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadCameras()}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ---- Step: Live capture ---- */}
        {step === "capture" && (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden bg-black">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={capturePhoto}
                disabled={!isCameraReady}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600"
              >
                <Camera className="h-4 w-4 mr-2" />
                {isCameraReady ? "Capture Photo" : "Loading Camera…"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  stopStream();
                  setStep("pick");
                }}
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ---- Step: Preview & confirm ---- */}
        {step === "preview" && photoPreview && (
          <div className="space-y-3">
            <div className="relative rounded-xl overflow-hidden">
              <img
                src={photoPreview}
                alt="Captured preview"
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
            <p className="text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" />
              Photo captured successfully
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={handleRetake}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retake
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                className="bg-gradient-to-r from-[#0d7377] to-[#14919b]"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Confirm Photo
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
}
