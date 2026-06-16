import { apiRequest } from "./api-client";

// HR staff/employee directory — standalone, admin-only. NOT linked to the
// auth User model. See API_BLUEPRINT §8.x (staff).

export type EmploymentType = "permanent" | "locum" | "contract";
export type StaffGender = "male" | "female" | "other" | "";

export interface Designation {
  id: string;
  name: string;
  is_active: boolean;
}

// List item — sensitive identifiers are masked server-side (last 4 only);
// salary / IFSC / address are omitted from the list payload entirely.
export interface StaffListItem {
  id: string;
  staff_code: string;
  full_name: string;
  designation: string;
  designation_id: string;
  employment_type: EmploymentType;
  is_active: boolean;
  joined_date: string | null;
  date_of_birth: string | null;
  gender: StaffGender;
  mobile_number: string;
  email: string;
  photo_url: string | null;
  gov_registration: string;
  aadhaar_number: string; // masked (•••• tail)
  pan_number: string; // masked
  bank_account_number: string; // masked
  holiday_allowed: number;
  sunday_holiday: boolean;
  created_at: string;
  updated_at: string;
}

// Detail — full sensitive fields (admin-only view).
export interface StaffDetail extends StaffListItem {
  address: string;
  bank_ifsc: string;
  monthly_salary: string;
}

export interface StaffWritePayload {
  staff_code: string;
  full_name: string;
  designation: string; // name; backend get-or-creates new titles
  employment_type: EmploymentType;
  is_active?: boolean;
  joined_date?: string | null;
  date_of_birth?: string | null;
  gender?: StaffGender;
  mobile_number?: string;
  email?: string;
  address?: string;
  gov_registration?: string;
  aadhaar_number?: string;
  pan_number?: string;
  bank_account_number?: string;
  bank_ifsc?: string;
  monthly_salary?: string | number;
  holiday_allowed?: number;
  sunday_holiday?: boolean;
  // Optional profile photo (base64 + mime), sent together. Mirrors the patient
  // photo upload contract — keeps create/update JSON.
  photo_base64?: string;
  photo_mime_type?: string;
}

// Directory-wide KPI aggregate for the staff console cards (admin-only).
export interface StaffSummary {
  total: number;
  active: number;
  inactive: number;
  by_designation: Record<string, number>;
}

export async function getStaffSummary(): Promise<StaffSummary> {
  return apiRequest<StaffSummary>("/api/v1/staff/summary/", {});
}

export interface StaffListResponse {
  items: StaffListItem[];
  pagination: { page: number; pageSize: number; total: number };
}

export async function listStaff(options?: {
  q?: string;
  designation?: string;
  status?: "active" | "inactive";
  page?: number;
  pageSize?: number;
}): Promise<StaffListResponse> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  if (options?.designation) params.set("designation", options.designation);
  if (options?.status) params.set("status", options.status);
  if (options?.page) params.set("page", String(options.page));
  if (options?.pageSize) params.set("pageSize", String(options.pageSize));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<StaffListResponse>(`/api/v1/staff/${suffix}`, {});
}

export async function getStaff(staffId: string): Promise<StaffDetail> {
  return apiRequest<StaffDetail>(`/api/v1/staff/${staffId}/`, {});
}

export async function createStaff(
  payload: StaffWritePayload,
): Promise<StaffDetail> {
  return apiRequest<StaffDetail>("/api/v1/staff/", {
    method: "POST",
    body: payload,
  });
}

export async function updateStaff(
  staffId: string,
  payload: Partial<StaffWritePayload>,
): Promise<StaffDetail> {
  return apiRequest<StaffDetail>(`/api/v1/staff/${staffId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deactivateStaff(
  staffId: string,
): Promise<{ deactivated: boolean; staff_id: string; is_active: boolean }> {
  return apiRequest(`/api/v1/staff/${staffId}/`, { method: "DELETE" });
}

export async function listDesignations(): Promise<{ items: Designation[] }> {
  return apiRequest<{ items: Designation[] }>(
    "/api/v1/staff/designations/",
    {},
  );
}

// ── Attendance ──
export type AttendanceStatus = "present" | "absent" | "half_day";

export interface AttendanceRosterItem {
  staff_id: string;
  staff_code: string;
  full_name: string;
  designation: string;
  status: AttendanceStatus | null;
}

// Per-day submission/lock marker. Present once a day has been submitted
// (typically by reception). Records who submitted it and their auth role.
export interface AttendanceDaySubmission {
  submitted_by_name: string;
  submitted_by_role: string;
  submitted_at: string;
}

export interface AttendanceRosterResponse {
  date: string;
  items: AttendanceRosterItem[];
  submission: AttendanceDaySubmission | null;
  // Reception: true only if the day isn't locked yet. Admin: always true.
  can_submit: boolean;
}

export async function getAttendanceRoster(
  date: string,
): Promise<AttendanceRosterResponse> {
  return apiRequest<AttendanceRosterResponse>(
    `/api/v1/staff/attendance/?date=${encodeURIComponent(date)}`,
    {},
  );
}

export async function bulkMarkAttendance(
  date: string,
  entries: { staff_id: string; status: AttendanceStatus }[],
): Promise<{
  date: string;
  marked: number;
  submission: AttendanceDaySubmission | null;
}> {
  return apiRequest<{
    date: string;
    marked: number;
    submission: AttendanceDaySubmission | null;
  }>("/api/v1/staff/attendance/", {
    method: "POST",
    body: { date, entries },
  });
}

export interface MonthAttendance {
  year: number;
  month: number;
  by_date: Record<string, AttendanceStatus>;
  stats: {
    present: number;
    absent: number;
    half_day: number;
    marked_days: number;
    effective_present: number;
    effective_absent: number;
  };
}

export async function getStaffMonthAttendance(
  staffId: string,
  month: string, // YYYY-MM
): Promise<MonthAttendance> {
  return apiRequest<MonthAttendance>(
    `/api/v1/staff/${staffId}/attendance/?month=${encodeURIComponent(month)}`,
    {},
  );
}

export async function markStaffAttendance(
  staffId: string,
  date: string,
  status: AttendanceStatus,
): Promise<{ updated: boolean }> {
  return apiRequest<{ updated: boolean }>(
    `/api/v1/staff/${staffId}/attendance/`,
    { method: "PATCH", body: { date, status } },
  );
}

// ── Payroll / Payslips ──

// Computed (preview) breakdown for a month — derived from salary + attendance.
// Decimal fields arrive as strings; whole-number fields as numbers.
export interface PayrollPreview {
  year: number;
  month: number;
  monthly_salary: string;
  days_in_month: number;
  sundays_in_month: number;
  sunday_holiday: boolean;
  holiday_allowed: number;
  present_days: string;
  absent_days: string;
  half_days: number;
  paid_leave_used: string;
  unpaid_absent: string;
  per_day_rate: string;
  deduction: string;
  net_pay: string;
  marked_days: number;
}

// Stored snapshot (audit). Mirrors PayrollPreview plus identity + provenance.
export interface Payslip {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_code: string;
  designation: string;
  year: number;
  month: number;
  monthly_salary: string;
  days_in_month: number;
  sundays_in_month: number;
  sunday_holiday: boolean;
  holiday_allowed: number;
  present_days: string;
  absent_days: string;
  half_days: number;
  paid_leave_used: string;
  unpaid_absent: string;
  per_day_rate: string;
  deduction: string;
  net_pay: string;
  generated_at: string;
  generated_by_name: string;
}

export async function getStaffPayroll(
  staffId: string,
  month: string, // YYYY-MM
): Promise<PayrollPreview> {
  return apiRequest<PayrollPreview>(
    `/api/v1/staff/${staffId}/payroll/?month=${encodeURIComponent(month)}`,
    {},
  );
}

export async function listStaffPayslips(
  staffId: string,
): Promise<{ items: Payslip[] }> {
  return apiRequest<{ items: Payslip[] }>(
    `/api/v1/staff/${staffId}/payslips/`,
    {},
  );
}

export async function generateStaffPayslip(
  staffId: string,
  month: string, // YYYY-MM
): Promise<Payslip> {
  return apiRequest<Payslip>(`/api/v1/staff/${staffId}/payslips/`, {
    method: "POST",
    body: { month },
  });
}
