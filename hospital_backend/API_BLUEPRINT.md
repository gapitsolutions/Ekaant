# Hospital Backend API Blueprint (Django)

> **Last Updated:** 2026-05-23
> **Scope:** Full backend API surface — accounts, patients, visits, follow-ups, and the pharmacy module.

---

## 1. Scope and Code Sources

This blueprint is generated from the Django code in:

- backend/backend (project config, root routing)
- backend/core (auth, permissions, response and exception contracts, pagination)
- backend/accounts (authentication APIs)
- backend/patients (patient registration, lookup, profile, media, and patient-centric visits)
- backend/visits (check-in workflow, queue snapshot, dashboard stats, reports, visit detail update)
- backend/followups (follow-up tickets, call attempts)
- backend/pharmacy (inventory, dispensing, audit removal, reports — see §7)

Primary URL prefix for all APIs: `/api/v1/`

---

## 2. Runtime Architecture

### 2.1 Routing

Root router lives in `backend/backend/urls.py` and mounts:

- `accounts.urls` under `/api/v1/`
- `patients.urls` under `/api/v1/`
- `followups.urls` under `/api/v1/`
- `visits.urls` under `/api/v1/`
- `pharmacy.urls` under `/api/v1/`

### 2.2 Authentication Model

Authentication class: `core.authentication.CookieJWTAuthentication`

Behavior:

- Reads JWT access token from cookie named by `SIMPLE_JWT[AUTH_COOKIE_ACCESS]`
- Validates token using DRF SimpleJWT
- For non-safe HTTP methods (not GET/HEAD/OPTIONS/TRACE), enforces CSRF using `enforce_csrf`
- Returns authenticated user + token pair to DRF

### 2.3 Permission Model

- `IsReceptionOrAdmin`: allows roles `admin`, `reception`, `receptionist`
- `IsAdminRole`: allows role `admin` only
- `IsReceptionAdminOrPharmacist`: allows roles `admin`, `reception`, `receptionist`, `pharmacist`
- `IsPharmacistOrAdmin`: allows roles `admin`, `pharmacist`

Pharmacy mutating endpoints (medicine CRUD, purchase invoice, audit removal, dispense, cancel, revenue/consumption reports) use `IsPharmacistOrAdmin`. Read-heavy pharmacy endpoints (queue, inventory list, low-stock/expiry, dispense history, product dispense history, inventory stats) use `IsReceptionAdminOrPharmacist`.

### 2.4 Response and Error Envelope

Success envelope (`core.responses.success_response`):

```json
{
  "success": true,
  "data": ...
}
```

Error envelope (`core.exceptions.api_exception_handler`):

```json
{
  "success": false,
  "error": {
    "message": "..."
  }
}
```

Important behavior:

- `success_response` can also attach a CSRF cookie when `request` is passed.
- `ConflictError` maps to HTTP 409 with the standard error envelope.

---

## 3. Core Utility Function Blueprint

### 3.1 `core.authentication`

- `enforce_csrf(request)`
  - Runs Django `CsrfViewMiddleware` checks manually.
  - Raises `PermissionDenied("CSRF validation failed.")` if rejected.

- `CookieJWTAuthentication.authenticate(request)`
  - Reads access token from cookie.
  - Returns `None` when cookie is absent.
  - Validates token and user.
  - Calls `enforce_csrf` for mutating methods.

### 3.2 `core.responses`

- `attach_csrf_cookie(response, request)` — gets/creates CSRF token and sets CSRF cookie.
- `success_response(data, status_code=200, request=None)` — wraps payload in `{success, data}`; optionally attaches CSRF cookie.
- `set_auth_cookies(response, access_token, refresh_token)` — sets both HttpOnly auth cookies.
- `clear_auth_cookies(response)` — deletes both auth cookies.

### 3.3 `core.exceptions`

- `ConflictError` — `APIException` subclass with HTTP 409.
- `_coerce_message(data)` — extracts human-readable message from nested DRF error structures.
- `api_exception_handler(exc, context)` — converts all handled exceptions to standardized error envelope; returns 500 with "Internal server error" when DRF gives no response.

### 3.4 `core.pagination`

- `paginate_queryset(queryset, page, page_size)`
  - Normalizes `page` to ≥ 1.
  - Clamps `page_size` to range 1..200.
  - Returns sliced queryset and metadata `{page, pageSize, total}`.

---

## 4. Accounts API Blueprint

Base module: `backend/accounts/views.py`

### 4.1 `POST /api/v1/auth/login/`

View: `LoginView.post`

Permission/auth classes:

- `AllowAny`
- No DRF auth class (manual flow)

Request body:

- `email` (required)
- `password` (required)

Working flow:

1. `enforce_csrf(request)`
2. Validate payload with `LoginSerializer`
3. Lookup user by case-insensitive email
4. Reject invalid credentials or inactive account
5. Create `RefreshToken.for_user(user)`
6. Build payload via `_auth_payload`
7. Return success envelope with auth cookies set

Response data:

- `expires_in` (access token lifetime in seconds)
- `user` (`id`, `full_name`, `email`, `role`, `hospital_id`)

Errors:

- 401 invalid credentials
- 401 inactive account
- 403 CSRF validation failed

### 4.2 `GET /api/v1/auth/session/`

View: `SessionView.get`

Working flow:

1. Authenticate from access cookie via `_authenticate_from_cookie`
2. If no valid cookie/token → 401
3. Return `_auth_payload(user)`

Use case: Session bootstrap for frontend on app load.

### 4.3 `POST /api/v1/auth/refresh/`

View: `RefreshView.post`

Working flow:

1. `enforce_csrf(request)`
2. Read refresh cookie
3. Validate refresh token and resolve user
4. Mint new access token (refresh token reused)
5. Return `refreshed=true` and new expiry, plus reset cookies

Errors:

- 401 refresh missing/invalid
- 403 CSRF failure

### 4.4 `POST /api/v1/auth/logout/`

View: `LogoutView.post`

Working flow:

1. `enforce_csrf(request)`
2. Return `logged_out=true`
3. Clear auth cookies

---

## 5. Patients API Blueprint

Base module: `backend/patients/views.py` and `serializers.py`

### 5.1 `POST /api/v1/patients/register/`

View: `PatientRegistrationView.post`
Serializer: `PatientRegistrationSerializer`
Permission: `IsReceptionOrAdmin`

Request body (core required fields):

- `patient_category`
- `file_number` (optional; auto-generated if missing)
- `full_name`
- `phone_number`
- `date_of_birth`
- `sex`
- `fingerprint_template`
- `relative_phone`
- `address_line1`
- `aadhaar_number` (optional)
- `photo_base64` + `photo_mime_type` (optional pair)

Working flow:

1. Validate payload and business rules in serializer:
   - DOB not in future
   - phone/relative_phone digits normalization
   - Aadhaar must be 12 digits and unique
   - photo fields must be provided together
   - allowed photo MIME only: `image/jpeg`, `image/png`
   - max photo size: 2 MB after decode
2. Create patient record, set `fingerprint_enrolled_at`
3. Save decoded photo to `ImageField` when present
4. Serialize result using `PatientLookupSerializer`
5. Add `fingerprint_reenrollment_required=false` flag
6. Return 201 success

### 5.2 `GET /api/v1/patients/lookup/`

View: `PatientLookupView.get`
Permission: `IsReceptionOrAdmin`

Query params:

- `registration_number` (exact match path)
- `q` (broad search path)

Searches by registration_number, full_name, phone_number, aadhaar_number (digit-aware icontains).

### 5.3 `GET /api/v1/patients/<patient_id>/fingerprint-template/`

View: `PatientFingerprintTemplateView.get`

Returns: `patient_id`, `fingerprint_template`, `fingerprint_enrolled_at`, `fingerprint_template_key_version`.

Errors: 404 when patient not found or fingerprint template absent.

### 5.4 `GET /api/v1/patients/<patient_id>/photo/`

View: `PatientPhotoView.get`

Behavior:

- Auth-required guarded media streaming endpoint
- Guesses content-type from file name
- Returns `FileResponse` with `Cache-Control: private, no-store`

### 5.5 `GET /api/v1/receptionist/patients/`

View: `ReceptionistPatientListView.get`

Query params: `q`, `page` (default 1), `pageSize` (default 100, clamped).

Response:

- `items[]`: detailed lookup serializer payload list
- `pagination`: `{page, pageSize, total}`

### 5.6 `GET /api/v1/receptionist/patients/summary/`

View: `ReceptionistPatientSummaryListView.get`
Serializer: `PatientSummarySerializer`

Lightweight paginated list for patient cards/listing UI.

Summary item fields: `patient_id`, `registration_number`, `hdams_id`, `full_name`, `phone_number`, `date_of_birth`, `sex`, `status`, `photo_url`.

### 5.7 `GET /api/v1/patients/<patient_id>/`

View: `PatientDetailView.get`
Serializer: `PatientGeneralDataSerializer`

Returns full patient profile with computed fields: `has_fingerprint`, `last_visit_date`, `days_since_last_visit`, `general_data_complete`, guarded `photo_url`.

### 5.8 `PATCH /api/v1/patients/<patient_id>/general/`

View: `PatientGeneralUpdateView.patch`
Serializer: `PatientGeneralUpdateSerializer` (partial update)

Working flow:

1. Fetch patient
2. Validate/normalize update fields (DOB, phone, Aadhaar uniqueness excluding self, fingerprint fields)
3. Save partial update; manages `fingerprint_enrolled_at` based on `fingerprint_template` changes
4. Return full `PatientGeneralDataSerializer` response

### 5.9 `GET /api/v1/patients/<patient_id>/visits/`

View: `PatientVisitsView.get`

Returns visit list for one patient ordered by newest:

- `id`, `visit_uid`, `visit_date`, `visit_type`, `file_number`
- `checkin_time`, `completed_time`
- `status`, `current_stage`
- `medicines_total`

### 5.10 `DELETE /api/v1/patients/<patient_id>/`

View: `PatientDetailView.delete`

Working flow:

1. Fetch patient by id
2. Delete patient row (VisitSession rows cascade)
3. Remove patient media directory under `MEDIA_ROOT/patients/<patient_id>` on transaction commit
4. Return success payload with `deleted=true` and `patient_id`

### 5.11 `PATCH /api/v1/patients/<patient_id>/next-followup-date/`

View: `PatientFollowUpDateUpdateView.patch`
Permission: `IsReceptionAdminOrPharmacist`

Request body:

- `next_followup_date` (nullable date; optional in body to fetch current value)

Behavior:

- Sets or clears `patient.next_followup_date`.
- Rejects past dates.
- Returns `{ patient_id, next_followup_date }`.

> **Note:** The pharmacy dispense flow updates this field directly inside its atomic transaction rather than calling this endpoint.

---

## 6. Visits API Blueprint

Base module: `backend/visits/views.py`

### 6.1 `POST /api/v1/sessions/checkin/`

View: `CheckinPatientView.post`
Serializer: `CheckinRequestSerializer`
Permission: `IsReceptionOrAdmin`

Request body:

- `patient_id` (UUID)
- `verification_method` (optional): `fingerprint` (default) or `photo`
- `verification_photo_base64` (required when `verification_method=photo`)
- `verification_photo_mime_type` (required when `verification_method=photo`; `image/jpeg` or `image/png`)
- `verification_photo_captured_at` (optional datetime; server uses current time when omitted for photo mode)

**Current workflow behavior:**

- This system now routes patients to the pharmacy queue at check-in.
- On successful check-in, session is created with:
  - `status = in_progress`
  - `current_stage = pharmacy`
  - `completed_time = null`
  - `file_number = patient.registration_number` (denormalized snapshot)

Detailed flow:

1. Validate `patient_id`
2. Ensure patient exists
3. Reject if patient status is `dead`
4. Reject if same patient already has any session for today
5. Validate verification mode payload:
   - fingerprint mode: no photo payload fields allowed
   - photo mode: photo payload is mandatory and validated (mime + size)
6. Determine `visit_type` as `first_visit` or `follow_up`
7. Create `VisitSession` with `in_progress` status and `pharmacy` stage
8. Reconcile follow-up tickets for this patient
9. If photo mode, save verification photo under patient media directory
10. Return 201 with `session_id`, patient details, `file_number`, status, current_stage, verification metadata

Response example:

```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "patient_id": "uuid",
    "patient_name": "Rahul Sharma",
    "file_number": "AGH260523123",
    "checked_in_by_name": "Reception Staff",
    "checked_in_at": "2026-05-23T09:30:00+05:30",
    "status": "in_progress",
    "current_stage": "pharmacy",
    "completed_at": null,
    "outstanding_debt_at_checkin": 0,
    "verification_method": "fingerprint",
    "verification_photo_captured_at": null
  }
}
```

Errors:

- 400 validation errors
- 404 patient not found
- 409 already checked in for today

### 6.2 `GET /api/v1/receptionist/dashboard/`

View: `DashboardStatsView.get`
Permission: `IsReceptionOrAdmin`

Returns: `totalPatients`, `todayVisits`, `completedToday`.

### 6.3 `GET /api/v1/receptionist/queue/`

View: `QueueStatusView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Behavior:**

- Returns today's `in_progress` sessions ordered by latest `checkin_time` first.
- Supports optional `?current_stage=<stage>` filter to narrow by current stage (e.g. `pharmacy`).

Query params:

- `current_stage` (optional): one of `counsellor`, `doctor`, `pharmacy`, `completed`

Each item contains:

- `session_id`
- `patient_id`
- `patient_name`
- `file_number`
- `checked_in_at`
- `checked_in_by_name`
- `status`
- `current_stage`
- `outstanding_debt`
- `patient` (`file_number`, `registration_number`)

### 6.4 `GET /api/v1/receptionist/reports/daily/`

View: `ReceptionDailyReportView.get`
Permission: `IsReceptionOrAdmin`

Query params: `date` (optional, defaults to today).

Response:

- `date`
- `total_checkins`
- `active_checkins`
- `completed_checkins`
- `items[]` (with patient snapshot: `registration_number`, `full_name`, `date_of_birth`, `gender`, `phone`, `patient_category`)

### 6.5 `GET /api/v1/receptionist/reports/monthly/`

View: `ReceptionMonthlyReportView.get`
Permission: `IsReceptionOrAdmin`

Query params: `year` (optional), `month` (optional).

Response: `year`, `month`, `total_checkins`, `active_checkins`, `completed_checkins`, `breakdown[]` (`{day, count}`).

### 6.6 `GET /api/v1/receptionist/reports/custom-range/`

View: `ReceptionCustomRangeReportView.get`
Permission: `IsReceptionOrAdmin`

Query params: `start_date` (required), `end_date` (required).

Validation: `start_date` cannot be after `end_date`.

Response: `start_date`, `end_date`, `total_checkins`, `active_checkins`, `completed_checkins`, `unique_patients`, `items[]`.

### 6.7 `GET /api/v1/receptionist/checkin-history/`

View: `ReceptionCheckinHistoryListView.get`
Permission: `IsReceptionOrAdmin`

Query params:

- `q` (optional): search by visit UID, registration number, name, phone
- `page` (optional, default 1)
- `pageSize` (optional, default 50, max 200)
- `verification_method` (optional): `fingerprint` or `photo`
- `status` (optional): `in_progress`, `completed`, `cancelled`
- `current_stage` (optional): `counsellor`, `doctor`, `pharmacy`, `completed`
- `start_date` (optional, YYYY-MM-DD)
- `end_date` (optional, YYYY-MM-DD)
- `today_only` (optional, boolean): convenience filter that restricts results to today's visits — used by the "Dispensed Today" view on the pharmacy frontend (combine with `status=completed`)

Validation: `start_date` cannot be after `end_date`.

Response item fields:

- `id`, `visit_uid`, `patient_id`, `visit_date`, `visit_type`, `file_number`
- `checkin_time`, `completed_time`, `status`, `current_stage`
- `checked_in_by_name`, `outstanding_debt_at_checkin`
- `verification_method`, `verification_photo_captured_at`
- `verification_photo_available`, `verification_photo_url`
- `patient` snapshot (registration_number, full_name, date_of_birth, gender, phone, patient_category, address_line1, relative_phone, blood_group, addiction_type, addiction_duration)

Plus `pagination: {page, pageSize, total}`.

### 6.8 `GET /api/v1/receptionist/checkin-history/<session_id>/verification-photo/`

View: `ReceptionCheckinHistoryPhotoView.get`
Permission: `IsReceptionOrAdmin`

Streams verification photo for the visit; returns `Cache-Control: private, no-store`.

Errors: 404 when visit or verification photo is missing.

### 6.9 `PATCH /api/v1/receptionist/checkin-history/<session_id>/`

View: `ReceptionCheckinHistoryDetailView.patch`
Serializer: `VisitSessionUpdateSerializer`
Permission: `IsReceptionOrAdmin`

**Use case:** External update to a visit session by reception or admin (e.g. manually flipping a visit to completed, correcting `file_number`, setting `medicines_total`). The pharmacy dispense flow does NOT call this endpoint — it updates the model directly inside its own transaction for atomicity.

Request body (any subset):

- `status` (`in_progress` | `completed` | `cancelled`)
- `current_stage` (`counsellor` | `doctor` | `pharmacy` | `completed`)
- `completed_time` (datetime; nullable)
- `file_number` (string up to 32 chars; may be blank)
- `medicines_total` (decimal, ≥ 0)

Behavior:

- Updates only the supplied fields.
- If `status` is set to `completed` and `completed_time` was not also supplied, server stamps `completed_time = now()`.
- Returns the updated session summary: `session_id`, `patient_id`, `status`, `current_stage`, `completed_time`, `file_number`, `medicines_total`.

### 6.10 `DELETE /api/v1/receptionist/checkin-history/<session_id>/`

View: `ReceptionCheckinHistoryDetailView.delete`
Permission: `IsReceptionOrAdmin`

Behavior:

- Deletes only the `VisitSession` row (keeps patient record intact).
- If a verification photo exists, file cleanup runs after commit (`transaction.on_commit`).

Response: `deleted` (boolean), `session_id`, `patient_id`.

---

## 7. Pharmacy API Blueprint

Base module: `backend/pharmacy/`

### 7.1 Module Overview

The pharmacy app owns inventory, dispensing, audit removal, stock movement ledger, and pharmacy-specific reporting. It has:

- 8 models: `Medicine`, `MedicineBatch`, `PurchaseInvoice`, `PurchaseInvoiceItem`, `DispenseInvoice`, `DispenseInvoiceItem`, `StockAuditRemoval`, `StockMovement`
- 16 endpoints (15 from blueprint §5 + 1 cancel endpoint)
- Services layer (`pharmacy.services`) for transactional business logic (`process_purchase_invoice`, `process_audit_removal`, `process_dispense`, `cancel_dispense_for_session`)

**Key invariants:**

- One dispense per visit (OneToOne on `DispenseInvoice.visit_session`).
- Stock is tracked at the batch level; deductions use `select_for_update()` to prevent races.
- All quantity changes are logged immutably in `StockMovement`.
- Snapshot fields on `DispenseInvoiceItem` preserve historical accuracy if the medicine record is later edited.

### 7.2 Medicine Enums

- `MedicineCategory`: `BUP`, `Rx`, `NRx`
- `BupStrength`: `0.4mg + 0.1mg`, `1.0mg + 0.25mg`, `2.0mg + 0.5mg`
- `PaymentMethod`: `Cash`, `Online`, `Split`
- `RemovalReason`: `destroyed`, `returned`, `damaged`, `defect`
- `MovementType`: `purchase`, `dispense`, `audit_removal`, `adjustment`
- `DispenseStatus`: `success`, `cancelled`

### 7.3 `GET /api/v1/pharmacy/inventory/medicines/`

View: `MedicineListCreateView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Populate the inventory list / dispense workstation medicine picker.

Query params:

- `category` (optional): `BUP`, `Rx`, `NRx`
- `bup_category` (optional): used in conjunction with `category=BUP`
- `search` (optional): icontains over `name` or `salt`

Response:

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "Buprenorphine Sublingual 2.0mg",
        "salt": "Buprenorphine + Naloxone",
        "category": "BUP",
        "bup_category": "2.0mg + 0.5mg",
        "manufacturer": "Abbott Healthcare",
        "reorder_level": 50,
        "tablets_per_strip": 10,
        "mrp": "450.00",
        "selling_price": "420.00",
        "is_active": true,
        "batches": [
          { "batch_number": "B-2024-01", "expiry_date": "2026-10-15", "quantity": 120 }
        ]
      }
    ],
    "total": 7
  }
}
```

Batches are ordered FEFO (earliest expiry first) and include only active batches.

### 7.4 `POST /api/v1/pharmacy/inventory/medicines/`

View: `MedicineListCreateView.post`
Serializer: `MedicineWriteSerializer`
Permission: `IsPharmacistOrAdmin`

**Use case:** Register a new medicine.

Request body:

```json
{
  "name": "Olanzapine 5mg",
  "salt": "Olanzapine",
  "category": "Rx",
  "bup_category": null,
  "manufacturer": "Sun Pharma",
  "reorder_level": 50,
  "tablets_per_strip": 10,
  "mrp": "125.00",
  "selling_price": "110.00"
}
```

Validation:

- `selling_price ≤ mrp`
- `category=BUP` requires non-null `bup_category`; non-BUP must have null `bup_category`
- Conditional unique constraint: `(name, category, bup_category)` must be unique among active medicines

Response (201): full medicine read payload.

Errors: 400 validation, 409 duplicate active medicine.

### 7.5 `GET /api/v1/pharmacy/inventory/medicines/<id>/`

View: `MedicineDetailView.get`
Permission: `IsReceptionAdminOrPharmacist`

Returns the same shape as a single list item.

### 7.6 `PATCH /api/v1/pharmacy/inventory/medicines/<id>/`

View: `MedicineDetailView.patch`
Serializer: `MedicineWriteSerializer` (partial)
Permission: `IsPharmacistOrAdmin`

Partial update. Same validation rules as POST applied against the merged state of stored + new values.

### 7.7 `DELETE /api/v1/pharmacy/inventory/medicines/<id>/`

View: `MedicineDetailView.delete`
Serializer: `MedicineDeleteSerializer`
Permission: `IsPharmacistOrAdmin`

**Use case:** Soft-delete a medicine. Historical batches and dispense items remain intact via denormalized snapshots.

Request body:

```json
{ "reason": "controlled_deletion", "notes": "Optional explanation" }
```

Side effects: `is_active=False`, `deletion_reason`, `deletion_notes`, `updated_by` set.

Response: `{ deleted: true, medicine_id }`.

### 7.8 `GET /api/v1/pharmacy/inventory/stats/`

View: `InventoryStatsView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Dashboard cards on the pharmacy home page.

Response:

```json
{
  "success": true,
  "data": {
    "total_medicines": 7,
    "low_stock_count": 2,
    "near_expiry_count": 3,
    "expired_count": 1,
    "total_stock_value": "145600.00",
    "todays_revenue": "8400.00"
  }
}
```

Computation:

- `total_medicines` — count of active medicines
- `low_stock_count` — active medicines whose `Sum(batches.quantity where is_active)` ≤ `reorder_level`
- `near_expiry_count` — active batches with `today ≤ expiry_date ≤ today + 180 days`
- `expired_count` — active batches with `expiry_date < today`
- `total_stock_value` — `Sum(batch.quantity * medicine.selling_price)` over active batches of active medicines
- `todays_revenue` — `Sum(DispenseInvoice.net_payable)` where `dispense_date = today` and `status = success`

### 7.9 `POST /api/v1/pharmacy/inventory/invoices/`

View: `PurchaseInvoiceCreateView.post`
Serializer: `PurchaseInvoiceCreateSerializer`
Service: `services.process_purchase_invoice`
Permission: `IsPharmacistOrAdmin`
Transaction: atomic

**Use case:** Pharmacist submits a supplier invoice to load stock.

Request body:

```json
{
  "invoice_number": "SUP-2026-0042",
  "supplier": "Abbott Healthcare Ltd",
  "invoice_date": "2026-05-20",
  "delivery_date": "2026-05-22",
  "notes": "",
  "items": [
    {
      "medicine_id": "uuid",
      "category": "BUP",
      "subcategory": "2.0mg + 0.5mg",
      "batch_number": "B-2026-NEW",
      "expiry_date": "2028-06-30",
      "quantity": 500,
      "purchase_price": "320.00",
      "gst_percentage": "12.00"
    }
  ]
}
```

Validation:

- `invoice_number` globally unique
- `invoice_date` not in the future
- `delivery_date ≥ invoice_date` if provided
- ≥ 1 item; each item references an active medicine; `expiry_date` in the future; `quantity > 0`; `0 ≤ gst_percentage ≤ 100`
- No duplicate `(medicine_id, batch_number)` within items

Side effects per item:

1. Find-or-create `MedicineBatch` (locked via `select_for_update`); increment `quantity`, reactivate if previously depleted.
2. Compute `line_total = quantity * purchase_price * (1 + gst/100)`.
3. Create `PurchaseInvoiceItem`.
4. Create `StockMovement` (`movement_type=purchase`).

Finally updates invoice `total_amount` and `items_count`.

Response (201):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoice_number": "SUP-2026-0042",
    "supplier": "Abbott Healthcare Ltd",
    "items_loaded": 1,
    "total_amount": "179200.00"
  }
}
```

Errors: 400 validation, 409 duplicate invoice number, 404 medicine not found.

### 7.10 `POST /api/v1/pharmacy/inventory/audit-removal/`

View: `AuditStockRemovalView.post`
Serializer: `AuditRemovalCreateSerializer`
Service: `services.process_audit_removal`
Permission: `IsPharmacistOrAdmin`
Transaction: atomic, batch row locked

**Use case:** Pharmacist removes stock due to destruction, return, damage, or manufacturing defect.

Request body:

```json
{
  "medicine_id": "uuid",
  "batch_number": "B-2024-01",
  "quantity": 25,
  "reason": "destroyed",
  "notes": "Expired batch destroyed per protocol"
}
```

`quantity` is optional — if omitted, the entire remaining batch quantity is removed.

Side effects:

1. Lock batch row.
2. Validate `quantity ≤ batch.quantity`.
3. Decrement `batch.quantity`; set `is_active=False` when it reaches zero.
4. Create `StockAuditRemoval` record.
5. Create `StockMovement` (`movement_type=audit_removal`).

Response (201): `id`, `medicine_id`, `batch_number`, `quantity_removed`, `reason`.

### 7.11 `GET /api/v1/pharmacy/inventory/medicines/<id>/dispense-history/`

View: `ProductDispenseHistoryView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Per-medicine consumption log on the medicine detail page.

Query params:

- `date` (optional, YYYY-MM-DD): exact date filter
- `month` (optional, YYYY-MM): month filter

Filters only `DispenseInvoice` rows with `status=success`.

Response:

```json
{
  "success": true,
  "data": {
    "medicine_id": "uuid",
    "items": [
      {
        "id": "uuid",
        "dispense_date": "2026-05-20",
        "patient_name": "Rahul Sharma",
        "patient_id": "uuid",
        "batch_number": "B-2024-01",
        "expiry_date": "2026-10-15",
        "quantity": 20,
        "total_price": "8400.00"
      }
    ],
    "total_quantity": 420
  }
}
```

### 7.12 `GET /api/v1/pharmacy/queue/`

View: `PharmacyQueueView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Dedicated pharmacy queue (alternative to filtering `/receptionist/queue/?current_stage=pharmacy`).

Returns today's sessions with `status=in_progress` and `current_stage=pharmacy`, ordered by `checkin_time` ascending (oldest first).

Response item shape:

```json
{
  "session_id": "uuid",
  "patient_id": "uuid",
  "patient_name": "Rahul Sharma",
  "current_stage": "pharmacy",
  "status": "in_progress",
  "checked_in_at": "2026-05-23T09:30:00+05:30",
  "checked_in_by_name": "Reception Staff",
  "outstanding_debt": "0.00",
  "patient": {
    "file_number": "AGH260523123",
    "registration_number": "AGH260523123",
    "phone": "9876543210",
    "date_of_birth": "1990-04-12",
    "sex": "male"
  }
}
```

### 7.13 `POST /api/v1/pharmacy/dispense/`

View: `DispenseCreateView.post`
Serializer: `DispenseCreateSerializer`
Service: `services.process_dispense`
Permission: `IsPharmacistOrAdmin`
Transaction: atomic, batch rows locked with `select_for_update()`

**Use case:** Pharmacist submits the dispense invoice for a visit. Single endpoint that persists the invoice, deducts stock, transitions the visit to completed, and updates the patient's follow-up date.

Request body:

```json
{
  "session_id": "uuid",
  "display_invoice_number": "INV-234567",
  "line_items": [
    {
      "medicine_id": "uuid",
      "batch_number": "B-2024-01",
      "dose": "1-0-1",
      "days": 10,
      "qty": 20,
      "unit_price": "420.00"
    }
  ],
  "payment": {
    "payment_method": "Cash",
    "cash_amount": "7980.00",
    "online_amount": "0",
    "discount": "5.0",
    "notes": "Regular patient discount applied"
  },
  "next_followup_date": "2026-06-02"
}
```

Validation:

- Session exists, `status=in_progress`, `current_stage=pharmacy`
- No existing `DispenseInvoice` for the session (unique constraint)
- Each line item references an active medicine; batch is active, belongs to medicine, and not expired
- Per-batch aggregate requested quantity (same batch may appear in multiple line items) ≤ batch's current quantity (re-checked after lock)
- Payment validation:
  - `subtotal = Σ(qty × unit_price)`
  - `discount_amount = round(subtotal × discount / 100)`
  - `net_payable = subtotal − discount_amount`
  - `Cash`: `|cash_amount − net_payable| ≤ ₹1`
  - `Online`: `|online_amount − net_payable| ≤ ₹1`
  - `Split`: `|cash_amount + online_amount − net_payable| ≤ ₹1`
- `next_followup_date` must be in the future if provided

Side effects (in order, single transaction):

1. Generate `invoice_number` (format `INV-YYYYMMDD-XXXX`)
2. Lock all referenced batches with `select_for_update()` in deterministic order
3. Re-validate aggregated quantities after locking
4. Create `DispenseInvoice` (status=`success`)
5. For each line item:
   - Create `DispenseInvoiceItem` with denormalized snapshots (medicine_name, salt, category, batch_number, expiry_date)
   - Decrement batch quantity; deactivate batch if it reaches zero
   - Create `StockMovement` (`movement_type=dispense`). For BUP medicines, the patient UUID is recorded in `notes` for NDPS audit trail.
6. Update `VisitSession.medicines_total = net_payable`
7. Transition `VisitSession.current_stage = completed`, `status = completed`, `completed_time = now()`
8. If `next_followup_date` provided, update `Patient.next_followup_date` directly inside the same transaction

Response (201):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoice_number": "INV-20260523-0001",
    "display_invoice_number": "INV-234567",
    "session_id": "uuid",
    "patient_id": "uuid",
    "patient_name": "Rahul Sharma",
    "subtotal": "8400.00",
    "discount_percentage": "5.00",
    "discount_amount": "420.00",
    "net_payable": "7980.00",
    "payment_method": "Cash",
    "cash_amount": "7980.00",
    "online_amount": "0.00",
    "item_count": 1,
    "dispensed_at": "2026-05-23T10:30:00+05:30",
    "dispensed_by": "Dr. Pharmacist",
    "current_stage": "completed",
    "status": "success"
  }
}
```

Errors:

- 400: validation (empty items, payment mismatch, expired batch, etc.)
- 404: session, medicine, or batch not found
- 409: dispense already exists for session OR insufficient stock after lock acquisition

### 7.14 `POST /api/v1/pharmacy/dispense/<session_id>/cancel/`

View: `DispenseCancelView.post`
Serializer: `DispenseCancelSerializer`
Service: `services.cancel_dispense_for_session`
Permission: `IsPharmacistOrAdmin`
Transaction: atomic, session + batch rows locked

**Use case:** Pharmacist cancels a prescription for a visit. Two scenarios:

- **No dispense exists yet** (pharmacist cancels before saving): creates a zero-amount `cancelled` `DispenseInvoice` so the visit has a 1:1 link to a pharmacy outcome. Requires the visit's `current_stage = pharmacy`.
- **A `success` dispense already exists**: restores stock for each line item (logged as `adjustment` movements), zeros `net_payable`/`cash_amount`/`online_amount`, flips status to `cancelled`, and stamps `cancelled_at` / `cancelled_by` / `cancel_reason`.

In both cases the linked `VisitSession` transitions to `current_stage=completed`, `status=completed`, `medicines_total=0`. `completed_time` is set to now if not already set.

Request body:

```json
{ "reason": "Patient declined treatment" }
```

Response:

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoice_number": "INV-20260523-0002",
    "session_id": "uuid",
    "status": "cancelled",
    "net_payable": "0.00",
    "cancelled_at": "2026-05-23T10:45:00+05:30",
    "cancel_reason": "Patient declined treatment"
  }
}
```

Errors:

- 400: visit session not found OR cancellation attempted before pharmacy stage when no dispense exists
- 409: dispense invoice already cancelled

### 7.15 `GET /api/v1/pharmacy/dispense-history/`

View: `DispenseHistoryListView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Invoice history page for pharmacy.

Query params:

- `q` (optional): search by patient name, registration number, invoice number, or display invoice number
- `page` (default 1), `pageSize` (default 50, max 200)
- `start_date`, `end_date` (optional, YYYY-MM-DD): dispense_date range
- `status` (optional): `success` or `cancelled`
- `today_only` (optional, boolean): restricts to today's dispenses (truthy values: `1`, `true`, `yes`)

Response item shape:

```json
{
  "id": "uuid",
  "invoice_number": "INV-20260523-0001",
  "display_invoice_number": "INV-234567",
  "patient": "Rahul Sharma",
  "patient_id": "uuid",
  "file_number": "AGH260523123",
  "registration_number": "AGH260523123",
  "amount": "7980.00",
  "date": "2026-05-23",
  "time": "10:30 AM",
  "pharmacist": "Dr. Pharmacist",
  "status": "success",
  "payment_method": "Cash"
}
```

Plus `pagination: {page, pageSize, total}`.

### 7.16 `GET /api/v1/pharmacy/reports/revenue/`

View: `RevenueReportView.get`
Permission: `IsPharmacistOrAdmin`

**Use case:** Revenue reporting with daily breakdown and cash/online split.

Query params:

- `range` (optional): `daily`, `monthly` (default), `custom`
- `date` (required for `range=daily`, YYYY-MM-DD)
- `month` (optional for `range=monthly`, YYYY-MM; defaults to current month)
- `start_date`, `end_date` (required for `range=custom`)

Only `status=success` dispenses are aggregated.

Response:

```json
{
  "success": true,
  "data": {
    "period": "May 2026",
    "summary": {
      "total_revenue": "245000.00",
      "total_cash": "145000.00",
      "total_online": "100000.00",
      "total_transactions": 348
    },
    "breakdown": [
      {
        "date": "2026-05-01",
        "day_name": "Friday",
        "revenue": "8500.00",
        "cash": "5200.00",
        "online": "3300.00",
        "transactions": 12
      }
    ]
  }
}
```

### 7.17 `GET /api/v1/pharmacy/reports/consumption/`

View: `ConsumptionReportView.get`
Permission: `IsPharmacistOrAdmin`

**Use case:** Medicine consumption trend + per-medicine breakdown.

Query params: same as Revenue Report, plus optional `category` (`All`, `Rx`, `NRx`, `BUP`).

Response:

```json
{
  "success": true,
  "data": {
    "period": "May 2026",
    "trend_data": [
      {
        "date": "2026-05-01",
        "day_name": "Friday",
        "rx": 45,
        "nrx": 20,
        "bup": 30,
        "total": 95
      }
    ],
    "medicine_breakdown": [
      {
        "name": "Buprenorphine Sublingual 2.0mg",
        "salt": "Buprenorphine + Naloxone",
        "category": "BUP",
        "strength": "2.0mg + 0.5mg",
        "quantity": 150,
        "selling_value": "63000.00"
      }
    ]
  }
}
```

### 7.18 `GET /api/v1/pharmacy/reports/low-stock/`

View: `LowStockReportView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** List medicines at or below their reorder level (per-medicine, summed across active batches).

Response item:

```json
{
  "id": "uuid",
  "name": "Olanzapine 5mg",
  "salt": "Olanzapine",
  "category": "Rx",
  "current_stock": 45,
  "reorder_level": 50
}
```

### 7.19 `GET /api/v1/pharmacy/reports/expiry/`

View: `ExpiryReportView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Expired vs. near-expiry batch listings.

Behavior:

- `expired`: active batches with `expiry_date < today` (includes `days_overdue`).
- `near_expiry`: active batches with `today ≤ expiry_date ≤ today + 180 days` (includes `days_until_expiry`).

Response:

```json
{
  "success": true,
  "data": {
    "expired": [
      {
        "medicine_id": "uuid",
        "medicine_name": "Paracetamol 500mg",
        "batch_number": "BAT-9921",
        "expiry_date": "2026-03-15",
        "quantity": 50,
        "days_overdue": 69
      }
    ],
    "near_expiry": [
      {
        "medicine_id": "uuid",
        "medicine_name": "Olanzapine 5mg",
        "batch_number": "OLZ-991",
        "expiry_date": "2026-08-10",
        "quantity": 45,
        "days_until_expiry": 79
      }
    ]
  }
}
```

---

## 8. Follow-Ups API Blueprint

Base module: `backend/followups/views.py`

### 8.1 `GET /api/v1/receptionist/follow-ups/`

View: `ReceptionFollowUpListView.get`
Permission: `IsReceptionOrAdmin`

Query params:

- `q` (optional): search by registration number, name, phone
- `stage` (optional): `pending`, `completed`, `successful`, `success`, `all` (default `pending`)
- `page` (default 1), `pageSize` (default 50, max 200)

Behavior:

- Runs sync job on request:
  - creates pending tickets when `patient.next_followup_date + 2 days` is due
  - requeues completed unsuccessful calls when `next_call_date` is due
  - marks completed callbacks as `successful` if patient has checked in
- Returns paginated items and stage counts.

Response: `items[]`, `pagination`, `counts: { pending, completed, successful, all }`.

### 8.2 `POST /api/v1/receptionist/follow-ups/<ticket_id>/complete-call/`

View: `ReceptionFollowUpCallCompleteView.post`
Permission: `IsReceptionOrAdmin`

Request body:

- `call_result`: `confirmed` | `busy_later` | `wrong_number` | `not_reachable` | `other`
- `call_note` (required, non-empty)
- `next_call_date` (required when `call_result` is not `confirmed`; ignored for `confirmed`)

Behavior:

- Creates `FollowUpCallAttempt` history row.
- Marks ticket `status = completed`.
- Stores last call metadata on ticket.
- For unsuccessful calls, schedules retry via `next_call_date`.

---

## 9. Data Model and Enum Blueprint

### 9.1 `accounts.User`

Key fields: `email` (unique, login ID), `username` (auto-filled from email if blank), `full_name`, `role`, `hospital_id`.

`UserRole`: `admin`, `reception`, `receptionist`, `counsellor`, `doctor`, `pharmacist`.

### 9.2 `patients.Patient`

Key identity and workflow fields: `registration_number` (unique), `hdams_id` (nullable unique), `patient_category`, `full_name`, `date_of_birth`, `sex`, `phone_number`, `aadhaar_number` (nullable conditional unique), `photo`, `fingerprint_template` + `fingerprint_enrolled_at`, `status`, `outstanding_debt`, `next_followup_date`.

High-dimensional clinical/social profile fields are also part of this model.

Methods/properties: `general_data_complete` property, `generate_registration_number` classmethod.

### 9.3 `visits.VisitSession`

Key fields:

- `visit_uid` (unique)
- `patient` FK
- `checked_in_by` FK
- `visit_date`
- `visit_type`
- `file_number` — denormalized snapshot of `patient.registration_number` set at check-in
- `checkin_time`, `completed_time`
- `status`
- `current_stage`
- `outstanding_debt_at_checkin`
- `medicines_total` — populated by pharmacy dispense flow
- `verification_method`
- `verification_photo`
- `verification_photo_captured_at`

Enums:

- `VisitStatus`: `in_progress`, `completed`, `cancelled`
- `VisitStage`: `counsellor`, `doctor`, `pharmacy`, `completed`
- `CheckinVerificationMethod`: `fingerprint`, `photo`

Default `current_stage` on the model is `pharmacy`; the check-in flow explicitly sets `in_progress + pharmacy` for new sessions.

Classmethods: `generate_visit_uid`, `build_month_breakdown`, `build_year_breakdown`.

### 9.4 `followups.FollowUpTicket` / `followups.FollowUpCallAttempt`

`FollowUpTicket` key fields: `patient` FK, `cycle_number` (unique per patient), `follow_up_date`, `status` (`pending` | `completed` | `successful`), `pending_since`, `last_call_result`, `last_call_note`, `last_called_at`, `next_call_date`, `completed_at`, `successful_at`.

`FollowUpCallAttempt` key fields: `ticket` FK, `called_by` FK, `result`, `note`, `next_call_date`, `called_at`.

### 9.5 Pharmacy Models

See §7 for full model definitions. Summary of relationships:

| Parent | Child | Relationship | FK Field | Constraint |
|---|---|---|---|---|
| `Medicine` | `MedicineBatch` | 1-to-Many | `medicine_id` | Unique `(medicine, batch_number)` |
| `Medicine` | `PurchaseInvoiceItem` | 1-to-Many | `medicine_id` | — |
| `Medicine` | `DispenseInvoiceItem` | 1-to-Many | `medicine_id` | — |
| `Medicine` | `StockAuditRemoval` | 1-to-Many | `medicine_id` | — |
| `Medicine` | `StockMovement` | 1-to-Many | `medicine_id` | — |
| `MedicineBatch` | `DispenseInvoiceItem` | 1-to-Many | `batch_id` | — |
| `MedicineBatch` | `StockAuditRemoval` | 1-to-Many | `batch_id` | — |
| `MedicineBatch` | `StockMovement` | 1-to-Many | `batch_id` | — |
| `PurchaseInvoice` | `PurchaseInvoiceItem` | 1-to-Many | `purchase_invoice_id` | CASCADE delete |
| `DispenseInvoice` | `DispenseInvoiceItem` | 1-to-Many | `dispense_invoice_id` | CASCADE delete |
| `VisitSession` | `DispenseInvoice` | **OneToOne** | `visit_session_id` | Unique |
| `Patient` | `DispenseInvoice` | 1-to-Many | `patient_id` | — |
| `User` | `DispenseInvoice` | 1-to-Many | `dispensed_by_id` | — |
| `User` | `StockAuditRemoval` | 1-to-Many | `removed_by_id` | — |
| `User` | `StockMovement` | 1-to-Many | `performed_by_id` | — |

Stock movement type reference:

| Movement Type | Direction | Triggered By | Reference Model |
|---|---|---|---|
| `purchase` | ➕ Ingress | Purchase Invoice submission | `PurchaseInvoice` |
| `dispense` | ➖ Egress | Dispense Invoice creation | `DispenseInvoiceItem` |
| `audit_removal` | ➖ Egress | Stock Audit Removal | `StockAuditRemoval` |
| `adjustment` | ➕/➖ | Manual or dispense cancellation | (varies) |

---

## 10. Standard Error Map

- **400** ValidationError (serializer and request validation)
- **401** Authentication/session/refresh failures
- **403** CSRF failure on mutating endpoints; insufficient role
- **404** Resource not found (missing patient, missing photo/template, missing medicine/batch/session)
- **409** ConflictError — duplicate unique business actions (duplicate same-day check-in, duplicate purchase invoice number, duplicate dispense per visit, insufficient stock after row lock)
- **500** Unhandled server errors (wrapped by `api_exception_handler`)

---

## 11. Security and Operational Notes

- Auth tokens are cookie-based and HttpOnly.
- CSRF is mandatory for mutating auth endpoints and authenticated mutating API calls.
- Photo and pharmacy media (purchase invoice photos, audit removal documents) are served behind authenticated endpoints, not open media URLs.
- Pagination is centralized and capped at `pageSize=200`.
- In DEBUG mode, media static serving is enabled via root `urls.py`.
- All pharmacy stock changes are immutably logged in `StockMovement` for audit/regulatory compliance (especially BUP / Schedule H1 drugs — patient UUID is captured in `notes` for BUP dispenses).
- All pharmacy multi-row writes use `@transaction.atomic` and `select_for_update()` on batch rows to prevent concurrent overselling.

---

## 12. Endpoint Inventory Quick Table

**Accounts:**

- `POST /api/v1/auth/login/`
- `GET  /api/v1/auth/session/`
- `POST /api/v1/auth/refresh/`
- `POST /api/v1/auth/logout/`

**Patients:**

- `POST   /api/v1/patients/register/`
- `GET    /api/v1/patients/lookup/`
- `GET    /api/v1/patients/<patient_id>/fingerprint-template/`
- `GET    /api/v1/patients/<patient_id>/photo/`
- `GET    /api/v1/patients/<patient_id>/`
- `DELETE /api/v1/patients/<patient_id>/`
- `PATCH  /api/v1/patients/<patient_id>/general/`
- `PATCH  /api/v1/patients/<patient_id>/next-followup-date/`
- `GET    /api/v1/patients/<patient_id>/visits/`
- `GET    /api/v1/receptionist/patients/`
- `GET    /api/v1/receptionist/patients/summary/`

**Visits:**

- `POST   /api/v1/sessions/checkin/`
- `GET    /api/v1/receptionist/dashboard/`
- `GET    /api/v1/receptionist/queue/`
- `GET    /api/v1/receptionist/checkin-history/`
- `GET    /api/v1/receptionist/checkin-history/<session_id>/verification-photo/`
- `PATCH  /api/v1/receptionist/checkin-history/<session_id>/`
- `DELETE /api/v1/receptionist/checkin-history/<session_id>/`
- `GET    /api/v1/receptionist/reports/daily/`
- `GET    /api/v1/receptionist/reports/monthly/`
- `GET    /api/v1/receptionist/reports/custom-range/`

**Follow-Ups:**

- `GET  /api/v1/receptionist/follow-ups/`
- `POST /api/v1/receptionist/follow-ups/<ticket_id>/complete-call/`

**Pharmacy:**

- `GET    /api/v1/pharmacy/inventory/medicines/`
- `POST   /api/v1/pharmacy/inventory/medicines/`
- `GET    /api/v1/pharmacy/inventory/medicines/<id>/`
- `PATCH  /api/v1/pharmacy/inventory/medicines/<id>/`
- `DELETE /api/v1/pharmacy/inventory/medicines/<id>/`
- `GET    /api/v1/pharmacy/inventory/medicines/<id>/dispense-history/`
- `GET    /api/v1/pharmacy/inventory/stats/`
- `POST   /api/v1/pharmacy/inventory/invoices/`
- `POST   /api/v1/pharmacy/inventory/audit-removal/`
- `GET    /api/v1/pharmacy/queue/`
- `POST   /api/v1/pharmacy/dispense/`
- `POST   /api/v1/pharmacy/dispense/<session_id>/cancel/`
- `GET    /api/v1/pharmacy/dispense-history/`
- `GET    /api/v1/pharmacy/reports/revenue/`
- `GET    /api/v1/pharmacy/reports/consumption/`
- `GET    /api/v1/pharmacy/reports/low-stock/`
- `GET    /api/v1/pharmacy/reports/expiry/`
