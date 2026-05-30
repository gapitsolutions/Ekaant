# Project Guidelines

## API Documentation

**MANDATORY:** Whenever creating, modifying, or extending any backend API endpoint, always update `hospital_backend/API_BLUEPRINT.md`:
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
