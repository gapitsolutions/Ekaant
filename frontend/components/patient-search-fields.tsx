"use client";

import { Checkbox } from "@/components/ui/checkbox";
import type { PatientSearchField } from "@/lib/hms-api";

// Single source of truth for the patient search-field scope, shared by the
// Reception → Patient Data search and the Check-In History search so both
// offer identical options, ordering, labels, and behaviour.
export const PATIENT_SEARCH_FIELD_OPTIONS: {
  key: PatientSearchField;
  label: string;
}[] = [
  { key: "file_number", label: "File No." },
  { key: "full_name", label: "Name" },
  { key: "aadhaar_number", label: "Aadhaar" },
  { key: "hdams_id", label: "HDAMS ID" },
  { key: "phone_number", label: "Phone" },
];

const FIELD_PLACEHOLDER_LABEL: Record<PatientSearchField, string> = {
  file_number: "File Number",
  full_name: "Name",
  aadhaar_number: "Aadhaar",
  hdams_id: "HDAMS ID",
  phone_number: "Phone",
};

/** Placeholder text for the search input, matching the selected scope. */
export function patientSearchPlaceholder(fields: PatientSearchField[]): string {
  if (fields.length === 1) {
    return `Search by ${FIELD_PLACEHOLDER_LABEL[fields[0]]}…`;
  }
  return `Search by ${fields.length} fields…`;
}

/**
 * The "Search in" checkbox row. Tick the patient identity fields the query
 * should match. Never lets the user untick the last field — `file_number`
 * stays as a sane fallback so the input never silently matches nothing.
 */
export function PatientSearchFields({
  value,
  onChange,
  className = "",
}: {
  value: PatientSearchField[];
  onChange: (next: PatientSearchField[]) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${className}`}
    >
      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Search in
      </span>
      {PATIENT_SEARCH_FIELD_OPTIONS.map(({ key, label }) => {
        const checked = value.includes(key);
        const isOnlySelection = checked && value.length === 1;
        return (
          <label
            key={key}
            className={`flex items-center gap-2 text-sm cursor-pointer select-none ${
              isOnlySelection ? "opacity-90" : ""
            }`}
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) => {
                const shouldCheck = v === true;
                if (shouldCheck) {
                  onChange(value.includes(key) ? value : [...value, key]);
                } else {
                  const next = value.filter((f) => f !== key);
                  onChange(next.length === 0 ? ["file_number"] : next);
                }
              }}
            />
            <span>{label}</span>
          </label>
        );
      })}
    </div>
  );
}
