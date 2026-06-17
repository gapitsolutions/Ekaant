# Project Guidelines

## API Documentation

**MANDATORY:** Whenever creating, modifying, or extending any backend API endpoint, always update `hospital_backend/API_BLUEPRINT.md`:

- Always refer to `API_BLUEPRINT.md` when you need to have any information about the backend API and then verify with code , if any inconsistencies are found update the blueprint accordingly.
- Add/update the endpoint section with view, serializer, permission, query params, behavior, and response shape.
- Update the quick-reference URL list in the appendix.
- Update the "Last Updated" date.

This applies to new endpoints, new query parameters on existing endpoints, changed response shapes, and new serializer fields.

## Backend Conventions

- **Virtual environment:** The backend uses `pipenv`. To run any backend command: `cd hospital_backend && pipenv run <command>` (or `pipenv shell` first).
- **File organization:** Each Django app follows the pattern:
  - `models.py` — data models and enums
  - `serializers.py` — query serializers, request serializers, payload builders
  - `services.py` — business logic, queryset builders, data aggregation
  - `views.py` — thin API views that wire serializers → services → response
  - `urls.py` — URL routing
  - `tests.py` — test cases
- Do NOT put serializers or business logic inline in `views.py`.
- Use `success_response()` from `core.responses` for all API responses.
- Use permission classes from `core.permissions`.

## Frontend Conventions

- TypeScript strict mode — `npx tsc --noEmit` must pass with zero errors after every change.
- API types and functions live in `frontend/lib/hms-api.ts`.
- Reusable UI components live in `frontend/components/`.
- Page components live in `frontend/app/<module>/<page>/page.tsx`.
- Use proper TypeScript types — never use `any`.

## Investigation Before Implementation

Before implementing any feature:

1. Identify affected frontend pages/components.
2. Identify affected backend models/serializers/services/views.
3. Trace the complete request lifecycle.
4. Search for existing implementations before creating new ones.
5. Search for existing APIs before creating new APIs.
6. Search for existing UI components before creating new components.

Never implement a change without first understanding the surrounding workflow.

## Avoid Duplicate Logic

- Reuse existing services before creating new services.
- Reuse existing serializers before creating new serializers.
- Reuse existing frontend components before creating new components.
- Reuse existing API endpoints whenever possible.
- Extend existing functionality before creating parallel implementations.

Duplicate business logic is prohibited.

## Database Changes

Before creating or modifying models:

- Evaluate migration impact.
- Check reporting impact.
- Check serializer impact.
- Check admin impact.
- Check filtering/search impact.
- Check API impact.

Prefer additive migrations.

Avoid destructive schema changes unless explicitly requested.

## Reporting & Dashboard Rules

Do not build dashboards from paginated APIs.

Dashboard metrics must come from:

- aggregate queries
- reporting services
- dedicated summary endpoints

Dashboard counts must not depend on page size.

## Frontend Quality Gates

After frontend changes:

- TypeScript must compile with zero errors.
- No console.log statements.
- No hardcoded mock data.
- No dead code.
- No unused imports.
- No any types unless explicitly justified.

## Backend Quality Gates

After backend changes:

- Run migrations locally.
- Verify serializers.
- Verify permissions.
- Verify admin.
- Verify API responses.
- Verify API_BLUEPRINT.md is updated.

Do not leave partially implemented endpoints.

## Assumptions

Never invent:

- business rules
- API fields
- model fields
- workflows
- report calculations

If unclear:

- investigate
- search codebase
- ask questions

No silent assumptions.

## HMS Domain Rules

Patient, billing, inventory, pharmacy, invoice, reporting, and financial workflows are considered high-impact.

Changes affecting these modules require:

- full impact analysis
- regression analysis
- workflow tracing
- verification of related reports and dashboards

Do not treat them as isolated CRUD operations.

Read the ENGINEERING_PATTERNS.md file to understand how to code.
