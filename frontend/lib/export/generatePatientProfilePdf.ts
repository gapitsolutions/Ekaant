import { jsPDF } from "jspdf";
import {
  loadLogoBase64,
  addPdfHeader,
  addSectionTitle,
  addField,
  checkPageBreak,
  downloadPdf,
} from "./pdf-helpers";
import { HOSPITAL_PRIMARY_COLOR } from "./hospital-branding";
import {
  EMPLOYMENT_STATUS_LABELS,
  EDUCATION_LABELS,
  MARITAL_STATUS_LABELS,
  LIVING_ARRANGEMENT_LABELS,
  SUBSTANCE_TYPE_LABELS,
} from "@/lib/types";
import type { Patient, Visit } from "@/lib/types";

function fmtDate(d: string | undefined): string {
  if (!d) return "N/A";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getAge(dob: string): string {
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
  return `${age} years`;
}

function buildAddress(p: Patient): string {
  const parts = [p.address, p.block_mc, p.city, p.district, p.state, p.pincode].filter(Boolean);
  return parts.join(", ") || "N/A";
}

export async function generatePatientProfilePdf(
  patient: Patient,
  visits: Visit[],
): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await loadLogoBase64();
  const pageWidth = doc.internal.pageSize.getWidth();
  const col2x = pageWidth / 2;

  let y = addPdfHeader(doc, logo, { subtitle: "Patient Profile Report" });

  // ── Patient Identity ──
  y = addSectionTitle(doc, "Patient Information", y);

  y = addField(doc, "Full Name", patient.full_name, 14, y);
  const row1y = y;
  addField(doc, "File Number", patient.file_number, 14, y);
  y = addField(doc, "HDAMS ID", patient.hdams_id || "N/A", col2x, row1y);

  const row2y = y;
  addField(doc, "Age / Gender", `${getAge(patient.date_of_birth)} / ${patient.gender?.charAt(0).toUpperCase() + patient.gender?.slice(1)}`, 14, y);
  y = addField(doc, "Date of Birth", fmtDate(patient.date_of_birth), col2x, row2y);

  const row3y = y;
  addField(doc, "Mobile", patient.phone || "N/A", 14, y);
  y = addField(doc, "Relative Mobile", patient.relative_phone || "N/A", col2x, row3y);

  const row4y = y;
  addField(doc, "Registration Date", fmtDate(patient.registration_date), 14, y);
  y = addField(doc, "Status", patient.status?.replace("_", " ")?.toUpperCase() || "N/A", col2x, row4y);

  y = addField(doc, "Address", buildAddress(patient), 14, y);

  y = checkPageBreak(doc, y);

  // ── Demographics ──
  y = addSectionTitle(doc, "Demographics", y);

  const d1y = y;
  addField(doc, "Blood Group", patient.blood_group || "N/A", 14, y);
  y = addField(doc, "Nationality", patient.nationality || "N/A", col2x, d1y);

  const d2y = y;
  addField(doc, "Religion", patient.religion || "N/A", 14, y);
  y = addField(doc, "Education", patient.education ? EDUCATION_LABELS[patient.education] : "N/A", col2x, d2y);

  const d3y = y;
  addField(doc, "Employment", patient.employment_status ? EMPLOYMENT_STATUS_LABELS[patient.employment_status] : "N/A", 14, y);
  y = addField(doc, "Occupation", patient.occupation || "N/A", col2x, d3y);

  const d4y = y;
  addField(doc, "Marital Status", patient.marital_status ? MARITAL_STATUS_LABELS[patient.marital_status] : "N/A", 14, y);
  y = addField(doc, "Living Arrangement", patient.living_arrangement ? LIVING_ARRANGEMENT_LABELS[patient.living_arrangement] : "N/A", col2x, d4y);

  y = checkPageBreak(doc, y);

  // ── Family ──
  y = addSectionTitle(doc, "Family Details", y);

  const f1y = y;
  addField(doc, "Father's Name", patient.father_name || "N/A", 14, y);
  y = addField(doc, "Mother's Name", patient.mother_name || "N/A", col2x, f1y);

  const f2y = y;
  addField(doc, "Spouse Name", patient.spouse_name || "N/A", 14, y);
  y = addField(doc, "Grandfather's Name", patient.grandfather_name || "N/A", col2x, f2y);

  y = checkPageBreak(doc, y);

  // ── Emergency Contact ──
  y = addSectionTitle(doc, "Emergency Contact", y);

  const e1y = y;
  addField(doc, "Contact Name", patient.emergency_contact_name || "N/A", 14, y);
  y = addField(doc, "Phone", patient.emergency_contact_phone || "N/A", col2x, e1y);

  y = addField(doc, "Relation", patient.emergency_contact_relation || "N/A", 14, y);

  y = checkPageBreak(doc, y);

  // ── Substance Use ──
  y = addSectionTitle(doc, "Substance Use History", y);

  const currentSubs = patient.substance_used_currently
    ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
    .join(", ") || "None specified";
  const everSubs = patient.substance_ever_used
    ?.map((s) => SUBSTANCE_TYPE_LABELS[s])
    .join(", ") || "None specified";

  y = addField(doc, "Currently Using", currentSubs, 14, y);
  y = addField(doc, "Ever Used", everSubs, 14, y);

  const s1y = y;
  addField(doc, "Injection Use (Ever)", patient.injection_use_ever ? "Yes" : "No", 14, y);
  y = addField(doc, "Injection Use (Currently)", patient.injection_use_currently ? "Yes" : "No", col2x, s1y);

  const s2y = y;
  addField(doc, "Syringe Sharing", patient.syringe_sharing ? "Yes" : "No", 14, y);
  y = addField(doc, "Route of Admission", patient.route_of_admission || "N/A", col2x, s2y);

  y = checkPageBreak(doc, y);

  // ── Medical History ──
  y = addSectionTitle(doc, "Medical History", y);

  const m1y = y;
  addField(doc, "STI/STD", patient.sti_std || "N/A", 14, y);
  y = addField(doc, "Jaundice", patient.jaundice ? "Yes" : "No", col2x, m1y);

  const m2y = y;
  addField(doc, "HIV Screening", patient.hiv_screening ? "Yes" : "No", 14, y);
  y = addField(doc, "HIV Result", patient.hiv_result || "N/A", col2x, m2y);

  y = addField(doc, "Co-morbid Medical Illness", patient.comorbid_medical_illness || "N/A", 14, y);
  y = addField(doc, "Co-morbid Psychiatric Illness", patient.comorbid_psychiatric_illness || "N/A", 14, y);
  y = addField(doc, "Allergies", patient.allergies || "N/A", 14, y);

  y = checkPageBreak(doc, y);

  // ── Visit Summary ──
  if (visits.length > 0) {
    y = addSectionTitle(doc, `Visit Summary (${visits.length} visits)`, y);

    // Table header
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.setTextColor("#64748b");
    doc.text("#", 14, y);
    doc.text("Date", 24, y);
    doc.text("Check-in", 60, y);
    doc.text("Stage", 110, y);
    doc.text("Status", 150, y);
    y += 3;
    doc.setDrawColor("#e2e8f0");
    doc.setLineWidth(0.2);
    doc.line(14, y, pageWidth - 14, y);
    y += 4;

    doc.setFont("helvetica", "normal");
    doc.setTextColor("#1e293b");

    const recentVisits = visits.slice(0, 20); // Show last 20
    for (let i = 0; i < recentVisits.length; i++) {
      y = checkPageBreak(doc, y, 15);
      const v = recentVisits[i];
      doc.setFontSize(8);
      doc.text(`${i + 1}`, 14, y);
      doc.text(fmtDate(v.visit_date), 24, y);
      doc.text(
        v.checkin_time
          ? new Date(v.checkin_time).toLocaleTimeString("en-IN", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "—",
        60,
        y,
      );
      doc.text(v.current_stage || "—", 110, y);
      doc.text(v.status === "completed" ? "Completed" : "In Progress", 150, y);
      y += 5;
    }

    if (visits.length > 20) {
      y += 2;
      doc.setFontSize(7);
      doc.setTextColor("#94a3b8");
      doc.text(`... and ${visits.length - 20} more visits`, 14, y);
      y += 5;
    }
  }

  // ── Footer ──
  y = checkPageBreak(doc, y, 15);
  y += 5;
  doc.setDrawColor(HOSPITAL_PRIMARY_COLOR);
  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont("helvetica", "italic");
  doc.setTextColor("#94a3b8");
  doc.text(
    `Generated on ${new Date().toLocaleString("en-IN")} | Confidential Medical Record`,
    14,
    y,
  );

  downloadPdf(doc, `patient-profile-${patient.file_number}.pdf`);
}
