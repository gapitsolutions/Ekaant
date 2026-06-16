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

// Lightweight supplier summary returned inline on Medicine — only the
// fields the inventory row badges and the register/edit dialog picker
// actually need. Distinct from the full ``Supplier`` type (which includes
// contact details + audit timestamps).
export interface MedicineSupplierRef {
  id: string;
  company_name: string;
  is_active: boolean;
  categories: SupplierCategory[];
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
  suppliers: MedicineSupplierRef[];
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
  // Optional explicit Medicine↔Supplier links. Omit on PATCH to preserve
  // existing links; send ``[]`` to clear. See API_BLUEPRINT §7.4.
  supplier_ids?: string[];
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
  // Scope to medicines linked to one supplier (Medicine.suppliers M2M) —
  // powers the supplier console Products tab.
  supplier?: string;
}): Promise<MedicineListResponse> {
  const params = new URLSearchParams();
  if (options?.category) params.set("category", options.category);
  if (options?.bup_category) params.set("bup_category", options.bup_category);
  if (options?.search) params.set("search", options.search);
  if (options?.supplier) params.set("supplier", options.supplier);
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

// ── Bulk CSV import ──
export interface MedicineBulkImportResult {
  created: { row_number: number; id: string; name: string }[];
  skipped: { row_number: number; name: string; reason: string }[];
  errors: { row_number: number; errors: string[] }[];
  summary: {
    total: number;
    created: number;
    skipped: number;
    failed: number;
  };
}

/**
 * Bulk-create medicines from parsed CSV rows. The backend reuses the same
 * per-row validation as single creation, skips duplicates, and returns a
 * per-row report (created / skipped / failed). See API_BLUEPRINT §7.x.
 */
export async function importMedicinesBulk(
  items: Record<string, unknown>[],
): Promise<MedicineBulkImportResult> {
  return apiRequest<MedicineBulkImportResult>(
    "/api/v1/pharmacy/inventory/medicines/bulk-import/",
    {
      method: "POST",
      body: { items },
    },
  );
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
  order_date: string;
  invoice_date: string;
  delivery_date?: string | null;
  invoice_document_base64?: string;
  invoice_document_mime_type?: string;
  invoice_document_filename?: string;
  notes?: string;
  // Form 6 (controlled-substance register) compliance flag.
  form6?: boolean;
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
  order_date: string;
  invoice_date: string;
  delivery_date: string | null;
  supplier: PurchaseInvoiceSupplierSnapshot | null;
  items_loaded: number;
  total_amount: string;
  invoice_document_url: string | null;
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

// ── Purchase Invoice history (per supplier) ──
export interface PurchaseInvoiceListItem {
  id: string;
  invoice_number: string;
  order_date: string | null;
  invoice_date: string;
  delivery_date: string | null;
  total_amount: string;
  items_count: number;
  form6: boolean;
  notes: string;
  invoice_document_url: string | null;
  items: {
    medicine_id: string;
    medicine_name: string;
    category: string;
    subcategory: string;
    batch_number: string;
    expiry_date: string;
    quantity: number;
    purchase_price: string;
    gst_percentage: string;
    line_total: string;
  }[];
}

export async function listPurchaseInvoices(options?: {
  supplier?: string;
}): Promise<{ items: PurchaseInvoiceListItem[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.supplier) params.set("supplier", options.supplier);
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiRequest<{ items: PurchaseInvoiceListItem[]; total: number }>(
    `/api/v1/pharmacy/inventory/invoices/${suffix}`,
    {},
  );
}

// Toggle the Form 6 compliance flag on an existing invoice (the only
// mutable field — invoices otherwise drive stock and the payable ledger).
export async function updatePurchaseInvoiceForm6(
  invoiceId: string,
  form6: boolean,
): Promise<PurchaseInvoiceListItem> {
  return apiRequest<PurchaseInvoiceListItem>(
    `/api/v1/pharmacy/inventory/invoices/${invoiceId}/`,
    { method: "PATCH", body: { form6 } },
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
  // Full ISO datetime — derive both date and time from this. The earlier
  // ``dispense_date`` (date-only) caused every row to render the same
  // midnight time on the frontend; see API_BLUEPRINT §7.11.
  dispense_time: string;
  patient_name: string;
  // Human-facing patient identifier (e.g. "AGH123"). Replaces the
  // previous ``patient_id`` UUID, which was meaningless in the row and
  // CSV export.
  file_number: string;
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
  // Optional: omit/null → hospital default applied server-side; 0 waives it.
  consultation_fee?: string | number | null;
  next_followup_date?: string | null;
}

export interface DispenseCreateResponse {
  id: string;
  invoice_number: string;
  session_id: string;
  patient_id: string;
  patient_name: string;
  subtotal: string;
  consultation_fee: string;
  discount_percentage: string;
  discount_amount: string;
  net_payable: string;
  amount_paid: string;
  invoice_outstanding: string;
  patient_outstanding: string;
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
  // ``amount`` = invoice total (net_payable, BILLED). ``amount_paid`` = money
  // actually received; ``outstanding`` = unpaid portion of this invoice.
  amount: string;
  consultation_fee: string;
  amount_paid: string;
  outstanding: string;
  date: string;
  time: string;
  pharmacist: string;
  status: DispenseStatus;
  payment_method: PaymentMethod;
  is_amended: boolean;
}

// Range-scoped KPI summary for the three cards on the invoice history
// page. Scoped by all list filters; ignores pagination. See
// API_BLUEPRINT §7.15. ``total_revenue`` is serialised as a string
// because it's a Decimal — parse with ``parseFloat`` for display.
export interface DispenseHistoryStats {
  unique_patients: number;
  // ``total_revenue`` = Σ billed (net_payable). ``total_collected`` = Σ money
  // received (amount_paid). ``total_outstanding`` = billed − collected.
  total_revenue: string;
  total_collected: string;
  total_outstanding: string;
  total_records: number;
}

export interface DispenseHistoryResponse {
  items: DispenseHistoryItem[];
  pagination: { page: number; pageSize: number; total: number };
  stats: DispenseHistoryStats;
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
  // Needed to rebuild the amend payload from the read payload.
  medicine_id: string;
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

// One row per post-dispense correction, newest first. The full
// pre-amendment snapshot lives server-side (DispenseInvoiceAmendment);
// the API exposes only what the UI shows.
export interface DispenseAmendmentInfo {
  amended_at: string;
  amended_by_name: string;
  reason: string;
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
  consultation_fee: string;
  discount_percentage: string;
  discount_amount: string;
  net_payable: string;
  amount_paid: string;
  invoice_outstanding: string;
  patient_outstanding: string;
  payment_method: PaymentMethod | string;
  cash_amount: string;
  online_amount: string;
  pharmacist: string;
  status: DispenseStatus;
  notes: string;
  next_followup_date: string | null;
  items: DispenseInvoiceLineItem[];
  amendments: DispenseAmendmentInfo[];
}

export async function getDispenseInvoiceBySession(
  sessionId: string,
): Promise<DispenseInvoiceDetail> {
  return apiRequest<DispenseInvoiceDetail>(
    `/api/v1/pharmacy/dispense/${sessionId}/`,
    {},
  );
}

// ── Dispense Amend (post-dispense correction) ──
export interface DispenseAmendPayload {
  amend_reason: string;
  line_items: DispenseLineItemPayload[];
  payment: DispensePaymentPayload;
  consultation_fee?: string | number | null;
  next_followup_date?: string | null;
}

// ── Billing settings (hospital-wide consultation fee default) ──
export interface BillingSettings {
  default_consultation_fee: string;
  updated_at?: string;
}

export async function getBillingSettings(): Promise<BillingSettings> {
  return apiRequest<BillingSettings>("/api/v1/billing/settings/", {});
}

export async function updateBillingSettings(
  payload: { default_consultation_fee: number | string },
): Promise<BillingSettings> {
  return apiRequest<BillingSettings>("/api/v1/billing/settings/", {
    method: "PATCH",
    body: payload,
  });
}

// PATCH /pharmacy/dispense/<session_id>/ — revert-then-reapply correction.
// Stock ledger gets corrective rows; pre-amendment state is snapshot
// server-side. Returns the refreshed full detail payload. See
// API_BLUEPRINT §7.14a.
export async function amendDispense(
  sessionId: string,
  payload: DispenseAmendPayload,
): Promise<DispenseInvoiceDetail> {
  return apiRequest<DispenseInvoiceDetail>(
    `/api/v1/pharmacy/dispense/${sessionId}/`,
    {
      method: "PATCH",
      body: payload,
    },
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
    // ``total_revenue`` = amount BILLED (Σ net_payable). ``total_collected`` =
    // amount actually received (Σ amount_paid = cash + online). They differ
    // once partial payment / outstanding exists. See API_BLUEPRINT §7.16.
    total_revenue: string;
    total_collected: string;
    total_outstanding: string;
    total_cash: string;
    total_online: string;
    total_consultation: string;
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
  // Count of active medicines mapped to this supplier (Medicine.suppliers M2M).
  product_count: number | null;
  // Cached accounts-payable balance (money owed to this supplier). Decimal
  // serialised as string. See API_BLUEPRINT — supplier payables ledger.
  outstanding_payable: string;
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
  has_dues?: boolean;
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
  if (query.has_dues) params.set("has_dues", "true");
  if (query.page) params.set("page", String(query.page));
  if (query.pageSize) params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return apiRequest<SupplierListResponse>(
    `/api/v1/pharmacy/suppliers/${qs ? `?${qs}` : ""}`,
    {},
  );
}

// Directory-wide KPI aggregate for the supplier console cards. Comes from a
// dedicated summary endpoint (aggregate queries), NOT the paginated list.
export interface SupplierSummary {
  total: number;
  active: number;
  inactive: number;
  by_category: Record<SupplierCategory, number>;
  outstanding_total: string; // decimal as string
  suppliers_with_dues: number;
}

export async function getSupplierSummary(): Promise<SupplierSummary> {
  return apiRequest<SupplierSummary>(
    "/api/v1/pharmacy/suppliers/summary/",
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

// ── Supplier payables ledger (admin-only) ──
export interface SupplierLedgerRow {
  id: string;
  date: string; // payment_date for payments, else posting time
  payment_date: string | null;
  entry_type: "invoice" | "payment" | "adjustment";
  credit: string; // invoice booked (+payable)
  debit: string; // payment made (−payable)
  balance: string; // running outstanding after this row
  payment_mode: string;
  reference: string;
  note: string;
  invoice_number: string;
}

export interface SupplierLedgerResponse {
  supplier_id: string;
  summary: {
    outstanding: string;
    total_invoiced: string;
    total_paid: string;
  };
  entries: SupplierLedgerRow[];
}

export async function getSupplierLedger(
  supplierId: string,
): Promise<SupplierLedgerResponse> {
  return apiRequest<SupplierLedgerResponse>(
    `/api/v1/pharmacy/suppliers/${supplierId}/ledger/`,
    {},
  );
}

export interface SupplierPaymentPayload {
  amount: string | number;
  payment_mode?: "cash" | "online" | "bank";
  reference?: string;
  note?: string;
  payment_date?: string; // YYYY-MM-DD; defaults to today server-side
}

export async function recordSupplierPayment(
  supplierId: string,
  payload: SupplierPaymentPayload,
): Promise<{ outstanding: string }> {
  return apiRequest<{ outstanding: string }>(
    `/api/v1/pharmacy/suppliers/${supplierId}/payments/`,
    { method: "POST", body: payload },
  );
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

