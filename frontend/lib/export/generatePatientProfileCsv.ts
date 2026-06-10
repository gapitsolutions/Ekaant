import {
  EMPLOYMENT_STATUS_LABELS,
  EDUCATION_LABELS,
  MARITAL_STATUS_LABELS,
  LIVING_ARRANGEMENT_LABELS,
  SUBSTANCE_TYPE_LABELS,
} from "@/lib/types";
import type { Patient } from "@/lib/types";

function fmtDate(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(value: string | undefined): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtAadhaar(value: string | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 12) return value;
  return `${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(8, 12)}`;
}

function fmtAge(dob: string): string {
  if (!dob) return "";
  const today = new Date();
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) return "";
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return String(age);
}

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Single-patient profile CSV — horizontal layout.
 *
 * One header row + one data row. Column set is a strict superset of the
 * bulk patient list export (``exportToExcel`` on the patient list page) so
 * a profile CSV can be opened next to a bulk CSV without confusing the
 * reader.
 *
 * Deliberately excluded (decided 2026-06-10):
 *   - ``photo_url`` (just a text URL; no photo in the spreadsheet)
 *   - ``fingerprint_template`` (binary blob; sensitive)
 *   - ``id`` (internal UUID; ``file_number`` is the human identifier)
 *   - ``email`` (always blank in the current data model)
 *   - Visit history (one-to-many; doesn't fit a single row — use the PDF
 *     or the list-page exports for that)
 */
export function generatePatientProfileCsv(patient: Patient): void {
  const columns: { label: string; value: string }[] = [
    { label: "File Number", value: patient.file_number || "" },
    { label: "HDAMS ID", value: patient.hdams_id || "" },
    { label: "Patient Category", value: patient.patient_category || "" },
    { label: "Full Name", value: patient.full_name || "" },
    { label: "Aadhaar Number", value: fmtAadhaar(patient.aadhaar_number) },
    { label: "Date of Birth", value: fmtDate(patient.date_of_birth) },
    { label: "Age", value: fmtAge(patient.date_of_birth) },
    { label: "Gender", value: patient.gender || "" },
    { label: "Phone", value: patient.phone || "" },
    { label: "Relative Phone", value: patient.relative_phone || "" },
    { label: "Address", value: patient.address || "" },
    { label: "Block / MC", value: patient.block_mc || "" },
    { label: "City", value: patient.city || "" },
    { label: "District", value: patient.district || "" },
    { label: "State", value: patient.state || "" },
    { label: "Pincode", value: patient.pincode || "" },
    { label: "Father Name", value: patient.father_name || "" },
    { label: "Mother Name", value: patient.mother_name || "" },
    { label: "Grandfather Name", value: patient.grandfather_name || "" },
    { label: "Spouse Name", value: patient.spouse_name || "" },
    { label: "Blood Group", value: patient.blood_group || "" },
    { label: "Religion", value: patient.religion || "" },
    { label: "Nationality", value: patient.nationality || "" },
    {
      label: "Education",
      value: patient.education ? EDUCATION_LABELS[patient.education] : "",
    },
    { label: "Occupation", value: patient.occupation || "" },
    {
      label: "Employment Status",
      value: patient.employment_status
        ? EMPLOYMENT_STATUS_LABELS[patient.employment_status]
        : "",
    },
    {
      label: "Marital Status",
      value: patient.marital_status
        ? MARITAL_STATUS_LABELS[patient.marital_status]
        : "",
    },
    { label: "Monthly Income", value: patient.monthly_income || "" },
    {
      label: "Living Arrangement",
      value: patient.living_arrangement
        ? LIVING_ARRANGEMENT_LABELS[patient.living_arrangement]
        : "",
    },
    { label: "Addiction Type", value: patient.addiction_type || "" },
    { label: "Addiction Duration", value: patient.addiction_duration || "" },
    {
      label: "Substances Used Currently",
      value:
        patient.substance_used_currently
          ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
          .join("; ") || "",
    },
    {
      label: "Substances Ever Used",
      value:
        patient.substance_ever_used
          ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
          .join("; ") || "",
    },
    {
      label: "Injection Use (Ever)",
      value: patient.injection_use_ever ? "Yes" : "No",
    },
    {
      label: "Injection Use (Currently)",
      value: patient.injection_use_currently ? "Yes" : "No",
    },
    { label: "Route of Admission", value: patient.route_of_admission || "" },
    { label: "Syringe Sharing", value: patient.syringe_sharing ? "Yes" : "No" },
    {
      label: "Sex with Sex Worker",
      value: patient.sex_with_sex_worker ? "Yes" : "No",
    },
    { label: "STI / STD", value: patient.sti_std || "" },
    { label: "Jaundice", value: patient.jaundice ? "Yes" : "No" },
    { label: "HIV Screening", value: patient.hiv_screening ? "Yes" : "No" },
    { label: "HIV Result", value: patient.hiv_result || "" },
    {
      label: "Co-morbid Medical Illness",
      value: patient.comorbid_medical_illness || "",
    },
    {
      label: "Co-morbid Psychiatric Illness",
      value: patient.comorbid_psychiatric_illness || "",
    },
    {
      label: "Previous Drug Treatment",
      value: patient.previous_drug_treatment || "",
    },
    {
      label: "Ever Hospitalized",
      value: patient.ever_hospitalized ? "Yes" : "No",
    },
    { label: "Family History", value: patient.family_history || "" },
    { label: "Medical History", value: patient.medical_history || "" },
    { label: "Allergies", value: patient.allergies || "" },
    { label: "Current Medications", value: patient.current_medications || "" },
    { label: "Previous Treatments", value: patient.previous_treatments || "" },
    {
      label: "Emergency Contact Name",
      value: patient.emergency_contact_name || "",
    },
    {
      label: "Emergency Contact Phone",
      value: patient.emergency_contact_phone || "",
    },
    {
      label: "Emergency Contact Relation",
      value: patient.emergency_contact_relation || "",
    },
    { label: "Status", value: patient.status || "" },
    { label: "Registration Date", value: fmtDate(patient.registration_date) },
    { label: "First Visit Date", value: fmtDate(patient.first_visit_date) },
    { label: "Created At", value: fmtDateTime(patient.created_at) },
    { label: "Updated At", value: fmtDateTime(patient.updated_at) },
  ];

  const csv = [
    columns.map((c) => escapeCsvCell(c.label)).join(","),
    columns.map((c) => escapeCsvCell(c.value)).join(","),
  ].join("\r\n");

  // ``﻿`` BOM keeps Excel happy with UTF-8 (Devanagari, accents).
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `patient-profile-${patient.file_number || patient.id}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
