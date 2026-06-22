# HMS Engineering & Design Patterns

> Reverse-engineered from the existing backend + frontend. These are **generalized
> engineering principles** distilled from how this codebase is actually written — not
> a description of individual features. Future agents: read this before writing code so
> new work matches the established philosophy instead of introducing isolated quick fixes.
>
> The golden rule of this codebase: **the database is the source of truth, the server is
> the authority, history is never rewritten, and totals are never trusted from the client.**

---

## Architecture Rules

The backend uses a strict four-layer separation. Every app (`models / serializers /
services / views / urls / tests`) repeats it. Respect the layer boundaries.

1. **Views are thin orchestrators.** A view does exactly: resolve permission → deserialize
   & validate input → call one service (or run a read query for GET) → wrap in
   `success_response`. A mutating view body is typically 5–12 lines. If a view contains a
   loop that writes rows, a balance computation, or multi-model coordination, that logic is
   in the wrong place.
   - *Rule:* **No business logic, no transactional writes, and no multi-record aggregation in views.** Push it to a service.

2. **Serializers validate and shape; they do not orchestrate.** Serializers own field
   validation (`validate_<field>`, cross-field `validate`), normalization (trim, lowercase,
   digits-only), decoding (base64 media), and uniqueness/collision checks. They do **not**
   write related records, mutate stock, or compute financial balances.
   - *Rule:* **Validation and input/output shape live in serializers; state transitions live in services.**

3. **Services own business logic.** Anything that (a) writes more than one row, (b) must be
   atomic, (c) computes authoritative money/stock, (d) builds a reusable queryset, or (e)
   aggregates for a dashboard, is a service function. Services are plain functions with
   keyword-only args (`*, data, user`) returning model instances or plain dicts. Other apps
   call services, never each other's models directly (e.g. pharmacy calls `billing.services`
   to touch the patient ledger).
   - *Rule:* **A service is the single writer for its domain's invariant.** Cross-domain effects go through the owning domain's service.

4. **Models hold invariants and derivations.** Models carry constraints (functional unique
   constraints, check constraints, indexes), enums (`TextChoices`), singletons (forced
   `pk=1`), and pure derivations exposed as `@staticmethod`/`classmethod`
   (`balance_for(...)`, `load()`, `latest_file_number()`). No request/transaction logic.

5. **Shared concerns live in `core/`** (`responses`, `exceptions`, `pagination`,
   `permissions`, `authentication`). Never re-implement an envelope, paginator, or
   permission inline.

---

## Response Rules

The API speaks one envelope. Every client depends on it.

- **Success:** `success_response(data, status_code=...)` → `{"success": true, "data": ...}`.
  Always wrap; never return a bare `Response(...)`.
- **Error:** a single project exception handler produces
  `{"success": false, "error": {"message", "fields"?, "code"?, ...extra}}`.
  - `message` is always present (human-readable).
  - `fields` is the **flattened** per-field map (`items.0.quantity`) so the frontend can
    address nested/`many=True` errors directly.
  - `code` exposes the exception's machine-readable `default_code` so clients branch on codes,
    not message strings.
  - Domain exceptions may attach an `extra` dict merged into `error` (e.g. a 409 ships
    `last_file_number` as a recovery hint).
- *Rules:*
  - **Raise typed exceptions** (`ConflictError`, DRF `ValidationError`, `NotFound`) and let the
    handler format them — never hand-build error JSON in a view.
  - **Use the right status semantically:** 409 for uniqueness/duplicate-state collisions, 400
    for validation, 403 for role failures, 404 for missing.
  - When an error should also change client state (e.g. clear stale auth cookies), signal it
    via an exception attribute the handler reads — keep views unaware.

---

## Database Rules

1. **Append-only ledgers are the source of truth for any running quantity** (money owed,
   stock on hand). A ledger is a table of **signed** rows; the balance is `SUM(amount)`.
   This codebase has three parallel instances of the same pattern: `StockMovement`
   (inventory), `PatientLedgerEntry` (receivables), `SupplierLedgerEntry` (payables).
   - **Never hand-edit a running total.** A field like `outstanding_debt` /
     `outstanding_payable` / batch `quantity` is a **cache** recomputed from the ledger
     (`sync_*_cache`), never incremented in place.
   - **Corrections are compensating rows, never mutations or deletes.** To reverse, post an
     `adjustment` that nets prior impact to zero (re-read current net each time so it's
     idempotent across repeated cancel/amend).
   - **Link ledger rows to their source with `SET_NULL`**, so financial/stock history
     survives even if the source record is later removed.

2. **Foreign-key `on_delete` encodes ownership intent:**
   - `CASCADE` for owned children that are meaningless without the parent (invoice → items).
   - `PROTECT` for master data referenced by transactions (Supplier ← PurchaseInvoice) — the
     DB refuses to delete something with history; use soft-delete (`is_active=False`) instead.
   - `SET_NULL` for audit/actor links (`created_by`, `marked_by`, ledger→invoice) so deleting
     a user/source never erases the record of what happened.

3. **Enforce uniqueness at the DB layer, case-insensitively where humans type it.** Use
   functional unique constraints (`UniqueConstraint(Lower("name"))`) and a unique-per-day
   row to encode "once per day". The serializer's collision check is a friendly 409; the DB
   constraint is the real guarantee (handle the race — see Transaction Rules).

4. **Prefer additive, idempotent migrations.** Schema changes are additive (nullable add,
   new table). Data backfills must be **idempotent**: compute the desired set, skip existing,
   `bulk_create(..., ignore_conflicts=True)`, and provide a `noop` reverse when the backfilled
   rows are indistinguishable from organic ones. A backfill exists precisely because a
   live-write rule (e.g. auto-mapping a relationship) was added after data already existed —
   reconstruct from the authoritative record.

5. **Snapshot/denormalize values that must not change retroactively.** Copy point-in-time
   facts onto the transaction at creation (consultation fee onto the invoice, `file_number`
   onto the visit, `medicine_name`/`salt` onto the dispense item, `submitted_by_role` onto
   the lock). Changing the source later must never rewrite history. Denormalized counters that
   *are* allowed to drift are explicitly labelled caches and recomputed.

---

## Query Optimization Rules

1. **`select_related` for forward FK/OneToOne you will read.** Any read that touches
   `obj.related.field` in a loop or serializer adds `select_related(...)` (e.g.
   `select_related("patient")`, `select_related("purchase_invoice")`). Reads that iterate
   related actors (`performed_by`, `generated_by`) select_related them.

2. **`prefetch_related` for reverse/M2M collections** rendered per row (e.g. a medicine's
   `suppliers`). Annotate-or-prefetch so list serialization is O(1) queries, not O(n).

3. **Count via annotation/subquery, never per-row queries.** Counts shown in a list come
   from an annotated queryset. When counting **two different relations** on one queryset, use
   **correlated `Subquery` counts**, not two `Count(distinct=True)` — the latter produces a
   multiplicative join that explodes on large data.

4. **`.exists()` for presence checks, never `.count()` or truthiness on a queryset.**
   Pre-checks before create use `.filter(...).exists()`.

5. **`aggregate()` + `Coalesce(Sum(...), Decimal("0"))` for totals.** Always coalesce so an
   empty set yields `0`, not `None`. Money aggregates sum `DecimalField`s.

6. **Watch the GROUP BY ordering trap.** `.values(X).annotate(Count(...))` on a queryset that
   has default `ordering` silently adds the ordering column to the GROUP BY (wrong groups,
   all-1 counts). Clear it with `.order_by()` before `.values().annotate()`.

7. Use `only()/defer()` when serializing wide tables for narrow payloads; otherwise keep it
   simple — premature column pruning isn't done here.

---

## Transaction Rules

1. **`@transaction.atomic` whenever one business operation modifies multiple related records
   that must all succeed or all fail.** Every multi-row writer in this codebase is atomic:
   invoice creation (invoice + items + batches + stock movements + ledger posting), dispense,
   cancel, amend, payment, daily-attendance submission. If your function writes 2+ rows that
   form one logical unit, wrap it.

2. **`select_for_update()` on the rows whose value gates a decision under concurrency.** Lock
   the balance/stock row before reading-then-writing it, so two concurrent requests can't both
   pass a check against a stale value (supplier row before an over-payment check; medicine
   batch before decrementing stock).

3. **Defense in depth against races: pre-check + DB constraint + caught `IntegrityError`.**
   A friendly `.exists()`/`get_or_create` pre-check gives a clean 409 in the common case; the
   unique constraint guarantees correctness; catching `IntegrityError` converts the lost-race
   case into the same clean 409 instead of a 500. Prefer claiming a uniqueness lock
   (`get_or_create`) **before** doing the dependent writes so a loser does no partial work.

4. **All side effects of an atomic op live inside the transaction** (ledger posting, cache
   resync, M2M auto-mapping) so a downstream failure rolls everything back together.

---

## Reporting & Dashboard Rules

**This is the rule most often violated by quick fixes. Treat it as inviolable.**

1. **Dashboard cards and KPIs come from aggregate queries or a dedicated summary endpoint —
   never from a paginated list.** A KPI must be correct at 10, 1k, and 1M rows, i.e. fully
   independent of `page`/`pageSize`. There are dedicated `summary` sub-resources for exactly
   this (`/suppliers/summary/`, `/staff/summary/`, dashboard endpoints) that run
   `aggregate()/Count/Sum/Coalesce`.

2. **Operational list APIs and analytics APIs are separate endpoints.** A list endpoint
   paginates records; a summary/report endpoint returns scale-invariant totals. Do not bolt
   counts onto a list response and call it a dashboard.

3. **Reports compute server-side with grouped aggregation** (`.values("date").annotate(...)`)
   and return both a `summary` block and a per-bucket `breakdown`. Distinguish billed vs
   collected vs outstanding explicitly — don't conflate "revenue" with "cash received."

4. Client-side aggregation of a server-paginated list is an anti-pattern; if the frontend
   needs a total, the server provides it.

---

## Billing Rules

1. **The server is the sole authority for money.** Never persist a client-sent total.
   Recompute `subtotal`, `discount`, `net_payable` from line items on the server; the
   frontend's displayed figure is for UX only.

2. **`Decimal` end-to-end; quantize consistently.** All money is `DecimalField`. Quantize
   each unit price/line with a single helper (`_q2` → 2dp, `ROUND_HALF_UP`) **before** summing,
   so persisted per-line totals reconcile exactly with the stored subtotal. Never use `float`
   for currency.

3. **Validate bounds, derive reporting fields.** Reject negative amounts and discounts that
   exceed subtotal. Store a derived `discount_percentage` for reporting only — it never drives
   the arithmetic.

4. **Charge and payment are independent ledger events.** Billing records the charge
   (`+net_payable`) and the amount actually tendered (`-amount_paid`) as separate signed rows.
   Tendered may be **less** than billed (creates outstanding) or **more** (recovers prior
   dues) — the ledger captures both naturally; do not force "paid == total."

5. **Invoice creation is atomic and idempotent-guarded** (one invoice per visit, enforced by
   pre-check + uniqueness). Corrections never edit money in place silently — see Inventory.

---

## Inventory Rules

1. **Inventory is a stock-movement ledger, not a bare quantity field.** Every change in
   on-hand stock writes a `StockMovement` row capturing `quantity_before`, `quantity_change`,
   `quantity_after`, `movement_type`, and a `reference_type`/`reference_id` back to the cause
   (purchase, dispense, audit removal, adjustment/cancellation). The batch `quantity` is the
   fast-read cache; the ledger is the audit truth.

2. **Batch identity is `(medicine, batch_number)`.** Re-receiving the same batch accumulates
   quantity (find-or-create) rather than duplicating; a depleted batch reactivates when stock
   returns. Expiry is data on the batch, not part of its identity.

3. **Stock writes are atomic and lock the batch** (`select_for_update`) so concurrent
   dispenses can't oversell. Every stock mutation is paired with its `StockMovement` row in the
   same transaction.

4. **Relationship side effects are automatic and idempotent.** Booking a purchase invoice
   auto-links the supplier onto each medicine (`m.suppliers.add(...)`, a no-op if present) — so
   the data model self-heals from real events rather than relying on manual linking.

---

## Immutability & Audit Rules

1. **Financial/stock records are effectively immutable.** They are not edited in place;
   corrections go through an explicit revert-then-reapply service that reverses prior ledger
   impact and posts the new state.

2. **Amendments are audited with a full prior-state snapshot.** Before mutating, store a
   JSON-safe snapshot of the record exactly as it was (items + all money fields), with who/when
   and a reason. The printed/rendered artifact discloses that it was amended.

3. **Audit-log and append-only tables are read-only in the admin** (`has_add/change/delete
   = False`) so the UI can never desync the ledger or rewrite history. Caches
   (`outstanding_*`) are shown read-only too.

---

## API Rules

1. **Resource endpoints for CRUD, action sub-resources for state transitions and analytics.**
   Pattern: `/<resource>/`, `/<resource>/<id>/`, plus verbs/aspects as sub-paths
   (`/dispense/<id>/cancel/`, `/suppliers/<id>/payments/`, `/suppliers/<id>/ledger/`,
   `/suppliers/summary/`, `/staff/attendance/today-status/`). Don't overload one endpoint with
   a `?mode=` switch when a sub-resource is clearer.

2. **List endpoints: server-side filter + search + capped pagination.** Query params are
   parsed defensively (bad input → sane default), filters are explicit (`is_active`,
   `category`, `has_dues`), search is a single param matched across fields with `Q(...)
   icontains` unions. Always return `{ items, pagination: { page, pageSize, total } }`. Page
   size is capped (200) centrally.

3. **Permissions are declared per view via tiny role classes from `core.permissions`.**
   GET is often broader than mutation: `get_permissions()` returns a read-audience class for
   GET and a stricter one for writes. Financial and PII endpoints are admin-only.

4. **Media/PII contracts:** upload as base64 + mime in JSON (mirrors the patient-photo
   contract — keeps requests JSON, no multipart); serve files through a **permissioned view**,
   not the open media URL; **mask** sensitive identifiers (Aadhaar/PAN/account) in list
   serializers and expose full values only in the admin-only detail.

5. **Keep the API blueprint in sync.** Any endpoint/field/param change updates
   `hospital_backend/API_BLUEPRINT.md` (mandated by `CLAUDE.md`).

---

## Permission Rules

1. **Role checks are centralized, declarative, and composable.** All permission classes live
   in `core.permissions`, each a one-liner over a shared `_user_has_role(user, {roles})`
   helper. Views declare intent (`IsAdminRole`, `IsReceptionOrAdmin`,
   `IsPharmacistOrAdmin`, `IsReceptionAdminOrPharmacist`); they never inline `request.user.role
   == "..."`.

2. **Read audience ⊇ write audience.** Broadly-readable masters (supplier picker) allow
   reception+pharmacist+admin to GET but restrict mutation to the owning roles. Add a new
   role-combination class rather than scattering ad-hoc checks.

3. **Sensitivity drives the gate.** Money (ledgers, payments) and PII (full staff financials)
   are admin-only; the one non-admin reach into an admin module is deliberately narrow and
   exposes no sensitive fields (e.g. reception's attendance roster shows name/code/designation
   only).

---

## Performance Rules

- Prefer one annotated/aggregated query over N per-row queries (counts, totals, stock).
- `select_related`/`prefetch_related` proportional to what the serializer reads.
- `.exists()` over `.count()` for presence.
- Subquery counts over multiplicative multi-relation `Count(distinct=True)`.
- Lock narrowly (`select_for_update` only the contended rows) and briefly (inside one atomic
  block); never hold a transaction open across external I/O.
- Constant-query summaries: a dashboard endpoint's query count must not grow with row count.

---

## Anti-Patterns (do NOT do these)

- ❌ Business logic, multi-row writes, or aggregation **in views or serializers**.
- ❌ Dashboard/KPI numbers derived from a **paginated** queryset, or client-side aggregation of
  a paginated list.
- ❌ Hand-incrementing a balance/stock field instead of appending a ledger row and recomputing
  the cache.
- ❌ Mutating or deleting financial/stock history to "fix" it (use a compensating row /
  amendment snapshot).
- ❌ Trusting a client-supplied total, or using `float` for money.
- ❌ Multi-row writes without `@transaction.atomic`; concurrency-sensitive read-modify-write
  without `select_for_update`; relying on a pre-check alone without the DB constraint.
- ❌ Hand-built error JSON or bare `Response`; bypassing `success_response`/the exception
  handler.
- ❌ Inline `request.user.role` checks; duplicated permission logic.
- ❌ Duplicating a serializer, query builder, or UI form when one can be parametrized/shared
  (extract → reuse → extend before creating new).
- ❌ Unbounded list endpoints (no pagination cap) for data that grows.
- ❌ Serving PII media from the open `/media/` URL; returning unmasked sensitive fields in list
  payloads.

---

# Domain Design Patterns

- **Model relationships by lifecycle, not convenience.** Owned children → `CASCADE`;
  referenced masters → `PROTECT` + soft-delete; actors/sources on audit rows → `SET_NULL`.
- **Many-to-Many when the link is itself a fact that grows** (a medicine is stocked by several
  suppliers over time) — and let real events maintain it (auto-map on purchase). Provide a
  backfill for links that predate the auto-map rule.
- **Lookup tables / dynamic enums for open vocabularies.** Fixed sets are `TextChoices`;
  user-extensible sets (designations) are a lookup model with case-insensitive **get-or-create**
  so typing a new value persists it without a migration.
- **Singletons for hospital-wide config** (`pk=1`, `load()`), stored in DB so admins change it
  without a deploy — and **snapshot** its value onto transactions so changes aren't retroactive.
- **Deliberately decoupled entities where the domains are independent.** Staff (HR) is *not*
  linked to the auth `User`: auth roles grant app access; staff records are HR data for people
  who may have no login. Keeping them separate avoids polluting auth with PII and avoids forcing
  accounts for every employee — at the cost of no automatic login↔HR bridge (add a nullable FK
  later if needed).

# Workflow Design Patterns

- **Append-only history + cache** for anything with a running balance (money, stock).
- **State machines** for process flow (visit stages: in-progress → completed/cancelled).
- **Idempotency guards** on creation (one invoice per visit; once-per-day attendance lock via a
  unique row).
- **Revert-then-reapply** for corrections; **snapshot-before-mutate** for audit.
- **Author + role recorded on every consequential action** (`*_by` FK, plus a role snapshot
  where the actor's role might change later).

# System Design Decisions

- **Inventory = stock-movement ledger** (chosen over quantity-only updates) → full auditability,
  safe concurrency, reconstructable on-hand. Tradeoff: more rows + a cache to keep in sync;
  worth it for any system where "how did stock reach this number?" must be answerable.
- **Billing = append-only patient/supplier ledgers + recomputed cache** → clean partial
  payments, recovery, and reversals; the cached `outstanding_*` is disposable and always
  re-derivable.
- **Reporting = aggregate-only, separate from operational APIs** → KPIs stay correct at any
  scale and never couple to list pagination.

# UI/UX Design Patterns (frontend)

- **List page + clickable KPI filter cards fed by a `summary` endpoint** (never the page).
  Cards double as filters that drive the list's server query.
- **Detail as a modal/console with lazy-loaded tabs** for admin power-tools (staff console);
  full-page detail for primary navigation flows. Tab data fetches on activation, not upfront;
  always-visible summaries (financial summary) load eagerly.
- **Search: server-side for record lists** (debounced, hits the list endpoint's `q`),
  **client-side for already-loaded small sets** (ledger rows). Pick by where the data already is.
- **Shared, parametrized components over forks.** One purchase-invoice form and one
  medicine-register form are extracted to `components/` and reused across pages via props
  (`lockedSupplier`, `presetSupplier`, `onRegisterMedicine`) — there is exactly one invoice
  workflow and one medicine form app-wide.
- **Print/export via one shared jsPDF layout** (`lib/export/pdf-layout`), not per-screen
  `window.print()`.
- **Typed API client, no `any`; `tsc --noEmit` is a hard gate.** Decimals cross the wire as
  strings.

# API Design Philosophy

- **Hybrid resource + action design** (resources for data, sub-resources for transitions and
  summaries). One envelope for every response; one error shape with machine codes; pagination
  shape identical everywhere.
- **The server owns truth and computation; the client renders.** Totals, balances, ordering,
  and authority all live server-side.

# Extensibility Patterns

- **The ledger architecture** generalizes: a new payable/receivable/quantity stream is "another
  ledger" (signed rows + `balance_for` + cache + reversal), not new bespoke math.
- **The role set + per-view permission classes** extend by adding a class, not editing call
  sites.
- **The dynamic-designation pattern** lets HR vocabularies grow without migrations; the same
  shape suits any open lookup.
- **Summary endpoints** are the extension point for any new dashboard metric — add an aggregate,
  not a column on a list.

# Tradeoff Analysis

| Pattern | Problem solved | Chosen design | Advantages | Tradeoffs | Reuse when |
|---|---|---|---|---|---|
| **Append-only ledger + cache** | Need an auditable, reversible running balance | Signed rows; `SUM`=balance; cached field recomputed | Full audit trail; clean reversal; never-wrong totals | Extra rows; must keep cache in sync; balance is a query | Any money or quantity that changes over time and must be explainable |
| **Server-authoritative money (Decimal + quantize)** | Client totals can be wrong/tampered | Recompute from line items, per-line `_q2`, validate bounds | Exactness; reconciliation; security | Slightly more server compute; client total is display-only | All financial persistence |
| **Immutability + amendment snapshot** | Corrections must not erase history | Revert-then-reapply + JSON snapshot + disclosure | Regulatory-grade auditability | More storage; correction is heavier than an edit | Invoices, anything legally/financially significant |
| **Aggregate-only dashboards** | KPIs must be scale-independent | Dedicated summary endpoints with `aggregate()` | Correct at any size; decoupled from lists | A second endpoint per view | Every dashboard/KPI/stat |
| **`@transaction.atomic` + `select_for_update` + caught IntegrityError** | Partial writes & race conditions | Atomic unit, lock contended rows, DB constraint + clean 409 | Consistency under concurrency | Lock contention if held too long | Any multi-row op or contended counter |
| **Stock-movement ledger** | "How did stock get here?" must be answerable | Movement rows + cached batch qty | Auditable, concurrency-safe inventory | More rows; cache sync | Any inventory/quantity domain |
| **Standalone entity (Staff ⟂ User)** | HR data ≠ auth identity | Separate model, no FK to User | No PII on auth; no forced accounts | No automatic login↔HR link | When two domains are genuinely independent |
| **Shared parametrized UI component** | Divergent duplicate forms | Extract to `components/`, drive by props | One workflow, one bug surface | Component grows props/conditionals | Two+ screens need the same form/flow |
| **Base64-in-JSON media + permissioned serving** | Upload without multipart; protect PII media | base64 field decoded server-side; file served via gated view | Uniform JSON contract; access control | base64 ~33% larger payloads | Any user-controlled file tied to a record |

---

# Checklist For Future Changes

**Before writing code**
- [ ] Does an equivalent service / serializer / query builder / UI component already exist? Reuse → extract → extend → only then create new.
- [ ] Which layer does each piece belong in (view = orchestrate, serializer = validate/shape, service = logic, model = invariant)?

**Backend correctness**
- [ ] Multi-row write? → `@transaction.atomic`.
- [ ] Read-modify-write on a balance/stock/uniqueness row under concurrency? → `select_for_update`, and a DB constraint + caught `IntegrityError` as backstop.
- [ ] Money? → `Decimal`, `_q2` quantize, server-recomputed, bounds validated, never trust client totals.
- [ ] Changing a running balance or stock? → append a ledger row + recompute the cache; never increment in place.
- [ ] Correcting a financial/stock record? → reverse + reapply + snapshot; never mutate/delete history.
- [ ] New point-in-time fact that must not change retroactively? → snapshot it onto the transaction.

**Queries & performance**
- [ ] `select_related`/`prefetch_related` for everything the serializer/loop reads.
- [ ] Counts via annotation/`Subquery` (not per-row, not multiplicative `Count(distinct)`); totals via `Coalesce(Sum, 0)`.
- [ ] `.values().annotate()` preceded by `.order_by()` to avoid the GROUP BY trap.
- [ ] `.exists()` for presence checks.

**Dashboards & reports**
- [ ] KPIs/cards from a dedicated aggregate/summary endpoint — **independent of pagination**.
- [ ] Operational list vs analytics are separate endpoints.

**API & access**
- [ ] Response via `success_response`; errors via typed exceptions + the handler (with `code`/`fields`).
- [ ] List returns `{ items, pagination }`, capped page size, defensive param parsing, `Q` search.
- [ ] Permission class from `core.permissions`; read audience ⊇ write audience; money/PII admin-only.
- [ ] Sensitive fields masked in lists; media served through a gated view.
- [ ] `API_BLUEPRINT.md` updated.

**Migrations**
- [ ] Additive and reversible-or-`noop`; data backfills idempotent (`ignore_conflicts`, skip existing), reconstructed from the authoritative record.

**Frontend**
- [ ] `tsc --noEmit` passes, no `any`, no unused imports, no `console.log`, no hardcoded mock data.
- [ ] KPI cards fed by summary endpoint; list search server-side, loaded-set search client-side.
- [ ] Reuse the shared form/PDF components rather than forking.
