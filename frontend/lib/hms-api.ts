import { apiRequest } from "./api-client";
import type { PatientCategory, PatientStatus } from "./types";
import type { VerificationMethod } from "./verification-methods";

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  role: "admin" | "reception" | "counsellor" | "doctor" | "pharmacist" | string;
}

export interface LoginResponse {
  expires_in: number;
  user: AuthUser;
}

export interface SessionResponse {
  expires_in: number;
  user: AuthUser;
}

export interface PatientLookupResponse {
  patient_id: string;
  file_number: string;
  photo_url?: string | null;
  hdams_id?: string | null;
  patient_category?: PatientCategory;
  full_name: string;
  father_name?: string | null;
  phone_number: string;
  aadhaar_number_last4?: string | null;
  phone?: string;
  date_of_birth: string;
  sex: "male" | "female" | "other";
  gender?: "male" | "female" | "other";
  status: PatientStatus;
  outstanding_debt: number;
  address_line1?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  relative_phone?: string | null;
  district?: string | null;
  state?: string | null;
  addiction_type?: string | null;
  registration_date?: string | null;
  addiction_duration_text?: string | null;
  addiction_duration?: string | null;
  next_followup_date?: string | null;
  fingerprint_reenrollment_required?: boolean;
  [key: string]: unknown;
}

export interface PatientLookupListResponse {
  items: PatientLookupResponse[];
  total: number;
}

export interface PatientSummaryResponse {
  patient_id: string;
  file_number: string;
  hdams_id?: string | null;
  full_name: string;
  phone_number: string;
  date_of_birth: string;
  sex: "male" | "female" | "other";
  status: PatientStatus;
  photo_url?: string | null;
}

export interface PatientSummaryListResponse {
  items: PatientSummaryResponse[];
  pagination?: { page: number; pageSize: number; total: number };
}

export interface FingerprintTemplateResponse {
  patient_id: string;
  fingerprint_template: string;
  fingerprint_enrolled_at?: string | null;
  fingerprint_template_key_version?: string | null;
}

type RegisterPatientTier1Payload = {
  patient_category: PatientCategory;
  file_number: string;
  full_name: string;
  phone_number: string;
  date_of_birth: string;
  sex: "male" | "female" | "other";
  fingerprint_template?: string;
  aadhaar_number?: string;
  relative_phone: string;
  address_line1: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  photo_base64?: string;
  photo_mime_type?: string;
};

export interface CheckinResponse {
  session_id: string;
  patient_id: string;
  patient_name: string;
  checked_in_by_name: string;
  checked_in_at: string;
  status: "completed";
  current_stage?: "completed";
  completed_at?: string;
  outstanding_debt_at_checkin: number;
  verification_method?: VerificationMethod;
  verification_photo_captured_at?: string;
}

export interface CheckinRequestPayload {
  patient_id: string;
  verification_method?: VerificationMethod;
  verification_photo_base64?: string;
  verification_photo_mime_type?: string;
  verification_photo_captured_at?: string;
}

export interface PatientGeneralData {
  date_of_birth?: string;
  sex?: "male" | "female" | "other";
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
}

export interface PatientDetailResponse extends PatientGeneralData {
  patient_id: string;
  file_number?: string;
  hdams_id?: string;
  patient_category?: PatientCategory;
  full_name: string;
  phone_number: string;
  aadhaar_number?: string;
  phone?: string;
  gender?: "male" | "female" | "other";
  status: PatientStatus;
  address_line1?: string;
  photo_url?: string | null;
  relative_phone?: string;
  registration_date?: string;
  mother_name?: string;
  father_name?: string;
  grandfather_name?: string;
  spouse_name?: string;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  monthly_income?: string;
  occupation?: string;
  employment_status?: string;
  education?: string;
  marital_status?: string;
  block_mc?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  living_arrangement?: string;
  substance_used_currently?: string[];
  substance_ever_used?: string[];
  injection_use_ever?: boolean;
  injection_use_currently?: boolean;
  route_of_admission?: string;
  syringe_sharing?: boolean;
  sti_std?: string;
  jaundice?: boolean;
  sex_with_sex_worker?: boolean;
  hiv_screening?: boolean;
  hiv_result?: string;
  comorbid_medical_illness?: string;
  comorbid_psychiatric_illness?: string;
  previous_drug_treatment?: string;
  ever_hospitalized?: boolean;
  addiction_type?: string;
  addiction_duration?: string;
  first_visit_date?: string;
  emergency_contact_relation?: string;
  family_history?: string;
  medical_history?: string;
  allergies?: string;
  current_medications?: string;
  previous_treatments?: string;
  created_at?: string;
  updated_at?: string;
  has_fingerprint?: boolean;
  last_visit_date?: string;
  days_since_last_visit?: number;
  general_data_complete?: boolean;
  next_followup_date?: string | null;
}

export interface PatientVisitHistoryItemResponse {
  id: string;
  visit_uid: string;
  visit_date: string;
  visit_type: string;
  checkin_time: string;
  completed_time?: string | null;
  status: "in_progress" | "completed" | "cancelled";
  current_stage: "counsellor" | "doctor" | "pharmacy" | "completed";
  medicines_total: number;
}

export interface DeletePatientResponse {
  deleted: boolean;
  patient_id: string;
}

export interface PatientProfileUpdatePayload {
  hdams_id?: string;
  full_name?: string;
  aadhaar_number?: string;
  date_of_birth?: string;
  phone_number?: string;
  sex?: "male" | "female" | "other";
  blood_group?: string;
  nationality?: string;
  religion?: string;
  education?: string;
  employment_status?: string;
  occupation?: string;
  monthly_income?: string;
  marital_status?: string;
  father_name?: string;
  mother_name?: string;
  grandfather_name?: string;
  spouse_name?: string;
  relative_phone?: string;
  living_arrangement?: string;
  address_line1?: string;
  block_mc?: string;
  city?: string;
  district?: string;
  state?: string;
  pincode?: string;
  substance_used_currently?: string[];
  substance_ever_used?: string[];
  injection_use_ever?: boolean;
  injection_use_currently?: boolean;
  route_of_admission?: string;
  syringe_sharing?: boolean;
  sti_std?: string;
  jaundice?: boolean;
  sex_with_sex_worker?: boolean;
  hiv_screening?: boolean;
  hiv_result?: string;
  comorbid_medical_illness?: string;
  comorbid_psychiatric_illness?: string;
  previous_drug_treatment?: string;
  ever_hospitalized?: boolean;
  addiction_type?: string;
  addiction_duration?: string;
  family_history?: string;
  medical_history?: string;
  allergies?: string;
  current_medications?: string;
  previous_treatments?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
  status?: PatientStatus;
  registration_date?: string;
  first_visit_date?: string;
  fingerprint_template?: string;
  fingerprint_template_key_version?: string;
  photo_base64?: string;
  photo_mime_type?: string;
}

function unwrapNestedData<T>(
  payload: { data?: T } | T | null | undefined,
): T | null {
  if (!payload) return null;
  if (typeof payload === "object" && "data" in payload) {
    return (payload as { data?: T }).data ?? null;
  }
  return payload as T;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/api/v1/auth/login/", {
    method: "POST",
    body: { email, password },
    retryOn401: false,
    suppressAuthRedirect: true,
  });
}

export async function getSession(): Promise<SessionResponse> {
  return apiRequest<SessionResponse>("/api/v1/auth/session/", {
    retryOn401: false,
    suppressAuthRedirect: true,
  });
}

export async function logout(): Promise<{ logged_out: boolean }> {
  return apiRequest<{ logged_out: boolean }>("/api/v1/auth/logout/", {
    method: "POST",
    suppressAuthRedirect: true,
  });
}

export async function registerPatientTier1(
  payloadOrToken: RegisterPatientTier1Payload | string,
  maybePayload?: RegisterPatientTier1Payload,
): Promise<PatientLookupResponse> {
  const payload =
    typeof payloadOrToken === "string" ? maybePayload : payloadOrToken;
  return apiRequest<PatientLookupResponse>("/api/v1/patients/register/", {
    method: "POST",
    body: payload,
  });
}

export async function lookupPatient(
  queryOrToken: { q?: string; file_number?: string } | string,
  maybeQuery?: { q?: string; file_number?: string },
): Promise<PatientLookupListResponse> {
  const query =
    typeof queryOrToken === "string" ? (maybeQuery ?? {}) : queryOrToken;
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.file_number) params.set("file_number", query.file_number);
  return apiRequest<PatientLookupListResponse>(
    `/api/v1/patients/lookup/?${params.toString()}`,
    {},
  );
}

export async function checkinPatient(
  patientOrToken: string | CheckinRequestPayload,
  maybePatientIdOrPayload?: string | CheckinRequestPayload,
): Promise<CheckinResponse> {
  let payload: CheckinRequestPayload;

  if (typeof patientOrToken === "object") {
    payload = patientOrToken;
  } else if (typeof maybePatientIdOrPayload === "object") {
    payload = maybePatientIdOrPayload;
  } else {
    payload = { patient_id: maybePatientIdOrPayload ?? patientOrToken };
  }

  return apiRequest<CheckinResponse>("/api/v1/sessions/checkin/", {
    method: "POST",
    body: payload,
  });
}

export async function getPatientFingerprintTemplate(
  patientIdOrToken: string,
  maybePatientId?: string,
): Promise<FingerprintTemplateResponse> {
  const patientId = maybePatientId ?? patientIdOrToken;
  return apiRequest<FingerprintTemplateResponse>(
    `/api/v1/patients/${patientId}/fingerprint-template/`,
    {},
  );
}

export async function getPatientById(
  patientIdOrToken: string,
  maybePatientId?: string,
): Promise<PatientDetailResponse> {
  const patientId = maybePatientId ?? patientIdOrToken;
  const response = await apiRequest<
    PatientDetailResponse | { data?: PatientDetailResponse }
  >(`/api/v1/patients/${patientId}/`, {});

  const unwrapped = unwrapNestedData(response);
  if (unwrapped) return unwrapped;

  return {
    patient_id: patientId,
    full_name: "",
    phone_number: "",
    status: "active",
  };
}

export async function updatePatientGeneralData(
  patientIdOrToken: string,
  dataOrPatientId: Partial<PatientGeneralData> | string,
  maybeData?: Partial<PatientGeneralData>,
): Promise<PatientDetailResponse> {
  const patientId =
    typeof dataOrPatientId === "string" ? dataOrPatientId : patientIdOrToken;
  const data =
    typeof dataOrPatientId === "string" ? maybeData : dataOrPatientId;

  const response = await apiRequest<
    PatientDetailResponse | { data?: PatientDetailResponse }
  >(`/api/v1/patients/${patientId}/general/`, {
    method: "PATCH",
    body: data,
  });

  const unwrapped = unwrapNestedData(response);
  if (unwrapped) return unwrapped;

  return {
    patient_id: patientId,
    full_name: "",
    phone_number: "",
    status: "active",
    ...data,
  };
}

export async function updatePatientProfile(
  patientIdOrToken: string,
  dataOrPatientId: PatientProfileUpdatePayload | string,
  maybeData?: PatientProfileUpdatePayload,
): Promise<PatientDetailResponse> {
  const patientId =
    typeof dataOrPatientId === "string" ? dataOrPatientId : patientIdOrToken;
  const data =
    typeof dataOrPatientId === "string" ? maybeData : dataOrPatientId;

  const response = await apiRequest<
    PatientDetailResponse | { data?: PatientDetailResponse }
  >(`/api/v1/patients/${patientId}/general/`, {
    method: "PATCH",
    body: data,
  });

  const unwrapped = unwrapNestedData(response);
  if (unwrapped) return unwrapped;

  return {
    patient_id: patientId,
    full_name: "",
    phone_number: "",
    status: "active",
    ...data,
  };
}

export async function updatePatientNextFollowupDate(
  patientIdOrToken: string,
  dataOrPatientId: { next_followup_date?: string | null } | string,
  maybeData?: { next_followup_date?: string | null },
): Promise<{ patient_id: string; next_followup_date: string | null }> {
  const patientId =
    typeof dataOrPatientId === "string" ? dataOrPatientId : patientIdOrToken;
  const data =
    typeof dataOrPatientId === "string" ? maybeData : dataOrPatientId;
  return apiRequest<{ patient_id: string; next_followup_date: string | null }>(
    `/api/v1/patients/${patientId}/next-followup-date/`,
    {
      method: "PATCH",
      body: data,
    },
  );
}

export interface ReportPatientSnapshot {
  file_number: string;
  full_name: string;
  date_of_birth: string;
  gender: "male" | "female" | "other";
  phone: string;
  patient_category: PatientCategory;
}

export interface ReportVisitItem {
  id: string;
  patient_id: string;
  visit_date: string;
  checkin_time: string;
  status: "in_progress" | "completed" | "cancelled";
  current_stage: "counsellor" | "doctor" | "pharmacy" | "completed";
  patient: ReportPatientSnapshot;
}

export interface DailyReportResponse {
  date: string;
  total_checkins: number;
  active_checkins: number;
  completed_checkins: number;
  items: ReportVisitItem[];
}

export interface MonthlyReportResponse {
  year: number;
  month: number;
  total_checkins: number;
  active_checkins: number;
  completed_checkins: number;
  breakdown: Array<{ day: number; count: number }>;
}

export interface CustomRangeReportResponse {
  start_date: string;
  end_date: string;
  total_checkins: number;
  active_checkins: number;
  completed_checkins: number;
  unique_patients: number;
  items: ReportVisitItem[];
}

export async function getReceptionDailyReport(
  _token?: string,
  options?: { date?: string },
): Promise<DailyReportResponse> {
  const params = new URLSearchParams();
  if (options?.date) params.set("date", options.date);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<DailyReportResponse>(
    `/api/v1/receptionist/reports/daily/${suffix}`,
    {},
  );
}

export async function getReceptionMonthlyReport(
  _token?: string,
  options?: { year?: number; month?: number },
): Promise<MonthlyReportResponse> {
  const params = new URLSearchParams();
  if (options?.year) params.set("year", String(options.year));
  if (options?.month) params.set("month", String(options.month));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<MonthlyReportResponse>(
    `/api/v1/receptionist/reports/monthly/${suffix}`,
    {},
  );
}

export async function getReceptionCustomRangeReport(
  _token: string | undefined,
  options: { start_date: string; end_date: string },
): Promise<CustomRangeReportResponse> {
  const params = new URLSearchParams();
  params.set("start_date", options.start_date);
  params.set("end_date", options.end_date);
  return apiRequest<CustomRangeReportResponse>(
    `/api/v1/receptionist/reports/custom-range/?${params.toString()}`,
    {},
  );
}

// ── Reception: Dashboard stats ──
export interface DashboardStatsResponse {
  totalPatients: number;
  todayVisits: number;
  completedToday: number;
}

export async function getDashboardStats(
  _token?: string,
): Promise<DashboardStatsResponse> {
  const raw = await apiRequest<Partial<DashboardStatsResponse>>(
    "/api/v1/receptionist/dashboard/",
    {},
  );
  return {
    totalPatients: raw.totalPatients ?? 0,
    todayVisits: raw.todayVisits ?? 0,
    completedToday: raw.completedToday ?? 0,
  };
}

// ── Reception: Queue (today's completed sessions) ──
export interface QueueItem {
  session_id: string;
  patient_id: string;
  patient_name: string;
  file_number: string;
  checked_in_at: string;
  checked_in_by_name: string;
  status: string;
  current_stage: string;
  outstanding_debt: number;
  date_of_birth?: string;
  gender?: string;
  phone?: string;
}

export async function getQueueStatus(_token?: string) {
  return apiRequest<{ items: QueueItem[]; total: number }>(
    "/api/v1/receptionist/queue/",
    {},
  );
}

/** Re-exported from the single source of truth. */
export type CheckinHistoryVerificationMethod = VerificationMethod;

export interface CheckinHistoryPatientSnapshot {
  file_number: string;
  full_name: string;
  date_of_birth: string;
  gender: "male" | "female" | "other";
  phone: string;
  patient_category: PatientCategory;
  address_line1?: string;
  relative_phone?: string | null;
  blood_group?: string;
  addiction_type?: string;
  addiction_duration?: string;
}

export interface CheckinHistoryItem {
  id: string;
  visit_uid: string;
  patient_id: string;
  visit_date: string;
  visit_type: string;
  checkin_time: string;
  completed_time?: string | null;
  status: "in_progress" | "completed" | "cancelled";
  current_stage: "counsellor" | "doctor" | "pharmacy" | "completed";
  checked_in_by_name: string;
  outstanding_debt_at_checkin: number;
  verification_method: CheckinHistoryVerificationMethod;
  verification_photo_captured_at?: string | null;
  verification_photo_available: boolean;
  verification_photo_url?: string | null;
  patient: CheckinHistoryPatientSnapshot;
}

export interface CheckinHistoryListResponse {
  items: CheckinHistoryItem[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface DeleteCheckinHistoryVisitResponse {
  deleted: boolean;
  session_id: string;
  patient_id: string;
}

export async function getReceptionCheckinHistory(
  _token?: string,
  options?: {
    q?: string;
    page?: number;
    pageSize?: number;
    verification_method?: CheckinHistoryVerificationMethod;
    status?: "in_progress" | "completed" | "cancelled";
    start_date?: string;
    end_date?: string;
  },
): Promise<CheckinHistoryListResponse> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  params.set("page", String(options?.page ?? 1));
  params.set("pageSize", String(options?.pageSize ?? 50));
  if (options?.verification_method) {
    params.set("verification_method", options.verification_method);
  }
  if (options?.status) params.set("status", options.status);
  if (options?.start_date) params.set("start_date", options.start_date);
  if (options?.end_date) params.set("end_date", options.end_date);

  return apiRequest<CheckinHistoryListResponse>(
    `/api/v1/receptionist/checkin-history/?${params.toString()}`,
    {},
  );
}

export async function deleteReceptionCheckinHistoryVisit(
  _token: string | undefined,
  sessionId: string,
): Promise<DeleteCheckinHistoryVisitResponse> {
  return apiRequest<DeleteCheckinHistoryVisitResponse>(
    `/api/v1/receptionist/checkin-history/${sessionId}/`,
    { method: "DELETE" },
  );
}

// ── Reception: Patient list (paginated, searchable) ──
//
// ``district``, ``state``, ``addiction_type`` and ``patient_category`` accept
// either a single string (legacy callers) or a list. The backend reads them
// with ``getlist(...)`` and applies OR-within-field / AND-across-fields
// semantics — see API_BLUEPRINT §5.5.
type PatientListFilter = string | string[] | undefined;

type GetPatientsListOpts = {
  q?: string;
  page?: number;
  pageSize?: number;
  district?: PatientListFilter;
  state?: PatientListFilter;
  addiction_type?: PatientListFilter;
  patient_category?: PatientListFilter;
  registration_start?: string;
  registration_end?: string;
};

function _appendMulti(
  params: URLSearchParams,
  key: string,
  value: PatientListFilter,
): void {
  if (value === undefined || value === null) return;
  if (typeof value === "string") {
    if (value) params.append(key, value);
    return;
  }
  for (const v of value) {
    if (v) params.append(key, v);
  }
}

export async function getPatientsList(
  optsOrToken: GetPatientsListOpts | string = {},
  maybeOpts: GetPatientsListOpts = {},
) {
  const opts = typeof optsOrToken === "string" ? maybeOpts : optsOrToken;
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  params.set("page", String(opts.page ?? 1));
  params.set("pageSize", String(opts.pageSize ?? 100));
  _appendMulti(params, "district", opts.district);
  _appendMulti(params, "state", opts.state);
  _appendMulti(params, "addiction_type", opts.addiction_type);
  _appendMulti(params, "patient_category", opts.patient_category);
  if (opts.registration_start) {
    params.set("registration_start", opts.registration_start);
  }
  if (opts.registration_end)
    params.set("registration_end", opts.registration_end);
  return apiRequest<{
    items: PatientLookupResponse[];
    pagination?: { page: number; pageSize: number; total: number };
  }>(`/api/v1/receptionist/patients/?${params.toString()}`, {});
}

// ── Reception: Patient filter options ──
//
// Returns the authoritative ``state → districts`` mapping for the filter
// panel — sourced from distinct values in the database, NOT from the
// country-state-city package. Cached server-side for ~60 seconds.
//
// The receptionist patient page calls this once on mount and again whenever
// the auth token changes. The response drives both the State and District
// multi-select option lists; the panel never falls back to deriving options
// from the currently-loaded patients (which would self-narrow).
export type PatientFilterOptionsResponse = {
  districts_by_state: Record<string, string[]>;
};

export async function getPatientFilterOptions() {
  return apiRequest<PatientFilterOptionsResponse>(
    "/api/v1/receptionist/patients/filter-options/",
    {},
  );
}

export async function getReceptionPatientSummaries(
  optsOrToken: { q?: string; page?: number; pageSize?: number } | string = {},
  maybeOpts: { q?: string; page?: number; pageSize?: number } = {},
) {
  const opts = typeof optsOrToken === "string" ? maybeOpts : optsOrToken;
  const params = new URLSearchParams();
  if (opts.q) params.set("q", opts.q);
  params.set("page", String(opts.page ?? 1));
  params.set("pageSize", String(opts.pageSize ?? 100));
  return apiRequest<PatientSummaryListResponse>(
    `/api/v1/receptionist/patients/summary/?${params.toString()}`,
    {},
  );
}

// ── Patient visit history ──
export async function getPatientVisits(
  patientIdOrToken: string,
  maybePatientId?: string,
) {
  const patientId = maybePatientId ?? patientIdOrToken;
  return apiRequest<{
    items: PatientVisitHistoryItemResponse[];
  }>(`/api/v1/patients/${patientId}/visits/`, {});
}

export async function deletePatient(
  patientIdOrToken: string,
  maybePatientId?: string,
): Promise<DeletePatientResponse> {
  const patientId = maybePatientId ?? patientIdOrToken;
  return apiRequest<DeletePatientResponse>(`/api/v1/patients/${patientId}/`, {
    method: "DELETE",
  });
}

export interface FollowUpItemResponse {
  id: string;
  patient_id: string;
  patient_name: string;
  file_number: string;
  phone: string;
  patient_category: PatientCategory;
  follow_up_date: string;
  status: "pending" | "completed" | "successful";
  cycle_number: number;
  pending_since?: string | null;
  last_response?:
    | "confirmed"
    | "busy_later"
    | "wrong_number"
    | "not_reachable"
    | "other"
    | null;
  last_call_date?: string | null;
  last_call_note?: string | null;
  next_call_date?: string | null;
  completed_at?: string | null;
  successful_at?: string | null;
}

export interface ReceptionFollowUpListResponse {
  items: FollowUpItemResponse[];
  pagination: { page: number; pageSize: number; total: number };
  counts: {
    pending: number;
    completed: number;
    successful: number;
    all: number;
  };
}

export type FollowUpCallResult =
  | "confirmed"
  | "busy_later"
  | "wrong_number"
  | "not_reachable"
  | "other";

export interface CompleteFollowUpCallPayload {
  call_result: FollowUpCallResult;
  call_note: string;
  next_call_date?: string | null;
}

export async function getReceptionFollowUps(
  _token?: string,
  options?: {
    q?: string;
    stage?: "pending" | "completed" | "successful" | "all";
    page?: number;
    pageSize?: number;
  },
): Promise<ReceptionFollowUpListResponse> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  params.set("stage", options?.stage ?? "pending");
  params.set("page", String(options?.page ?? 1));
  params.set("pageSize", String(options?.pageSize ?? 50));
  return apiRequest<ReceptionFollowUpListResponse>(
    `/api/v1/receptionist/follow-ups/?${params.toString()}`,
    {},
  );
}

export async function completeReceptionFollowUpCall(
  _token: string | undefined,
  ticketId: string,
  payload: CompleteFollowUpCallPayload,
): Promise<FollowUpItemResponse> {
  return apiRequest<FollowUpItemResponse>(
    `/api/v1/receptionist/follow-ups/${ticketId}/complete-call/`,
    {
      method: "POST",
      body: payload,
    },
  );
}
