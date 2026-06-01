"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  PhotoCaptureDialog,
  type CapturedPhoto,
} from "@/components/photo-capture-dialog";
// File numbers are entered by the receptionist (e.g. "A1", "A2", ...) and
// validated for uniqueness server-side. There is no auto-generation.
const FILE_NUMBER_REGEX = /^[A-Za-z0-9-]+$/;
import {
  captureFingerprint,
  checkRDService,
  type RDServiceInfo,
} from "@/lib/biometric";
import {
  ENABLE_FINGERPRINT,
  ENABLE_CAMERA,
  FINGERPRINT_REQUIRED,
  CAMERA_REQUIRED,
} from "@/lib/feature-flags";
import { getIndiaCitiesByStateName, getIndiaStates } from "@/lib/address-data";
import type { Gender, PatientCategory } from "@/lib/types";
import { registerPatientTier1 } from "@/lib/hms-api";
import { useAuth } from "@/lib/auth-context";
import { isApiError } from "@/lib/api-client";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import { FieldError } from "@/components/ui/field-error";
import { toast } from "sonner";
import {
  User,
  Users,
  Phone,
  Fingerprint,
  Loader2,
  Save,
  Zap,
  FileText,
  CheckCircle,
  Info,
  Camera,
  MapPin,
  Calendar,
  Hash,
  X,
  RefreshCw,
  CreditCard,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { navigate } from "@/lib/navigation";
import { SearchableSelect } from "@/components/ui/searchable-select";

export default function RegisterPatientPage() {
  const apiErrors = useApiErrors();
  const { accessToken } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingFingerprint, setIsCapturingFingerprint] = useState(false);
  const [fingerprintCaptured, setFingerprintCaptured] = useState(false);
  const [fingerprintService, setFingerprintService] =
    useState<RDServiceInfo | null>(null);
  const [isCheckingFingerprintService, setIsCheckingFingerprintService] =
    useState(false);
  const [registrationComplete, setRegistrationComplete] = useState(false);
  const [newRegistrationNumber, setNewRegistrationNumber] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isPhotoCaptureOpen, setIsPhotoCaptureOpen] = useState(false);

  // Instant registration form data
  const [instantFormData, setInstantFormData] = useState({
    patient_category: "" as PatientCategory | "",
    full_name: "",
    file_number: "",
    aadhaar_number: "",
    date_of_birth: "",
    sex: "" as Gender | "",
    phone: "",
    relative_phone: "",
    address: "",
    city: "",
    district: "",
    state: "",
    pincode: "",
    fingerprint_template: "",
    photo: "",
  });

  const stateOptions = useMemo(() => getIndiaStates(), []);
  const cityOptions = useMemo(
    () => getIndiaCitiesByStateName(instantFormData.state),
    [instantFormData.state],
  );

  const refreshFingerprintService = async () => {
    setIsCheckingFingerprintService(true);
    try {
      const status = await checkRDService();
      setFingerprintService(status);
    } finally {
      setIsCheckingFingerprintService(false);
    }
  };

  useEffect(() => {
    if (ENABLE_FINGERPRINT) {
      void refreshFingerprintService();
    }
  }, []);

  const handleInstantChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setInstantFormData({ ...instantFormData, [e.target.name]: e.target.value });
  };

  // Check Aadhaar uniqueness — placeholder, real check is server-side.
  const isAadhaarUnique = (_aadhaar: string): boolean => {
    return true;
  };

  // Format Aadhaar number with spaces (XXXX XXXX XXXX)
  const formatAadhaar = (value: string): string => {
    const digits = value.replace(/\D/g, "").slice(0, 12);
    const parts = [];
    for (let i = 0; i < digits.length; i += 4) {
      parts.push(digits.slice(i, i + 4));
    }
    return parts.join(" ");
  };

  const handleAadhaarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatAadhaar(e.target.value);
    setInstantFormData({ ...instantFormData, aadhaar_number: formatted });
  };

  const handleAddressStateChange = (stateName: string) => {
    setInstantFormData((prev) => ({
      ...prev,
      state: stateName,
      city: "",
    }));
  };

  const handleCaptureFingerprint = async () => {
    setIsCapturingFingerprint(true);
    const latestServiceStatus = await checkRDService();
    setFingerprintService(latestServiceStatus);

    if (!latestServiceStatus.available) {
      toast.error(
        latestServiceStatus.error ||
          "Fingerprint service is unavailable on this machine.",
      );
      setIsCapturingFingerprint(false);
      return;
    }

    const result = await captureFingerprint();

    if (result.success && result.data) {
      setInstantFormData({
        ...instantFormData,
        fingerprint_template: result.data,
      });
      setFingerprintCaptured(true);
      toast.success("Fingerprint captured successfully!");
    } else {
      toast.error(result.error || "Failed to capture fingerprint");
    }

    setIsCapturingFingerprint(false);
  };

  const handlePhotoCaptured = (photo: CapturedPhoto) => {
    setPhotoPreview(photo.dataUrl);
    setInstantFormData((prev) => ({ ...prev, photo: photo.dataUrl }));
  };

  const removePhoto = () => {
    setPhotoPreview(null);
    setInstantFormData((prev) => ({ ...prev, photo: "" }));
  };

  const handleInstantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    apiErrors.clear();

    // Validation
    if (!instantFormData.patient_category) {
      toast.error(
        "Please select patient category (Psychiatric or De-Addiction)",
      );
      return;
    }

    if (
      !instantFormData.full_name ||
      !instantFormData.phone ||
      !instantFormData.date_of_birth ||
      !instantFormData.sex
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    // if (!instantFormData.relative_phone) {
    //   toast.error("Relative mobile number is required");
    //   return;
    // }

    if (!instantFormData.address) {
      toast.error("Address is required");
      return;
    }

    // File number is required and must match the server-side regex; the
    // backend additionally enforces uniqueness and returns 409 + the most
    // recently used file_number on collision.
    const fileNumber = instantFormData.file_number.trim();
    if (!fileNumber) {
      toast.error("File number is required.");
      return;
    }
    if (!FILE_NUMBER_REGEX.test(fileNumber)) {
      toast.error("File number may only contain letters, digits and hyphens.");
      return;
    }

    // Validate Aadhaar format (12 digits)
    const aadhaarDigits = instantFormData.aadhaar_number.replace(/\s/g, "");
    if (instantFormData.aadhaar_number && aadhaarDigits.length !== 12) {
      toast.error("Aadhaar number must be 12 digits");
      return;
    }

    // Check Aadhaar uniqueness
    if (aadhaarDigits && !isAadhaarUnique(aadhaarDigits)) {
      toast.error(
        "This Aadhaar number is already registered with another patient.",
      );
      return;
    }

    if (FINGERPRINT_REQUIRED && !instantFormData.fingerprint_template) {
      toast.error("Fingerprint scan is required before registration.");
      return;
    }

    if (CAMERA_REQUIRED && !instantFormData.photo) {
      toast.error("Patient photo is required before registration.");
      return;
    }

    const photoMatch = instantFormData.photo
      ? instantFormData.photo.match(/^data:([^;]+);base64,(.+)$/)
      : null;
    const parsedPhoto = photoMatch
      ? { mimeType: photoMatch[1], base64: photoMatch[2] }
      : null;

    setIsSubmitting(true);

    if (!accessToken) {
      toast.error("Please sign in again.");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await registerPatientTier1(accessToken, {
        patient_category: instantFormData.patient_category,
        file_number: instantFormData.file_number,
        full_name: instantFormData.full_name,
        phone_number: instantFormData.phone,
        date_of_birth: instantFormData.date_of_birth,
        sex: instantFormData.sex,
        fingerprint_template: instantFormData.fingerprint_template || undefined,
        aadhaar_number: aadhaarDigits || undefined,
        relative_phone: instantFormData.relative_phone,
        address_line1: instantFormData.address,
        city: instantFormData.city || undefined,
        district: instantFormData.district || undefined,
        state: instantFormData.state || undefined,
        pincode: instantFormData.pincode || undefined,
        photo_base64: parsedPhoto?.base64,
        photo_mime_type: parsedPhoto?.mimeType,
      });

      setNewRegistrationNumber(result.file_number);
      setRegistrationComplete(true);
      toast.success(
        `Patient registered successfully! File No: ${result.file_number}`,
      );
    } catch (error) {
      apiErrors.setFromError(error);
      if (isApiError(error) && error.status === 409) {
        const hint =
          (error.payload?.last_file_number as string | undefined) ?? undefined;
        toast.error(
          // hint
          //   ? `File number "${fileNumber}" is already in use. Most recent file number is "${hint}".`
          //   : `File number "${fileNumber}" is already in use. Please choose another.`,
          error.payload?.message,
        );
      } else {
        toastApiError(error, "Registration failed");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewRegistration = () => {
    setInstantFormData({
      patient_category: "",
      full_name: "",
      file_number: "",
      aadhaar_number: "",
      date_of_birth: "",
      sex: "",
      phone: "",
      relative_phone: "",
      address: "",
      city: "",
      district: "",
      state: "",
      pincode: "",
      fingerprint_template: "",
      photo: "",
    });
    setPhotoPreview(null);
    setFingerprintCaptured(false);
    setRegistrationComplete(false);
    setNewRegistrationNumber("");
  };

  if (registrationComplete) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <PageHeader
          title="Registration Complete"
          subtitle="Patient has been registered successfully"
        />

        <Card className="max-w-lg mx-auto border-0 shadow-xl">
          <CardContent className="pt-8 pb-8">
            <div className="text-center space-y-6">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle className="h-10 w-10 text-white" />
              </div>

              <div>
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  Registration Successful!
                </h2>
                <p className="text-muted-foreground">
                  The patient has been added to the system
                </p>
              </div>

              <div className="bg-gradient-to-r from-teal-50 to-emerald-50 dark:from-teal-900/20 dark:to-emerald-900/20 rounded-xl p-6 border border-teal-200 dark:border-teal-800">
                <p className="text-sm text-muted-foreground mb-1">
                  File Number
                </p>
                <p className="text-3xl font-bold text-teal-700 dark:text-teal-400">
                  {newRegistrationNumber}
                </p>
              </div>

              <Alert className="text-left bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-700 dark:text-blue-300">
                  Mandatory registration details are now saved immediately.
                  Additional general profile data (addiction type, medical
                  history, allergies, etc.) from the{" "}
                  <strong>Patient Data</strong> section.
                </AlertDescription>
              </Alert>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  onClick={handleNewRegistration}
                  className="flex-1 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700"
                >
                  <User className="h-4 w-4 mr-2" />
                  Register Another Patient
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => navigate("/reception/patients")}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Go to Patient Data
                </Button>
              </div>

              <Button
                variant="ghost"
                className="w-full"
                onClick={() => navigate("/reception/checkin")}
              >
                <Fingerprint className="h-4 w-4 mr-2" />
                Go to Check-in
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title="Register New Patient"
        subtitle="Quick registration for new patients"
      />

      <Tabs defaultValue="instant" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2 mx-auto">
          <TabsTrigger value="instant" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Instant Registration
          </TabsTrigger>
          <TabsTrigger value="info" className="flex items-center gap-2">
            <Info className="h-4 w-4" />
            How It Works
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instant">
          <form onSubmit={handleInstantSubmit} className="space-y-6">
            {/* Patient Category Selection - Required First */}
            <Card className="border-0 shadow-lg bg-gradient-to-r from-primary/5 to-[#14919b]/5">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center gap-4">
                  <Label className="text-lg font-semibold text-center">
                    Select Patient Category{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  <div className="flex gap-4">
                    <Button
                      type="button"
                      variant={
                        instantFormData.patient_category === "psychiatric"
                          ? "default"
                          : "outline"
                      }
                      className={`h-20 w-48 flex flex-col gap-2 ${
                        instantFormData.patient_category === "psychiatric"
                          ? "bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
                          : "border-2 border-purple-300 hover:border-purple-500 hover:bg-purple-50"
                      }`}
                      onClick={() =>
                        setInstantFormData({
                          ...instantFormData,
                          patient_category: "psychiatric",
                        })
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                        />
                      </svg>
                      <span className="font-semibold">Psychiatric</span>
                    </Button>
                    <Button
                      type="button"
                      variant={
                        instantFormData.patient_category === "deaddiction"
                          ? "default"
                          : "outline"
                      }
                      className={`h-20 w-48 flex flex-col gap-2 ${
                        instantFormData.patient_category === "deaddiction"
                          ? "bg-gradient-to-r from-primary to-[#14919b] hover:from-[#0a5c5f] hover:to-primary text-white"
                          : "border-2 border-primary/30 hover:border-primary hover:bg-primary/5"
                      }`}
                      onClick={() =>
                        setInstantFormData({
                          ...instantFormData,
                          patient_category: "deaddiction",
                        })
                      }
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-6 w-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                        />
                      </svg>
                      <span className="font-semibold">De-Addiction</span>
                    </Button>
                  </div>
                  {!instantFormData.patient_category && (
                    <p className="text-sm text-muted-foreground">
                      Please select the patient category to proceed
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              {/* Patient Basic Info */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
                      <User className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        Patient Information
                      </CardTitle>
                      <CardDescription>
                        Basic details for quick registration
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* File Number */}
                  <div>
                    <Label
                      htmlFor="file_number"
                      className="flex items-center gap-2"
                    >
                      <Hash className="h-4 w-4 text-teal-600" />
                      File Number <span className="text-destructive">*</span>
                    </Label>
                    <div className="mt-1.5">
                      <Input
                        id="file_number"
                        name="file_number"
                        value={instantFormData.file_number}
                        onChange={handleInstantChange}
                        placeholder="e.g. A1"
                        className="font-mono text-lg font-semibold"
                        required
                      />
                    </div>
                    <FieldError message={apiErrors.get("file_number")} />
                    <p className="text-xs text-muted-foreground mt-1">
                      Letters, digits and hyphens only. Uniqueness is verified
                      on save — if the number is already taken the most recently
                      used one will be shown.
                    </p>
                  </div>

                  {/* Aadhaar Number */}
                  <div>
                    <Label
                      htmlFor="aadhaar_number"
                      className="flex items-center gap-2"
                    >
                      <CreditCard className="h-4 w-4 text-teal-600" />
                      Aadhaar Card Number{" "}
                      <span className="text-muted-foreground text-xs">
                        (Unique ID)
                      </span>
                    </Label>
                    <Input
                      id="aadhaar_number"
                      name="aadhaar_number"
                      value={instantFormData.aadhaar_number}
                      onChange={handleAadhaarChange}
                      placeholder="XXXX XXXX XXXX"
                      className="mt-1.5 font-mono tracking-wider"
                      maxLength={14}
                    />
                    <FieldError message={apiErrors.get("aadhaar_number")} />
                    <p className="text-xs text-muted-foreground mt-1">
                      12-digit Aadhaar number. Used as unique patient
                      identifier.
                    </p>
                  </div>

                  {/* Full Name */}
                  <div>
                    <Label
                      htmlFor="full_name"
                      className="flex items-center gap-2"
                    >
                      <User className="h-4 w-4 text-teal-600" />
                      Full Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      value={instantFormData.full_name}
                      onChange={handleInstantChange}
                      placeholder="Enter patient's full name"
                      className="mt-1.5"
                      required
                    />
                    <FieldError message={apiErrors.get("full_name")} />
                  </div>

                  {/* Date of Birth */}
                  <div>
                    <Label
                      htmlFor="date_of_birth"
                      className="flex items-center gap-2"
                    >
                      <Calendar className="h-4 w-4 text-teal-600" />
                      Date of Birth <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="date_of_birth"
                      name="date_of_birth"
                      type="date"
                      value={instantFormData.date_of_birth}
                      onChange={handleInstantChange}
                      className="mt-1.5"
                      required
                    />
                    <FieldError message={apiErrors.get("date_of_birth")} />
                  </div>

                  {/* Sex */}
                  <div>
                    <Label htmlFor="sex" className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-teal-600" />
                      Sex <span className="text-destructive">*</span>
                    </Label>
                    <select
                      id="sex"
                      name="sex"
                      value={instantFormData.sex}
                      onChange={(e) =>
                        setInstantFormData({
                          ...instantFormData,
                          sex: e.target.value as Gender | "",
                        })
                      }
                      className="mt-1.5 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      required
                    >
                      <option value="">Select sex</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  {/* Mobile Numbers */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <Label
                        htmlFor="phone"
                        className="flex items-center gap-2"
                      >
                        <Phone className="h-4 w-4 text-teal-600" />
                        Mobile Number{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={instantFormData.phone}
                        onChange={handleInstantChange}
                        placeholder="Patient's mobile"
                        className="mt-1.5"
                        required
                      />
                      <FieldError message={apiErrors.get("phone_number")} />
                    </div>

                    <div>
                      <Label
                        htmlFor="relative_phone"
                        className="flex items-center gap-2"
                      >
                        <Phone className="h-4 w-4 text-teal-600" />
                        Relative Mobile{" "}
                        {/* <span className="text-destructive">*</span> */}
                      </Label>
                      <Input
                        id="relative_phone"
                        name="relative_phone"
                        type="tel"
                        value={instantFormData.relative_phone}
                        onChange={handleInstantChange}
                        placeholder="Relative's mobile"
                        className="mt-1.5"
                        // required
                      />
                      {/* <FieldError message={apiErrors.get("relative_phone")} /> */}
                    </div>
                  </div>

                  {/* Location Details */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                      Location Details
                    </h3>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <Label
                          htmlFor="state"
                          className="flex items-center gap-2"
                        >
                          <MapPin className="h-4 w-4 text-teal-600" />
                          State
                        </Label>
                        <SearchableSelect
                          options={stateOptions.map((s) => ({
                            value: s.name,
                            label: s.name,
                          }))}
                          value={instantFormData.state}
                          onValueChange={handleAddressStateChange}
                          placeholder="Select state"
                          searchPlaceholder="Search states…"
                          emptyMessage="No matching state."
                          className="mt-1.5"
                        />
                      </div>

                      <div>
                        <Label
                          htmlFor="district"
                          className="flex items-center gap-2"
                        >
                          <MapPin className="h-4 w-4 text-teal-600" />
                          District
                        </Label>
                        <Input
                          id="district"
                          name="district"
                          value={instantFormData.district}
                          onChange={handleInstantChange}
                          placeholder="Enter district"
                          className="mt-1.5"
                        />
                      </div>

                      <div>
                        <Label
                          htmlFor="city"
                          className="flex items-center gap-2"
                        >
                          <MapPin className="h-4 w-4 text-teal-600" />
                          City/Village
                        </Label>
                        <SearchableSelect
                          options={cityOptions.map((c) => ({
                            value: c,
                            label: c,
                          }))}
                          value={instantFormData.city}
                          onValueChange={(val) =>
                            setInstantFormData((prev) => ({
                              ...prev,
                              city: val,
                            }))
                          }
                          placeholder={
                            instantFormData.state
                              ? "Search or type city"
                              : "Select state first"
                          }
                          searchPlaceholder="Search cities…"
                          emptyMessage="No matching city."
                          disabled={!instantFormData.state}
                          allowCustomValue
                          className="mt-1.5"
                        />
                      </div>

                      <div>
                        <Label
                          htmlFor="pincode"
                          className="flex items-center gap-2"
                        >
                          <MapPin className="h-4 w-4 text-teal-600" />
                          Pincode
                        </Label>
                        <Input
                          id="pincode"
                          name="pincode"
                          value={instantFormData.pincode}
                          onChange={handleInstantChange}
                          placeholder="Enter pincode"
                          inputMode="numeric"
                          maxLength={6}
                          className="mt-1.5"
                        />
                      </div>
                    </div>

                    {/* Address */}
                    <div>
                      <Label
                        htmlFor="address"
                        className="flex items-center gap-2"
                      >
                        <MapPin className="h-4 w-4 text-teal-600" />
                        Address <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        id="address"
                        name="address"
                        value={instantFormData.address}
                        onChange={handleInstantChange}
                        placeholder="Enter complete address"
                        className="mt-1.5 min-h-[80px]"
                        required
                      />
                      <FieldError message={apiErrors.get("address_line1")} />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Biometrics & Photo */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                      <Camera className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        Photo & Biometrics
                      </CardTitle>
                      <CardDescription>
                        Capture patient photo and fingerprint
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {ENABLE_FINGERPRINT && (
                  <Alert
                    className={
                      fingerprintService?.available
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-amber-200 bg-amber-50"
                    }
                  >
                    <Fingerprint
                      className={
                        fingerprintService?.available
                          ? "h-4 w-4 text-emerald-600"
                          : "h-4 w-4 text-amber-600"
                      }
                    />
                    <AlertDescription
                      className={
                        fingerprintService?.available
                          ? "text-emerald-800"
                          : "text-amber-800"
                      }
                    >
                      {fingerprintService?.available
                        ? `${fingerprintService.deviceInfo?.name || "Mantra MFS100"} connected via ${fingerprintService.secure ? "secure" : "non-secure"} SDK`
                        : fingerprintService?.error ||
                          "Checking Mantra fingerprint service..."}
                      <div className="mt-2 flex items-center gap-2 text-xs">
                        <span>
                          {fingerprintService?.endpoint ||
                            "Loading endpoint..."}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void refreshFingerprintService()}
                          disabled={isCheckingFingerprintService}
                          className="h-7 px-2"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${isCheckingFingerprintService ? "animate-spin" : ""}`}
                          />
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                  )}

                  {/* Photo Capture Section */}
                  {ENABLE_CAMERA && (
                  <div>
                    <Label className="mb-3 block flex items-center gap-2">
                      <Camera className="h-4 w-4 text-blue-600" />
                      Patient Photo{CAMERA_REQUIRED && <span className="text-destructive">*</span>}
                    </Label>

                    {!photoPreview ? (
                      <div className="border-2 border-dashed border-muted-foreground/25 rounded-xl p-8 text-center">
                        <Camera className="h-12 w-12 mx-auto text-muted-foreground/50 mb-3" />
                        <p className="text-sm text-muted-foreground mb-4">
                          No photo captured yet
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => setIsPhotoCaptureOpen(true)}
                        >
                          <Camera className="h-4 w-4 mr-2" />
                          Capture Photo
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="relative rounded-xl overflow-hidden">
                          <img
                            src={photoPreview}
                            alt="Patient preview"
                            className="w-full aspect-[4/3] object-cover"
                          />
                          <div className="absolute top-2 right-2 flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                removePhoto();
                                setIsPhotoCaptureOpen(true);
                              }}
                            >
                              <RefreshCw className="h-4 w-4 mr-1" />
                              Retake
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              onClick={removePhoto}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" />
                          Photo captured successfully
                        </p>
                      </div>
                    )}

                    <PhotoCaptureDialog
                      open={isPhotoCaptureOpen}
                      onOpenChange={setIsPhotoCaptureOpen}
                      onConfirm={handlePhotoCaptured}
                      title="Patient Photo"
                      description="Capture a photo for the patient profile."
                    />
                  </div>
                  )}

                  {/* Fingerprint Section */}
                  {ENABLE_FINGERPRINT && (
                  <div className="pt-4 border-t">
                    <Label className="mb-3 block flex items-center gap-2">
                      <Fingerprint className="h-4 w-4 text-teal-600" />
                      Fingerprint Scan{FINGERPRINT_REQUIRED && <span className="text-destructive">*</span>}
                    </Label>
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-20 h-20 rounded-xl flex items-center justify-center transition-all ${
                          fingerprintCaptured
                            ? "bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-500"
                            : isCapturingFingerprint
                              ? "bg-teal-100 dark:bg-teal-900/30 animate-pulse border-2 border-teal-500"
                              : "bg-secondary border-2 border-transparent"
                        }`}
                      >
                        {isCapturingFingerprint ? (
                          <Loader2 className="h-10 w-10 animate-spin text-teal-600" />
                        ) : (
                          <Fingerprint
                            className={`h-10 w-10 ${
                              fingerprintCaptured
                                ? "text-emerald-600"
                                : "text-muted-foreground"
                            }`}
                          />
                        )}
                      </div>
                      <div className="flex-1">
                        <Button
                          type="button"
                          variant={
                            fingerprintCaptured ? "outline" : "secondary"
                          }
                          onClick={handleCaptureFingerprint}
                          disabled={
                            isCapturingFingerprint ||
                            isCheckingFingerprintService ||
                            fingerprintService?.available === false
                          }
                          className="w-full"
                          size="lg"
                        >
                          {isCapturingFingerprint
                            ? "Scanning..."
                            : fingerprintCaptured
                              ? "Rescan Fingerprint"
                              : "Scan Fingerprint"}
                        </Button>
                        {fingerprintCaptured && (
                          <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Fingerprint captured successfully
                          </p>
                        )}
                        {!fingerprintCaptured && !isCapturingFingerprint && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Place finger on scanner when ready
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  )}

                  {/* Message when both biometric methods are disabled */}
                  {!ENABLE_FINGERPRINT && !ENABLE_CAMERA && (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">
                        Biometric and photo capture are not enabled at this centre.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Submit Button */}
            <div className="flex justify-center pt-4">
              <Button
                type="submit"
                size="lg"
                disabled={isSubmitting}
                className="min-w-[250px] bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 shadow-lg h-12 text-lg"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Registering...
                  </>
                ) : (
                  <>
                    <Save className="h-5 w-5 mr-2" />
                    Register Patient
                  </>
                )}
              </Button>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="info">
          <Card className="max-w-2xl mx-auto border-0 shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5 text-teal-600" />
                Two-Step Registration Process
              </CardTitle>
              <CardDescription>
                How the instant registration system works
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">1</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Instant Registration
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Capture mandatory details first: Patient Category, Name,
                      File Number, Date of Birth, Sex, Mobile Numbers, Address,
                      and Fingerprint. This allows patients to be registered and
                      checked in immediately.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-bold">2</span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">
                      Complete Profile Later
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Remaining general details can be edited later by reception
                      or counsellor from the <strong>Patient Data</strong>{" "}
                      section when time permits.
                    </p>
                  </div>
                </div>
              </div>

              <Alert className="bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800">
                <Zap className="h-4 w-4 text-teal-600" />
                <AlertDescription className="text-teal-700 dark:text-teal-300">
                  This two-step process helps reduce wait times at reception
                  while ensuring all necessary information is eventually
                  captured in the system.
                </AlertDescription>
              </Alert>

              <div className="pt-4">
                <Button
                  className="w-full bg-gradient-to-r from-teal-600 to-emerald-600"
                  onClick={() => navigate("/reception/patients")}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Go to Patient Data
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
