"use client";

import { useEffect, useState } from "react";
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
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import {
  PhotoCaptureDialog,
  type CapturedPhoto,
} from "@/components/photo-capture-dialog";
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
import {
  ENABLE_FINGERPRINT,
  ENABLE_CAMERA,
  HAS_ANY_VERIFICATION_METHOD,
  DEFAULT_CHECKIN_VERIFICATION_METHOD,
} from "@/lib/feature-flags";
import type { VerificationMethod } from "@/lib/verification-methods";
import { navigate } from "@/lib/navigation";
import { useAuth } from "@/lib/auth-context";
import { toastApiError } from "@/lib/api-errors";
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
  Camera,
  ShieldCheck,
  ArrowRight,
  X,
  RefreshCw,
} from "lucide-react";

interface LookupPatient {
  id: string;
  file_number: string;
  full_name: string;
  phone: string;
  date_of_birth: string;
  status: PatientStatus;
  aadhaar_last4?: string;
  address?: string;
  emergency_contact_phone?: string;
  photo?: string;
  fingerprint_template?: string;
  next_followup_date?: string;
}

type VisitStatus = "early" | "on_time" | "missed" | "late" | "none";

const getVisitStatus = (dateStr?: string): VisitStatus => {
  if (!dateStr) return "none";
  const followUp = new Date(dateStr);
  followUp.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (today.getTime() - followUp.getTime()) / (1000 * 3600 * 24);

  if (diffDays < 0) return "early";
  if (diffDays === 0) return "on_time";
  if (diffDays > 0 && diffDays <= 45) return "missed";
  return "late";
};

const getBannerStyle = (status: VisitStatus) => {
  switch (status) {
    case "early":
      return {
        bg: "bg-blue-50 border-blue-100",
        text: "text-blue-700",
        label: "EARLY VISIT",
        badge: "bg-slate-100 text-slate-700",
      };
    case "on_time":
      return {
        bg: "bg-primary/10 border-primary/10",
        text: "text-primary",
        label: "ON TIME VISIT",
        badge: null,
      };
    case "missed":
      return {
        bg: "bg-orange-50 border-orange-100",
        text: "text-orange-700",
        label: "MISSED VISIT",
        badge: "bg-blue-50 text-blue-700",
      };
    case "late":
      return {
        bg: "bg-red-50 border-red-100",
        text: "text-red-700",
        label: "LATE VISIT (>1.5 MONTHS)",
        badge: "bg-red-600 text-white",
      };
    default:
      return {
        bg: "bg-slate-50 border-slate-100",
        text: "text-slate-500",
        label: "LATEST FOLLOW-UP DATE",
        badge: null,
      };
  }
};

const formatPatientNameWithStatus = (name: string, dateStr?: string) => {
  const status = getVisitStatus(dateStr);
  if (status === "early") return `${name} (EARLY)`;
  if (status === "on_time") return `${name} (ON TIME)`;
  if (status === "missed") return `${name} (MISSED)`;
  if (status === "late") return `${name} (LATE)`;
  return name;
};

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
  const [verificationMethod, setVerificationMethod] = useState<VerificationMethod>(
    DEFAULT_CHECKIN_VERIFICATION_METHOD,
  );
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);
  const [checkinPhotoPreview, setCheckinPhotoPreview] = useState("");
  const [checkinPhotoBase64, setCheckinPhotoBase64] = useState("");
  const [checkinPhotoMimeType, setCheckinPhotoMimeType] =
    useState("image/jpeg");
  const [checkinPhotoCapturedAt, setCheckinPhotoCapturedAt] = useState("");
  const [verificationStep, setVerificationStep] = useState<
    "search" | "confirm" | "verify" | "verified"
  >("search");

  const isIdentityVerified =
    verificationMethod === "manual"
      ? true
      : verificationMethod === "fingerprint"
        ? biometricVerified
        : Boolean(checkinPhotoBase64);

  const refreshServiceStatus = async () => {
    const status = await checkRDService();
    setRdService(status);
  };

  // Check RD Service status on mount (only if fingerprint is enabled)
  useEffect(() => {
    if (ENABLE_FINGERPRINT) {
      void refreshServiceStatus();
    }
  }, []);

  const resetPhotoCapture = () => {
    setCheckinPhotoPreview("");
    setCheckinPhotoBase64("");
    setCheckinPhotoCapturedAt("");
    setCheckinPhotoMimeType("image/jpeg");
    setIsPhotoCaptureOpen(false);
  };

  const handleCheckinPhotoCaptured = (photo: CapturedPhoto) => {
    setCheckinPhotoPreview(photo.dataUrl);
    setCheckinPhotoBase64(photo.base64);
    setCheckinPhotoMimeType(photo.mimeType);
    setCheckinPhotoCapturedAt(photo.capturedAt);
    setVerificationStep("verified");
  };

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
            file_number: patient.file_number,
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
        setVerificationMethod(DEFAULT_CHECKIN_VERIFICATION_METHOD);
        resetPhotoCapture();
        setBiometricVerified(false);
        setVerificationStep("search");
      });
  };

  // Select patient and move to confirmation step
  const handleSelectPatient = (patient: LookupPatient) => {
    setSelectedPatient(patient);
    setVerificationMethod(DEFAULT_CHECKIN_VERIFICATION_METHOD);
    resetPhotoCapture();
    setBiometricVerified(false);
    setVerificationStep(
      DEFAULT_CHECKIN_VERIFICATION_METHOD === "manual" ? "verified" : "confirm",
    );
  };

  const handleVerificationMethodChange = (method: VerificationMethod) => {
    setVerificationMethod(method);
    setBiometricVerified(false);
    resetPhotoCapture();
    setVerificationStep(method === "manual" ? "verified" : "confirm");
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
          : verificationMethod === "manual"
            ? {
                patient_id: selectedPatient.id,
                verification_method: "manual" as const,
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
      setVerificationMethod(DEFAULT_CHECKIN_VERIFICATION_METHOD);
      setBiometricVerified(false);
      setVerificationStep("search");
    } catch (error) {
      toastApiError(error, "Check-in failed");
    } finally {
      setIsCheckingIn(false);
    }
  };

  // Cancel and reset
  const handleCancel = () => {
    resetPhotoCapture();
    setSelectedPatient(null);
    setVerificationMethod(DEFAULT_CHECKIN_VERIFICATION_METHOD);
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
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Patient Check-in"
        subtitle="Search patient, verify identity, and complete check-in"
        actions={
          <Button
            onClick={() => navigate("/reception/register")}
            className="bg-gradient-to-r from-primary to-[#14919b] hover:from-[#0a5c5f] hover:to-primary"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Register New Patient
          </Button>
        }
      />

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2">
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            verificationStep === "search"
              ? "bg-primary text-white"
              : "bg-primary/10 text-primary"
          }`}
        >
          <Search className="h-4 w-4" />
          <span>1. Search</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
            verificationStep === "confirm" || verificationStep === "verify"
              ? "bg-primary text-white"
              : verificationStep === "verified"
                ? "bg-primary/10 text-primary"
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
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground"
          }`}
        >
          {verificationMethod === "photo" ? (
            <Camera className="h-4 w-4" />
          ) : verificationMethod === "manual" ? (
            <User className="h-4 w-4" />
          ) : (
            <ShieldCheck className="h-4 w-4" />
          )}
          <span>
            3. {verificationMethod === "manual" ? "Confirm" : "Verify/Capture"}
          </span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Search Section */}
        <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
          <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-[#14919b]/5">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Search Patient
            </CardTitle>
            <CardDescription>
              Search by File Number, Name, Phone, or Aadhaar
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {/* RD Service Status — only when fingerprint is enabled */}
            {ENABLE_FINGERPRINT && rdService && !rdService.available && (
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

            {ENABLE_FINGERPRINT &&
              rdService?.available &&
              rdService.deviceInfo && (
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
                  className="focus-visible:ring-primary"
                />
              </div>
              <Button
                onClick={handleSearch}
                className="bg-primary hover:bg-[#0a5c5f]"
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
                          ? "border-primary bg-primary/5 shadow-md ring-2 ring-primary/20"
                          : "hover:bg-primary/5 hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Photo or Avatar */}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary/20 to-[#14919b]/20 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {patient.photo ? (
                            <img
                              src={patient.photo}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <User className="h-6 w-6 text-primary" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">
                            {formatPatientNameWithStatus(
                              patient.full_name,
                              patient.next_followup_date,
                            )}
                          </p>
                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge
                              variant="outline"
                              className="text-xs font-mono"
                            >
                              {patient.file_number}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {patient.phone}
                            </span>
                          </div>
                        </div>
                        {selectedPatient?.id === patient.id && (
                          <CheckCircle className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                  ))}
                </>
              ) : searchQuery && searchResults.length === 0 ? (
                <EmptyState
                  icon={
                    <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
                      <Search className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  }
                  title="No patients found"
                  description="Try a different search term or register a new patient"
                  action={
                    <Button
                      variant="link"
                      className="text-primary"
                      onClick={() => navigate("/reception/register")}
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Register New Patient
                    </Button>
                  }
                />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary/10 to-[#14919b]/10 flex items-center justify-center mx-auto mb-4">
                    <Search className="h-8 w-8 text-primary/50" />
                  </div>
                  <p>Enter search term to find patient</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Confirmation & Verification Section */}
        <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
          <CardHeader className="border-b bg-gradient-to-r from-primary/5 to-[#14919b]/5">
            <CardTitle className="flex items-center gap-2">
              {isIdentityVerified ? (
                <>
                  <ShieldCheck className="h-5 w-5 text-emerald-500" />
                  Identity Verified
                </>
              ) : (
                <>
                  <Fingerprint className="h-5 w-5 text-primary" />
                  Check-in Confirmation
                </>
              )}
            </CardTitle>
            <CardDescription>
              {isIdentityVerified
                ? "Patient verified. Click to complete check-in."
                : verificationMethod === "photo"
                  ? "Capture verification photo with timestamp to complete check-in"
                  : verificationMethod === "manual"
                    ? "Confirm patient identity visually to complete check-in"
                    : "Verify patient details and confirm with biometric"}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {selectedPatient ? (
              <div className="space-y-6">
                {/* Patient Registration Details Card */}
                <div
                  className={`rounded-2xl border overflow-hidden transition-all bg-[#f8fafc] ${
                    biometricVerified
                      ? "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)]"
                      : "border-primary/20 shadow-sm"
                  }`}
                >
                  {/* Latest Follow-Up Date Banner */}
                  {(() => {
                    const status = getVisitStatus(
                      selectedPatient.next_followup_date,
                    );
                    const style = getBannerStyle(status);

                    let displayDate =
                      selectedPatient.next_followup_date ||
                      "NO PREVIOUS RECORD";
                    if (selectedPatient.next_followup_date) {
                      displayDate = new Date(
                        selectedPatient.next_followup_date,
                      ).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      });
                    }

                    return (
                      <div
                        className={`${style.bg} px-5 py-4 border-b flex items-center justify-between gap-3`}
                      >
                        <div className="flex items-center gap-3">
                          <RefreshCw className={`h-5 w-5 ${style.text}`} />
                          <div>
                            <p
                              className={`text-[10px] font-bold uppercase tracking-[0.15em] mb-0.5 ${style.text} opacity-80`}
                            >
                              {style.label}
                            </p>
                            <p
                              className={`font-extrabold text-lg tracking-tight ${style.text}`}
                            >
                              {displayDate}
                            </p>
                          </div>
                        </div>
                        {style.badge && (
                          <Badge
                            className={`${style.badge} border-0 text-[10px] font-bold tracking-wider shadow-none`}
                          >
                            {style.label}
                          </Badge>
                        )}
                      </div>
                    );
                  })()}

                  {/* Photo & Basic Info Header */}
                  <div className="p-6 flex flex-col sm:flex-row sm:items-center gap-6 border-b border-slate-200/60 bg-white/40">
                    <div className="relative mx-auto sm:mx-0 flex flex-col items-center gap-3">
                      <div className="w-40 h-40 rounded-3xl bg-white shadow-sm flex items-center justify-center overflow-hidden border border-slate-200 relative">
                        {selectedPatient.photo ? (
                          <img
                            src={selectedPatient.photo}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Camera className="h-12 w-12 text-slate-300" />
                        )}
                        {selectedPatient.fingerprint_template && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center ring-2 ring-white">
                            <Fingerprint className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 font-medium">
                        Patient photo
                      </p>
                    </div>

                    <div className="flex-1 text-center sm:text-left">
                      <h3 className="text-2xl font-extrabold text-slate-800 tracking-tight">
                        {formatPatientNameWithStatus(
                          selectedPatient.full_name,
                          selectedPatient.next_followup_date,
                        )}
                      </h3>
                      <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2 mb-3">
                        <Badge className="bg-primary hover:bg-primary text-white font-mono px-3 py-1 rounded-md text-xs border-0">
                          {selectedPatient.file_number}
                        </Badge>
                        {biometricVerified && (
                          <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 px-2 py-1">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            Verified
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-slate-500 leading-relaxed max-w-sm">
                        Confirm patient identity using photo, name, and file
                        number before biometric verification.
                      </p>
                    </div>
                  </div>

                  {/* Registration Details Stack */}
                  <div className="p-6 space-y-3 bg-[#f8fafc]/50">
                    {/* Age / DOB */}
                    <div className="bg-white p-4 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Calendar className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                          Date of Birth / Age
                        </p>
                        <p className="font-bold text-slate-700 text-[15px] mt-0.5">
                          {new Date(
                            selectedPatient.date_of_birth,
                          ).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          ({calculateAge(selectedPatient.date_of_birth)} Years)
                        </p>
                      </div>
                    </div>

                    {/* Mobile Number */}
                    <div className="bg-white p-4 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Phone className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                          Mobile Number
                        </p>
                        <p className="font-bold text-slate-700 text-[15px] mt-0.5">
                          {selectedPatient.phone}
                        </p>
                      </div>
                    </div>

                    {/* Aadhaar Number */}
                    <div className="bg-white p-4 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <CreditCard className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                          Aadhaar Number
                        </p>
                        <p className="font-bold text-slate-700 font-mono text-[15px] mt-0.5">
                          {formatAadhaarDisplay(selectedPatient.aadhaar_last4)}
                        </p>
                      </div>
                    </div>

                    {/* Address */}
                    <div className="bg-white p-4 rounded-xl shadow-[0_2px_10px_rgb(0,0,0,0.02)] border border-slate-100 flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <MapPin className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">
                          Address
                        </p>
                        <p className="font-bold text-slate-700 text-[15px] mt-0.5 line-clamp-2">
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
                    {ENABLE_FINGERPRINT && (
                      <Button
                        type="button"
                        variant={
                          verificationMethod === "fingerprint"
                            ? "default"
                            : "outline"
                        }
                        className={
                          verificationMethod === "fingerprint"
                            ? "bg-primary hover:bg-[#0a5c5f]"
                            : ""
                        }
                        onClick={() =>
                          handleVerificationMethodChange("fingerprint")
                        }
                      >
                        <Fingerprint className="h-4 w-4 mr-2" />
                        Fingerprint
                        {ENABLE_FINGERPRINT && !ENABLE_CAMERA
                          ? ""
                          : " (Recommended)"}
                      </Button>
                    )}
                    {ENABLE_CAMERA && (
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
                    )}
                    {!HAS_ANY_VERIFICATION_METHOD && (
                      <Button
                        type="button"
                        variant="default"
                        className="bg-slate-600 hover:bg-slate-700"
                        disabled
                      >
                        <User className="h-4 w-4 mr-2" />
                        Manual Verification
                      </Button>
                    )}
                  </div>
                </div>

                {/* Verification Section */}
                {verificationMethod === "manual" ? (
                  <div className="text-center space-y-4 py-4">
                    <div className="w-24 h-24 mx-auto rounded-full flex items-center justify-center bg-emerald-100 border-4 border-emerald-500">
                      <CheckCircle className="h-12 w-12 text-emerald-500" />
                    </div>
                    <div>
                      <p className="font-bold text-emerald-600 text-lg">
                        Manual Check-in
                      </p>
                      <p className="text-sm text-muted-foreground">
                        No biometric verification available. Confirm identity
                        visually.
                      </p>
                    </div>
                  </div>
                ) : verificationMethod === "fingerprint" ? (
                  !biometricVerified ? (
                    <div className="text-center space-y-4 py-4">
                      <div
                        className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center transition-all border-4 ${
                          isScanning
                            ? "bg-primary/20 border-primary animate-pulse"
                            : "bg-gradient-to-br from-primary/10 to-[#14919b]/10 border-primary/30"
                        }`}
                      >
                        {isScanning ? (
                          <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        ) : (
                          <Fingerprint className="h-10 w-10 text-primary" />
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
                        className="bg-gradient-to-r from-primary to-[#14919b] hover:from-[#0a5c5f] hover:to-primary"
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
                      {checkinPhotoPreview ? (
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
                              onClick={() => {
                                resetPhotoCapture();
                                setIsPhotoCaptureOpen(true);
                              }}
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
                            onClick={() => setIsPhotoCaptureOpen(true)}
                          >
                            <Camera className="h-4 w-4 mr-2" />
                            Capture Photo
                          </Button>
                        </div>
                      )}
                    </div>
                    <PhotoCaptureDialog
                      open={isPhotoCaptureOpen}
                      onOpenChange={setIsPhotoCaptureOpen}
                      onConfirm={handleCheckinPhotoCaptured}
                      addTimestamp
                      title="Check-In Verification Photo"
                      description="Capture a timestamped photo for check-in verification."
                    />
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
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/10 to-[#14919b]/10 flex items-center justify-center mb-4">
                  <User className="h-12 w-12 text-primary/30" />
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
