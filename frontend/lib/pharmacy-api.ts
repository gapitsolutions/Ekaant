import { apiRequest } from "./api-client";

// ── Enums ──
export type MedicineCategory = "BUP" | "Rx" | "NRx";
export type BupStrength = "0.4mg + 0.1mg" | "1.0mg + 0.25mg" | "2.0mg + 0.5mg";
export type PaymentMethod = "Cash" | "Online" | "Split";
export type RemovalReason = "destroyed" | "returned" | "damaged" | "defect";
export type DispenseStatus = "success" | "cancelled";

// ── Medicines / Batches ──
export interface MedicineBatch {
  batch_number: string;
  expiry_date: string;
  quantity: number;
}

export interface Medicine {
  id: string;
  name: string;
  salt: string;
  category: MedicineCategory;
  bup_category: BupStrength | null;
  manufacturer: string;
  reorder_level: number;
  tablets_per_strip: number;
  mrp: string;
  selling_price: string;
  is_active: boolean;
  batches: MedicineBatch[];
}

export interface MedicineListResponse {
  items: Medicine[];
  total: number;
}

export interface MedicineCreatePayload {
  name: string;
  salt: string;
  category: MedicineCategory;
  bup_category?: BupStrength | null;
  manufacturer: string;
  reorder_level: number;
  tablets_per_strip?: number;
  mrp: string | number;
  selling_price: string | number;
}

export interface MedicineUpdatePayload extends Partial<MedicineCreatePayload> {}

export interface MedicineDeletePayload {
  reason: string;
  notes?: string;
}

export async function getInventoryMedicines(options?: {
  category?: MedicineCategory;
  bup_category?: BupStrength;
  search?: string;
}): Promise<MedicineListResponse> {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.bup_category) params.set("bup_category", options.bup_category);
  if (options?.search) params.set("search", options.search);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<MedicineListResponse>(
    `/api/v1/pharmacy/inventory/medicines/${suffix}`,
    {},
  );
}

export async function getMedicineById(medicineId: string): Promise<Medicine> {
  return apiRequest<Medicine>(
    `/api/v1/pharmacy/inventory/medicines/${medicineId}/`,
    {},
  );
}

export async function addInventoryMedicine(
  payload: MedicineCreatePayload,
): Promise<Medicine> {
  return apiRequest<Medicine>("/api/v1/pharmacy/inventory/medicines/", {
    method: "POST",
    body: payload,
  });
}

export async function updateInventoryMedicine(
  medicineId: string,
  payload: MedicineUpdatePayload,
): Promise<Medicine> {
  return apiRequest<Medicine>(
    `/api/v1/pharmacy/inventory/medicines/${medicineId}/`,
    {
      method: "PATCH",
      body: payload,
    },
  );
}

export async function deleteInventoryMedicine(
  medicineId: string,
  payload: MedicineDeletePayload,
): Promise<{ deleted: boolean; medicine_id: string }> {
  return apiRequest<{ deleted: boolean; medicine_id: string }>(
    `/api/v1/pharmacy/inventory/medicines/${medicineId}/`,
    {
      method: "DELETE",
      body: payload,
    },
  );
}

// ── Inventory Stats ──
export interface InventoryStats {
  total_medicines: number;
  low_stock_count: number;
  near_expiry_count: number;
  expired_count: number;
  total_stock_value: string;
  todays_revenue: string;
  dispensed_today_count: number;
}

export async function getInventoryStats(): Promise<InventoryStats> {
  return apiRequest<InventoryStats>("/api/v1/pharmacy/inventory/stats/", {});
}

// ── Purchase Invoices ──
export interface PurchaseInvoiceItemPayload {
  medicine_id: string;
  category: MedicineCategory;
  subcategory?: string | null;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price: string | number;
  gst_percentage: string | number;
}

export interface PurchaseInvoicePayload {
  invoice_number: string;
  supplier_id: string;
  invoice_date: string;
  delivery_date?: string | null;
  notes?: string;
  items: PurchaseInvoiceItemPayload[];
}

export interface PurchaseInvoiceSupplierSnapshot {
  id: string;
  company_name: string;
  mobile_number?: string | null;
}

export interface PurchaseInvoiceResponse {
  id: string;
  invoice_number: string;
  supplier: PurchaseInvoiceSupplierSnapshot | null;
  items_loaded: number;
  total_amount: string;
}

export async function submitPurchaseInvoice(
  payload: PurchaseInvoicePayload,
): Promise<PurchaseInvoiceResponse> {
  return apiRequest<PurchaseInvoiceResponse>(
    "/api/v1/pharmacy/inventory/invoices/",
    {
      method: "POST",
      body: payload,
    },
  );
}

// ── Audit Stock Removal ──
export interface AuditRemovalPayload {
  medicine_id: string;
  batch_number: string;
  quantity?: number;
  reason: RemovalReason;
  notes?: string;
}

export interface AuditRemovalResponse {
  id: string;
  medicine_id: string;
  batch_number: string;
  quantity_removed: number;
  reason: RemovalReason;
}

export async function auditStockRemoval(
  payload: AuditRemovalPayload,
): Promise<AuditRemovalResponse> {
  return apiRequest<AuditRemovalResponse>(
    "/api/v1/pharmacy/inventory/audit-removal/",
    {
      method: "POST",
      body: payload,
    },
  );
}

// ── Product Dispense History (per medicine) ──
export interface ProductDispenseHistoryItem {
  id: string;
  dispense_date: string;
  patient_name: string;
  patient_id: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  total_price: string;
}

export interface ProductDispenseHistoryResponse {
  medicine_id: string;
  items: ProductDispenseHistoryItem[];
  total_quantity: number;
}

export async function getProductDispenseHistory(
  medicineId: string,
  options?: { date?: string; month?: string },
): Promise<ProductDispenseHistoryResponse> {
  const params = new URLSearchParams();
  if (options?.date) params.set("date", options.date);
  if (options?.month) params.set("month", options.month);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<ProductDispenseHistoryResponse>(
    `/api/v1/pharmacy/inventory/medicines/${medicineId}/dispense-history/${suffix}`,
    {},
  );
}

// ── Pharmacy Queue ──
export interface PharmacyQueueItem {
  session_id: string;
  patient_id: string;
  patient_name: string;
  current_stage: string;
  status: string;
  checked_in_at: string;
  checked_in_by_name: string;
  outstanding_debt: string | number;
  patient: {
    file_number?: string | null;
    phone?: string | null;
    date_of_birth?: string | null;
    sex?: "male" | "female" | "other" | null;
  };
}

export interface PharmacyQueueResponse {
  items: PharmacyQueueItem[];
  total?: number;
}

export async function getPharmacyQueue(): Promise<PharmacyQueueResponse> {
  const response = await apiRequest<
    PharmacyQueueResponse | PharmacyQueueItem[]
  >("/api/v1/pharmacy/queue/", {});
  if (Array.isArray(response)) {
    return { items: response, total: response.length };
  }
  return response;
}

// ── Dispense ──
export interface DispenseLineItemPayload {
  medicine_id: string;
  batch_number: string;
  dose: string;
  days: number;
  qty: number;
  unit_price: string | number;
}

export interface DispensePaymentPayload {
  payment_method: PaymentMethod;
  cash_amount: string | number;
  online_amount: string | number;
  discount: string | number;
  notes?: string;
}

export interface DispenseCreatePayload {
  session_id: string;
  line_items: DispenseLineItemPayload[];
  payment: DispensePaymentPayload;
  next_followup_date?: string | null;
}

export interface DispenseCreateResponse {
  id: string;
  invoice_number: string;
  session_id: string;
  patient_id: string;
  patient_name: string;
  subtotal: string;
  discount_percentage: string;
  discount_amount: string;
  net_payable: string;
  payment_method: PaymentMethod;
  cash_amount: string;
  online_amount: string;
  item_count: number;
  dispensed_at: string;
  dispensed_by: string;
  current_stage: string;
  status: DispenseStatus;
}

export async function createDispense(
  payload: DispenseCreatePayload,
): Promise<DispenseCreateResponse> {
  return apiRequest<DispenseCreateResponse>("/api/v1/pharmacy/dispense/", {
    method: "POST",
    body: payload,
  });
}

export interface DispenseCancelResponse {
  id: string;
  invoice_number: string;
  session_id: string;
  status: DispenseStatus;
  net_payable: string;
  cancelled_at: string;
  cancel_reason: string;
}

export async function cancelDispense(
  sessionId: string,
  reason: string,
): Promise<DispenseCancelResponse> {
  return apiRequest<DispenseCancelResponse>(
    `/api/v1/pharmacy/dispense/${sessionId}/cancel/`,
    {
      method: "POST",
      body: { reason },
    },
  );
}

// ── Dispense History (Invoice History) ──
export interface DispenseHistoryItem {
  id: string;
  session_id: string;
  invoice_number: string;
  patient: string;
  patient_id: string;
  file_number?: string | null;
  amount: string;
  date: string;
  time: string;
  pharmacist: string;
  status: DispenseStatus;
  payment_method: PaymentMethod;
}

export interface DispenseHistoryResponse {
  items: DispenseHistoryItem[];
  pagination: { page: number; pageSize: number; total: number };
}

export async function getDispenseHistory(options?: {
  q?: string;
  page?: number;
  pageSize?: number;
  start_date?: string;
  end_date?: string;
  status?: DispenseStatus;
  today_only?: boolean;
}): Promise<DispenseHistoryResponse> {
  const params = new URLSearchParams();
  if (options?.q) params.set("q", options.q);
  params.set("page", String(options?.page ?? 1));
  params.set("pageSize", String(options?.pageSize ?? 50));
  if (options?.start_date) params.set("start_date", options.start_date);
  if (options?.end_date) params.set("end_date", options.end_date);
  if (options?.status) params.set("status", options.status);
  if (options?.today_only) params.set("today_only", "true");
  return apiRequest<DispenseHistoryResponse>(
    `/api/v1/pharmacy/dispense-history/?${params.toString()}`,
    {},
  );
}

// ── Dispense Invoice Detail (per visit session) ──
export interface DispenseInvoiceLineItem {
  id: string;
  medicine_name: string;
  salt: string;
  category: string;
  batch_number: string;
  dose: string;
  days: number;
  quantity: number;
  unit_price: string;
  total: string;
}

export interface DispenseInvoiceDetail {
  id: string;
  invoice_number: string;
  session_id: string;
  patient_id: string;
  patient_name: string;
  dispense_date: string;
  dispense_time: string;
  subtotal: string;
  discount_percentage: string;
  discount_amount: string;
  net_payable: string;
  payment_method: PaymentMethod | string;
  cash_amount: string;
  online_amount: string;
  pharmacist: string;
  status: DispenseStatus;
  notes: string;
  items: DispenseInvoiceLineItem[];
}

export async function getDispenseInvoiceBySession(
  sessionId: string,
): Promise<DispenseInvoiceDetail> {
  return apiRequest<DispenseInvoiceDetail>(
    `/api/v1/pharmacy/dispense/${sessionId}/`,
    {},
  );
}

// ── Reports ──
export type ReportRange = "daily" | "monthly" | "custom";

export interface ReportFilterOptions {
  range?: ReportRange;
  date?: string;
  month?: string;
  start_date?: string;
  end_date?: string;
}

export interface RevenueBreakdownRow {
  date: string;
  day_name: string;
  revenue: string;
  cash: string;
  online: string;
  transactions: number;
}

export interface RevenueReportResponse {
  period: string;
  summary: {
    total_revenue: string;
    total_cash: string;
    total_online: string;
    total_transactions: number;
  };
  breakdown: RevenueBreakdownRow[];
}

export async function getRevenueReport(
  options?: ReportFilterOptions,
): Promise<RevenueReportResponse> {
  const params = new URLSearchParams();
  if (options?.range) params.set("range", options.range);
  if (options?.date) params.set("date", options.date);
  if (options?.month) params.set("month", options.month);
  if (options?.start_date) params.set("start_date", options.start_date);
  if (options?.end_date) params.set("end_date", options.end_date);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<RevenueReportResponse>(
    `/api/v1/pharmacy/reports/revenue/${suffix}`,
    {},
  );
}

export interface ConsumptionTrendRow {
  date: string;
  day_name: string;
  rx: number;
  nrx: number;
  bup: number;
  total: number;
}

export interface ConsumptionMedicineRow {
  name: string;
  salt: string;
  category: MedicineCategory;
  strength?: string | null;
  quantity: number;
  selling_value: string;
}

export interface ConsumptionReportResponse {
  period: string;
  trend_data: ConsumptionTrendRow[];
  medicine_breakdown: ConsumptionMedicineRow[];
}

export async function getConsumptionReport(
  options?: ReportFilterOptions & { category?: "All" | MedicineCategory },
): Promise<ConsumptionReportResponse> {
  const params = new URLSearchParams();
  if (options?.range) params.set("range", options.range);
  if (options?.date) params.set("date", options.date);
  if (options?.month) params.set("month", options.month);
  if (options?.start_date) params.set("start_date", options.start_date);
  if (options?.end_date) params.set("end_date", options.end_date);
  if (options?.category) params.set("category", options.category);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<ConsumptionReportResponse>(
    `/api/v1/pharmacy/reports/consumption/${suffix}`,
    {},
  );
}

export interface LowStockReportItem {
  id: string;
  name: string;
  salt: string;
  category: MedicineCategory;
  current_stock: number;
  reorder_level: number;
}

export interface LowStockReportResponse {
  items: LowStockReportItem[];
}

export async function getLowStockReport(): Promise<LowStockReportResponse> {
  const response = await apiRequest<
    LowStockReportResponse | LowStockReportItem[]
  >("/api/v1/pharmacy/reports/low-stock/", {});
  if (Array.isArray(response)) {
    return { items: response };
  }
  return response;
}

export interface ExpiryReportRow {
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  days_overdue?: number;
  days_until_expiry?: number;
}

export interface ExpiryReportResponse {
  expired: ExpiryReportRow[];
  near_expiry: ExpiryReportRow[];
}

export async function getExpiryReport(): Promise<ExpiryReportResponse> {
  return apiRequest<ExpiryReportResponse>(
    "/api/v1/pharmacy/reports/expiry/",
    {},
  );
}

// ── Suppliers ──
export type SupplierCategory = MedicineCategory;

export interface Supplier {
  id: string;
  company_name: string;
  contact_person: string;
  mobile_number: string | null;
  email: string | null;
  full_address: string;
  gst_number: string | null;
  drug_license_number: string | null;
  categories: SupplierCategory[];
  is_active: boolean;
  invoice_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierListResponse {
  items: Supplier[];
  pagination: { page: number; pageSize: number; total: number };
}

export interface SupplierListQuery {
  q?: string;
  is_active?: boolean;
  category?: SupplierCategory;
  page?: number;
  pageSize?: number;
}

export async function listSuppliers(
  query: SupplierListQuery = {},
): Promise<SupplierListResponse> {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.is_active !== undefined)
    params.set("is_active", String(query.is_active));
  if (query.category) params.set("category", query.category);
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return apiRequest<SupplierListResponse>(
    `/api/v1/pharmacy/suppliers/${qs ? `?${qs}` : ""}`,
    {},
  );
}

export interface SupplierWritePayload {
  company_name: string;
  mobile_number: string;
  contact_person?: string;
  email?: string | null;
  full_address?: string;
  gst_number?: string | null;
  drug_license_number?: string | null;
  categories?: SupplierCategory[];
  is_active?: boolean;
}

export async function createSupplier(
  payload: SupplierWritePayload,
): Promise<Supplier> {
  return apiRequest<Supplier>("/api/v1/pharmacy/suppliers/", {
    method: "POST",
    body: payload,
  });
}

export async function updateSupplier(
  supplierId: string,
  payload: Partial<SupplierWritePayload>,
): Promise<Supplier> {
  return apiRequest<Supplier>(`/api/v1/pharmacy/suppliers/${supplierId}/`, {
    method: "PATCH",
    body: payload,
  });
}

export async function deactivateSupplier(
  supplierId: string,
): Promise<{ deactivated: boolean; supplier_id: string; is_active: boolean }> {
  return apiRequest(`/api/v1/pharmacy/suppliers/${supplierId}/`, {
    method: "DELETE",
  });
}

export async function getSupplier(supplierId: string): Promise<Supplier> {
  return apiRequest<Supplier>(`/api/v1/pharmacy/suppliers/${supplierId}/`, {});
}

// ── Utilities ──

export const BUP_STRENGTHS: BupStrength[] = [
  "0.4mg + 0.1mg",
  "1.0mg + 0.25mg",
  "2.0mg + 0.5mg",
];

export function parseDoseToNumeric(dose: string): number {
  if (!dose) return 0;
  return dose
    .split("-")
    .map((part) => parseFloat(part.trim()))
    .filter((n) => !Number.isNaN(n))
    .reduce((sum, n) => sum + n, 0);
}

