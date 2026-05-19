"use client";

import { useEffect, useRef, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  checkinPatient,
  getPatientFingerprintTemplate,
  lookupPatient,
} from "@/lib/hms-api";
import type { PatientStatus } from "@/lib/types";
import {
  captureFingerprint,
  checkRDService,
  type RDServiceInfo,
  verifyFingerprint,
} from "@/lib/biometric";
import { navigate } from "@/lib/navigation";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import {
  Fingerprint,
  Search,
  AlertCircle,
  CheckCircle,
  Loader2,
  UserPlus,
  User,
  Phone,
  MapPin,
  Calendar,
  CreditCard,
  Users,
  Camera,
  ShieldCheck,
  ArrowRight,
  X,
  RefreshCw,
} from "lucide-react";

interface LookupPatient {
  id: string;
  registration_number: string;
  full_name: string;
  phone: string;
  date_of_birth: string;
  status: PatientStatus;
  aadhaar_last4?: string;
  address?: string;
  emergency_contact_phone?: string;
  relative_phone?: string;
  photo?: string;
  fingerprint_template?: string;
  next_followup_date?: string;
}

export default function CheckinPage() {
  const { accessToken } = useAuth();
  const [rdService, setRdService] = useState<RDServiceInfo | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LookupPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<LookupPatient | null>(
    null,
  );
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [biometricVerified, setBiometricVerified] = useState(false);
  const [verificationMethod, setVerificationMethod] = useState<
    "fingerprint" | "photo"
  >("fingerprint");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isCameraPickerOpen, setIsCameraPickerOpen] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>(
    [],
  );
  const [selectedCameraId, setSelectedCameraId] = useState("");
  const [isLoadingCameras, setIsLoadingCameras] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [checkinPhotoPreview, setCheckinPhotoPreview] = useState("");
  const [checkinPhotoBase64, setCheckinPhotoBase64] = useState("");
  const [checkinPhotoMimeType, setCheckinPhotoMimeType] =
    useState("image/jpeg");
  const [checkinPhotoCapturedAt, setCheckinPhotoCapturedAt] = useState("");
  const [verificationStep, setVerificationStep] = useState<
    "search" | "confirm" | "verify" | "verified"
  >("search");
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const isIdentityVerified =
    verificationMethod === "fingerprint"
      ? biometricVerified
      : Boolean(checkinPhotoBase64);

  const refreshServiceStatus = async () => {
    const status = await checkRDService();
    setRdService(status);
  };

  // Check RD Service status on mount
  useEffect(() => {
    void refreshServiceStatus();
  }, []);

  const stopCamera = () => {
    setIsCameraReady(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraOpen(false);
  };

  const resetPhotoCapture = () => {
    setCheckinPhotoPreview("");
    setCheckinPhotoBase64("");
    setCheckinPhotoCapturedAt("");
    setCheckinPhotoMimeType("image/jpeg");
    setIsCameraPickerOpen(false);
    stopCamera();
  };

  const openCameraPicker = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera is not supported in this browser.");
      return;
    }

    setIsLoadingCameras(true);
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({
        video: true,
      });
      tempStream.getTracks().forEach((track) => track.stop());

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((d) => d.kind === "videoinput");

      if (cameras.length === 0) {
        toast.error("No camera devices detected.");
        return;
      }

      setAvailableCameras(cameras);
      setSelectedCameraId((prev) => {
        if (prev && cameras.some((camera) => camera.deviceId === prev)) {
          return prev;
        }
        return cameras[0].deviceId;
      });
      setIsCameraPickerOpen(true);
    } catch {
      toast.error("Unable to access camera. Please check permissions.");
    } finally {
      setIsLoadingCameras(false);
    }
  };

  const startCamera = async (deviceId?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Camera is not supported in this browser.");
      return;
    }

    try {
      stopCamera();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId
          ? { deviceId: { exact: deviceId }, width: 1280, height: 720 }
          : { facingMode: "user", width: 1280, height: 720 },
      });
      streamRef.current = stream;
      setIsCameraOpen(true);
      setIsCameraPickerOpen(false);
      setIsCameraReady(false);
      setVerificationStep("verify");
    } catch {
      toast.error("Unable to access camera. Please check permissions.");
    }
  };

  const captureVerificationPhoto = () => {
    if (!videoRef.current || !canvasRef.current || !isCameraReady) {
      toast.error("Camera is still loading. Please wait.");
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      toast.error("Could not process captured photo.");
      return;
    }

    const capturedAt = new Date();
    const timestampLabel = capturedAt.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const padding = Math.max(16, Math.round(canvas.width * 0.02));
    const fontSize = Math.max(18, Math.round(canvas.width * 0.028));
    ctx.font = `700 ${fontSize}px sans-serif`;
    ctx.textBaseline = "bottom";
    const text = `Captured: ${timestampLabel}`;
    const textMetrics = ctx.measureText(text);
    const boxHeight = fontSize + 14;
    const boxWidth = Math.ceil(textMetrics.width) + 20;
    const boxX = padding;
    const boxY = canvas.height - padding - boxHeight;

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(boxX, boxY, boxWidth, boxHeight);
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, boxX + 10, canvas.height - padding - 8);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
    const parsed = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!parsed) {
      toast.error("Failed to prepare captured photo.");
      return;
    }

    setCheckinPhotoPreview(dataUrl);
    setCheckinPhotoMimeType(parsed[1]);
    setCheckinPhotoBase64(parsed[2]);
    setCheckinPhotoCapturedAt(capturedAt.toISOString());
    setVerificationStep("verified");
    stopCamera();
    toast.success("Photo captured with timestamp.");
  };

  useEffect(() => {
    if (!isCameraOpen || !videoRef.current || !streamRef.current) {
      return;
    }

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
  }, [isCameraOpen]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Search patients
  const handleSearch = () => {
    if (!accessToken) {
      toast.error("Please sign in again.");
      return;
    }
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    lookupPatient(accessToken, { q: searchQuery.trim() })
      .then((result) => {
        const mapped: LookupPatient[] = (result.items || []).map((patient) => {
          const photoUrl =
            typeof patient.photo_url === "string"
              ? patient.photo_url
              : typeof patient.photo === "string"
                ? patient.photo
                : undefined;

          return {
            id: patient.patient_id,
            registration_number: patient.registration_number,
            full_name: patient.full_name,
            phone: patient.phone_number,
            date_of_birth: patient.date_of_birth,
            status: patient.status,
            aadhaar_last4:
              typeof patient.aadhaar_number_last4 === "string"
                ? patient.aadhaar_number_last4
                : undefined,
            address:
              typeof patient.address_line1 === "string"
                ? patient.address_line1
                : undefined,
            emergency_contact_phone:
              typeof patient.emergency_contact_phone === "string"
                ? patient.emergency_contact_phone
                : undefined,
            relative_phone:
              typeof patient.relative_phone === "string"
                ? patient.relative_phone
                : undefined,
            photo: photoUrl,
            next_followup_date:
              typeof patient.next_followup_date === "string"
                ? patient.next_followup_date
                : undefined,
          };
        });
        setSearchResults(mapped);
      })
      .catch((error) => {
        setSearchResults([]);
        toast.error(
          error instanceof Error ? error.message : "Patient not found",
        );
      })
      .finally(() => {
        setSelectedPatient(null);
        setVerificationMethod("fingerprint");
        resetPhotoCapture();
        setBiometricVerified(false);
        setVerificationStep("search");
      });
  };

  // Select patient and move to confirmation step
  const handleSelectPatient = (patient: LookupPatient) => {
    setSelectedPatient(patient);
    setVerificationMethod("fingerprint");
    resetPhotoCapture();
    setBiometricVerified(false);
    setVerificationStep("confirm");
  };

  const handleVerificationMethodChange = (method: "fingerprint" | "photo") => {
    setVerificationMethod(method);
    setBiometricVerified(false);
    resetPhotoCapture();
    setVerificationStep("confirm");
  };

  // Fingerprint verification
  const handleFingerprintVerification = async () => {
    if (!selectedPatient || verificationMethod !== "fingerprint") return;

    setIsScanning(true);
    setVerificationStep("verify");

    const storedTemplate = await getPatientFingerprintTemplate(
      selectedPatient.id,
    ).catch((error) => {
      toast.error(
        error instanceof Error
          ? error.message
          : "Stored fingerprint is unavailable",
      );
      return null;
    });

    if (!storedTemplate) {
      setVerificationStep("confirm");
      setIsScanning(false);
      return;
    }

    const result = await captureFingerprint();

    if (result.success) {
      const matched = await verifyFingerprint(
        result.data || "",
        storedTemplate.fingerprint_template,
      );

      if (matched) {
        setBiometricVerified(true);
        setVerificationStep("verified");
        toast.success("Fingerprint verified successfully!");
      } else {
        toast.error("Fingerprint does not match the selected patient.");
        setVerificationStep("confirm");
      }
    } else {
      toast.error(result.error || "Fingerprint verification failed");
      setVerificationStep("confirm");
    }

    void refreshServiceStatus();
    setIsScanning(false);
  };

  // Check in patient - only after verification
  const handleCheckin = async () => {
    if (!selectedPatient || !accessToken || !isIdentityVerified) return;

    if (selectedPatient.status === "dead") {
      toast.error(
        "This patient is marked as deceased and cannot be checked in.",
      );
      return;
    }

    setIsCheckingIn(true);

    try {
      const payload =
        verificationMethod === "photo"
          ? {
              patient_id: selectedPatient.id,
              verification_method: "photo" as const,
              verification_photo_base64: checkinPhotoBase64,
              verification_photo_mime_type: checkinPhotoMimeType,
              verification_photo_captured_at: checkinPhotoCapturedAt,
            }
          : {
              patient_id: selectedPatient.id,
              verification_method: "fingerprint" as const,
            };

      await checkinPatient(accessToken, payload);
      toast.success(
        `${selectedPatient.full_name} check-in completed successfully!`,
      );

      resetPhotoCapture();
      setSelectedPatient(null);
      setSearchQuery("");
      setSearchResults([]);
      setVerificationMethod("fingerprint");
      setBiometricVerified(false);
      setVerificationStep("search");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Check-in failed");
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Cancel and reset
  const handleCancel = () => {
    resetPhotoCapture();
    setSelectedPatient(null);
    setVerificationMethod("fingerprint");
    setBiometricVerified(false);
    setVerificationStep("search");
  };

  // Format Aadhaar for display
  const formatAadhaarDisplay = (aadhaarLast4: string | undefined) => {
    if (!aadhaarLast4) return "Not provided";
    const masked = "XXXX XXXX " + aadhaarLast4.slice(-4);
    return masked;
  };

  // Calculate age from DOB
  const calculateAge = (dob: string) => {
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-[#0d7377] to-[#14919b] bg-clip-text text-transparent">
            Patient Check-in
          </h1>
          <p className="text-muted-foreground">
            Search patient, verify identity, and complete check-in
          </p>
        </div>
        <Button
          onClick={() => navigate("/reception/register")}
          className="bg-gradient-to-r from-[#0d7377] to-[#14919b] hover:from-[#0a5c5f] hover:to-[#0d7377]"
        >
          <UserPlus className="h-4 w-4 mr-2" />
          Register New Patient
        </Button>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            verificationStep === "search"
              ? "bg-[#0d7377] text-white"
              : "bg-[#0d7377]/10 text-[#0d7377]"
          }`}
        >
          <Search className="h-4 w-4" />
          <span>1. Search</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            verificationStep === "confirm" || verificationStep === "verify"
              ? "bg-[#0d7377] text-white"
              : verificationStep === "verified"
                ? "bg-[#0d7377]/10 text-[#0d7377]"
                : "bg-muted text-muted-foreground"
          }`}
        >
          <User className="h-4 w-4" />
          <span>2. Confirm</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            verificationStep === "verified"
              ? "bg-emerald-500 text-white"
              : verificationStep === "verify"
                ? "bg-[#0d7377] text-white"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {verificationMethod === "photo" ? (
            <Camera className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          <span>3. Verify/Capture</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Search Section */}
        <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
          <CardHeader className="border-b bg-gradient-to-r from-[#0d7377]/5 to-[#14919b]/5">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-[#0d7377]" />
              Search Patient
            </CardTitle>
            <CardDescription>
              Search by File Number, Name, Phone, or Aadhaar
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {/* RD Service Status */}
            {rdService && !rdService.available && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  {rdService.error ||
                    "Fingerprint scanner not detected. Connect scanner to continue."}
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span>{rdService.endpoint}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void refreshServiceStatus()}
                      className="h-7 px-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {rdService?.available && rdService.deviceInfo && (
              <Alert className="border-emerald-200 bg-emerald-50">
                <CheckCircle className="h-4 w-4 text-emerald-600" />
                <AlertDescription className="text-emerald-800">
                  {rdService.deviceInfo.name} connected via{" "}
                  {rdService.secure ? "secure" : "non-secure"} SDK
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span>{rdService.endpoint}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => void refreshServiceStatus()}
                      className="h-7 px-2"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Search Input */}
            <div className="flex gap-2">
              <div className="flex-1">
                <Label htmlFor="search" className="sr-only">
                  Search
                </Label>
                <Input
                  id="search"
                  placeholder="Enter File No., Name, Phone, or Aadhaar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="focus-visible:ring-[#0d7377]"
                />
              </div>
              <Button
                onClick={handleSearch}
                className="bg-[#0d7377] hover:bg-[#0a5c5f]"
              >
                <Search className="h-4 w-4 mr-2" />
                Search
              </Button>
            </div>

            {/* Search Results */}
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {searchResults.length > 0 ? (
                <>
                  <p className="text-sm text-muted-foreground mb-3">
                    Found {searchResults.length} patient(s)
                  </p>
                  {searchResults.map((patient) => (
                    <div
                      key={patient.id}
                      onClick={() => handleSelectPatient(patient)}
                      className={`p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedPatient?.id === patient.id
                          ? "border-[#0d7377] bg-[#0d7377]/5 shadow-md ring-2 ring-[#0d7377]/20"
                          : "hover:bg-[#0d7377]/5 hover:border-[#0d7377]/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Photo or Avatar */}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#0d7377]/20 to-[#14919b]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {patient.photo ? (
                            <img
                              src={patient.photo}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="h-6 w-6 text-[#0d7377]" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">
                            {patient.full_name}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge
                              variant="outline"
                              className="text-xs font-mono"
                            >
                              {patient.registration_number}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {patient.phone}
                            </span>
                          </div>
                        </div>
                        {selectedPatient?.id === patient.id && (
                          <CheckCircle className="h-5 w-5 text-[#0d7377]" />
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : searchQuery && searchResults.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-muted-foreground/50" />
                  </div>
                  <p className="font-medium">No patients found</p>
                  <p className="text-sm mt-1">
                    Try a different search term or register a new patient
                  </p>
                  <Button
                    variant="link"
                    className="mt-3 text-[#0d7377]"
                    onClick={() => navigate("/reception/register")}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Register New Patient
                  </Button>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-[#0d7377]/50" />
                  </div>
                  <p>Enter search term to find patient</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confirmation & Verification Section */}
        <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
          <CardHeader className="border-b bg-gradient-to-r from-[#0d7377]/5 to-[#14919b]/5">
            <CardTitle className="flex items-center gap-2">
              {isIdentityVerified ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  Identity Verified
                </>
              ) : (
                <>
                  <Fingerprint className="h-5 w-5 text-[#0d7377]" />
                  Check-in Confirmation
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isIdentityVerified
                ? "Patient verified. Click to complete check-in."
                : verificationMethod === "photo"
                  ? "Capture verification photo with timestamp to complete check-in"
                  : "Verify patient details and confirm with biometric"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {selectedPatient ? (
              <div className="space-y-6">
                {/* Patient Registration Details Card */}
                <div
                  className={`rounded-xl border-2 overflow-hidden transition-all ${
                    biometricVerified
                      ? "border-emerald-500 bg-emerald-50/50"
                      : "border-[#0d7377]/30 bg-gradient-to-br from-[#0d7377]/5 to-[#14919b]/5"
                  }`}
                >
                  {/* Photo & Basic Info Header */}
                  <div className="p-5 md:p-6 flex flex-col sm:flex-row sm:items-start gap-6 border-b border-dashed">
                    <div className="relative mx-auto sm:mx-0">
                      <div className="w-40 h-40 md:w-48 md:h-48 rounded-2xl bg-white shadow-md flex items-center justify-center overflow-hidden border-2 border-white">
                        {selectedPatient.photo ? (
                          <img
                            src={selectedPatient.photo}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="h-12 w-12 text-muted-foreground/30" />
                        )}
                      </div>
                      {selectedPatient.fingerprint_template && (
                        <div className="absolute -bottom-2 -right-2 w-7 h-7 rounded-full bg-[#0d7377] flex items-center justify-center ring-2 ring-white">
                          <Fingerprint className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <p className="mt-2 text-xs text-center text-muted-foreground">
                        Patient photo
                      </p>
                    </div>
                    <div className="flex-1 w-full">
                      <h3 className="text-xl font-bold text-foreground">
                        {selectedPatient.full_name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-2">
                        <Badge className="bg-[#0d7377] text-white font-mono">
                          {selectedPatient.registration_number}
                        </Badge>
                        {biometricVerified && (
                          <Badge className="bg-emerald-500 text-white">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-3">
                        Confirm patient identity using photo, name, and file
                        number before biometric verification.
                      </p>
                    </div>
                  </div>

                  {/* Registration Details Grid */}
                  <div className="p-4 grid gap-3">
                    {/* Aadhaar */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                      <div className="w-8 h-8 rounded-full bg-[#0d7377]/10 flex items-center justify-center">
                        <CreditCard className="h-4 w-4 text-[#0d7377]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Aadhaar Number
                        </p>
                        <p className="font-mono font-medium">
                          {formatAadhaarDisplay(selectedPatient.aadhaar_last4)}
                        </p>
                      </div>
                    </div>

                    {/* DOB & Age */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                      <div className="w-8 h-8 rounded-full bg-[#0d7377]/10 flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-[#0d7377]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Date of Birth
                        </p>
                        <p className="font-medium">
                          {new Date(
                            selectedPatient.date_of_birth,
                          ).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          <span className="text-muted-foreground ml-2">
                            ({calculateAge(selectedPatient.date_of_birth)}{" "}
                            years)
                          </span>
                        </p>
                      </div>
                    </div>

                    {/* Mobile */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                      <div className="w-8 h-8 rounded-full bg-[#0d7377]/10 flex items-center justify-center">
                        <Phone className="h-4 w-4 text-[#0d7377]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Mobile Number
                        </p>
                        <p className="font-medium">{selectedPatient.phone}</p>
                      </div>
                    </div>

                    {/* Relative Mobile */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                      <div className="w-8 h-8 rounded-full bg-[#0d7377]/10 flex items-center justify-center">
                        <Users className="h-4 w-4 text-[#0d7377]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">
                          Relative Mobile
                        </p>
                        <p className="font-medium">
                          {selectedPatient.emergency_contact_phone ||
                            selectedPatient.relative_phone ||
                            "Not provided"}
                        </p>
                      </div>
                    </div>

                    {/* Address */}
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-white/50">
                      <div className="w-8 h-8 rounded-full bg-[#0d7377]/10 flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-[#0d7377]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs text-muted-foreground">Address</p>
                        <p className="font-medium text-sm">
                          {selectedPatient.address || "Not provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Verification Method */}
                <div className="space-y-3">
                  <p className="text-sm font-medium text-muted-foreground">
                    Verification Method
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={
                        verificationMethod === "fingerprint"
                          ? "default"
                          : "outline"
                      }
                      className={
                        verificationMethod === "fingerprint"
                          ? "bg-[#0d7377] hover:bg-[#0a5c5f]"
                          : ""
                      }
                      onClick={() =>
                        handleVerificationMethodChange("fingerprint")
                      }
                    >
                      <Fingerprint className="h-4 w-4 mr-2" />
                      Fingerprint (Recommended)
                    </Button>
                    <Button
                      type="button"
                      variant={
                        verificationMethod === "photo" ? "default" : "outline"
                      }
                      className={
                        verificationMethod === "photo"
                          ? "bg-[#14919b] hover:bg-[#0f6f77]"
                          : ""
                      }
                      onClick={() => handleVerificationMethodChange("photo")}
                    >
                      <Camera className="h-4 w-4 mr-2" />
                      Photo with Timestamp
                    </Button>
                  </div>
                </div>

                {/* Verification Section */}
                {verificationMethod === "fingerprint" ? (
                  !biometricVerified ? (
                    <div className="text-center space-y-4 py-4">
                      <div
                        className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all border-4 ${
                          isScanning
                            ? "bg-[#0d7377]/20 border-[#0d7377] animate-pulse"
                            : "bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 border-[#0d7377]/30"
                        }`}
                      >
                        {isScanning ? (
                          <Loader2 className="h-10 w-10 text-[#0d7377] animate-spin" />
                        ) : (
                          <Fingerprint className="h-10 w-10 text-[#0d7377]" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">
                          Biometric Verification Required
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Place finger on scanner to verify identity
                        </p>
                      </div>
                      <Button
                        size="lg"
                        onClick={handleFingerprintVerification}
                        disabled={isScanning || rdService?.available === false}
                        className="bg-gradient-to-r from-[#0d7377] to-[#14919b] hover:from-[#0a5c5f] hover:to-[#0d7377]"
                      >
                        {isScanning ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Verifying...
                          </>
                        ) : (
                          <>
                            <Fingerprint className="h-4 w-4 mr-2" />
                            Verify Fingerprint
                          </>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="text-center space-y-4 py-4">
                      <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center bg-emerald-100 border-4 border-emerald-500">
                        <ShieldCheck className="h-12 w-12 text-emerald-500" />
                      </div>
                      <div>
                        <p className="font-bold text-emerald-600 text-lg">
                          Identity Verified
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Fingerprint matched successfully
                        </p>
                      </div>
                    </div>
                  )
                ) : (
                  <div className="space-y-4 py-2">
                    <div className="rounded-xl border bg-white/70 p-3">
                      {isCameraOpen ? (
                        <div className="space-y-3">
                          <div className="rounded-lg overflow-hidden bg-black">
                            <video
                              ref={videoRef}
                              className="w-full max-h-[300px] object-cover"
                              autoPlay
                              playsInline
                              muted
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              className="flex-1 bg-[#14919b] hover:bg-[#0f6f77]"
                              onClick={captureVerificationPhoto}
                              disabled={!isCameraReady}
                            >
                              <Camera className="h-4 w-4 mr-2" />
                              Capture Photo
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={stopCamera}
                            >
                              Close Camera
                            </Button>
                          </div>
                        </div>
                      ) : checkinPhotoPreview ? (
                        <div className="space-y-3">
                          <img
                            src={checkinPhotoPreview}
                            alt="Captured verification"
                            className="w-full rounded-lg border max-h-[320px] object-cover"
                          />
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => void openCameraPicker()}
                              disabled={isLoadingCameras}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Retake Photo
                            </Button>
                            <Badge className="bg-emerald-500 text-white">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Photo Captured
                            </Badge>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6 space-y-3">
                          <div className="w-20 h-20 mx-auto rounded-full bg-[#14919b]/10 flex items-center justify-center">
                            <Camera className="h-10 w-10 text-[#14919b]" />
                          </div>
                          <p className="font-medium">
                            Capture patient photo for check-in verification
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Timestamp will be embedded on the photo before
                            upload.
                          </p>
                          <Button
                            type="button"
                            className="bg-[#14919b] hover:bg-[#0f6f77]"
                            onClick={() => void openCameraPicker()}
                            disabled={isLoadingCameras}
                          >
                            {isLoadingCameras ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Camera className="h-4 w-4 mr-2" />
                            )}
                            Select Camera
                          </Button>
                        </div>
                      )}
                    </div>
                    <Dialog
                      open={isCameraPickerOpen}
                      onOpenChange={setIsCameraPickerOpen}
                    >
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Select Camera Source</DialogTitle>
                          <DialogDescription>
                            Choose which connected camera to use for check-in
                            photo capture.
                          </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-2">
                          <Label htmlFor="checkin-camera-source">
                            Available Cameras
                          </Label>
                          <select
                            id="checkin-camera-source"
                            value={selectedCameraId}
                            onChange={(e) =>
                              setSelectedCameraId(e.target.value)
                            }
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          >
                            {availableCameras.map((camera, index) => (
                              <option
                                key={camera.deviceId}
                                value={camera.deviceId}
                              >
                                {camera.label || `Camera ${index + 1}`}
                              </option>
                            ))}
                          </select>
                        </div>

                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsCameraPickerOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void startCamera(selectedCameraId)}
                            disabled={!selectedCameraId}
                          >
                            Open Selected Camera
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleCancel}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                  <Button
                    className={`flex-1 ${
                      isIdentityVerified
                        ? "bg-emerald-500 hover:bg-emerald-600"
                        : "bg-muted text-muted-foreground cursor-not-allowed"
                    }`}
                    onClick={handleCheckin}
                    disabled={!isIdentityVerified || isCheckingIn}
                  >
                    {isCheckingIn ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Completing Check-in...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {isIdentityVerified
                          ? "Complete Check-in"
                          : verificationMethod === "photo"
                            ? "Capture Photo First"
                            : "Verify First"}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 flex items-center justify-center mb-4">
                  <User className="h-12 w-12 text-[#0d7377]/30" />
                </div>
                <p className="font-medium text-muted-foreground">
                  No Patient Selected
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Search and select a patient to begin check-in
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
