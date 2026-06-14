"use client";

import { useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import {
  type MedicineCategory,
  type Supplier,
} from "@/lib/pharmacy-api";
import { SupplierCreateDialog } from "@/components/pharmacy/supplier-create-dialog";

// Minimal shape both `Supplier` and `MedicineSupplierRef` satisfy.
export interface SupplierOption {
  id: string;
  company_name: string;
  is_active: boolean;
  categories: MedicineCategory[];
}

/**
 * Shared supplier multi-select used by Register Medicine, and the CSV import
 * review grid. Same architecture as the original inline picker: a popover with
 * a checkbox list, an inline "Add supplier" (+) that opens the shared
 * SupplierCreateDialog (auto-ticking the new supplier), and an optional
 * category-mismatch hint.
 *
 * - ``compact`` renders a single in-cell trigger (for the wide import table):
 *   selected count on the trigger, and the add action lives inside the popover.
 * - default (non-compact) reproduces the Register Medicine layout: full-width
 *   trigger + external (+) button + removable chips below.
 */
export function SupplierMultiSelect({
  suppliers,
  selectedIds,
  onChange,
  onSupplierCreated,
  category,
  compact = false,
  disabled = false,
}: {
  suppliers: SupplierOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onSupplierCreated: (s: Supplier) => void;
  category?: MedicineCategory;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const selected = suppliers.filter((s) => selectedIds.includes(s.id));

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  const isCategoryMismatch = (s: SupplierOption): boolean =>
    !!category && s.categories.length > 0 && !s.categories.includes(category);

  const triggerLabel =
    selected.length === 0
      ? compact
        ? "Add"
        : "Select suppliers"
      : `${selected.length} selected`;

  const handleCreated = (s: Supplier) => {
    onSupplierCreated(s);
    if (!selectedIds.includes(s.id)) onChange([...selectedIds, s.id]);
    setCreateOpen(false);
  };

  const list = (
    <div className="max-h-64 overflow-y-auto p-1">
      {suppliers.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-400">
          No suppliers yet. Add one below.
        </p>
      ) : (
        suppliers.map((s) => {
          const checked = selectedIds.includes(s.id);
          const mismatch = isCategoryMismatch(s);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left"
            >
              <div
                className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${
                  checked ? "bg-primary border-primary" : "border-slate-300 bg-white"
                }`}
              >
                {checked && <Check className="h-3 w-3 text-white" />}
              </div>
              <span
                className={`text-xs font-semibold truncate ${
                  mismatch ? "text-slate-500" : "text-slate-700"
                }`}
              >
                {s.company_name}
              </span>
              {!s.is_active && (
                <Badge
                  variant="outline"
                  className="text-[9px] uppercase font-bold px-1 py-0 border-slate-300 text-slate-500 bg-slate-50 flex-shrink-0"
                >
                  Inactive
                </Badge>
              )}
              {mismatch && (
                <Badge
                  variant="outline"
                  className="text-[9px] font-bold px-1 py-0 border-amber-200 text-amber-700 bg-amber-50 flex-shrink-0"
                  title={`Supplier categories: ${s.categories.join(", ") || "none"}`}
                >
                  Not {category}
                </Badge>
              )}
            </button>
          );
        })
      )}
    </div>
  );

  // The shared create dialog, rendered once per instance.
  const createDialog = (
    <SupplierCreateDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      onCreated={handleCreated}
    />
  );

  if (compact) {
    return (
      <>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              title={
                selected.length > 0
                  ? selected.map((s) => s.company_name).join(", ")
                  : undefined
              }
              className="h-8 w-full min-w-0 rounded-lg bg-white border-slate-200 font-semibold text-slate-700 text-xs justify-between px-2"
            >
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[260px] p-0 rounded-xl border-slate-200"
          >
            {list}
            <div className="border-t border-slate-100 p-1">
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 text-left text-xs font-bold text-primary"
              >
                <Plus className="h-3.5 w-3.5" /> Add new supplier
              </button>
            </div>
          </PopoverContent>
        </Popover>
        {createDialog}
      </>
    );
  }

  // Non-compact: matches the Register Medicine layout.
  return (
    <>
      <div className="flex gap-2">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              className="flex-1 min-w-0 h-11 rounded-xl bg-slate-50 border-slate-200 font-semibold text-slate-700 text-xs justify-between hover:bg-slate-100"
            >
              <span className="truncate">{triggerLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-[var(--radix-popover-trigger-width)] p-0 rounded-xl border-slate-200"
          >
            {list}
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setCreateOpen(true)}
          title="Add new supplier"
          className="h-11 w-11 rounded-xl border-slate-200 bg-white hover:bg-slate-50 flex-shrink-0"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {selected.map((s) => (
            <span
              key={s.id}
              className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full bg-primary/10 text-primary border border-primary/20 pl-2 pr-1 py-0.5"
            >
              {s.company_name}
              {!s.is_active && (
                <span className="text-[8px] uppercase text-slate-500">
                  (inactive)
                </span>
              )}
              <button
                type="button"
                onClick={() => toggle(s.id)}
                className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5"
                aria-label={`Remove ${s.company_name}`}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      {createDialog}
    </>
  );
}
