// User roles
export type UserRole =
  | "admin"
  | "reception"
  | "counsellor"
  | "doctor"
  | "pharmacist";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

// Patient types
export type Gender = "male" | "female" | "other";
export type AddictionType =
  | "alcohol"
  | "drugs"
  | "tobacco"
  | "gambling"
  | "other";
export type PatientStatus =
  | "active"
  | "inactive"
  | "dead"
  | "discharged"
  | "follow_up";
export type PatientCategory = "psychiatric" | "deaddiction";

export const PATIENT_CATEGORY_LABELS: Record<PatientCategory, string> = {
  psychiatric: "Psychiatric",
  deaddiction: "De-Addiction",
};

// Employment status options
export type EmploymentStatus =
  | "never_employed"
  | "presently_unemployed"
  | "full_time_employed"
  | "part_time_employed"
  | "self_employed"
  | "student"
  | "housewife"
  | "other";

// Education level options
export type EducationLevel =
  | "illiterate"
  | "primary_upto_5th"
  | "middle_upto_8th"
  | "upto_10_12"
  | "literate"
  | "graduation"
  | "professional";

// Marital status options
export type MaritalStatus =
  | "never_married"
  | "married"
  | "widow_widower"
  | "separated_drug_abuse"
  | "divorced_separated";

// Living arrangement options
export type LivingArrangement =
  | "joint_family"
  | "nuclear_family"
  | "with_friends"
  | "alone"
  | "other";

// Substance types
export type SubstanceType =
  | "alcohol"
  | "heroin"
  | "opium"
  | "other_opioids"
  | "cannabis"
  | "sedatives"
  | "cocaine"
  | "amphetamine_stimulants"
  | "hallucinogens"
  | "volatile_solvents"
  | "tobacco"
  | "other";

export interface Patient {
  id: string;
  registration_number: string; // File Number
  hdams_id?: string; // HDAMS unique ID
  patient_category: PatientCategory; // Psychiatric or De-Addiction

  // Basic Info (from Instant Registration)
  full_name: string;
  date_of_birth: string;
  aadhaar_number?: string;
  phone: string;
  relative_phone?: string;
  address: string;
  photo_url?: string;
  fingerprint_template?: string;

  // Extended Registration Details
  registration_date?: string;
  mother_name?: string;
  father_name?: string;
  grandfather_name?: string;
  spouse_name?: string;

  // Demographics
  gender: Gender;
  blood_group?: string;
  nationality?: string;
  religion?: string;
  monthly_income?: string;
  occupation?: string;
  employment_status?: EmploymentStatus;
  education?: EducationLevel;
  marital_status?: MaritalStatus;

  // Address Details
  block_mc?: string;
  city: string;
  district?: string;
  state: string;
  pincode: string;

  // Living Situation
  living_arrangement?: LivingArrangement;

  // Substance Use Details
  substance_used_currently?: SubstanceType[];
  substance_ever_used?: SubstanceType[];
  injection_use_ever?: boolean;
  injection_use_currently?: boolean;
  route_of_admission?: string;
  syringe_sharing?: boolean;

  // Medical History
  sti_std?: string;
  jaundice?: boolean;
  sex_with_sex_worker?: boolean;
  hiv_screening?: boolean;
  hiv_result?: string;
  comorbid_medical_illness?: string;
  comorbid_psychiatric_illness?: string;
  previous_drug_treatment?: string;
  ever_hospitalized?: boolean;

  // Legacy fields for compatibility
  email?: string;
  addiction_type: AddictionType;
  addiction_duration?: string;
  first_visit_date: string;
  emergency_contact_name: string;
  emergency_contact_phone: string;
  emergency_contact_relation: string;
  family_history?: string;
  medical_history?: string;
  allergies?: string;
  current_medications?: string;
  previous_treatments?: string;
  status: PatientStatus;
  created_at: string;
  updated_at: string;
}

// Visit types
export type VisitStage =
  | "checkin"
  | "reception"
  | "counsellor"
  | "doctor"
  | "pharmacy"
  | "completed";
export type VisitStatus = "in_progress" | "completed" | "cancelled";

export interface Visit {
  id: string;
  patient_id: string;
  patient?: Patient;
  visit_date: string;
  visit_number: number;
  current_stage: VisitStage;
  checkin_time?: string;
  counsellor_start_time?: string;
  counsellor_end_time?: string;
  doctor_start_time?: string;
  doctor_end_time?: string;
  pharmacy_time?: string;
  completed_time?: string;
  assigned_counsellor_id?: string;
  assigned_doctor_id?: string;
  pharmacist_id?: string;
  status: VisitStatus;
  created_at?: string;
}

// Counsellor session
export type RiskLevel = "low" | "medium" | "high";

export interface CounsellorSession {
  id: string;
  visit_id: string;
  patient_id: string;
  counsellor_id: string;
  session_notes: string;
  mood_assessment?: number; // 1-10 scale
  risk_level: RiskLevel;
  recommendations?: string;
  follow_up_required: boolean;
  session_duration_minutes?: number;
  created_at: string;
}

// Doctor consultation
export interface VitalSigns {
  blood_pressure?: string;
  pulse?: number;
  weight?: number;
  temperature?: number;
}

export interface DoctorConsultation {
  id: string;
  visit_id: string;
  patient_id: string;
  doctor_id: string;
  diagnosis?: string;
  treatment_plan?: string;
  clinical_notes?: string;
  vital_signs?: VitalSigns;
  next_visit_date?: string;
  created_at: string;
}

// Medicine and Prescription
export type MedicineUnit =
  | "tablet"
  | "capsule"
  | "ml"
  | "mg"
  | "syrup"
  | "injection";
export type Frequency =
  | "once_daily"
  | "twice_daily"
  | "thrice_daily"
  | "as_needed";

export interface Medicine {
  id: string;
  name: string;
  generic_name?: string;
  category?: string;
  manufacturer?: string;
  unit?: MedicineUnit;
  price_per_unit?: number;
  unit_price?: number;
  stock_quantity: number;
  reorder_level: number;
  expiry_date?: string;
  is_active: boolean;
  created_at?: string;
  dosage_form?: string;
  strength?: string;
  batch_number?: string;
}

export interface Prescription {
  id: string;
  consultation_id: string;
  visit_id: string;
  patient_id: string;
  medicine_id: string;
  medicine?: Medicine;
  quantity: number;
  dosage: string;
  frequency: Frequency;
  duration_days: number;
  instructions?: string;
  dispensed: boolean;
  dispensed_at?: string;
}

// Invoice
export type PaymentStatus = "pending" | "paid" | "partial";
export type PaymentMethod = "cash" | "online" | "split" | "debt";

export interface Invoice {
  id: string;
  visit_id: string;
  patient_id: string;
  invoice_number: string;
  invoice_date: string;
  consultation_fee: number;
  medicine_total: number;
  discount: number;
  tax: number;
  grand_total: number;
  payment_status: PaymentStatus;
  payment_method?: PaymentMethod;
  notes?: string;
  created_at: string;
}

// Inventory transaction
export type TransactionType = "in" | "out";

export interface InventoryTransaction {
  id: string;
  medicine_id: string;
  transaction_type: TransactionType;
  quantity: number;
  reference_id?: string;
  performed_by: string;
  notes?: string;
  created_at: string;
}

// Dashboard stats
export interface DashboardStats {
  totalPatients: number;
  todayVisits: number;
  completedToday: number;
}

// Option labels for dropdowns
export const EMPLOYMENT_STATUS_LABELS: Record<EmploymentStatus, string> = {
  never_employed: "Never Employed",
  presently_unemployed: "Presently Unemployed",
  full_time_employed: "Full Time Employed",
  part_time_employed: "Part Time Employed",
  self_employed: "Self Employed",
  student: "Student",
  housewife: "Housewife/Girl",
  other: "Any Other",
};

export const EDUCATION_LABELS: Record<EducationLevel, string> = {
  illiterate: "Illiterate",
  primary_upto_5th: "Primary (upto 5th)",
  middle_upto_8th: "Middle (upto 8th)",
  upto_10_12: "Upto 10th & 12th",
  literate: "Literate",
  graduation: "Graduation",
  professional: "Professional/Technical",
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  never_married: "Never Married",
  married: "Married",
  widow_widower: "Widow/Widower",
  separated_drug_abuse: "Separated due to Drug Abuse",
  divorced_separated: "Divorced/Separated",
};

export const LIVING_ARRANGEMENT_LABELS: Record<LivingArrangement, string> = {
  joint_family: "Joint Family",
  nuclear_family: "Nuclear Family",
  with_friends: "With Friends",
  alone: "Alone",
  other: "Any Other",
};

export const SUBSTANCE_TYPE_LABELS: Record<SubstanceType, string> = {
  alcohol: "Alcohol",
  heroin: "Heroin",
  opium: "Opium",
  other_opioids: "Other Opioids",
  cannabis: "Cannabis",
  sedatives: "Sedatives",
  cocaine: "Cocaine",
  amphetamine_stimulants: "Amphetamine/Other Stimulants",
  hallucinogens: "Hallucinogens",
  volatile_solvents: "Volatile Solvents",
  tobacco: "Tobacco",
  other: "Any Other",
};

export const BLOOD_GROUP_OPTIONS = [
  "A+",
  "A-",
  "B+",
  "B-",
  "AB+",
  "AB-",
  "O+",
  "O-",
];

export const RELIGION_OPTIONS = [
  "Hindu",
  "Muslim",
  "Christian",
  "Sikh",
  "Buddhist",
  "Jain",
  "Other",
];

export const NATIONALITY_OPTIONS = ["Indian", "Other"];
