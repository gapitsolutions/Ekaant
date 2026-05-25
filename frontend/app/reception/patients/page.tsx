"use client";

import { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/lib/auth-context";
import { captureFingerprint } from "@/lib/biometric";
import { getIndiaCitiesByStateName, getIndiaStates } from "@/lib/address-data";
import {
  getPatientById,
  getPatientVisits,
  getPatientsList,
  deletePatient,
  updatePatientProfile,
  type PatientProfileUpdatePayload,
  type PatientDetailResponse,
  type PatientLookupResponse,
} from "@/lib/hms-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Search,
  User,
  Phone,
  MapPin,
  Calendar,
  Edit,
  ArrowUpDown,
  FileText,
  Droplet,
  Users,
  Save,
  X,
  CreditCard,
  Fingerprint,
  Hash,
  Briefcase,
  GraduationCap,
  HeartPulse,
  Syringe,
  ArrowLeft,
  Clock,
  Stethoscope,
  Pill,
  MessageSquare,
  ChevronRight,
  Activity,
  Download,
  Filter,
  RotateCcw,
  Loader2,
  Trash2,
} from "lucide-react";
import type {
  Patient,
  Visit,
  PatientCategory,
  Gender,
  AddictionType,
  PatientStatus,
  EmploymentStatus,
  EducationLevel,
  MaritalStatus,
  LivingArrangement,
  SubstanceType,
} from "@/lib/types";
import {
  EMPLOYMENT_STATUS_LABELS,
  EDUCATION_LABELS,
  MARITAL_STATUS_LABELS,
  LIVING_ARRANGEMENT_LABELS,
  SUBSTANCE_TYPE_LABELS,
  BLOOD_GROUP_OPTIONS,
  RELIGION_OPTIONS,
  NATIONALITY_OPTIONS,
} from "@/lib/types";

export default function PatientDataPage() {
  const { accessToken } = useAuth();
  const patientStatusOptions: PatientStatus[] = [
    "active",
    "inactive",
    "dead",
    "discharged",
    "follow_up",
  ];
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);
  const [listPage, setListPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(20);
  const [totalPatientsCount, setTotalPatientsCount] = useState(0);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientVisits, setPatientVisits] = useState<Visit[]>([]);
  const [isLoadingPatientDetail, setIsLoadingPatientDetail] = useState(false);
  const [isLoadingPatientVisits, setIsLoadingPatientVisits] = useState(false);
  const [loadedPatientDetails, setLoadedPatientDetails] = useState<
    Record<string, Patient>
  >({});
  const [loadedPatientVisits, setLoadedPatientVisits] = useState<
    Record<string, Visit[]>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [isSavingPatient, setIsSavingPatient] = useState(false);
  const [isStatusEditing, setIsStatusEditing] = useState(false);
  const [statusDraft, setStatusDraft] = useState<PatientStatus>("active");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingFingerprint, setIsUpdatingFingerprint] = useState(false);
  const [isFingerprintConfirmOpen, setIsFingerprintConfirmOpen] =
    useState(false);
  const [isFingerprintDialogOpen, setIsFingerprintDialogOpen] = useState(false);
  const [fingerprintFlowMessage, setFingerprintFlowMessage] = useState(
    "Capture a fresh fingerprint and update the patient profile.",
  );
  const [isDeletePatientConfirmOpen, setIsDeletePatientConfirmOpen] =
    useState(false);
  const [isDeletingPatient, setIsDeletingPatient] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterAddictionType, setFilterAddictionType] = useState<string>("all");
  const [filterDistrict, setFilterDistrict] = useState<string>("all");
  const [filterState, setFilterState] = useState<string>("all");

  const mapLookupPatient = (p: PatientLookupResponse): Patient => ({
    id: p.patient_id,
    file_number: p.file_number,
    hdams_id: p.hdams_id || "",
    patient_category: (p.patient_category as PatientCategory) || "deaddiction",
    full_name: p.full_name,
    date_of_birth: p.date_of_birth,
    phone: p.phone_number || p.phone || "",
    gender: (p.sex || p.gender || "male") as Gender,
    status: p.status as PatientStatus,
    address: p.address || p.address_line1 || "",
    city: p.city || "",
    district: p.district || "",
    state: p.state || "",
    pincode: p.pincode || "",
    addiction_type: (p.addiction_type as AddictionType) || "other",
    addiction_duration: p.addiction_duration || "",
    first_visit_date: "",
    registration_date: p.registration_date || "",
    emergency_contact_name: "",
    emergency_contact_phone: "",
    emergency_contact_relation: "",
    created_at: typeof p.created_at === "string" ? p.created_at : "",
    updated_at: typeof p.updated_at === "string" ? p.updated_at : "",
    blood_group: "",
    email: "",
    aadhaar_number: "",
    relative_phone: p.relative_phone || "",
    medical_history: "",
    allergies: "",
    family_history: "",
    current_medications: "",
    previous_treatments: "",
    photo_url: p.photo_url || undefined,
  });

  const mapPatientDetail = (p: PatientDetailResponse): Patient => ({
    id: p.patient_id,
    file_number: p.file_number || "",
    hdams_id: p.hdams_id || "",
    patient_category: (p.patient_category as PatientCategory) || "deaddiction",
    full_name: p.full_name || "",
    date_of_birth: p.date_of_birth || "",
    aadhaar_number: p.aadhaar_number || "",
    phone: p.phone_number || p.phone || "",
    relative_phone: p.relative_phone || "",
    address: p.address || p.address_line1 || "",
    photo_url: p.photo_url || undefined,
    fingerprint_template: p.has_fingerprint ? "enrolled" : "",
    registration_date: p.registration_date || "",
    mother_name: p.mother_name || "",
    father_name: p.father_name || "",
    grandfather_name: p.grandfather_name || "",
    spouse_name: p.spouse_name || "",
    gender: (p.sex || p.gender || "male") as Gender,
    blood_group: p.blood_group || "",
    nationality: p.nationality || "",
    religion: p.religion || "",
    monthly_income: p.monthly_income || "",
    occupation: p.occupation || "",
    employment_status: (p.employment_status as EmploymentStatus) || undefined,
    education: (p.education as EducationLevel) || undefined,
    marital_status: (p.marital_status as MaritalStatus) || undefined,
    block_mc: p.block_mc || "",
    city: p.city || "",
    district: p.district || "",
    state: p.state || "",
    pincode: p.pincode || "",
    living_arrangement:
      (p.living_arrangement as LivingArrangement) || undefined,
    substance_used_currently:
      (p.substance_used_currently as SubstanceType[]) || [],
    substance_ever_used: (p.substance_ever_used as SubstanceType[]) || [],
    injection_use_ever: Boolean(p.injection_use_ever),
    injection_use_currently: Boolean(p.injection_use_currently),
    route_of_admission: p.route_of_admission || "",
    syringe_sharing: Boolean(p.syringe_sharing),
    sti_std: p.sti_std || "",
    jaundice: Boolean(p.jaundice),
    sex_with_sex_worker: Boolean(p.sex_with_sex_worker),
    hiv_screening: Boolean(p.hiv_screening),
    hiv_result: p.hiv_result || "",
    comorbid_medical_illness: p.comorbid_medical_illness || "",
    comorbid_psychiatric_illness: p.comorbid_psychiatric_illness || "",
    previous_drug_treatment: p.previous_drug_treatment || "",
    ever_hospitalized: Boolean(p.ever_hospitalized),
    email: "",
    addiction_type: (p.addiction_type as AddictionType) || "other",
    addiction_duration: p.addiction_duration || "",
    first_visit_date: p.first_visit_date || p.date_of_birth || "",
    emergency_contact_name: p.emergency_contact_name || "",
    emergency_contact_phone: p.emergency_contact_phone || "",
    emergency_contact_relation: p.emergency_contact_relation || "",
    family_history: p.family_history || "",
    medical_history: p.medical_history || "",
    allergies: p.allergies || "",
    current_medications: p.current_medications || "",
    previous_treatments: p.previous_treatments || "",
    status: (p.status as PatientStatus) || "active",
    created_at: p.created_at || new Date().toISOString(),
    updated_at: p.updated_at || new Date().toISOString(),
  });

  const syncPatientInLists = (updated: Patient) => {
    setPatients((prev) =>
      prev.map((p) =>
        p.id === updated.id
          ? {
              ...p,
              full_name: updated.full_name,
              phone: updated.phone,
              date_of_birth: updated.date_of_birth,
              status: updated.status,
              photo_url: updated.photo_url,
            }
          : p,
      ),
    );
  };

  const buildPatientUpdatePayload = (
    patient: Patient,
  ): PatientProfileUpdatePayload => ({
    hdams_id: patient.hdams_id || undefined,
    full_name: patient.full_name,
    aadhaar_number: patient.aadhaar_number || undefined,
    date_of_birth: patient.date_of_birth || undefined,
    phone_number: patient.phone,
    sex: patient.gender,
    blood_group: patient.blood_group || "",
    nationality: patient.nationality || "",
    religion: patient.religion || "",
    education: patient.education || "",
    employment_status: patient.employment_status || "",
    occupation: patient.occupation || "",
    monthly_income: patient.monthly_income || "",
    marital_status: patient.marital_status || "",
    father_name: patient.father_name || "",
    mother_name: patient.mother_name || "",
    grandfather_name: patient.grandfather_name || "",
    spouse_name: patient.spouse_name || "",
    relative_phone: patient.relative_phone || "",
    living_arrangement: patient.living_arrangement || "",
    address_line1: patient.address || "",
    block_mc: patient.block_mc || "",
    city: patient.city || "",
    district: patient.district || "",
    state: patient.state || "",
    pincode: patient.pincode || "",
    substance_used_currently: patient.substance_used_currently || [],
    substance_ever_used: patient.substance_ever_used || [],
    injection_use_ever: Boolean(patient.injection_use_ever),
    injection_use_currently: Boolean(patient.injection_use_currently),
    route_of_admission: patient.route_of_admission || "",
    syringe_sharing: Boolean(patient.syringe_sharing),
    sti_std: patient.sti_std || "",
    jaundice: Boolean(patient.jaundice),
    sex_with_sex_worker: Boolean(patient.sex_with_sex_worker),
    hiv_screening: Boolean(patient.hiv_screening),
    hiv_result: patient.hiv_result || "",
    comorbid_medical_illness: patient.comorbid_medical_illness || "",
    comorbid_psychiatric_illness: patient.comorbid_psychiatric_illness || "",
    previous_drug_treatment: patient.previous_drug_treatment || "",
    ever_hospitalized: Boolean(patient.ever_hospitalized),
    addiction_type: patient.addiction_type || "other",
    addiction_duration: patient.addiction_duration || "",
    family_history: patient.family_history || "",
    medical_history: patient.medical_history || "",
    allergies: patient.allergies || "",
    current_medications: patient.current_medications || "",
    previous_treatments: patient.previous_treatments || "",
    emergency_contact_name: patient.emergency_contact_name || "",
    emergency_contact_phone: patient.emergency_contact_phone || "",
    emergency_contact_relation: patient.emergency_contact_relation || "",
    status: patient.status,
    registration_date: patient.registration_date || undefined,
    first_visit_date: patient.first_visit_date || undefined,
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setListPage(1);
  }, [
    debouncedSearchQuery,
    listPageSize,
    filterDistrict,
    filterState,
    filterAddictionType,
    filterDateFrom,
    filterDateTo,
  ]);

  // Load patient list (paginated)
  useEffect(() => {
    if (!accessToken) return;
    setIsLoadingPatients(true);
    getPatientsList(accessToken, {
      q: debouncedSearchQuery || undefined,
      page: listPage,
      pageSize: listPageSize,
      district: filterDistrict === "all" ? undefined : filterDistrict,
      state: filterState === "all" ? undefined : filterState,
      addiction_type:
        filterAddictionType === "all" ? undefined : filterAddictionType,
      registration_start: filterDateFrom || undefined,
      registration_end: filterDateTo || undefined,
    })
      .then((data) => {
        setPatients((data.items || []).map(mapLookupPatient));
        setTotalPatientsCount(
          data.pagination?.total ?? (data.items || []).length,
        );
      })
      .catch(() => {
        setPatients([]);
        setTotalPatientsCount(0);
      })
      .finally(() => setIsLoadingPatients(false));
  }, [
    accessToken,
    listPage,
    listPageSize,
    debouncedSearchQuery,
    filterDistrict,
    filterState,
    filterAddictionType,
    filterDateFrom,
    filterDateTo,
  ]);

  // Reset local visits list when patient changes.
  useEffect(() => {
    if (selectedPatient) {
      setPatientVisits(loadedPatientVisits[selectedPatient.id] || []);
    }
  }, [selectedPatient, loadedPatientVisits]);

  // Lazy-load full patient profile only when a patient card is opened.
  useEffect(() => {
    if (!accessToken || !selectedPatient) return;

    const cached = loadedPatientDetails[selectedPatient.id];
    if (cached) {
      setSelectedPatient(cached);
      return;
    }

    setIsLoadingPatientDetail(true);
    getPatientById(accessToken, selectedPatient.id)
      .then((detail) => {
        const mapped = mapPatientDetail(detail);
        setLoadedPatientDetails((prev) => ({ ...prev, [mapped.id]: mapped }));
        setSelectedPatient(mapped);
      })
      .catch(() => {
        toast.error("Failed to load patient profile");
      })
      .finally(() => setIsLoadingPatientDetail(false));
  }, [accessToken, selectedPatient?.id]);

  // Load visit history for the selected patient in parallel with full profile.
  useEffect(() => {
    if (!accessToken || !selectedPatient) return;

    const cached = loadedPatientVisits[selectedPatient.id];
    if (cached) {
      setPatientVisits(cached);
      return;
    }

    setIsLoadingPatientVisits(true);
    getPatientVisits(accessToken, selectedPatient.id)
      .then((data) => {
        const mapped: Visit[] = (data.items || []).map((visit, index) => ({
          id: visit.id,
          patient_id: selectedPatient.id,
          visit_date: visit.visit_date,
          visit_number: index + 1,
          current_stage: visit.current_stage,
          checkin_time: visit.checkin_time,
          completed_time: visit.completed_time || undefined,
          status: visit.status,
        }));
        setLoadedPatientVisits((prev) => ({
          ...prev,
          [selectedPatient.id]: mapped,
        }));
        setPatientVisits(mapped);
      })
      .catch(() => {
        toast.error("Failed to load visit history");
      })
      .finally(() => setIsLoadingPatientVisits(false));
  }, [accessToken, selectedPatient?.id]);

  // Reset filters
  const resetFilters = () => {
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterAddictionType("all");
    setFilterDistrict("all");
    setFilterState("all");
    setSearchQuery("");
  };

  const stateOptions = useMemo(() => getIndiaStates(), []);
  const editingStateCityOptions = useMemo(() => {
    if (!editingPatient?.state) {
      return [];
    }
    return getIndiaCitiesByStateName(editingPatient.state);
  }, [editingPatient?.state]);

  // Get unique districts and states from patients for filter dropdowns
  const uniqueDistricts = useMemo(() => {
    const districts = new Set<string>();
    patients.forEach((p) => {
      if (p.district) districts.add(p.district);
    });
    return Array.from(districts).sort();
  }, [patients]);

  // Sort current server-filtered page
  const filteredPatients = useMemo(() => {
    const result = [...patients];

    result.sort((a, b) => {
      const comparison = a.file_number.localeCompare(
        b.file_number,
      );
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [patients, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(totalPatientsCount / listPageSize));
  const pageStart =
    totalPatientsCount === 0 ? 0 : (listPage - 1) * listPageSize + 1;
  const pageEnd = Math.min(listPage * listPageSize, totalPatientsCount);

  // Export to Excel (CSV format that Excel can open)
  const exportToExcel = async () => {
    if (filteredPatients.length === 0) {
      toast.error("No patients to export");
      return;
    }

    if (!accessToken) {
      toast.error("Please sign in again to export patient details.");
      return;
    }

    setIsExporting(true);

    try {
      const exportCandidates = await Promise.all(
        filteredPatients.map(async (patient) => {
          const cached = loadedPatientDetails[patient.id];
          if (cached) return cached;

          try {
            const detail = await getPatientById(accessToken, patient.id);
            return mapPatientDetail(detail);
          } catch {
            return patient;
          }
        }),
      );

      setLoadedPatientDetails((prev) => {
        const next = { ...prev };
        exportCandidates.forEach((patient) => {
          next[patient.id] = patient;
        });
        return next;
      });

      // Define CSV headers
      const headers = [
        "File Number",
        "HDAMS ID",
        "Full Name",
        "Aadhaar Number",
        "Date of Birth",
        "Age",
        "Gender",
        "Phone",
        "Relative Phone",
        "Address",
        "City",
        "District",
        "State",
        "Father Name",
        "Mother Name",
        "Spouse Name",
        "Blood Group",
        "Religion",
        "Nationality",
        "Education",
        "Occupation",
        "Employment Status",
        "Marital Status",
        "Monthly Income",
        "Living Arrangement",
        "Addiction Type",
        "Substances Used Currently",
        "Substances Ever Used",
        "Injection Use Ever",
        "Injection Use Currently",
        "Syringe Sharing",
        "STI/STD",
        "Jaundice",
        "HIV Screening",
        "HIV Result",
        "Co-morbid Medical Illness",
        "Co-morbid Psychiatric Illness",
        "Previous Treatment",
        "Ever Hospitalized",
        "Status",
        "Registration Date",
      ];

      // Convert patients to CSV rows
      const rows = exportCandidates.map((patient) => [
        patient.file_number || "",
        patient.hdams_id || "",
        patient.full_name || "",
        patient.aadhaar_number || "",
        patient.date_of_birth || "",
        patient.date_of_birth ? getAge(patient.date_of_birth) : "",
        patient.gender || "",
        patient.phone || "",
        patient.relative_phone || "",
        patient.address || "",
        patient.city || "",
        patient.district || "",
        patient.state || "",
        patient.father_name || "",
        patient.mother_name || "",
        patient.spouse_name || "",
        patient.blood_group || "",
        patient.religion || "",
        patient.nationality || "",
        patient.education ? EDUCATION_LABELS[patient.education] : "",
        patient.occupation || "",
        patient.employment_status
          ? EMPLOYMENT_STATUS_LABELS[patient.employment_status]
          : "",
        patient.marital_status
          ? MARITAL_STATUS_LABELS[patient.marital_status]
          : "",
        patient.monthly_income || "",
        patient.living_arrangement
          ? LIVING_ARRANGEMENT_LABELS[patient.living_arrangement]
          : "",
        patient.addiction_type || "",
        patient.substance_used_currently
          ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
          .join("; ") || "",
        patient.substance_ever_used
          ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
          .join("; ") || "",
        patient.injection_use_ever ? "Yes" : "No",
        patient.injection_use_currently ? "Yes" : "No",
        patient.syringe_sharing ? "Yes" : "No",
        patient.sti_std || "",
        patient.jaundice ? "Yes" : "No",
        patient.hiv_screening ? "Yes" : "No",
        patient.hiv_result || "",
        patient.comorbid_medical_illness || "",
        patient.comorbid_psychiatric_illness || "",
        patient.previous_treatments || "",
        patient.ever_hospitalized ? "Yes" : "No",
        patient.status || "",
        patient.registration_date ? formatDate(patient.registration_date) : "",
      ]);

      // Create CSV content
      const escapeCSV = (value: string | number | boolean) => {
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const csvContent = [
        headers.map(escapeCSV).join(","),
        ...rows.map((row) => row.map(escapeCSV).join(",")),
      ].join("\n");

      // Create and download file
      const blob = new Blob(["\ufeff" + csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      const fileName = `patient_data_${new Date().toISOString().split("T")[0]}.csv`;
      link.setAttribute("download", fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(
        `Exported ${exportCandidates.length} patients to ${fileName}`,
      );
    } finally {
      setIsExporting(false);
    }
  };

  const handleSelectPatient = (patient: Patient) => {
    const resolvedPatient = loadedPatientDetails[patient.id] || patient;
    setSelectedPatient(resolvedPatient);
    setPatientVisits(loadedPatientVisits[patient.id] || []);
    setStatusDraft(resolvedPatient.status);
    setIsStatusEditing(false);
    setActiveTab("profile");
  };

  const handleBackToList = () => {
    setSelectedPatient(null);
    setPatientVisits([]);
    setIsLoadingPatientDetail(false);
    setIsLoadingPatientVisits(false);
    setIsStatusEditing(false);
  };

  const handleEditPatient = (patient: Patient) => {
    setEditingPatient({ ...patient });
    setIsEditOpen(true);
  };

  const handleSavePatient = async () => {
    if (!editingPatient || !accessToken) return;

    setIsSavingPatient(true);
    try {
      const payload = buildPatientUpdatePayload(editingPatient);
      const updated = await updatePatientProfile(
        accessToken,
        editingPatient.id,
        payload,
      );
      const mapped = mapPatientDetail(updated);

      setLoadedPatientDetails((prev) => ({ ...prev, [mapped.id]: mapped }));
      setSelectedPatient(mapped);
      setStatusDraft(mapped.status);
      syncPatientInLists(mapped);

      toast.success("Patient profile updated");
      setIsEditOpen(false);
      setEditingPatient(null);
    } catch {
      toast.error("Failed to save patient profile");
    } finally {
      setIsSavingPatient(false);
    }
  };

  const handleQuickStatusSave = async () => {
    if (!selectedPatient || !accessToken) return;

    setIsUpdatingStatus(true);
    try {
      const updated = await updatePatientProfile(
        accessToken,
        selectedPatient.id,
        { status: statusDraft },
      );
      const mapped = mapPatientDetail(updated);

      setLoadedPatientDetails((prev) => ({ ...prev, [mapped.id]: mapped }));
      setSelectedPatient(mapped);
      syncPatientInLists(mapped);
      setIsStatusEditing(false);

      toast.success("Patient status updated");
    } catch {
      toast.error("Failed to update status");
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleOpenFingerprintConfirmation = () => {
    if (!selectedPatient || !accessToken || isLoadingPatientDetail) return;
    setIsFingerprintConfirmOpen(true);
  };

  const handleProceedFingerprintFlow = () => {
    setIsFingerprintConfirmOpen(false);
    setFingerprintFlowMessage(
      "Capture a fresh fingerprint and update the patient profile.",
    );
    setIsFingerprintDialogOpen(true);
  };

  const handleCaptureAndUpdateFingerprint = async () => {
    if (!selectedPatient || !accessToken) return;

    setIsUpdatingFingerprint(true);
    setFingerprintFlowMessage("Capturing fingerprint from connected device...");
    try {
      const captureResult = await captureFingerprint();
      if (!captureResult.success || !captureResult.data) {
        const message =
          captureResult.error || "Failed to capture fingerprint. Try again.";
        setFingerprintFlowMessage(message);
        toast.error(message);
        return;
      }

      setFingerprintFlowMessage("Updating patient fingerprint in backend...");
      const updated = await updatePatientProfile(
        accessToken,
        selectedPatient.id,
        {
          fingerprint_template: captureResult.data,
        },
      );
      const mapped = mapPatientDetail(updated);

      setLoadedPatientDetails((prev) => ({ ...prev, [mapped.id]: mapped }));
      setSelectedPatient(mapped);
      syncPatientInLists(mapped);
      setFingerprintFlowMessage("Fingerprint updated successfully.");

      toast.success("Fingerprint updated successfully");
    } catch {
      const message = "Failed to update fingerprint. Please try again.";
      setFingerprintFlowMessage(message);
      toast.error(message);
    } finally {
      setIsUpdatingFingerprint(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!selectedPatient || !accessToken) return;

    const deletingId = selectedPatient.id;
    const deletingName = selectedPatient.full_name;

    setIsDeletingPatient(true);
    try {
      await deletePatient(accessToken, deletingId);

      setPatients((prev) => prev.filter((p) => p.id !== deletingId));
      setLoadedPatientDetails((prev) => {
        const next = { ...prev };
        delete next[deletingId];
        return next;
      });
      setLoadedPatientVisits((prev) => {
        const next = { ...prev };
        delete next[deletingId];
        return next;
      });
      setTotalPatientsCount((prev) => Math.max(0, prev - 1));

      setIsDeletePatientConfirmOpen(false);
      setIsFingerprintConfirmOpen(false);
      setIsFingerprintDialogOpen(false);
      setSelectedPatient(null);
      setPatientVisits([]);

      toast.success(`Patient ${deletingName} deleted successfully`);
    } catch {
      toast.error("Failed to delete patient");
    } finally {
      setIsDeletingPatient(false);
    }
  };

  const handleEditChange = (field: keyof Patient, value: any) => {
    if (editingPatient) {
      setEditingPatient({ ...editingPatient, [field]: value });
    }
  };

  const handleEditingStateChange = (stateName: string) => {
    if (!editingPatient) return;

    const nextCityOptions = getIndiaCitiesByStateName(stateName);
    const shouldKeepCity =
      Boolean(editingPatient.city) &&
      nextCityOptions.includes(editingPatient.city);

    setEditingPatient({
      ...editingPatient,
      state: stateName,
      city: shouldKeepCity ? editingPatient.city : "",
    });
  };

  const handleSubstanceToggle = (
    field: "substance_used_currently" | "substance_ever_used",
    substance: SubstanceType,
  ) => {
    if (!editingPatient) return;
    const current = editingPatient[field] || [];
    const updated = current.includes(substance)
      ? current.filter((s) => s !== substance)
      : [...current, substance];
    handleEditChange(field, updated);
  };

  const getAge = (dob: string) => {
    if (!dob) return "N/A";
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  };

  const formatAadhaar = (aadhaar: string | undefined) => {
    if (!aadhaar) return "N/A";
    const digits = aadhaar.replace(/\D/g, "");
    if (digits.length !== 12) return aadhaar;
    return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
  };

  const formatDate = (date: string | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const formatDateTime = (date: string | undefined) => {
    if (!date) return "N/A";
    return new Date(date).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "counsellor":
        return <MessageSquare className="h-4 w-4" />;
      case "doctor":
        return <Stethoscope className="h-4 w-4" />;
      case "pharmacy":
        return <Pill className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "counsellor":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "doctor":
        return "bg-purple-100 text-purple-700 border-purple-300";
      case "pharmacy":
        return "bg-orange-100 text-orange-700 border-orange-300";
      default:
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  // Section component for view
  const ViewSection = ({
    title,
    icon: Icon,
    children,
  }: {
    title: string;
    icon: any;
    children: React.ReactNode;
  }) => (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-5 w-5 text-[#0d7377]" />
        <h3 className="font-semibold text-lg">{title}</h3>
      </div>
      <div className="grid grid-cols-2 gap-4 pl-7">{children}</div>
    </div>
  );

  // Field display component
  const ViewField = ({
    label,
    value,
  }: {
    label: string;
    value: string | number | undefined;
  }) => (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value || "N/A"}</p>
    </div>
  );

  // If a patient is selected, show full profile
  if (selectedPatient) {
    return (
      <div className="space-y-6">
        {/* Back Button & Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={handleBackToList}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{selectedPatient.full_name}</h1>
            <p className="text-muted-foreground">
              File No:{" "}
              <span className="font-mono text-[#0d7377]">
                {selectedPatient.file_number}
              </span>
              {selectedPatient.hdams_id && (
                <>
                  {" "}
                  | HDAMS:{" "}
                  <span className="font-mono">{selectedPatient.hdams_id}</span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleOpenFingerprintConfirmation}
              disabled={isLoadingPatientDetail || isUpdatingFingerprint}
            >
              {isUpdatingFingerprint ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Fingerprint className="h-4 w-4 mr-2" />
              )}
              {isUpdatingFingerprint ? "Updating..." : "Update Fingerprint"}
            </Button>
            <Button
              variant="destructive"
              onClick={() => setIsDeletePatientConfirmOpen(true)}
              disabled={isDeletingPatient || isLoadingPatientDetail}
            >
              {isDeletingPatient ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              {isDeletingPatient ? "Deleting..." : "Delete Patient"}
            </Button>
            <Button
              onClick={() => handleEditPatient(selectedPatient)}
              disabled={isLoadingPatientDetail}
              className="bg-gradient-to-r from-[#0d7377] to-[#14919b]"
            >
              {isLoadingPatientDetail ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Edit className="h-4 w-4 mr-2" />
              )}
              {isLoadingPatientDetail ? "Loading Profile..." : "Edit Profile"}
            </Button>
          </div>
        </div>

        <Dialog
          open={isFingerprintConfirmOpen}
          onOpenChange={setIsFingerprintConfirmOpen}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-[#0d7377]" />
                Confirm Fingerprint Update
              </DialogTitle>
              <DialogDescription>
                This will start live fingerprint capture for{" "}
                {selectedPatient.full_name}. Proceed only when the patient is
                present at the scanner.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFingerprintConfirmOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="bg-gradient-to-r from-[#0d7377] to-[#14919b]"
                onClick={handleProceedFingerprintFlow}
              >
                Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isFingerprintDialogOpen}
          onOpenChange={setIsFingerprintDialogOpen}
        >
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-[#0d7377]" />
                Fingerprint Update Console
              </DialogTitle>
              <DialogDescription>
                Patient: {selectedPatient.full_name} (
                {selectedPatient.file_number})
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-[#0d7377]/20 bg-[#0d7377]/5 p-4">
              <p className="text-sm text-muted-foreground mb-1">Status</p>
              <p className="font-medium">{fingerprintFlowMessage}</p>
            </div>

            <div className="rounded-lg border p-4 space-y-2">
              <p className="text-sm font-medium">Instructions</p>
              <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1">
                <li>
                  Ask the patient to place the same finger flat on the scanner.
                </li>
                <li>Keep finger still until capture completes.</li>
                <li>If capture fails, click Capture and Update again.</li>
              </ul>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsFingerprintDialogOpen(false)}
                disabled={isUpdatingFingerprint}
              >
                Close
              </Button>
              <Button
                className="bg-gradient-to-r from-[#0d7377] to-[#14919b]"
                onClick={handleCaptureAndUpdateFingerprint}
                disabled={isUpdatingFingerprint}
              >
                {isUpdatingFingerprint ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Fingerprint className="h-4 w-4 mr-2" />
                    Capture and Update
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isDeletePatientConfirmOpen}
          onOpenChange={setIsDeletePatientConfirmOpen}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <Trash2 className="h-5 w-5" />
                Delete Patient Record
              </DialogTitle>
              <DialogDescription>
                This will permanently delete {selectedPatient.full_name}, all
                visit records, and stored patient media files. This action
                cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsDeletePatientConfirmOpen(false)}
                disabled={isDeletingPatient}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeletePatient}
                disabled={isDeletingPatient}
              >
                {isDeletingPatient ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Permanently
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Patient Profile Card */}
        <Card className="border-[#0d7377]/20 overflow-hidden">
          <div className="h-2 bg-gradient-to-r from-[#0d7377] to-[#14919b]" />
          <CardContent className="pt-6">
            <div className="flex items-start gap-6">
              {/* Photo */}
              <div className="flex-shrink-0">
                {selectedPatient.photo_url ? (
                  <Image
                    src={selectedPatient.photo_url}
                    alt={selectedPatient.full_name}
                    width={120}
                    height={120}
                    className="rounded-xl object-cover border-2 border-[#0d7377]/30"
                  />
                ) : (
                  <div className="w-[120px] h-[120px] rounded-xl bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 flex items-center justify-center border-2 border-[#0d7377]/30">
                    <User className="h-12 w-12 text-[#0d7377]" />
                  </div>
                )}
                {selectedPatient.fingerprint_template && (
                  <Badge
                    variant="outline"
                    className="mt-2 w-full justify-center bg-green-50 text-green-700 border-green-300"
                  >
                    <Fingerprint className="h-3 w-3 mr-1" />
                    Verified
                  </Badge>
                )}
              </div>

              {/* Quick Info */}
              <div className="flex-1 grid grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Aadhaar</p>
                  <p className="font-mono font-medium">
                    {formatAadhaar(selectedPatient.aadhaar_number)}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">HDAMS ID</p>
                  <p className="font-mono font-medium">
                    {selectedPatient.hdams_id || "N/A"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Age / Gender</p>
                  <p className="font-medium">
                    {getAge(selectedPatient.date_of_birth)} yrs /{" "}
                    {selectedPatient.gender?.charAt(0).toUpperCase()}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Mobile</p>
                  <p className="font-medium">{selectedPatient.phone}</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">
                    Relative Mobile
                  </p>
                  <p className="font-medium">
                    {selectedPatient.relative_phone || "N/A"}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm text-muted-foreground">Status</p>
                    {!isStatusEditing && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => {
                          setStatusDraft(selectedPatient.status);
                          setIsStatusEditing(true);
                        }}
                      >
                        <Edit className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {isStatusEditing ? (
                    <div className="space-y-2">
                      <Select
                        value={statusDraft}
                        onValueChange={(value) =>
                          setStatusDraft(value as PatientStatus)
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {patientStatusOptions.map((status) => (
                            <SelectItem key={status} value={status}>
                              {status.replace("_", " ")}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          className="h-7 px-2"
                          onClick={handleQuickStatusSave}
                          disabled={isUpdatingStatus}
                        >
                          {isUpdatingStatus ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Save className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => {
                            setStatusDraft(selectedPatient.status);
                            setIsStatusEditing(false);
                          }}
                          disabled={isUpdatingStatus}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Badge
                      className={
                        selectedPatient.status === "active"
                          ? "bg-green-100 text-green-700"
                          : ""
                      }
                    >
                      {selectedPatient.status.replace("_", " ")}
                    </Badge>
                  )}
                </div>
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm text-muted-foreground">Total Visits</p>
                  <p className="font-medium text-[#0d7377]">
                    {patientVisits.length}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs for Profile & Visit History */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid grid-cols-2 w-full max-w-md">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              Full Profile
            </TabsTrigger>
            <TabsTrigger value="visits" className="gap-2">
              <Activity className="h-4 w-4" />
              Visit History ({patientVisits.length})
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6">
            <Card>
              <CardContent className="pt-6">
                {isLoadingPatientDetail ? (
                  <div className="h-[60vh] flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Loading patient profile...
                  </div>
                ) : (
                  <ScrollArea className="h-[60vh] pr-4">
                    {/* Personal Information */}
                    <ViewSection title="Personal Information" icon={User}>
                      <ViewField
                        label="Date of Birth"
                        value={formatDate(selectedPatient.date_of_birth)}
                      />
                      <ViewField
                        label="Gender"
                        value={
                          selectedPatient.gender?.charAt(0).toUpperCase() +
                          selectedPatient.gender?.slice(1)
                        }
                      />
                      <ViewField
                        label="Blood Group"
                        value={selectedPatient.blood_group}
                      />
                      <ViewField
                        label="Nationality"
                        value={selectedPatient.nationality}
                      />
                      <ViewField
                        label="Religion"
                        value={selectedPatient.religion}
                      />
                      <ViewField
                        label="Monthly Income"
                        value={selectedPatient.monthly_income}
                      />
                    </ViewSection>

                    <Separator className="my-4" />

                    {/* Family Information */}
                    <ViewSection title="Family Details" icon={Users}>
                      <ViewField
                        label="Father's Name"
                        value={selectedPatient.father_name}
                      />
                      <ViewField
                        label="Mother's Name"
                        value={selectedPatient.mother_name}
                      />
                      <ViewField
                        label="Grandfather's Name"
                        value={selectedPatient.grandfather_name}
                      />
                      <ViewField
                        label="Spouse Name"
                        value={selectedPatient.spouse_name}
                      />
                      <ViewField
                        label="Marital Status"
                        value={
                          selectedPatient.marital_status
                            ? MARITAL_STATUS_LABELS[
                                selectedPatient.marital_status
                              ]
                            : undefined
                        }
                      />
                      <ViewField
                        label="Living Arrangement"
                        value={
                          selectedPatient.living_arrangement
                            ? LIVING_ARRANGEMENT_LABELS[
                                selectedPatient.living_arrangement
                              ]
                            : undefined
                        }
                      />
                    </ViewSection>

                    <Separator className="my-4" />

                    {/* Contact Information */}
                    <ViewSection title="Contact Details" icon={Phone}>
                      <ViewField
                        label="Emergency Contact"
                        value={selectedPatient.emergency_contact_name}
                      />
                      <ViewField
                        label="Emergency Phone"
                        value={selectedPatient.emergency_contact_phone}
                      />
                      <ViewField
                        label="Relation"
                        value={selectedPatient.emergency_contact_relation}
                      />
                    </ViewSection>

                    <Separator className="my-4" />

                    {/* Address */}
                    <ViewSection title="Address" icon={MapPin}>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">
                          Full Address
                        </p>
                        <p className="font-medium">{selectedPatient.address}</p>
                      </div>
                      <ViewField
                        label="Block/MC"
                        value={selectedPatient.block_mc}
                      />
                      <ViewField label="City" value={selectedPatient.city} />
                      <ViewField
                        label="District"
                        value={selectedPatient.district}
                      />
                      <ViewField label="State" value={selectedPatient.state} />
                      <ViewField
                        label="Pincode"
                        value={selectedPatient.pincode}
                      />
                    </ViewSection>

                    <Separator className="my-4" />

                    {/* Education & Employment */}
                    <ViewSection
                      title="Education & Employment"
                      icon={Briefcase}
                    >
                      <ViewField
                        label="Education"
                        value={
                          selectedPatient.education
                            ? EDUCATION_LABELS[selectedPatient.education]
                            : undefined
                        }
                      />
                      <ViewField
                        label="Employment Status"
                        value={
                          selectedPatient.employment_status
                            ? EMPLOYMENT_STATUS_LABELS[
                                selectedPatient.employment_status
                              ]
                            : undefined
                        }
                      />
                      <ViewField
                        label="Occupation"
                        value={selectedPatient.occupation}
                      />
                    </ViewSection>

                    <Separator className="my-4" />

                    {/* Substance Use */}
                    <ViewSection title="Substance Use Details" icon={Syringe}>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">
                          Currently Using
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedPatient.substance_used_currently?.length ? (
                            selectedPatient.substance_used_currently.map(
                              (s) => (
                                <Badge
                                  key={s}
                                  variant="destructive"
                                  className="text-xs"
                                >
                                  {SUBSTANCE_TYPE_LABELS[s]}
                                </Badge>
                              ),
                            )
                          ) : (
                            <span className="text-muted-foreground">
                              None specified
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-muted-foreground">
                          Ever Used
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedPatient.substance_ever_used?.length ? (
                            selectedPatient.substance_ever_used.map((s) => (
                              <Badge
                                key={s}
                                variant="secondary"
                                className="text-xs"
                              >
                                {SUBSTANCE_TYPE_LABELS[s]}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-muted-foreground">
                              None specified
                            </span>
                          )}
                        </div>
                      </div>
                      <ViewField
                        label="Injection Use (Ever)"
                        value={
                          selectedPatient.injection_use_ever ? "Yes" : "No"
                        }
                      />
                      <ViewField
                        label="Injection Use (Currently)"
                        value={
                          selectedPatient.injection_use_currently ? "Yes" : "No"
                        }
                      />
                      <ViewField
                        label="Route of Admission"
                        value={selectedPatient.route_of_admission}
                      />
                      <ViewField
                        label="Syringe/Needle Sharing"
                        value={selectedPatient.syringe_sharing ? "Yes" : "No"}
                      />
                    </ViewSection>

                    <Separator className="my-4" />

                    {/* Medical History */}
                    <ViewSection title="Medical History" icon={HeartPulse}>
                      <ViewField
                        label="STI/STD"
                        value={selectedPatient.sti_std}
                      />
                      <ViewField
                        label="Jaundice"
                        value={selectedPatient.jaundice ? "Yes" : "No"}
                      />
                      <ViewField
                        label="Sex with Sex Worker"
                        value={
                          selectedPatient.sex_with_sex_worker ? "Yes" : "No"
                        }
                      />
                      <ViewField
                        label="HIV Screening"
                        value={selectedPatient.hiv_screening ? "Yes" : "No"}
                      />
                      {selectedPatient.hiv_screening && (
                        <ViewField
                          label="HIV Result"
                          value={selectedPatient.hiv_result}
                        />
                      )}
                      <div className="col-span-2">
                        <ViewField
                          label="Co-morbid Medical Illness"
                          value={selectedPatient.comorbid_medical_illness}
                        />
                      </div>
                      <div className="col-span-2">
                        <ViewField
                          label="Co-morbid Psychiatric Illness"
                          value={selectedPatient.comorbid_psychiatric_illness}
                        />
                      </div>
                      <ViewField
                        label="Previous Drug Treatment"
                        value={selectedPatient.previous_drug_treatment}
                      />
                      <ViewField
                        label="Ever Hospitalized"
                        value={selectedPatient.ever_hospitalized ? "Yes" : "No"}
                      />
                      <div className="col-span-2">
                        <ViewField
                          label="Allergies"
                          value={selectedPatient.allergies}
                        />
                      </div>
                    </ViewSection>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Visit History Tab */}
          <TabsContent value="visits" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-[#0d7377]" />
                  Visit History
                </CardTitle>
                <CardDescription>
                  All visits and treatment records for this patient
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingPatientVisits ? (
                  <div className="text-center py-10 text-muted-foreground flex items-center justify-center">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Loading visit history...
                  </div>
                ) : patientVisits.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground">
                    <Clock className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No visits recorded yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {patientVisits.map((visit, index) => (
                      <Card
                        key={visit.id}
                        className={`border-l-4 ${
                          visit.status === "completed"
                            ? "border-l-green-500 bg-green-50/50"
                            : "border-l-[#0d7377] bg-[#0d7377]/5"
                        }`}
                      >
                        <CardContent className="py-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-[#0d7377]/10 flex items-center justify-center font-semibold text-[#0d7377]">
                                {patientVisits.length - index}
                              </div>
                              <div>
                                <p className="font-medium">
                                  Visit on {formatDateTime(visit.checkin_time)}
                                </p>
                                <div className="flex items-center gap-2 mt-1">
                                  <Badge
                                    variant="outline"
                                    className={getStageColor(
                                      visit.current_stage,
                                    )}
                                  >
                                    {getStageIcon(visit.current_stage)}
                                    <span className="ml-1 capitalize">
                                      {visit.current_stage}
                                    </span>
                                  </Badge>
                                  <Badge
                                    variant={
                                      visit.status === "completed"
                                        ? "default"
                                        : "secondary"
                                    }
                                  >
                                    {visit.status === "completed"
                                      ? "Completed"
                                      : "In Progress"}
                                  </Badge>
                                </div>
                              </div>
                            </div>
                            {visit.completed_time && (
                              <div className="text-right text-sm text-muted-foreground">
                                <p>Checked out</p>
                                <p className="font-medium">
                                  {formatDateTime(visit.completed_time)}
                                </p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Edit Patient Dialog - Same as before */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="w-[95vw] max-w-6xl h-[92vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-[#0d7377]" />
                Edit Patient Data
              </DialogTitle>
              <DialogDescription>
                Update patient information. Fields from instant registration are
                highlighted.
              </DialogDescription>
            </DialogHeader>

            {editingPatient && (
              <Tabs
                defaultValue="personal"
                className="flex-1 min-h-0 flex flex-col overflow-hidden"
              >
                <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 w-full h-auto gap-1 rounded-none border-b bg-muted/40 p-2 shrink-0">
                  <TabsTrigger value="personal">Personal</TabsTrigger>
                  <TabsTrigger value="family">Family</TabsTrigger>
                  <TabsTrigger value="address">Address</TabsTrigger>
                  <TabsTrigger value="substance">Substance</TabsTrigger>
                  <TabsTrigger value="medical">Medical</TabsTrigger>
                </TabsList>

                <ScrollArea className="flex-1 min-h-0">
                  {/* Personal Tab */}
                  <TabsContent
                    value="personal"
                    className="space-y-4 px-6 pt-4 pb-6 mt-0"
                  >
                    <div className="p-4 rounded-lg border-2 border-[#0d7377]/30 bg-gradient-to-r from-[#0d7377]/5 to-[#14919b]/5">
                      <h4 className="font-semibold mb-4 flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#0d7377]" />
                        Registration Details
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label>File Number</Label>
                          <Input
                            value={editingPatient.file_number}
                            onChange={(e) =>
                              handleEditChange(
                                "file_number",
                                e.target.value,
                              )
                            }
                            className="font-mono"
                          />
                        </div>
                        <div>
                          <Label>HDAMS ID</Label>
                          <Input
                            value={editingPatient.hdams_id || ""}
                            onChange={(e) =>
                              handleEditChange("hdams_id", e.target.value)
                            }
                            className="font-mono"
                          />
                        </div>
                        <div>
                          <Label>Full Name</Label>
                          <Input
                            value={editingPatient.full_name}
                            onChange={(e) =>
                              handleEditChange("full_name", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <Label>Aadhaar Number</Label>
                          <Input
                            value={editingPatient.aadhaar_number || ""}
                            onChange={(e) =>
                              handleEditChange("aadhaar_number", e.target.value)
                            }
                            className="font-mono"
                          />
                        </div>
                        <div>
                          <Label>Date of Birth</Label>
                          <Input
                            type="date"
                            value={editingPatient.date_of_birth}
                            onChange={(e) =>
                              handleEditChange("date_of_birth", e.target.value)
                            }
                          />
                        </div>
                        <div>
                          <Label>Mobile Number</Label>
                          <Input
                            value={editingPatient.phone}
                            onChange={(e) =>
                              handleEditChange("phone", e.target.value)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Gender</Label>
                        <Select
                          value={editingPatient.gender}
                          onValueChange={(v) => handleEditChange("gender", v)}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="male">Male</SelectItem>
                            <SelectItem value="female">Female</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Blood Group</Label>
                        <Select
                          value={editingPatient.blood_group || ""}
                          onValueChange={(v) =>
                            handleEditChange("blood_group", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {BLOOD_GROUP_OPTIONS.map((bg) => (
                              <SelectItem key={bg} value={bg}>
                                {bg}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Nationality</Label>
                        <Select
                          value={editingPatient.nationality || ""}
                          onValueChange={(v) =>
                            handleEditChange("nationality", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {NATIONALITY_OPTIONS.map((n) => (
                              <SelectItem key={n} value={n}>
                                {n}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Religion</Label>
                        <Select
                          value={editingPatient.religion || ""}
                          onValueChange={(v) => handleEditChange("religion", v)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {RELIGION_OPTIONS.map((r) => (
                              <SelectItem key={r} value={r}>
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Education</Label>
                        <Select
                          value={editingPatient.education || ""}
                          onValueChange={(v) =>
                            handleEditChange("education", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(EDUCATION_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Employment Status</Label>
                        <Select
                          value={editingPatient.employment_status || ""}
                          onValueChange={(v) =>
                            handleEditChange("employment_status", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(EMPLOYMENT_STATUS_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Occupation</Label>
                        <Input
                          value={editingPatient.occupation || ""}
                          onChange={(e) =>
                            handleEditChange("occupation", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Monthly Income</Label>
                        <Input
                          value={editingPatient.monthly_income || ""}
                          onChange={(e) =>
                            handleEditChange("monthly_income", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Marital Status</Label>
                        <Select
                          value={editingPatient.marital_status || ""}
                          onValueChange={(v) =>
                            handleEditChange("marital_status", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(MARITAL_STATUS_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  {/* Family Tab */}
                  <TabsContent
                    value="family"
                    className="space-y-4 px-6 pt-4 pb-6 mt-0"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Father&apos;s Name</Label>
                        <Input
                          value={editingPatient.father_name || ""}
                          onChange={(e) =>
                            handleEditChange("father_name", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Mother&apos;s Name</Label>
                        <Input
                          value={editingPatient.mother_name || ""}
                          onChange={(e) =>
                            handleEditChange("mother_name", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Grandfather&apos;s Name</Label>
                        <Input
                          value={editingPatient.grandfather_name || ""}
                          onChange={(e) =>
                            handleEditChange("grandfather_name", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Spouse Name</Label>
                        <Input
                          value={editingPatient.spouse_name || ""}
                          onChange={(e) =>
                            handleEditChange("spouse_name", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Relative Mobile</Label>
                        <Input
                          value={editingPatient.relative_phone || ""}
                          onChange={(e) =>
                            handleEditChange("relative_phone", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>Living Arrangement</Label>
                        <Select
                          value={editingPatient.living_arrangement || ""}
                          onValueChange={(v) =>
                            handleEditChange("living_arrangement", v)
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(LIVING_ARRANGEMENT_LABELS).map(
                              ([key, label]) => (
                                <SelectItem key={key} value={key}>
                                  {label}
                                </SelectItem>
                              ),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Emergency Contact Name</Label>
                        <Input
                          value={editingPatient.emergency_contact_name || ""}
                          onChange={(e) =>
                            handleEditChange(
                              "emergency_contact_name",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label>Emergency Contact Phone</Label>
                        <Input
                          value={editingPatient.emergency_contact_phone || ""}
                          onChange={(e) =>
                            handleEditChange(
                              "emergency_contact_phone",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div>
                        <Label>Relation</Label>
                        <Input
                          value={
                            editingPatient.emergency_contact_relation || ""
                          }
                          onChange={(e) =>
                            handleEditChange(
                              "emergency_contact_relation",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Address Tab */}
                  <TabsContent
                    value="address"
                    className="space-y-4 px-6 pt-4 pb-6 mt-0"
                  >
                    <div>
                      <Label>Full Address</Label>
                      <Textarea
                        value={editingPatient.address || ""}
                        onChange={(e) =>
                          handleEditChange("address", e.target.value)
                        }
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Block/MC</Label>
                        <Input
                          value={editingPatient.block_mc || ""}
                          onChange={(e) =>
                            handleEditChange("block_mc", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>City</Label>
                        <Input
                          value={editingPatient.city || ""}
                          onChange={(e) =>
                            handleEditChange("city", e.target.value)
                          }
                          list="edit-city-suggestions"
                          placeholder={
                            editingPatient.state
                              ? "Type to search city"
                              : "Select state first"
                          }
                          disabled={!editingPatient.state}
                        />
                        <datalist id="edit-city-suggestions">
                          {editingStateCityOptions.map((city) => (
                            <option key={city} value={city} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <Label>District</Label>
                        <Input
                          value={editingPatient.district || ""}
                          onChange={(e) =>
                            handleEditChange("district", e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label>State</Label>
                        <Input
                          value={editingPatient.state || ""}
                          onChange={(e) =>
                            handleEditingStateChange(e.target.value)
                          }
                          list="edit-state-suggestions"
                          placeholder="Type to search state"
                        />
                        <datalist id="edit-state-suggestions">
                          {stateOptions.map((state) => (
                            <option key={state.code} value={state.name} />
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <Label>Pincode</Label>
                        <Input
                          value={editingPatient.pincode || ""}
                          onChange={(e) =>
                            handleEditChange("pincode", e.target.value)
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Substance Tab */}
                  <TabsContent
                    value="substance"
                    className="space-y-4 px-6 pt-4 pb-6 mt-0"
                  >
                    <div>
                      <Label className="mb-3 block">
                        Substances Currently Using
                      </Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.entries(SUBSTANCE_TYPE_LABELS).map(
                          ([key, label]) => (
                            <div
                              key={key}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`current-${key}`}
                                checked={
                                  editingPatient.substance_used_currently?.includes(
                                    key as SubstanceType,
                                  ) || false
                                }
                                onCheckedChange={() =>
                                  handleSubstanceToggle(
                                    "substance_used_currently",
                                    key as SubstanceType,
                                  )
                                }
                              />
                              <label
                                htmlFor={`current-${key}`}
                                className="text-sm"
                              >
                                {label}
                              </label>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                    <Separator />
                    <div>
                      <Label className="mb-3 block">Substances Ever Used</Label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {Object.entries(SUBSTANCE_TYPE_LABELS).map(
                          ([key, label]) => (
                            <div
                              key={key}
                              className="flex items-center space-x-2"
                            >
                              <Checkbox
                                id={`ever-${key}`}
                                checked={
                                  editingPatient.substance_ever_used?.includes(
                                    key as SubstanceType,
                                  ) || false
                                }
                                onCheckedChange={() =>
                                  handleSubstanceToggle(
                                    "substance_ever_used",
                                    key as SubstanceType,
                                  )
                                }
                              />
                              <label
                                htmlFor={`ever-${key}`}
                                className="text-sm"
                              >
                                {label}
                              </label>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                    <Separator />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="inj-ever"
                          checked={editingPatient.injection_use_ever || false}
                          onCheckedChange={(c) =>
                            handleEditChange("injection_use_ever", c)
                          }
                        />
                        <label htmlFor="inj-ever">Injection Use (Ever)</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="inj-current"
                          checked={
                            editingPatient.injection_use_currently || false
                          }
                          onCheckedChange={(c) =>
                            handleEditChange("injection_use_currently", c)
                          }
                        />
                        <label htmlFor="inj-current">
                          Injection Use (Currently)
                        </label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="syringe"
                          checked={editingPatient.syringe_sharing || false}
                          onCheckedChange={(c) =>
                            handleEditChange("syringe_sharing", c)
                          }
                        />
                        <label htmlFor="syringe">Syringe/Needle Sharing</label>
                      </div>
                      <div>
                        <Label>Route of Admission</Label>
                        <Input
                          value={editingPatient.route_of_admission || ""}
                          onChange={(e) =>
                            handleEditChange(
                              "route_of_admission",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                    </div>
                  </TabsContent>

                  {/* Medical Tab */}
                  <TabsContent
                    value="medical"
                    className="space-y-4 px-6 pt-4 pb-6 mt-0"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>STI/STD</Label>
                        <Input
                          value={editingPatient.sti_std || ""}
                          onChange={(e) =>
                            handleEditChange("sti_std", e.target.value)
                          }
                        />
                      </div>
                      <div className="flex items-center space-x-2 pt-6">
                        <Checkbox
                          id="jaundice"
                          checked={editingPatient.jaundice || false}
                          onCheckedChange={(c) =>
                            handleEditChange("jaundice", c)
                          }
                        />
                        <label htmlFor="jaundice">Jaundice</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="sexworker"
                          checked={editingPatient.sex_with_sex_worker || false}
                          onCheckedChange={(c) =>
                            handleEditChange("sex_with_sex_worker", c)
                          }
                        />
                        <label htmlFor="sexworker">Sex with Sex Worker</label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="hiv"
                          checked={editingPatient.hiv_screening || false}
                          onCheckedChange={(c) =>
                            handleEditChange("hiv_screening", c)
                          }
                        />
                        <label htmlFor="hiv">HIV Screening Done</label>
                      </div>
                      {editingPatient.hiv_screening && (
                        <div>
                          <Label>HIV Result</Label>
                          <Input
                            value={editingPatient.hiv_result || ""}
                            onChange={(e) =>
                              handleEditChange("hiv_result", e.target.value)
                            }
                          />
                        </div>
                      )}
                    </div>
                    <Separator />
                    <div>
                      <Label>Co-morbid Medical Illness</Label>
                      <Textarea
                        value={editingPatient.comorbid_medical_illness || ""}
                        onChange={(e) =>
                          handleEditChange(
                            "comorbid_medical_illness",
                            e.target.value,
                          )
                        }
                        rows={2}
                      />
                    </div>
                    <div>
                      <Label>Co-morbid Psychiatric Illness</Label>
                      <Textarea
                        value={
                          editingPatient.comorbid_psychiatric_illness || ""
                        }
                        onChange={(e) =>
                          handleEditChange(
                            "comorbid_psychiatric_illness",
                            e.target.value,
                          )
                        }
                        rows={2}
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label>Previous Drug Treatment</Label>
                        <Input
                          value={editingPatient.previous_drug_treatment || ""}
                          onChange={(e) =>
                            handleEditChange(
                              "previous_drug_treatment",
                              e.target.value,
                            )
                          }
                        />
                      </div>
                      <div className="flex items-center space-x-2 pt-6">
                        <Checkbox
                          id="hospitalized"
                          checked={editingPatient.ever_hospitalized || false}
                          onCheckedChange={(c) =>
                            handleEditChange("ever_hospitalized", c)
                          }
                        />
                        <label htmlFor="hospitalized">
                          Ever Hospitalized for Treatment
                        </label>
                      </div>
                    </div>
                    <div>
                      <Label>Allergies</Label>
                      <Textarea
                        value={editingPatient.allergies || ""}
                        onChange={(e) =>
                          handleEditChange("allergies", e.target.value)
                        }
                        rows={2}
                      />
                    </div>
                  </TabsContent>
                </ScrollArea>
              </Tabs>
            )}

            <DialogFooter className="border-t bg-background px-6 py-4 mt-0 shrink-0">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSavePatient}
                disabled={isSavingPatient}
                className="bg-gradient-to-r from-[#0d7377] to-[#14919b]"
              >
                {isSavingPatient ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSavingPatient ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Patient List View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#0d7377] to-[#14919b] bg-clip-text text-transparent">
            Patient Data
          </h1>
          <p className="text-muted-foreground">
            Click on any patient to view their complete profile and visit
            history
          </p>
        </div>
        <Badge variant="secondary" className="text-lg px-4 py-2">
          {totalPatientsCount} Patients
        </Badge>
      </div>

      {/* Search and Filter */}
      <Card className="border-[#0d7377]/20">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by File No., HDAMS ID, Name, Phone, or Aadhaar..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={`gap-2 ${showFilters ? "bg-[#0d7377]/10 border-[#0d7377]" : ""}`}
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button
              variant="outline"
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className="gap-2"
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortOrder === "asc" ? "A-Z" : "Z-A"}
            </Button>
            <div className="w-[130px]">
              <Select
                value={String(listPageSize)}
                onValueChange={(value) => setListPageSize(Number(value))}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="10">10 / page</SelectItem>
                  <SelectItem value="20">20 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={exportToExcel}
              disabled={isExporting || isLoadingPatients}
              className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {isExporting ? "Exporting..." : "Export Excel"}
            </Button>
          </div>

          {/* Filters Panel */}
          {showFilters && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-sm text-muted-foreground">
                  Filter Options
                </h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="gap-1 h-8"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              </div>
              <div className="grid grid-cols-5 gap-4">
                <div>
                  <Label className="text-xs">District</Label>
                  <Select
                    value={filterDistrict}
                    onValueChange={setFilterDistrict}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Districts</SelectItem>
                      {uniqueDistricts.map((district) => (
                        <SelectItem key={district} value={district}>
                          {district}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">State</Label>
                  <Select value={filterState} onValueChange={setFilterState}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {stateOptions.map((state) => (
                        <SelectItem key={state.code} value={state.name}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Addiction Type</Label>
                  <Select
                    value={filterAddictionType}
                    onValueChange={setFilterAddictionType}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="alcohol">Alcohol</SelectItem>
                      <SelectItem value="drugs">Drugs</SelectItem>
                      <SelectItem value="tobacco">Tobacco</SelectItem>
                      <SelectItem value="gambling">Gambling</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Reg. Date From</Label>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Reg. Date To</Label>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Patient Cards Grid */}
      <div className="grid gap-3">
        {isLoadingPatients ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground flex items-center justify-center">
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Loading patients...
            </CardContent>
          </Card>
        ) : filteredPatients.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-10 text-center text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No patients found</p>
            </CardContent>
          </Card>
        ) : (
          filteredPatients.map((patient) => (
            <Card
              key={patient.id}
              className="cursor-pointer hover:border-[#0d7377]/50 hover:shadow-md transition-all group"
              onClick={() => handleSelectPatient(patient)}
            >
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  {/* Photo */}
                  {patient.photo_url ? (
                    <Image
                      src={patient.photo_url}
                      alt={patient.full_name}
                      width={50}
                      height={50}
                      className="rounded-full object-cover border-2 border-[#0d7377]/20"
                    />
                  ) : (
                    <div className="w-[50px] h-[50px] rounded-full bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 flex items-center justify-center border-2 border-[#0d7377]/20">
                      <User className="h-6 w-6 text-[#0d7377]" />
                    </div>
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">
                        {patient.full_name}
                      </span>
                      <Badge
                        variant={
                          patient.status === "active" ? "default" : "secondary"
                        }
                        className={
                          patient.status === "active"
                            ? "bg-green-100 text-green-700"
                            : ""
                        }
                      >
                        {patient.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="font-mono text-[#0d7377]">
                        {patient.file_number}
                      </span>
                      <span className="font-mono text-[#14919b]">
                        {patient.hdams_id
                          ? `HDAMS: ${patient.hdams_id}`
                          : "HDAMS: N/A"}
                      </span>
                      <span>
                        {getAge(patient.date_of_birth)} yrs /{" "}
                        {patient.gender?.charAt(0).toUpperCase()}
                      </span>
                      <span>{patient.phone}</span>
                    </div>
                  </div>

                  {/* Arrow */}
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-[#0d7377] transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Pagination Controls */}
      <Card className="border-[#0d7377]/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Showing {pageStart}-{pageEnd} of {totalPatientsCount}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setListPage((prev) => Math.max(1, prev - 1))}
                disabled={listPage <= 1 || isLoadingPatients}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {listPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setListPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={listPage >= totalPages || isLoadingPatients}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
