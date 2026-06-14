"use client";

import { Fragment, useMemo, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Upload,
  FileSpreadsheet,
  Download,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  X,
  ArrowLeft,
} from "lucide-react";
import { toastApiError } from "@/lib/api-errors";
import {
  importMedicinesBulk,
  BUP_STRENGTHS,
  type MedicineBulkImportResult,
  type Supplier,
} from "@/lib/pharmacy-api";
import { SupplierMultiSelect } from "@/components/pharmacy/supplier-multi-select";
import {
  MEDICINE_CATEGORIES,
  normalizeCategory,
  downloadMedicineCsvTemplate,
  parseMedicineCsv,
  validateMedicineRow,
  rowHasErrors,
  rowToPayload,
  findInFileDuplicates,
  type MedicineCsvRow,
} from "@/lib/medicine-csv";

type Phase = "upload" | "review" | "result";

export function ImportMedicinesDialog({
  open,
  onOpenChange,
  onSuccess,
  suppliers,
  onSupplierCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  suppliers: Supplier[];
  onSupplierCreated: (s: Supplier) => void;
}) {
  const [phase, setPhase] = useState<Phase>("upload");
  const [rows, setRows] = useState<MedicineCsvRow[]>([]);
  const [headerErrors, setHeaderErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<MedicineBulkImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Live validation (per row + in-file duplicate detection) ──
  const inFileDuplicates = useMemo(() => findInFileDuplicates(rows), [rows]);
  const rowValidations = useMemo(() => {
    const map = new Map<
      number,
      { messages: string[]; hasError: boolean }
    >();
    for (const row of rows) {
      const v = validateMedicineRow(row);
      const messages = [
        ...Object.values(v.fieldErrors),
        ...v.generalErrors,
      ] as string[];
      const dupOf = inFileDuplicates.get(row.row_number);
      if (dupOf !== undefined) {
        messages.push(`Duplicate of row ${dupOf} in this file.`);
      }
      map.set(row.row_number, {
        messages,
        hasError: rowHasErrors(v) || dupOf !== undefined,
      });
    }
    return map;
  }, [rows, inFileDuplicates]);

  const errorRowCount = useMemo(
    () =>
      rows.reduce(
        (n, r) => n + (rowValidations.get(r.row_number)?.hasError ? 1 : 0),
        0,
      ),
    [rows, rowValidations],
  );
  const validRowCount = rows.length - errorRowCount;

  const reset = () => {
    setPhase("upload");
    setRows([]);
    setHeaderErrors([]);
    setFileName("");
    setResult(null);
    setIsDragging(false);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const ingestFile = async (file: File) => {
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("Please select a .csv file.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseMedicineCsv(text);
      if (parsed.headerErrors.some((e) => e.startsWith("Missing"))) {
        // Fatal header problem — can't map columns.
        setHeaderErrors(parsed.headerErrors);
        setRows([]);
        setFileName(file.name);
        setPhase("review");
        return;
      }
      if (parsed.rows.length === 0) {
        toast.error("No data rows found in the file.");
        return;
      }
      setHeaderErrors(parsed.headerErrors);
      setRows(parsed.rows);
      setFileName(file.name);
      setPhase("review");
    } catch {
      toast.error("Unable to read the selected file.");
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void ingestFile(file);
  };

  const updateRow = (
    rowNumber: number,
    patch: Partial<MedicineCsvRow>,
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.row_number === rowNumber ? { ...r, ...patch } : r,
      ),
    );
  };

  const removeRow = (rowNumber: number) => {
    setRows((prev) => prev.filter((r) => r.row_number !== rowNumber));
  };

  const handleSubmit = async () => {
    if (rows.length === 0) {
      toast.error("There are no rows to import.");
      return;
    }
    if (errorRowCount > 0) {
      toast.error(
        `Fix or remove ${errorRowCount} row(s) with errors before registering.`,
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = rows.map(rowToPayload);
      const res = await importMedicinesBulk(payload);
      setResult(res);
      setPhase("result");
      if (res.summary.created > 0) {
        toast.success(`Registered ${res.summary.created} medicine(s).`);
        onSuccess();
      } else {
        toast.message("No new medicines were registered.");
      }
    } catch (error) {
      toastApiError(error, "Bulk import failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (hasErr: boolean) =>
    `h-8 text-xs rounded-lg bg-white ${
      hasErr ? "border-rose-300 focus-visible:ring-rose-200" : "border-slate-200"
    }`;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[1120px] max-h-[90vh] overflow-hidden flex flex-col rounded-2xl p-0 bg-white border border-slate-100">
        <DialogHeader className="p-6 pb-4 border-b border-slate-100 bg-slate-50/50">
          <DialogTitle className="text-base font-black text-slate-800 tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Import Medicines (CSV)
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400 mt-1">
            Bulk-register medicines from a spreadsheet. Review and fix rows
            before submitting — nothing is saved until you click Register.
          </DialogDescription>
        </DialogHeader>

        {/* ── Phase: Upload ── */}
        {phase === "upload" ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold text-slate-500">
                Step 1 — Download the template, fill it, then upload.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={downloadMedicineCsvTemplate}
                className="h-9 rounded-xl border-primary/30 bg-teal-50/50 hover:bg-teal-50 text-xs font-black text-primary flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download Sample CSV
              </Button>
            </div>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  fileInputRef.current?.click();
                }
              }}
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed py-14 cursor-pointer transition-colors ${
                isDragging
                  ? "border-primary bg-teal-50/50"
                  : "border-slate-200 bg-slate-50/40 hover:border-primary/40 hover:bg-slate-50"
              }`}
            >
              <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                <Upload className="h-6 w-6 text-primary" />
              </div>
              <div className="text-center">
                <p className="text-sm font-extrabold text-slate-700">
                  Drag &amp; drop your CSV here
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  or click to browse — .csv files only
                </p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void ingestFile(file);
              }}
            />
          </div>
        ) : null}

        {/* ── Phase: Review ── */}
        {phase === "review" ? (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2 text-xs">
                <Badge
                  variant="outline"
                  className="font-bold text-slate-500 bg-slate-50 border-slate-200"
                >
                  <FileSpreadsheet className="h-3 w-3 mr-1" />
                  {fileName}
                </Badge>
                <span className="font-bold text-slate-600">
                  {rows.length} row(s)
                </span>
                {validRowCount > 0 ? (
                  <span className="flex items-center gap-1 font-bold text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" /> {validRowCount} valid
                  </span>
                ) : null}
                {errorRowCount > 0 ? (
                  <span className="flex items-center gap-1 font-bold text-rose-600">
                    <AlertTriangle className="h-3.5 w-3.5" /> {errorRowCount} with
                    issues
                  </span>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={reset}
                className="h-8 rounded-lg text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Choose another file
              </Button>
            </div>

            {headerErrors.length > 0 ? (
              <div className="mx-6 mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                {headerErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>{e}</span>
                  </div>
                ))}
              </div>
            ) : null}

            {rows.length > 0 ? (
              <div className="flex-1 overflow-auto px-6 py-3">
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-transparent">
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500 w-10">
                          #
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Name
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Salt
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Category
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          BUP Strength
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Manufacturer
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">
                          Reorder
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">
                          Tabs/Strip
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">
                          MRP
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">
                          Selling
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Suppliers
                        </TableHead>
                        <TableHead className="h-9 text-[10px] font-bold uppercase tracking-wider text-slate-500 text-center">
                          Status
                        </TableHead>
                        <TableHead className="h-9 w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => {
                        const v = rowValidations.get(row.row_number);
                        const fe = validateMedicineRow(row).fieldErrors;
                        // Canonicalise the parsed category (case-insensitive)
                        // so the Select reflects Rx / NRx / BUP correctly —
                        // a naive toUpperCase() only matched the all-caps BUP
                        // and left Rx/NRx blank, forcing manual re-selection.
                        const catValue =
                          normalizeCategory(row.category) ?? undefined;
                        const isBup = catValue === "BUP";
                        return (
                          <Fragment key={row.row_number}>
                            <TableRow className="border-slate-100 align-top">
                              <TableCell className="text-xs font-bold text-slate-400 py-2">
                                {row.row_number}
                              </TableCell>
                              <TableCell className="py-2 min-w-[160px]">
                                <Input
                                  value={row.name}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      name: e.target.value,
                                    })
                                  }
                                  className={inputClass(!!fe.name)}
                                />
                              </TableCell>
                              <TableCell className="py-2 min-w-[150px]">
                                <Input
                                  value={row.salt}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      salt: e.target.value,
                                    })
                                  }
                                  className={inputClass(!!fe.salt)}
                                />
                              </TableCell>
                              <TableCell className="py-2 min-w-[110px]">
                                <Select
                                  value={catValue}
                                  onValueChange={(val) =>
                                    updateRow(row.row_number, {
                                      category: val,
                                      // Clear strength when leaving BUP.
                                      bup_category:
                                        val === "BUP" ? row.bup_category : "",
                                    })
                                  }
                                >
                                  <SelectTrigger
                                    className={inputClass(!!fe.category)}
                                  >
                                    <SelectValue placeholder="—" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {MEDICINE_CATEGORIES.map((c) => (
                                      <SelectItem
                                        key={c}
                                        value={c}
                                        className="text-xs"
                                      >
                                        {c}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-2 min-w-[130px]">
                                <Select
                                  value={row.bup_category || undefined}
                                  onValueChange={(val) =>
                                    updateRow(row.row_number, {
                                      bup_category: val,
                                    })
                                  }
                                  disabled={!isBup}
                                >
                                  <SelectTrigger
                                    className={inputClass(!!fe.bup_category)}
                                  >
                                    <SelectValue
                                      placeholder={isBup ? "Select" : "N/A"}
                                    />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {BUP_STRENGTHS.map((s) => (
                                      <SelectItem
                                        key={s}
                                        value={s}
                                        className="text-xs"
                                      >
                                        {s}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell className="py-2 min-w-[140px]">
                                <Input
                                  value={row.manufacturer}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      manufacturer: e.target.value,
                                    })
                                  }
                                  className={inputClass(!!fe.manufacturer)}
                                />
                              </TableCell>
                              <TableCell className="py-2">
                                <Input
                                  value={row.reorder_level}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      reorder_level: e.target.value,
                                    })
                                  }
                                  className={`${inputClass(!!fe.reorder_level)} w-16 text-center`}
                                />
                              </TableCell>
                              <TableCell className="py-2">
                                <Input
                                  value={row.tablets_per_strip}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      tablets_per_strip: e.target.value,
                                    })
                                  }
                                  className={`${inputClass(!!fe.tablets_per_strip)} w-16 text-center`}
                                />
                              </TableCell>
                              <TableCell className="py-2">
                                <Input
                                  value={row.mrp}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      mrp: e.target.value,
                                    })
                                  }
                                  className={`${inputClass(!!fe.mrp)} w-20 text-center`}
                                />
                              </TableCell>
                              <TableCell className="py-2">
                                <Input
                                  value={row.selling_price}
                                  onChange={(e) =>
                                    updateRow(row.row_number, {
                                      selling_price: e.target.value,
                                    })
                                  }
                                  className={`${inputClass(!!fe.selling_price)} w-20 text-center`}
                                />
                              </TableCell>
                              <TableCell className="py-2 min-w-[150px]">
                                <SupplierMultiSelect
                                  compact
                                  suppliers={suppliers}
                                  selectedIds={row.supplier_ids}
                                  onChange={(ids) =>
                                    updateRow(row.row_number, {
                                      supplier_ids: ids,
                                    })
                                  }
                                  onSupplierCreated={onSupplierCreated}
                                  category={
                                    normalizeCategory(row.category) ?? undefined
                                  }
                                />
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                {v?.hasError ? (
                                  <Badge className="bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold">
                                    {v.messages.length} issue
                                    {v.messages.length === 1 ? "" : "s"}
                                  </Badge>
                                ) : (
                                  <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                                    OK
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => removeRow(row.row_number)}
                                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Remove row"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                            {v?.hasError ? (
                              <TableRow className="border-slate-100 hover:bg-transparent">
                                <TableCell />
                                <TableCell
                                  colSpan={12}
                                  className="py-1 pb-2"
                                >
                                  <div className="text-[11px] text-rose-600 font-semibold space-y-0.5">
                                    {v.messages.map((m, i) => (
                                      <div
                                        key={i}
                                        className="flex items-start gap-1.5"
                                      >
                                        <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                        <span>{m}</span>
                                      </div>
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ) : null}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-400 font-semibold p-10">
                No importable rows. Choose another file.
              </div>
            )}

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-400 font-medium">
                Duplicates of existing medicines are skipped automatically.
              </p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleClose(false)}
                  className="h-10 rounded-xl border-slate-200 font-bold text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    isSubmitting || rows.length === 0 || errorRowCount > 0
                  }
                  className="h-10 rounded-xl bg-primary hover:bg-primary-dark text-white font-extrabold text-xs px-6 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Register {validRowCount > 0 ? validRowCount : ""} Medicine
                  {validRowCount === 1 ? "" : "s"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}

        {/* ── Phase: Result ── */}
        {phase === "result" && result ? (
          <div className="flex flex-col min-h-0 flex-1">
            <div className="px-6 py-4 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center">
                <p className="text-2xl font-black text-emerald-700">
                  {result.summary.created}
                </p>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                  Registered
                </p>
              </div>
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                <p className="text-2xl font-black text-amber-700">
                  {result.summary.skipped}
                </p>
                <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                  Skipped (existing)
                </p>
              </div>
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
                <p className="text-2xl font-black text-rose-700">
                  {result.summary.failed}
                </p>
                <p className="text-[10px] font-bold text-rose-600 uppercase tracking-wider">
                  Failed
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-6 pb-3 space-y-3">
              {result.skipped.length > 0 ? (
                <div className="rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                  <p className="text-xs font-black text-amber-700 uppercase tracking-wider mb-1.5">
                    Skipped
                  </p>
                  <div className="space-y-1">
                    {result.skipped.map((s) => (
                      <div
                        key={s.row_number}
                        className="text-[11px] text-amber-800"
                      >
                        <span className="font-bold">Row {s.row_number}</span>
                        {s.name ? ` (${s.name})` : ""}: {s.reason}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {result.errors.length > 0 ? (
                <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
                  <p className="text-xs font-black text-rose-700 uppercase tracking-wider mb-1.5">
                    Failed
                  </p>
                  <div className="space-y-1">
                    {result.errors.map((e) => (
                      <div
                        key={e.row_number}
                        className="text-[11px] text-rose-800"
                      >
                        <span className="font-bold">Row {e.row_number}</span>:{" "}
                        {e.errors.join("; ")}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {result.summary.created > 0 &&
              result.skipped.length === 0 &&
              result.errors.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mb-2" />
                  <p className="text-sm font-bold text-slate-700">
                    All {result.summary.created} medicines registered
                    successfully.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/30 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                className="h-10 rounded-xl border-slate-200 font-bold text-xs"
              >
                <Upload className="h-4 w-4 mr-1.5" /> Import another file
              </Button>
              <Button
                type="button"
                onClick={() => handleClose(false)}
                className="h-10 rounded-xl bg-primary hover:bg-primary-dark text-white font-extrabold text-xs px-6"
              >
                <X className="h-4 w-4 mr-1.5" /> Done
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
