"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";

import { ApiError, isApiError, type ApiFieldErrors } from "./api-client";

/** React hook for surfacing backend per-field validation errors in forms.
 *
 * Typical usage:
 *
 *     const errors = useApiErrors();
 *
 *     async function onSubmit() {
 *       errors.clear();
 *       try {
 *         await createSupplier(payload);
 *       } catch (err) {
 *         errors.setFromError(err);
 *         toastApiError(err, "Failed to add supplier");
 *       }
 *     }
 *
 *     <Input name="company_name" />
 *     <FieldError message={errors.get("company_name")} />
 *
 * Field paths follow the backend's flattened DRF shape — e.g.
 * ``items.0.quantity`` for the first line-item's ``quantity`` error.
 */
export function useApiErrors() {
  const [fields, setFields] = useState<ApiFieldErrors>({});

  const setFromError = useCallback((error: unknown) => {
    if (isApiError(error) && error.fields) {
      setFields(error.fields);
    } else {
      setFields({});
    }
  }, []);

  const clear = useCallback(() => setFields({}), []);

  const get = useCallback(
    (field: string): string | undefined => fields[field]?.[0],
    [fields],
  );

  const has = useCallback(
    (field: string): boolean => Boolean(fields[field]?.length),
    [fields],
  );

  return { fields, get, has, setFromError, clear };
}

/** Toast helper that respects the typed ApiError contract.
 *
 * * 401 → suppressed (the api-client already runs the refresh/redirect dance).
 * * 403 → "permission denied" wording when the backend message is generic.
 * * Other ApiErrors → the backend ``message`` is shown verbatim.
 * * Non-ApiError unknowns → fallback string.
 *
 * Field-level details are NOT toasted here — call ``useApiErrors().setFromError``
 * to render them inline below their inputs.
 */
export function toastApiError(
  error: unknown,
  fallback: string = "Something went wrong",
): void {
  if (isApiError(error)) {
    if (error.status === 401) {
      // Handled by the api-client's refresh + redirect flow.
      return;
    }
    if (error.status === 403) {
      toast.error(
        error.message || "You do not have permission to perform this action.",
      );
      return;
    }
    if (error.hasFieldErrors()) {
      // Pair the toast with the inline highlights set by useApiErrors().
      toast.error(error.message || "Please fix the highlighted fields.");
      return;
    }
    toast.error(error.message || fallback);
    return;
  }
  if (error instanceof Error) {
    toast.error(error.message || fallback);
    return;
  }
  toast.error(fallback);
}

export { ApiError, isApiError };
export type { ApiFieldErrors };
