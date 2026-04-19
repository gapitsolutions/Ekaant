# Hospital Backend API Blueprint (Django)

## 1. Scope and Code Sources

This blueprint is generated from the Django code in:

- backend/backend (project config, root routing)
- backend/core (auth, permissions, response and exception contracts, pagination)
- backend/accounts (authentication APIs)
- backend/patients (patient registration, lookup, profile, media, and patient-centric visits)
- backend/visits (check-in workflow, queue snapshot, dashboard stats, reports)

Primary URL prefix for all APIs: /api/v1/

---

## 2. Runtime Architecture

### 2.1 Routing

Root router lives in backend/backend/urls.py and mounts:

- accounts.urls under /api/v1/
- patients.urls under /api/v1/
- visits.urls under /api/v1/

### 2.2 Authentication Model

Authentication class: core.authentication.CookieJWTAuthentication

Behavior:

- Reads JWT access token from cookie named by SIMPLE_JWT[AUTH_COOKIE_ACCESS]
- Validates token using DRF SimpleJWT
- For non-safe HTTP methods (not GET/HEAD/OPTIONS/TRACE), enforces CSRF using enforce_csrf
- Returns authenticated user + token pair to DRF

### 2.3 Permission Model

- IsReceptionOrAdmin: allows roles admin, reception, receptionist
- IsAdminRole: allows role admin only

Current API views in this codebase mainly use IsReceptionOrAdmin, while auth views use AllowAny and perform explicit cookie/token checks.

### 2.4 Response and Error Envelope

Success envelope (core.responses.success_response):

{
"success": true,
"data": ...
}

Error envelope (core.exceptions.api_exception_handler):

{
"success": false,
"error": {
"message": "..."
}
}

Important behavior:

- success_response can also attach a CSRF cookie when request is passed.
- ConflictError maps to HTTP 409 with standard error envelope.

---

## 3. Core Utility Function Blueprint

## 3.1 core.authentication

- enforce_csrf(request)
  - Runs Django CsrfViewMiddleware checks manually.
  - Raises PermissionDenied("CSRF validation failed.") if rejected.

- CookieJWTAuthentication.authenticate(request)
  - Reads access token from cookie.
  - Returns None when cookie is absent.
  - Validates token and user.
  - Calls enforce_csrf for mutating methods.

## 3.2 core.responses

- attach_csrf_cookie(response, request)
  - Gets/creates CSRF token and sets CSRF cookie.

- success_response(data, status_code=200, request=None)
  - Wraps payload in {success, data}.
  - Optionally attaches CSRF cookie.

- set_auth_cookies(response, access_token, refresh_token)
  - Sets both HttpOnly auth cookies with configured lifetimes and flags.

- clear_auth_cookies(response)
  - Deletes both auth cookies.

## 3.3 core.exceptions

- ConflictError
  - APIException subclass with HTTP 409.

- \_coerce_message(data)
  - Extracts human-readable message from nested DRF error structures.

- api_exception_handler(exc, context)
  - Converts all handled exceptions to standardized error envelope.
  - Returns 500 with "Internal server error" when DRF gives no response.

## 3.4 core.pagination

- paginate_queryset(queryset, page, page_size)
  - Normalizes page to >= 1.
  - Clamps page_size to range 1..200.
  - Returns sliced queryset and metadata {page, pageSize, total}.

---

## 4. Accounts API Blueprint

Base module: backend/accounts/views.py

## 4.1 POST /api/v1/auth/login/

View: LoginView.post

Permission/auth classes:

- AllowAny
- No DRF auth class (manual flow)

Request body:

- email (required)
- password (required)

Working flow:

1. enforce_csrf(request)
2. Validate payload with LoginSerializer
3. Lookup user by case-insensitive email
4. Reject invalid credentials or inactive account
5. Create RefreshToken.for_user(user)
6. Build payload via \_auth_payload
7. Return success envelope with auth cookies set

Response data:

- expires_in (access token lifetime in seconds)
- user (id, full_name, email, role, hospital_id)

Errors:

- 401 invalid credentials
- 401 inactive account
- 403 CSRF validation failed

## 4.2 GET /api/v1/auth/session/

View: SessionView.get

Working flow:

1. Authenticate from access cookie via \_authenticate_from_cookie
2. If no valid cookie/token -> 401
3. Return \_auth_payload(user)

Use case:

- Session bootstrap for frontend on app load

## 4.3 POST /api/v1/auth/refresh/

View: RefreshView.post

Working flow:

1. enforce_csrf(request)
2. Read refresh cookie
3. Validate refresh token and resolve user
4. Mint new access token (refresh token reused)
5. Return refreshed=true and new expiry, plus reset cookies

Errors:

- 401 refresh missing/invalid
- 403 CSRF failure

## 4.4 POST /api/v1/auth/logout/

View: LogoutView.post

Working flow:

1. enforce_csrf(request)
2. Return logged_out=true
3. Clear auth cookies

---

## 5. Patients API Blueprint

Base module: backend/patients/views.py and serializers.py

## 5.1 POST /api/v1/patients/register/

View: PatientRegistrationView.post
Serializer: PatientRegistrationSerializer
Permission: IsReceptionOrAdmin

Request body (core required fields):

- patient_category
- file_number (optional; auto-generated if missing)
- full_name
- phone_number
- date_of_birth
- sex
- fingerprint_template
- relative_phone
- address_line1
- aadhaar_number (optional)
- photo_base64 + photo_mime_type (optional pair)

Working flow:

1. Validate payload and business rules in serializer:
   - DOB not in future
   - phone/relative_phone digits normalization
   - Aadhaar must be 12 digits and unique
   - photo fields must be provided together
   - allowed photo MIME only: image/jpeg, image/png
   - max photo size: 2 MB after decode
2. Create patient record, set fingerprint_enrolled_at
3. Save decoded photo to ImageField when present
4. Serialize result using PatientLookupSerializer
5. Add fingerprint_reenrollment_required=false flag
6. Return 201 success

Important helper functions used:

- \_digits_only
- \_decode_photo_payload
- \_photo_url_for_patient

## 5.2 GET /api/v1/patients/lookup/

View: PatientLookupView.get
Permission: IsReceptionOrAdmin

Query params:

- registration_number (exact match path)
- q (broad search path)

Working flow:

- If registration_number provided: exact lookup by registration_number (case-insensitive)
- Else if q provided: patient_search_queryset(q)
- Else return empty items/total
- Serialize with PatientLookupSerializer

patient_search_queryset searches by:

- registration_number icontains
- full_name icontains
- phone_number icontains (digit-aware)
- aadhaar_number icontains (digit-aware)

## 5.3 GET /api/v1/patients/<patient_id>/fingerprint-template/

View: PatientFingerprintTemplateView.get

Returns:

- patient_id
- fingerprint_template
- fingerprint_enrolled_at
- fingerprint_template_key_version

Errors:

- 404 when patient not found or fingerprint template absent

## 5.4 GET /api/v1/patients/<patient_id>/photo/

View: PatientPhotoView.get

Behavior:

- Auth-required guarded media streaming endpoint
- Guesses content-type from file name
- Returns FileResponse with Cache-Control: private, no-store

Errors:

- 404 when no photo

## 5.5 GET /api/v1/receptionist/patients/

View: ReceptionistPatientListView.get

Query params:

- q (optional)
- page (default 1)
- pageSize (default 100, clamped by paginator)

Response:

- items: detailed lookup serializer payload list
- pagination: {page, pageSize, total}

## 5.6 GET /api/v1/receptionist/patients/summary/

View: ReceptionistPatientSummaryListView.get
Serializer: PatientSummarySerializer

Purpose:

- Lightweight paginated list for patient cards/listing UI

Summary item fields:

- patient_id
- registration_number
- hdams_id
- full_name
- phone_number
- date_of_birth
- sex
- status
- photo_url

## 5.7 GET /api/v1/patients/<patient_id>/

View: PatientDetailView.get
Serializer: PatientGeneralDataSerializer

Returns full patient profile, computed/derived fields included:

- has_fingerprint
- last_visit_date
- days_since_last_visit
- general_data_complete
- guarded photo_url path

## 5.8 PATCH /api/v1/patients/<patient_id>/general/

View: PatientGeneralUpdateView.patch
Serializer: PatientGeneralUpdateSerializer (partial update)

Working flow:

1. Fetch patient
2. Validate/normalize update fields
   - DOB not future
   - phone fields digit normalization
   - Aadhaar format and uniqueness check excluding self
   - fingerprint_template and fingerprint_template_key_version can be updated here
3. Save partial update
   - if fingerprint_template is updated with a non-empty value, fingerprint_enrolled_at is set to now
   - if fingerprint_template is updated to empty, fingerprint_enrolled_at is cleared (null)
4. Return full PatientGeneralDataSerializer response

## 5.9 GET /api/v1/patients/<patient_id>/visits/

View: PatientVisitsView.get

Returns visit list for one patient ordered by newest:

- id, visit_uid, visit_date, visit_type
- checkin_time, completed_time
- status, current_stage
- medicines_total

## 5.10 DELETE /api/v1/patients/<patient_id>/

View: PatientDetailView.delete

Purpose:

- Allow frontend users with IsReceptionOrAdmin access to delete a patient without Django admin access.

Permission notes:

- Uses IsReceptionOrAdmin permission (admin, reception, receptionist).

Working flow:

1. Fetch patient by id
2. Delete patient row

- VisitSession rows are deleted automatically via FK cascade

3. Remove patient media directory under MEDIA_ROOT/patients/<patient_id> on transaction commit
4. Return success payload with deleted=true and patient_id

Errors:

- 404 when patient not found

---

## 6. Visits API Blueprint

Base module: backend/visits/views.py

## 6.1 POST /api/v1/sessions/checkin/

View: CheckinPatientView.post
Serializer: CheckinRequestSerializer
Permission: IsReceptionOrAdmin

Request body:

- patient_id (UUID)
- verification_method (optional): fingerprint (default) or photo
- verification_photo_base64 (required when verification_method=photo)
- verification_photo_mime_type (required when verification_method=photo; image/jpeg or image/png)
- verification_photo_captured_at (optional datetime; server uses current time when omitted for photo mode)

Current workflow behavior (important):

- This system now auto-completes at check-in.
- On successful check-in, session is created with:
  - status = completed
  - current_stage = completed
  - completed_time = now

Detailed flow:

1. Validate patient_id
2. Ensure patient exists
3. Reject if patient status is dead
4. Reject if same patient already has any session for today
5. Validate verification mode payload:

- fingerprint mode: no photo payload fields allowed
- photo mode: photo payload is mandatory and validated (mime + size)

6. Determine visit_type as first_visit or follow_up
7. Create VisitSession with completed status/stage immediately
8. If photo mode, save verification photo under patient media directory (patients/<patient_id>/visits/<visit_uid>/...)
9. Return 201 with session_id, patient details, status/current_stage/completed_at and verification metadata

Errors:

- 400 validation errors
- 404 patient not found
- 409 already checked in for today

## 6.2 GET /api/v1/receptionist/dashboard/

View: DashboardStatsView.get

Returns:

- totalPatients
- todayVisits
- completedToday

Based on VisitSession rows for current local date.

## 6.3 GET /api/v1/receptionist/queue/

View: QueueStatusView.get

Current behavior:

- Returns only today completed sessions (not in-progress queue)
- Ordered by latest checkin_time first

Each item contains:

- session_id
- patient_id
- patient_name
- checked_in_at
- checked_in_by_name
- status
- current_stage
- outstanding_debt

## 6.4 GET /api/v1/receptionist/reports/daily/

View: ReceptionDailyReportView.get

Query params:

- date (optional, YYYY-MM-DD, defaults to today)

Response:

- date
- total_checkins
- active_checkins
- completed_checkins
- items[]:
  - id, patient_id, visit_date, checkin_time, status, current_stage
  - patient snapshot: registration_number, full_name, date_of_birth, gender, phone, patient_category

## 6.5 GET /api/v1/receptionist/reports/monthly/

View: ReceptionMonthlyReportView.get

Query params:

- year (optional, defaults to current year)
- month (optional, defaults to current month)

Response:

- year
- month
- total_checkins
- active_checkins
- completed_checkins
- breakdown[] by day: {day, count}

## 6.6 GET /api/v1/receptionist/reports/custom-range/

View: ReceptionCustomRangeReportView.get

Query params:

- start_date (required, YYYY-MM-DD)
- end_date (required, YYYY-MM-DD)

Validation:

- start_date cannot be after end_date

Response:

- start_date
- end_date
- total_checkins
- active_checkins
- completed_checkins
- unique_patients
- items[] with same shape as daily items

## 6.7 GET /api/v1/receptionist/checkin-history/

View: ReceptionCheckinHistoryListView.get

Query params:

- q (optional): search by visit UID, registration number, patient name, or phone
- page (optional, default 1)
- pageSize (optional, default 50, max 200)
- verification_method (optional): fingerprint or photo
- status (optional): in_progress, completed, cancelled
- start_date (optional, YYYY-MM-DD)
- end_date (optional, YYYY-MM-DD)

Validation:

- start_date cannot be after end_date

Response:

- items[]
  - id, visit_uid, patient_id, visit_date, visit_type
  - checkin_time, completed_time, status, current_stage
  - checked_in_by_name, outstanding_debt_at_checkin
  - verification_method, verification_photo_captured_at
  - verification_photo_available, verification_photo_url
  - patient snapshot (registration_number, full_name, date_of_birth, gender, phone, patient_category, and key profile fields)
- pagination: { page, pageSize, total }

## 6.8 GET /api/v1/receptionist/checkin-history/<session_id>/verification-photo/

View: ReceptionCheckinHistoryPhotoView.get

Behavior:

- Streams verification photo for the visit when present
- Protected by IsReceptionOrAdmin
- Returns `Cache-Control: private, no-store`

Errors:

- 404 when visit or verification photo is missing

## 6.9 DELETE /api/v1/receptionist/checkin-history/<session_id>/

View: ReceptionCheckinHistoryDeleteView.delete

Behavior:

- Deletes only the VisitSession row
- Keeps patient record intact
- If verification photo exists, file cleanup runs after commit (`transaction.on_commit`)

Response:

- deleted (boolean)
- session_id
- patient_id

---

## 7. Data Model and Enum Blueprint

## 7.1 accounts.User

Key fields:

- email (unique, login ID)
- username (auto-filled from email if blank)
- full_name
- role
- hospital_id

Enums in UserRole:

- admin, reception, receptionist, counsellor, doctor, pharmacist

## 7.2 patients.Patient

Key identity and workflow fields:

- registration_number (unique)
- hdams_id (nullable unique)
- patient_category
- full_name
- date_of_birth
- sex
- phone_number
- aadhaar_number (nullable with conditional uniqueness)
- photo (ImageField)
- fingerprint_template + fingerprint_enrolled_at
- status

High-dimensional clinical/social profile fields are also part of this model.

Model methods/properties:

- general_data_complete property
- generate_registration_number classmethod

## 7.3 visits.VisitSession

Key fields:

- visit_uid (unique)
- patient FK
- checked_in_by FK
- visit_date
- visit_type
- checkin_time, completed_time
- status
- current_stage
- outstanding_debt_at_checkin
- medicines_total
- verification_method
- verification_photo
- verification_photo_captured_at

Enums:

- VisitStatus: in_progress, completed, cancelled
- VisitStage: counsellor, doctor, pharmacy, completed
- CheckinVerificationMethod: fingerprint, photo

Model classmethods:

- generate_visit_uid
- build_month_breakdown
- build_year_breakdown

---

## 8. Standard Error Map (Observed)

- 400 ValidationError (serializer and request validation)
- 401 Authentication/session/refresh failures
- 403 CSRF failure on mutating endpoints
- 404 Resource not found (missing patient, missing photo/template)
- 409 ConflictError (duplicate unique business actions, eg duplicate same-day check-in)
- 500 Unhandled server errors (wrapped by api_exception_handler)

---

## 9. Security and Operational Notes

- Auth tokens are cookie-based and HttpOnly.
- CSRF is mandatory for mutating auth endpoints and authenticated mutating API calls.
- Photo serving is protected behind authenticated API endpoint, not open media URL.
- Pagination is centralized and capped at pageSize=200.
- In DEBUG mode, media static serving is enabled via root urls.py.

---

## 10. Endpoint Inventory Quick Table

Accounts:

- POST /api/v1/auth/login/
- GET /api/v1/auth/session/
- POST /api/v1/auth/refresh/
- POST /api/v1/auth/logout/

Patients:

- POST /api/v1/patients/register/
- GET /api/v1/patients/lookup/
- GET /api/v1/patients/<patient_id>/fingerprint-template/
- GET /api/v1/patients/<patient_id>/photo/
- GET /api/v1/patients/<patient_id>/
- DELETE /api/v1/patients/<patient_id>/
- PATCH /api/v1/patients/<patient_id>/general/
- GET /api/v1/patients/<patient_id>/visits/
- GET /api/v1/receptionist/patients/
- GET /api/v1/receptionist/patients/summary/

Visits:

- POST /api/v1/sessions/checkin/
- GET /api/v1/receptionist/dashboard/
- GET /api/v1/receptionist/queue/
- GET /api/v1/receptionist/checkin-history/
- GET /api/v1/receptionist/checkin-history/<session_id>/verification-photo/
- DELETE /api/v1/receptionist/checkin-history/<session_id>/
- GET /api/v1/receptionist/reports/daily/
- GET /api/v1/receptionist/reports/monthly/
- GET /api/v1/receptionist/reports/custom-range/
