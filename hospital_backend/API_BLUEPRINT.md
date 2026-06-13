# Hospital Backend API Blueprint (Django)

> **Last Updated:** 2026-06-14 (IST) — single medicine create now returns 409 (not 500) on duplicates, enforced at app level for all categories
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

- `IsReceptionOrAdmin`: allows roles `admin`, `reception`
- `IsAdminRole`: allows role `admin` only
- `IsReceptionAdminOrPharmacist`: allows roles `admin`, `reception`, `pharmacist`
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
    "message": "...",
    "fields": {
      "<field path>": ["<msg>", "..."]
    },
    "code": "<exception code>",
    "...": "<extras>"
  }
}
```

* `message` is always present — older clients that only read it continue to work.
* `fields` is added whenever the underlying DRF error carries per-field
  structure (e.g. serializer ValidationError). Nested errors inside
  `many=True` serializers are flattened to dot/index paths (`items.0.quantity`)
  so the front-end can address them directly. Omitted for non-validation
  errors and when the only field is the implicit `non_field_errors`.
* `code` exposes the exception's `default_code` (`conflict`,
  `not_authenticated`, `permission_denied`, `internal_error`, …) so clients
  can branch on machine-readable identifiers.
* Subclasses can attach an `extra` dict that is merged verbatim into
  `error`. Today `ConflictError` ships `last_file_number` here after a
  patient registration collision (see §5.1).

Important behavior:

- `success_response` can also attach a CSRF cookie when `request` is passed.
- `ConflictError` maps to HTTP 409 with the standard error envelope.
- `AuthFailedClearCookies` (subclass of `AuthenticationFailed`) maps to HTTP 401
  AND instructs the handler to clear both auth cookies on the response. Used by
  the cookie-auth session/refresh views so stale JWTs stop being re-sent.

Enforcement rules:

- **Views never construct error `Response`s by hand.** Every non-2xx path raises
  an exception (`ValidationError`, `NotFound`, `PermissionDenied`,
  `ConflictError`, `AuthenticationFailed`, …). The handler wired in
  `REST_FRAMEWORK["EXCEPTION_HANDLER"]` is the single place that builds error
  bodies.
- The handler explicitly strips DRF's `detail` key from `error.fields` so the
  401/403/404 message never appears twice in the payload.
- Top-level `non_field_errors` is collapsed into `message`. Nested
  `non_field_errors` (e.g. `payment.non_field_errors`) is kept because it is
  distinct from the summary.

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

- `ConflictError` — `APIException` subclass with HTTP 409. Accepts an
  `extra=` dict that the handler merges into `error` as siblings of
  `message`/`code` (e.g. `last_file_number` on a file-number collision).
- `AuthFailedClearCookies` — `AuthenticationFailed` subclass that carries a
  `clear_auth_cookies = True` marker. The handler recognises this and wipes
  both auth cookies on the 401 response.
- `_coerce_message(data)` — extracts human-readable message from nested DRF error structures.
- `_flatten_field_errors(data)` — flattens nested DRF validation errors into
  dot/index paths (`items.0.expiry_date`).
- `api_exception_handler(exc, context)` — converts all handled exceptions to
  the standardized error envelope; returns 500 with `"internal_error"` when
  DRF gives no response.

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
- `user` (`id`, `full_name`, `email`, `role`)

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
- `file_number` (required; user-supplied; format `^[A-Za-z0-9-]+$`, max 32 chars)
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
   - `file_number` is required, must match `^[A-Za-z0-9-]+$`, and must be unique
2. Create patient record, set `fingerprint_enrolled_at`
3. Save decoded photo to `ImageField` when present
4. Serialize result using `PatientLookupSerializer`
5. Add `fingerprint_reenrollment_required=false` flag
6. Return 201 success

Errors:

- 400 validation errors
- 409 file_number collision — error envelope includes `last_file_number` (the
  most recently created patient's file_number) so the front-end can suggest
  the next available value:
  `{"success": false, "error": {"message": "This file number already exists.", "last_file_number": "A47"}}`

### 5.2 `GET /api/v1/patients/lookup/`

View: `PatientLookupView.get`
Permission: `IsReceptionOrAdmin`

Query params:

- `file_number` (exact match path)
- `q` (broad search path)

Searches by file_number, full_name, phone_number, aadhaar_number (digit-aware icontains).

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

Query params:

- `q` — free-text search. Without `search_fields` it OR-matches across the
  legacy default set (`file_number`, `full_name`, `phone_number`,
  `aadhaar_number`).
- `search_fields` — optional **multi-value**, repeated-key. Allow-list:
  `file_number`, `full_name`, `phone_number`, `aadhaar_number`, `hdams_id`.
  When present, `q` is OR-matched only across the named fields (so the
  caller can scope a search to e.g. file number only, or file number +
  HDAMS). Unknown names are silently dropped; if the validated set is empty
  the endpoint falls back to the legacy default so a malformed param never
  produces a silently empty result. Ignored when `q` is empty. **Only this
  endpoint reads `search_fields`** — `patients/lookup/` and
  `receptionist/patients/summary/` share `patient_search_queryset` but call
  it without `fields`, preserving their current "all fields" behaviour.
- `page` (default 1), `pageSize` (default 100, clamped).
- `state`, `district`, `addiction_type`, `patient_category` — **multi-value**.
  Repeat the key once per selected value:
  `?state=Bihar&state=Assam&patient_category=psychiatric`. A single value is
  also accepted for backwards compatibility (`?state=Bihar`).
- `registration_start`, `registration_end` — single ISO dates (range endpoints).

Filter semantics (implemented by `_apply_reception_list_filters`):

- **Within a field:** values are OR-combined (row matches if its value is in
  the selected set).
- **Across fields:** filters are AND-combined (every selected facet must match).
- **Empty selection / missing key:** that field is unconstrained.
- `state` and `district` are matched case-insensitively via a `Lower(field) IN
  (...)` annotation. `addiction_type` and `patient_category` use an exact `IN`
  against their canonical lowercase `TextChoices` values.
- A stray empty value (`?state=`) is ignored — it does **not** collapse the
  result set to "rows with empty state".

Response:

- `items[]`: detailed lookup serializer payload list
- `pagination`: `{page, pageSize, total}`

### 5.6 `GET /api/v1/receptionist/patients/summary/`

View: `ReceptionistPatientSummaryListView.get`
Serializer: `PatientSummarySerializer`

Lightweight paginated list for patient cards/listing UI.

Accepts the same multi-value filter params as §5.5 (same helper).

Summary item fields: `patient_id`, `file_number`, `hdams_id`, `full_name`, `phone_number`, `date_of_birth`, `sex`, `status`, `photo_url`.

### 5.6a `GET /api/v1/receptionist/patients/filter-options/`

View: `PatientFilterOptionsView.get`

Authoritative `state → districts` mapping for the reception filter panel.
The State and District multi-select option lists on the patient page are
sourced from this endpoint — **not** from any third-party address-data
package — so that:

- Districts the package doesn't ship with (legacy spellings, renamed/new
  districts, alternate transliterations) are still selectable, mapped to
  the state they actually belong to according to real patient rows.
- The option list cannot self-narrow as the user tightens filters — this
  endpoint takes no filter params on purpose; its result is stable
  regardless of what the user is currently filtering on.

Query params: **none**. Any params passed are ignored.

Response:

```json
{
  "success": true,
  "data": {
    "districts_by_state": {
      "Assam": ["Dibrugarh", "Guwahati"],
      "Bihar": ["Gaya", "Patna", "Pataliputra"]
    }
  }
}
```

- Keys are distinct non-empty `Patient.state` values.
- Values are sorted lists of distinct non-empty `Patient.district` values
  for patients in that state.
- Permission: `IsReceptionAdminOrPharmacist` (matches the list endpoint).
- Cached in-process for ~60s via `django.core.cache` (low-level API, not
  `cache_page` — the latter would bypass the auth check by serving cached
  responses to unauthenticated callers).

### 5.7 `GET /api/v1/patients/<patient_id>/`

View: `PatientDetailView.get`
Serializer: `PatientGeneralDataSerializer`

Returns full patient profile with computed fields: `has_fingerprint`, `last_visit_date`, `days_since_last_visit`, `general_data_complete`, guarded `photo_url`.

### 5.8 `PATCH /api/v1/patients/<patient_id>/general/`

View: `PatientGeneralUpdateView.patch`
Serializer: `PatientGeneralUpdateSerializer` (partial update)

Working flow:

1. Fetch patient
2. Validate/normalize update fields (DOB, phone, fingerprint fields)
3. Pre-check uniqueness (excluding self) on `file_number`, `hdams_id`, and
   `aadhaar_number`. Each emits a **409 ConflictError** with a
   human-readable `message` on collision; the `file_number` 409 also ships
   `last_file_number` in the payload so the frontend can suggest the next
   available id. Empty `hdams_id` is stored as NULL (multiple patients
   with no HDAMS id do not collide on the partial-unique index).
4. Save partial update; manages `fingerprint_enrolled_at` based on `fingerprint_template` changes
5. Wraps `save()` in an `IntegrityError` handler that re-raises as 409 for
   the same three unique fields, in case a concurrent edit slips through
   the pre-check race window.
6. Return full `PatientGeneralDataSerializer` response

Editable identity fields: `file_number`, `hdams_id`, `aadhaar_number` —
all subject to the uniqueness rules above. `file_number` additionally
runs the `^[A-Za-z0-9-]+$` regex validator.

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
  - `file_number = patient.file_number` (denormalized snapshot)

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
- `patient` (`file_number`)

### 6.4 `GET /api/v1/receptionist/reports/daily/`

View: `ReceptionDailyReportView.get`
Permission: `IsReceptionOrAdmin`

Query params: `date` (optional, defaults to today).

Response:

- `date`
- `total_checkins`
- `active_checkins`
- `completed_checkins`
- `items[]` (with patient snapshot: `file_number`, `full_name`, `date_of_birth`, `gender`, `phone`, `patient_category`)

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
- `patient` snapshot (file_number, full_name, date_of_birth, gender, phone, patient_category, address_line1, relative_phone, blood_group, addiction_type, addiction_duration)

Plus `pagination: {page, pageSize, total}`.

Plus `stats`: per-range summary used by the four cards on the reception
check-in history page (the cards must reflect the full matched set, not
the current page of the table). Shape:

```
stats: {
  total: number,
  by_verification_method: { fingerprint: number, photo: number, manual: number },
}
```

Scope: `stats` is computed AFTER `q`, `status`, `current_stage`,
`today_only`, `start_date`, `end_date` are applied, but BEFORE
`verification_method`. So `stats.total` equals `pagination.total` only
when `verification_method` is unset; when set, `pagination.total` is the
narrowed table count while `stats.total` is the date-range total. This
lets the frontend show a stable breakdown regardless of which method is
selected in the filter dropdown.

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
        ],
        "suppliers": [
          {
            "id": "uuid",
            "company_name": "Abbott Healthcare Ltd",
            "is_active": true,
            "categories": ["BUP", "Rx"]
          }
        ]
      }
    ],
    "total": 7
  }
}
```

Batches are ordered FEFO (earliest expiry first) and include only active batches.

`suppliers` is the explicit Medicine↔Supplier tracking relation declared at
register/edit time (distinct from the implicit link via purchase invoices).
Payload kept lightweight — only the fields the frontend needs for the
badges on the inventory table row and the picker in the register/edit
dialog (`is_active` to surface an "Inactive" badge, `categories` to
de-emphasise category-mismatched suppliers in the picker).

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
  "selling_price": "110.00",
  "supplier_ids": ["uuid", "uuid"]
}
```

Validation:

- `selling_price ≤ mrp`
- `category=BUP` requires non-null `bup_category`; non-BUP must have null `bup_category`
- Uniqueness on `(name, category, bup_category)` among active medicines.
  Enforced at the application level by `services.active_medicine_exists`
  (raises 409 before insert), backed by a partial `UniqueConstraint` on the
  DB. Note: the DB constraint alone is insufficient because PostgreSQL treats
  `NULL` as distinct, so it never fires for non-BUP rows (`bup_category IS
  NULL`) — the application check is what guarantees Rx/NRx uniqueness.
- `supplier_ids` (optional): list of Supplier UUIDs. Each id is checked
  against the Supplier table; unknown ids return 400 with
  `{"supplier_ids": [...]}`. Empty list is an explicit clear; omitting
  the key on PATCH preserves existing links.

Response (201): full medicine read payload.

Errors: 400 validation, 409 duplicate active medicine (any category).

### 7.4.1 `POST /api/v1/pharmacy/inventory/medicines/bulk-import/`

View: `MedicineBulkImportView`
Serializer: `MedicineBulkImportSerializer` (request envelope); per-row validation reuses `MedicineWriteSerializer`
Service: `services.bulk_create_medicines`
Permission: `IsPharmacistOrAdmin`

**Use case:** Bulk-register medicines from a parsed CSV (Inventory → Import
Medicines). The frontend parses/validates the CSV and lets the user fix rows
in a review grid before submitting; only then is this endpoint called.

Request body:

```json
{
  "items": [
    {
      "row_number": 1,
      "name": "Paracetamol 500mg",
      "salt": "Paracetamol",
      "category": "NRx",
      "bup_category": null,
      "manufacturer": "Cipla",
      "reorder_level": 50,
      "tablets_per_strip": 10,
      "mrp": "20.00",
      "selling_price": "18.00"
    }
  ]
}
```

- `items`: 1–2000 rows. Each row carries the same fields as the single
  `POST` body **except `supplier_ids`** — the relational Medicine↔Supplier
  link is intentionally excluded from CSV (UUIDs aren't human-authorable; no
  name-mapping mechanism exists). Suppliers are attached later via Edit Medicine.
- `row_number` (optional): 1-based CSV data row, echoed back in the report so
  the UI can map outcomes to grid rows. Falls back to positional index.

Per-row validation is identical to single creation (`selling_price ≤ mrp`;
BUP↔strength rules).

**Behaviour (product decisions):**

- **Duplicates** — a row matching an existing *active* medicine on
  `(name, category, bup_category)` is **skipped** (never modified) and reported.
- **Partial success** — valid, non-duplicate rows are committed even when
  sibling rows fail; each row is saved in its own savepoint. Failures are
  returned with row-level messages.

Response (200): per-row report (note: 200, not 201 — this is a batch report,
not a single resource):

```json
{
  "created": [{ "row_number": 1, "id": "uuid", "name": "Paracetamol 500mg" }],
  "skipped": [{ "row_number": 4, "name": "Aspirin", "reason": "Already exists — ..." }],
  "errors": [{ "row_number": 7, "errors": ["selling_price: Selling price cannot exceed MRP."] }],
  "summary": { "total": 7, "created": 1, "skipped": 1, "failed": 2 }
}
```

Errors: 400 if `items` is missing/empty or exceeds 2000 rows (envelope-level).
Row-level problems never fail the request — they appear under `errors`.

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
    "todays_revenue": "8400.00",
    "dispensed_today_count": 5
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
- `dispensed_today_count` — count of successful `DispenseInvoice` rows where `dispense_date = today` (same queryset as `todays_revenue`, aggregated together in a single round-trip)

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
  "supplier_id": "supplier-uuid",
  "order_date": "2026-05-18",
  "invoice_date": "2026-05-20",
  "delivery_date": "2026-05-22",
  "invoice_document_base64": "<optional-base64-payload>",
  "invoice_document_mime_type": "application/pdf",
  "invoice_document_filename": "supplier-bill.pdf",
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
- `supplier_id` references an existing, active Supplier (see §7.20)
- `order_date` is required for new submissions and cannot be in the future
- `invoice_date` not in the future
- `order_date <= invoice_date`
- `delivery_date ≥ invoice_date` if provided
- ≥ 1 item; each item references an active medicine; `expiry_date` in the future; `quantity > 0`; `0 ≤ gst_percentage ≤ 100`
- `delivery_date >= order_date` if provided
- Optional invoice document fields must be provided as a pair (`invoice_document_base64`, `invoice_document_mime_type`); allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`; maximum decoded file size: 5 MB
- No duplicate `(medicine_id, batch_number)` within items

Side effects per item:

1. Find-or-create `MedicineBatch` (locked via `select_for_update`); increment `quantity`, reactivate if previously depleted.
2. Compute `line_total = quantity * purchase_price * (1 + gst/100)`.
3. Create `PurchaseInvoiceItem`.
4. Create `StockMovement` (`movement_type=purchase`).
5. Add the invoice's supplier to the medicine's `suppliers` M2M
   (idempotent — no-op if the link already exists). This is how the
   explicit Medicine↔Supplier tracking relation grows from real
   purchase activity without an extra UI step. See §7.3 for the
   `Medicine.suppliers` field shape, and Edit Medicine for manual prune.

Finally updates invoice `total_amount` and `items_count`.

Response (201):

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "invoice_number": "SUP-2026-0042",
    "order_date": "2026-05-18",
    "invoice_date": "2026-05-20",
    "delivery_date": "2026-05-22",
    "supplier": {
      "id": "supplier-uuid",
      "company_name": "Abbott Healthcare Ltd",
      "mobile_number": "9876543210"
    },
    "items_loaded": 1,
    "total_amount": "179200.00",
    "invoice_document_url": "https://example.com/api/v1/pharmacy/inventory/invoices/<invoice_id>/document/"
  }
}
```

Errors: 400 validation, 404 supplier or medicine not found, 409 duplicate invoice number.

### 7.9.1 `GET /api/v1/pharmacy/inventory/invoices/<invoice_id>/document/`

View: `PurchaseInvoiceDocumentView.get`
Permission: `IsPharmacistOrAdmin`

**Use case:** Open or download the original supplier invoice document attached during purchase invoice creation.

Behavior:

- Looks up `PurchaseInvoice.invoice_photo` by invoice id.
- Returns an authenticated `FileResponse`.
- PDFs are returned as attachments for download; image documents are opened inline when the browser supports them.

Errors: 400 no document attached, 404 invoice not found.

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
        "dispense_time": "2026-05-20T11:24:17+05:30",
        "patient_name": "Rahul Sharma",
        "file_number": "AGH123",
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

`dispense_time` is the full ISO datetime from
`DispenseInvoice.dispense_time` — the per-invoice creation timestamp.
The earlier `dispense_date` (a date-only string) caused every row to
render the same midnight time on the frontend; the field was replaced.
`file_number` is the human-facing patient identifier from
`Patient.file_number`; it replaces the earlier `patient_id` UUID that
leaked the internal PK into the inventory consumption table and CSV
export.

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
    "discount": "420.00",
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
- `discount` is a **rupee amount** (2 dp), not a percentage. Must satisfy `0 ≤ discount ≤ subtotal`.
- Payment computation (server is the sole authority for money totals):
  - `subtotal = Σ(qty × round(unit_price, 2))`, then rounded to 2 dp
  - `discount_amount = round(discount, 2)`
  - `net_payable = subtotal − discount_amount`
  - `discount_percentage = round(discount_amount / subtotal × 100, 2)` — **derived, storage/reporting only**
  - `Cash`: server derives `cash_amount = net_payable`, `online_amount = 0` (client values ignored)
  - `Online`: server derives `online_amount = net_payable`, `cash_amount = 0` (client values ignored)
  - `Split`: client `cash_amount + online_amount` must reconcile to `net_payable` within ₹0.01; cash leg is then snapped so the parts sum exactly
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

### 7.14 `GET /api/v1/pharmacy/dispense/<session_id>/`

View: `DispenseInvoiceDetailView.get`
Permission: `IsReceptionAdminOrPharmacist`

**Use case:** Fetch the full dispense invoice (with line items) for a specific visit session. Used by the patient profile's "View Invoice" expansion to display medicines dispensed, quantities, prices, and totals.

**Path parameter:** `session_id` — UUID of the `VisitSession`.

**Response (200):**
```json
{
  "id": "<uuid>",
  "invoice_number": "INV-20260531-0001",
  "session_id": "<uuid>",
  "patient_id": "<uuid>",
  "patient_name": "Rahul Sharma",
  "dispense_date": "2026-05-31",
  "dispense_time": "2026-05-31T10:30:00+05:30",
  "subtotal": "224.00",
  "discount_percentage": "0.00",
  "discount_amount": "0.00",
  "net_payable": "224.00",
  "payment_method": "Cash",
  "cash_amount": "224.00",
  "online_amount": "0.00",
  "pharmacist": "Dr. Pharmacist",
  "status": "success",
  "notes": "",
  "next_followup_date": null,
  "items": [
    {
      "id": "<uuid>",
      "medicine_id": "<uuid>",
      "medicine_name": "Diazepam 5mg",
      "salt": "Diazepam",
      "category": "Rx",
      "batch_number": "B001",
      "dose": "5mg",
      "days": 7,
      "quantity": 7,
      "unit_price": "8.00",
      "total": "56.00"
    }
  ],
  "amendments": [
    {
      "amended_at": "2026-06-11T11:20:00+05:30",
      "amended_by_name": "Dr. Pharmacist",
      "reason": "Wrong quantity entered for Diazepam"
    }
  ]
}
```

`amendments` is ordered newest-first (empty list when the invoice was never
amended). `medicine_id` is included so the amend dialog can rebuild the
write payload from the read payload.

**Errors:**
- 404: no dispense invoice found for the given session

### 7.14a `PATCH /api/v1/pharmacy/dispense/<session_id>/`

View: `DispenseInvoiceDetailView.patch`
Serializer: `DispenseAmendSerializer`
Service: `services.amend_dispense_for_session`
Permission: `IsPharmacistOrAdmin`
Transaction: atomic; lock order session → invoice → union of old+new batches (mirrors cancel, so concurrent amend/cancel cannot deadlock)

**Use case:** Pharmacist corrects a wrongly recorded dispense (wrong
quantity / medicine / batch / payment split) after the fact. The invoice
and its line items are updated **in place**; the StockMovement ledger is
never rewritten — the amendment appends corrective rows.

Request body (same shape as §7.13 create minus `session_id`, plus a
mandatory reason):

```json
{
  "amend_reason": "Typed 50 instead of 30 tablets",
  "line_items": [
    {
      "medicine_id": "uuid",
      "batch_number": "B001",
      "dose": "5mg",
      "days": 7,
      "qty": 30,
      "unit_price": "8.00"
    }
  ],
  "payment": {
    "payment_method": "Cash",
    "cash_amount": 0,
    "online_amount": 0,
    "discount": 0,
    "notes": ""
  },
  "next_followup_date": null
}
```

Behaviour (revert-then-reapply, all inside one transaction):

1. Snapshot the pre-amendment invoice (items, totals, payment, notes,
   follow-up date) into the append-only `DispenseInvoiceAmendment` table
   (`amended_by`, `amended_at`, `reason`, `previous_state` JSON).
2. Restore stock for every original item; one `adjustment` StockMovement
   per item (`notes="amend revert: <reason>"`), reactivating depleted
   batches.
3. Delete the old `DispenseInvoiceItem` rows (content preserved in the
   snapshot).
4. Validate + apply the new items exactly like create: active medicine,
   batch exists, per-batch stock sufficiency. **Expiry exemption:** a
   batch present on the original invoice may be re-applied up to its
   originally dispensed quantity even if now expired (no new stock leaves
   the shelf); increases or newly added batches require a non-expired
   batch.
5. Create new items, deduct stock, one `dispense` StockMovement per item
   (`notes="amend"`, BUP rows keep the patient-id convention with an
   `| amend` suffix).
6. Recompute totals server-side (`_build_payment_totals` — same money
   policy as create), update the invoice money fields / notes /
   follow-up date, sync `VisitSession.medicines_total`, and update the
   patient's `next_followup_date` when provided.

Immutable through this endpoint: `invoice_number`, `visit_session`,
`patient`, `dispensed_by`, `dispense_date` / `dispense_time` (revenue
stays on the original date), `status` (only cancel changes it).

Ripple effects: revenue report, consumption report, dashboard
`todays_revenue`, and reception check-in history `medicines_total`
recompute automatically from the amended rows — including retroactively
for past dates.

Response (200): full §7.14 detail payload (with the new `amendments`
entry included).

Errors:

- 400: session/invoice not found, validation failures (expired-batch
  increase, unknown medicine/batch, empty `amend_reason`, < 1 line item)
- 409: invoice is cancelled (`"Cannot amend a cancelled invoice."`),
  insufficient stock for a requested increase

### 7.15 `POST /api/v1/pharmacy/dispense/<session_id>/cancel/`

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

- `q` (optional): search by patient name, file number, or invoice number
- `page` (default 1), `pageSize` (default 50, max 200)
- `start_date`, `end_date` (optional, YYYY-MM-DD): dispense_date range
- `status` (optional): `success` or `cancelled`
- `today_only` (optional, boolean): restricts to today's dispenses (truthy values: `1`, `true`, `yes`)

Response item shape:

```json
{
  "id": "uuid",
  "session_id": "uuid",
  "invoice_number": "INV-20260523-0001",
  "patient": "Rahul Sharma",
  "patient_id": "uuid",
  "file_number": "AGH260523123",
  "amount": "7980.00",
  "date": "2026-05-23",
  "time": "10:30 AM",
  "pharmacist": "Dr. Pharmacist",
  "status": "success",
  "payment_method": "Cash",
  "is_amended": false
}
```

`is_amended` is true when the invoice has at least one §7.14a amendment
(annotated via `Count("amendments")` — no per-row query).

Plus `pagination: {page, pageSize, total}`.

Plus `stats`: range-scoped KPI summary used by the three cards on the
pharmacy invoice history page (Unique Patients, Total Revenue, Total
Records). Shape:

```
stats: {
  unique_patients: number,
  total_revenue: string,   // Decimal serialised as string
  total_records: number,
}
```

Scope: `stats` is computed over the post-filter queryset (same `q`,
`start_date`, `end_date`, `status`, `today_only`, `current_stage`
filters as the list) but **before** pagination. So the three cards
describe the matched set independent of which page is being viewed.
`stats.total_records` equals `pagination.total` by construction — both
numbers describe the same queryset. Cancelled invoices have
`net_payable = 0`, so they contribute zero to `total_revenue`
regardless of whether the `status` filter includes them.

Notes:

- `session_id` is included so clients can call `GET /api/v1/pharmacy/dispense/<session_id>/` for detailed invoice view or PDF generation flows.

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

### 7.20 Suppliers

The pharmacy module owns a first-class `Supplier` entity. Every
`PurchaseInvoice.supplier` is a FK to a Supplier row (`on_delete=PROTECT`).
Soft-delete is supported via `is_active=False`; suppliers with invoices
cannot be hard-deleted.

Fields:

- `id` (UUID), `company_name` (case-insensitive unique),
- `contact_person`, `mobile_number`, `email`, `full_address`,
- `gst_number`, `drug_license_number`,
- `categories` (PostgreSQL array of `MedicineCategory` values: `BUP`, `Rx`, `NRx`),
- `is_active`, `invoice_count` (annotated), `created_at`, `updated_at`.

Validation (on create/update):

- `company_name` required, trimmed, case-insensitively unique → 409 on collision.
- `mobile_number` required at the API layer (column is nullable to accommodate
  legacy / seeded rows that pre-date this entity). 7–15 digits after stripping.
- `email` lowercased; blank → `null`.
- `gst_number` / `drug_license_number` uppercased; blank → `null`.
- `categories` deduplicated; values restricted to `MedicineCategory`.

#### `GET /api/v1/pharmacy/suppliers/`

Permission: `IsReceptionAdminOrPharmacist` (broadly readable so any picker can populate).

Query params: `q` (search company / contact / GST / drug license / mobile),
`is_active` (`true`/`false`), `category` (one of `BUP`, `Rx`, `NRx`),
`page` (default 1), `pageSize` (default 50, max 200).

Response: `{ items: Supplier[], pagination: { page, pageSize, total } }`.

#### `POST /api/v1/pharmacy/suppliers/`

Permission: `IsPharmacistOrAdmin`. Returns the created Supplier (201).

#### `GET /api/v1/pharmacy/suppliers/<supplier_id>/`

Permission: `IsReceptionAdminOrPharmacist`. Returns the Supplier.

#### `PATCH /api/v1/pharmacy/suppliers/<supplier_id>/`

Permission: `IsPharmacistOrAdmin`. Partial update.

#### `DELETE /api/v1/pharmacy/suppliers/<supplier_id>/`

Permission: `IsPharmacistOrAdmin`. **Soft-delete only** — sets `is_active=False`.
Returns `{ deactivated: true, supplier_id, is_active: false }`.

To reactivate, send `PATCH` with `{ "is_active": true }`.

---

## 8. Follow-Ups API Blueprint

Base modules: `backend/followups/views.py`, `backend/followups/serializers.py`, `backend/followups/services.py`

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

### 8.3 `GET /api/v1/receptionist/follow-ups/report/`

View: `ReceptionFollowUpCallingReportView.get`
Serializer: `CallingReportQuerySerializer`
Service: `build_calling_report_payload`
Permission: `IsReceptionOrAdmin`

Query params:

- `start_date` (required): ISO date — beginning of reporting window.
- `end_date` (required): ISO date — end of reporting window. Must be ≥ `start_date`.
- `patient_id` (optional): UUID — when provided, scopes the entire report to a
  single patient. Omit for the global calling-reports dashboard.

Behavior:

- Aggregates `FollowUpCallAttempt` rows where `called_at` falls within
  `[start_date, end_date]`.
- Returns summary statistics, per-staff breakdown, and individual call items.
- All aggregation uses conditional `Count` annotations — no N+1 queries.
- `select_related("ticket__patient", "called_by")` on the items query.

Response:

```json
{
  "start_date": "2026-05-01",
  "end_date": "2026-05-30",
  "total_calls": 45,
  "outcome_distribution": {
    "confirmed": 18,
    "busy_later": 12,
    "wrong_number": 5,
    "not_reachable": 8,
    "other": 2
  },
  "staff_breakdown": [
    {
      "staff_name": "Receptionist A",
      "total": 25,
      "confirmed": 10,
      "busy_later": 8,
      "wrong_number": 3,
      "not_reachable": 3,
      "other": 1
    }
  ],
  "items": [
    {
      "id": "123",
      "file_number": "A1",
      "patient_name": "Rahul Sharma",
      "phone": "9876543210",
      "called_at": "2026-05-28T10:30:00Z",
      "result": "confirmed",
      "note": "Will visit tomorrow morning",
      "staff_name": "Receptionist A"
    }
  ]
}
```

`result` values: `confirmed` | `busy_later` | `wrong_number` | `not_reachable` | `other` (mirrors `FollowUpCallResult` choices).

---

## 9. Data Model and Enum Blueprint

### 9.1 `accounts.User`

Key fields: `email` (unique, login ID), `username` (auto-filled from email if blank), `full_name`, `role`.

`UserRole`: `admin`, `reception`, `counsellor`, `doctor`, `pharmacist`.

### 9.2 `patients.Patient`

Key identity and workflow fields: `file_number` (unique, user-supplied, format `^[A-Za-z0-9-]+$`), `hdams_id` (nullable unique), `patient_category`, `full_name`, `date_of_birth`, `sex`, `phone_number`, `aadhaar_number` (nullable conditional unique), `photo`, `fingerprint_template` + `fingerprint_enrolled_at`, `status`, `outstanding_debt`, `next_followup_date`.

High-dimensional clinical/social profile fields are also part of this model.

Methods/properties: `general_data_complete` property, `latest_file_number` classmethod (returns the most recent patient's `file_number` for 409 collision hints).

### 9.3 `visits.VisitSession`

Key fields:

- `visit_uid` (unique)
- `patient` FK
- `checked_in_by` FK
- `visit_date`
- `visit_type`
- `file_number` — denormalized snapshot of `patient.file_number` set at check-in
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
| `Supplier` | `PurchaseInvoice` | 1-to-Many | `supplier_id` | PROTECT — soft-delete via `is_active` |
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
- `GET  /api/v1/receptionist/follow-ups/report/`

**Pharmacy:**

- `GET    /api/v1/pharmacy/suppliers/`
- `POST   /api/v1/pharmacy/suppliers/`
- `GET    /api/v1/pharmacy/suppliers/<supplier_id>/`
- `PATCH  /api/v1/pharmacy/suppliers/<supplier_id>/`
- `DELETE /api/v1/pharmacy/suppliers/<supplier_id>/` (soft-delete)
- `GET    /api/v1/pharmacy/inventory/medicines/`
- `POST   /api/v1/pharmacy/inventory/medicines/`
- `POST   /api/v1/pharmacy/inventory/medicines/bulk-import/`
- `GET    /api/v1/pharmacy/inventory/medicines/<id>/`
- `PATCH  /api/v1/pharmacy/inventory/medicines/<id>/`
- `DELETE /api/v1/pharmacy/inventory/medicines/<id>/`
- `GET    /api/v1/pharmacy/inventory/medicines/<id>/dispense-history/`
- `GET    /api/v1/pharmacy/inventory/stats/`
- `POST   /api/v1/pharmacy/inventory/invoices/`
- `GET    /api/v1/pharmacy/inventory/invoices/<invoice_id>/document/`
- `POST   /api/v1/pharmacy/inventory/audit-removal/`
- `GET    /api/v1/pharmacy/queue/`
- `POST   /api/v1/pharmacy/dispense/`
- `GET    /api/v1/pharmacy/dispense/<session_id>/`
- `PATCH  /api/v1/pharmacy/dispense/<session_id>/`
- `POST   /api/v1/pharmacy/dispense/<session_id>/cancel/`
- `GET    /api/v1/pharmacy/dispense-history/`
- `GET    /api/v1/pharmacy/reports/revenue/`
- `GET    /api/v1/pharmacy/reports/consumption/`
- `GET    /api/v1/pharmacy/reports/low-stock/`
- `GET    /api/v1/pharmacy/reports/expiry/`
