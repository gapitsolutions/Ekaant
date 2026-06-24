"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PatientInvoiceView } from "@/components/patients/PatientInvoiceView";
import {
  Download,
  Eye,
  Loader2,
  Search,
  FileText,
  User,
  CheckCircle2,
  Pencil,
  Plus,
  Trash2,
  History,
} from "lucide-react";
import {
  amendDispense,
  getDispenseHistory,
  getDispenseInvoiceBySession,
  getInventoryMedicines,
  type DispenseAmendmentInfo,
  type DispenseHistoryItem,
  type DispenseHistoryStats,
  type DispenseInvoiceDetail,
  type DispenseLineItemPayload,
  type DispenseStatus,
  type Medicine,
  type PaymentMethod,
} from "@/lib/pharmacy-api";
import { toastApiError } from "@/lib/api-errors";
import { generateInvoicePdf } from "@/lib/export/generateInvoicePdf";
import { AmendmentHistoryDialog } from "@/components/pharmacy/amendment-history-dialog";

type ActiveInvoice = {
  sessionId: string;
  patientName: string;
  fileNumber: string;
  status: DispenseStatus;
};

function formatAmount(amount: string): string {
  const parsed = parseFloat(amount);
  if (Number.isNaN(parsed)) return "\u20B90";
  return `\u20B9${parsed.toLocaleString("en-IN")}`;
}

function statusBadgeClass(status: DispenseStatus): string {
  if (status === "success") {
    return "bg-emerald-600 hover:bg-emerald-600 text-white font-semibold";
  }
  return "bg-rose-600 hover:bg-rose-600 text-white font-semibold";
}

export default function InvoiceHistoryPage() {
  const [items, setItems] = useState<DispenseHistoryItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | DispenseStatus>(
    "all",
  );
  const [amendedFilter, setAmendedFilter] = useState<
    "all" | "amended" | "not_amended"
  >("all");
  // Default the range to today so the page opens scoped to today's
  // dispenses; the three header cards describe today by default and
  // update as the user widens / clears the range. ``toLocaleDateString``
  // with the ``en-CA`` locale yields a stable ISO ``YYYY-MM-DD`` in the
  // user's local timezone.
  const todayIso = new Date().toLocaleDateString("en-CA");
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);
  // ``stats`` is the backend's range-scoped aggregate (unique patients,
  // total revenue, total records) — independent of pagination. See
  // API_BLUEPRINT §7.15.
  const [stats, setStats] = useState<DispenseHistoryStats>({
    unique_patients: 0,
    total_revenue: "0",
    total_collected: "0",
    total_outstanding: "0",
    total_records: 0,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null);
  const [downloadingSessionId, setDownloadingSessionId] = useState<
    string | null
  >(null);
  const [activeInvoice, setActiveInvoice] = useState<ActiveInvoice | null>(
    null,
  );
  const [isInvoiceDialogOpen, setIsInvoiceDialogOpen] = useState(false);
  const [invoiceCache, setInvoiceCache] = useState<
    Record<string, DispenseInvoiceDetail>
  >({});
  // Row whose invoice is being amended (null = amend dialog closed).
  const [amendTarget, setAmendTarget] = useState<DispenseHistoryItem | null>(
    null,
  );
  // "Previous versions" dialog state (amendment snapshots).
  const [prevVersionsOpen, setPrevVersionsOpen] = useState(false);
  const [prevVersionsInvoice, setPrevVersionsInvoice] = useState<{
    invoiceNumber: string;
    patientName: string;
  } | null>(null);
  const [prevVersionsAmendments, setPrevVersionsAmendments] = useState<
    DispenseAmendmentInfo[]
  >([]);
  const [loadingPrevId, setLoadingPrevId] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const loadHistory = useCallback(() => {
    setIsLoading(true);
    setErrorMessage("");
    return getDispenseHistory({
      q: debouncedSearch || undefined,
      page,
      pageSize,
      status: statusFilter === "all" ? undefined : statusFilter,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
      amended:
        amendedFilter === "all" ? undefined : amendedFilter === "amended",
    })
      .then((data) => {
        setItems(data.items || []);
        setPagination(
          data.pagination || {
            page,
            pageSize,
            total: data.items?.length || 0,
          },
        );
        if (data.stats) {
          setStats(data.stats);
        }
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load invoice history.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [debouncedSearch, page, pageSize, statusFilter, amendedFilter, startDate, endDate]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Range label for the small caption under each card. Falls through
  // a short ladder: today → all-time → single date → from/to.
  const rangeLabel = useMemo(() => {
    if (!startDate && !endDate) return "All time";
    if (startDate && endDate && startDate === endDate) {
      return startDate === todayIso ? "Today" : startDate;
    }
    if (startDate && endDate) return `${startDate} → ${endDate}`;
    if (startDate) return `From ${startDate}`;
    return `Until ${endDate}`;
  }, [startDate, endDate, todayIso]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize));

  const selectedInvoice = useMemo(() => {
    if (!activeInvoice) return null;
    return invoiceCache[activeInvoice.sessionId] || null;
  }, [activeInvoice, invoiceCache]);

  const handleExportCSV = () => {
    if (items.length === 0) return;
    const header = [
      "Invoice #",
      "Patient",
      "File No.",
      "Date",
      "Time",
      "Bill Amount",
      "Amount Paid",
      "Outstanding",
      "Payment",
      "Status",
      "Pharmacist",
    ];
    const rows = items.map((it) => [
      it.invoice_number,
      it.patient,
      it.file_number || "",
      it.date,
      it.time,
      it.amount,
      it.amount_paid,
      it.outstanding,
      it.payment_method,
      it.status,
      it.pharmacist,
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice_history_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const fetchInvoiceDetail = useCallback(
    async (sessionId: string): Promise<DispenseInvoiceDetail> => {
      const cached = invoiceCache[sessionId];
      if (cached) return cached;
      const detail = await getDispenseInvoiceBySession(sessionId);
      setInvoiceCache((prev) => ({ ...prev, [sessionId]: detail }));
      return detail;
    },
    [invoiceCache],
  );

  const handleViewInvoice = async (item: DispenseHistoryItem) => {
    if (!item.session_id) {
      toast.error("Invoice session reference is missing for this row.");
      return;
    }

    setViewingSessionId(item.session_id);
    try {
      await fetchInvoiceDetail(item.session_id);
      setActiveInvoice({
        sessionId: item.session_id,
        patientName: item.patient,
        fileNumber: item.file_number || "N/A",
        status: item.status,
      });
      setIsInvoiceDialogOpen(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to load invoice details.";
      toast.error(message);
    } finally {
      setViewingSessionId(null);
    }
  };

  const handleDownloadInvoice = async (item: DispenseHistoryItem) => {
    if (!item.session_id) {
      toast.error("Invoice session reference is missing for this row.");
      return;
    }

    setDownloadingSessionId(item.session_id);
    try {
      const detail = await fetchInvoiceDetail(item.session_id);
      await generateInvoicePdf({
        invoice: detail,
        patientName: item.patient,
        fileNumber: item.file_number || "N/A",
        mode: "download",
      });
      toast.success("Invoice PDF downloaded.");
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to download this invoice PDF.";
      toast.error(message);
    } finally {
      setDownloadingSessionId(null);
    }
  };

  const handleViewPreviousVersions = async (item: DispenseHistoryItem) => {
    if (!item.session_id) {
      toast.error("Invoice session reference is missing for this row.");
      return;
    }
    setLoadingPrevId(item.session_id);
    try {
      // Reuses the cached detail (amendments now carry their previous_state).
      const detail = await fetchInvoiceDetail(item.session_id);
      setPrevVersionsAmendments(detail.amendments || []);
      setPrevVersionsInvoice({
        invoiceNumber: detail.invoice_number,
        patientName: item.patient,
      });
      setPrevVersionsOpen(true);
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to load previous versions.";
      toast.error(message);
    } finally {
      setLoadingPrevId(null);
    }
  };

  const renderActions = (item: DispenseHistoryItem) => {
    const hasSession = Boolean(item.session_id);
    const isViewing = viewingSessionId === item.session_id;
    const isDownloading = downloadingSessionId === item.session_id;
    const isLoadingPrev = loadingPrevId === item.session_id;

    return (
      <div className="flex items-center gap-2 sm:justify-end">
        {item.is_amended && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-amber-200 text-amber-700 font-semibold hover:bg-amber-50 hover:text-amber-800"
            onClick={() => void handleViewPreviousVersions(item)}
            disabled={!hasSession || isViewing || isDownloading || isLoadingPrev}
            title={
              !hasSession
                ? "Session reference unavailable"
                : "View this invoice's previous versions (amendment history)"
            }
          >
            {isLoadingPrev ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <History className="h-3.5 w-3.5 mr-1.5" />
            )}
            Previous versions
          </Button>
        )}
        {item.status === "success" && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 rounded-lg border-amber-200 text-amber-700 font-semibold hover:bg-amber-50 hover:text-amber-800"
            onClick={() => setAmendTarget(item)}
            disabled={!hasSession || isViewing || isDownloading}
            title={
              !hasSession
                ? "Session reference unavailable"
                : "Correct this invoice (quantities, medicines, payment)"
            }
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 rounded-lg border-slate-200 text-slate-700 font-semibold"
          onClick={() => void handleDownloadInvoice(item)}
          disabled={!hasSession || isViewing || isDownloading}
          title={!hasSession ? "Session reference unavailable" : undefined}
        >
          {isDownloading ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5 mr-1.5" />
          )}
          Download
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 rounded-lg text-primary hover:text-primary hover:bg-teal-50 font-semibold"
          onClick={() => void handleViewInvoice(item)}
          disabled={!hasSession || isViewing || isDownloading}
          title={!hasSession ? "Session reference unavailable" : undefined}
        >
          {isViewing ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <Eye className="h-3.5 w-3.5 mr-1.5" />
          )}
          View
        </Button>
      </div>
    );
  };

  return (
    <>
      <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
        <PageHeader
          icon={
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
          }
          title="Invoice History"
          subtitle="Historical record of dispensed and cancelled invoices"
          actions={
            <>
              <Badge className="bg-teal-50 hover:bg-teal-50 text-primary font-bold px-3 py-1.5 rounded-lg border border-teal-200 shadow-sm flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Audit Compliant
              </Badge>
              <Button
                variant="outline"
                onClick={handleExportCSV}
                disabled={items.length === 0}
                className="border-slate-200 text-slate-700 font-semibold rounded-lg px-4 h-10 shadow-sm hover:bg-slate-50"
              >
                <Download className="h-4 w-4 mr-2 text-slate-500" />
                Export CSV
              </Button>
            </>
          }
        />

        {/* Three cards \u2014 values come from the backend ``stats`` aggregate,
            independent of pagination. See API_BLUEPRINT \u00A77.15. The small
            label under each number reflects the active filter range so
            the user always sees what scope they're looking at. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                <User className="h-7 w-7 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Unique Patients
                </p>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                  {stats.unique_patients}
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {rangeLabel}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-black text-emerald-600 tracking-tight">
                  {"\u20B9"}
                </span>
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Total Collected
                </p>
                <h3 className="text-2xl font-black text-primary tracking-tight mt-0.5">
                  {"\u20B9"}
                  {(parseFloat(stats.total_collected) || 0).toLocaleString(
                    "en-IN",
                    { maximumFractionDigits: 0 },
                  )}
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {parseFloat(stats.total_outstanding) > 0
                    ? `${rangeLabel} \u00B7 \u20B9${(parseFloat(stats.total_outstanding) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })} outstanding`
                    : rangeLabel}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardContent className="p-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
                <FileText className="h-7 w-7 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                  Total Records
                </p>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">
                  {stats.total_records}
                </h3>
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                  {rangeLabel}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardHeader className="bg-white border-b border-slate-100 py-4 px-6">
            <CardTitle className="text-lg font-bold text-slate-800 tracking-tight">
              Invoice Records
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-6">
            {/* "Today Only" dropdown removed — redundant with the date
                range below, which now defaults to today. */}
            <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_150px_150px_130px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by patient, file no., invoice"
                  className="pl-9 h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium focus:ring-primary/10 focus:border-primary"
                />
              </div>
              <Select
                value={statusFilter}
                onValueChange={(v) => {
                  setPage(1);
                  setStatusFilter(v as "all" | DispenseStatus);
                }}
              >
                <SelectTrigger className="h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="success">Success</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={amendedFilter}
                onValueChange={(v) => {
                  setPage(1);
                  setAmendedFilter(v as "all" | "amended" | "not_amended");
                }}
              >
                <SelectTrigger className="h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium">
                  <SelectValue placeholder="Amendment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Invoices</SelectItem>
                  <SelectItem value="amended">Amended Only</SelectItem>
                  <SelectItem value="not_amended">Not Amended</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPage(1);
                  setPageSize(Number(v));
                }}
              >
                <SelectTrigger className="h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25 / page</SelectItem>
                  <SelectItem value="50">50 / page</SelectItem>
                  <SelectItem value="100">100 / page</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setPage(1);
                  setStartDate(e.target.value);
                }}
                aria-label="Start date"
                className="h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
              />
              <Input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setPage(1);
                  setEndDate(e.target.value);
                }}
                aria-label="End date"
                className="h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium"
              />
              <Button
                variant="outline"
                className="h-10 rounded-xl border-slate-200 hover:bg-slate-50 font-semibold text-slate-700"
                onClick={() => {
                  setPage(1);
                  setSearchQuery("");
                  setDebouncedSearch("");
                  setStatusFilter("all");
                  setAmendedFilter("all");
                  setStartDate("");
                  setEndDate("");
                }}
              >
                Clear Filters
              </Button>
            </div>

            {errorMessage ? (
              <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-4 py-3">
                {errorMessage}
              </p>
            ) : null}

            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                className="py-16"
                icon={
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                    <FileText className="h-7 w-7 text-slate-400" />
                  </div>
                }
                title="No invoices found"
                description="No invoices match your filters."
              />
            ) : (
              <>
                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50/80">
                        <TableHead className="px-6 h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                          Patient Details
                        </TableHead>
                        <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                          Fulfillment
                        </TableHead>
                        <TableHead className="h-10 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500">
                          Amount Paid
                        </TableHead>
                        <TableHead className="h-10 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500 px-6">
                          Action
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {items.map((it) => (
                        <TableRow
                          key={it.id}
                          className="hover:bg-slate-50/50 transition-colors border-slate-100"
                        >
                          <TableCell className="px-6 py-4 align-top">
                            <p className="font-bold text-slate-800 text-sm tracking-tight">
                              {it.patient}
                            </p>
                            <p className="text-xs font-medium text-slate-500 mt-1">
                              FILE:{" "}
                              <span className="font-mono font-bold text-primary">
                                {it.file_number || "-"}
                              </span>
                            </p>
                            <p className="text-[11px] font-mono font-bold text-slate-400 mt-1.5">
                              {it.invoice_number}
                            </p>
                          </TableCell>
                          <TableCell className="py-4 align-top">
                            <div className="text-base font-bold text-slate-800 leading-tight">
                              {it.date}
                            </div>
                            <div className="text-xs text-slate-500 font-medium mt-1">
                              {it.time} by {it.pharmacist || "-"}
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge
                                variant="outline"
                                className="border-slate-200 text-slate-600 font-semibold"
                              >
                                {it.payment_method}
                              </Badge>
                              <Badge className={statusBadgeClass(it.status)}>
                                {it.status}
                              </Badge>
                              {it.is_amended && (
                                <Badge
                                  variant="outline"
                                  className="border-amber-200 text-amber-700 bg-amber-50 font-semibold"
                                >
                                  Amended
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-4 text-right align-top">
                            <span className="text-lg font-bold text-slate-800 tracking-tight block">
                              {formatAmount(it.amount_paid)}
                            </span>
                            <span className="text-[11px] font-medium text-slate-400 block mt-0.5">
                              Bill: {formatAmount(it.amount)}
                            </span>
                            {parseFloat(it.outstanding) > 0 && (
                              <span className="text-[11px] font-bold text-rose-600 block mt-0.5">
                                Due: {formatAmount(it.outstanding)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="px-6 py-4 text-right align-top">
                            {renderActions(it)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="md:hidden space-y-3">
                  {items.map((it) => (
                    <div
                      key={it.id}
                      className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-3"
                    >
                      <div>
                        <p className="font-bold text-slate-800 text-base">{it.patient}</p>
                        <p className="text-xs font-medium text-slate-500 mt-1">
                          FILE:{" "}
                          <span className="font-mono font-bold text-primary">
                            {it.file_number || "-"}
                          </span>
                        </p>
                        <p className="text-[11px] font-mono font-bold text-slate-400 mt-1">
                          {it.invoice_number}
                        </p>
                      </div>
                      <div>
                        <div className="text-base font-bold text-slate-800">{it.date}</div>
                        <div className="text-xs text-slate-500 font-medium mt-1">
                          {it.time} by {it.pharmacist || "-"}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge
                            variant="outline"
                            className="border-slate-200 text-slate-600 font-semibold"
                          >
                            {it.payment_method}
                          </Badge>
                          <Badge className={statusBadgeClass(it.status)}>
                            {it.status}
                          </Badge>
                          {it.is_amended && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 text-amber-700 bg-amber-50 font-semibold"
                            >
                              Amended
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div>
                          <span className="text-base font-bold text-slate-800 block">
                            {formatAmount(it.amount_paid)}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400 block">
                            Bill: {formatAmount(it.amount)}
                          </span>
                          {parseFloat(it.outstanding) > 0 && (
                            <span className="text-[11px] font-bold text-rose-600 block">
                              Due: {formatAmount(it.outstanding)}
                            </span>
                          )}
                        </div>
                        {renderActions(it)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="flex items-center justify-between text-xs text-slate-500 font-medium pt-4 border-t border-slate-100">
              <span>
                Showing {items.length} of {pagination.total} record
                {pagination.total === 1 ? "" : "s"}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page <= 1 || isLoading}
                >
                  Previous
                </Button>
                <span className="text-xs font-bold text-slate-600">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-slate-200 text-slate-600 font-semibold hover:bg-slate-50"
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page >= totalPages || isLoading}
                >
                  Next
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={isInvoiceDialogOpen}
        onOpenChange={(open) => {
          setIsInvoiceDialogOpen(open);
          if (!open) setActiveInvoice(null);
        }}
      >
        <DialogContent className="w-[96vw] max-w-4xl max-h-[92vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle className="sr-only">Invoice Preview</DialogTitle>
          </DialogHeader>
          {activeInvoice ? (
            <div className="[&>div]:max-w-3xl [&>div]:w-full [&>div]:mx-auto">
              <PatientInvoiceView
                sessionId={activeInvoice.sessionId}
                visitStatus={activeInvoice.status}
                patientName={activeInvoice.patientName}
                fileNumber={activeInvoice.fileNumber}
                prefetchedInvoice={selectedInvoice}
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <AmendInvoiceDialog
        historyItem={amendTarget}
        onClose={() => setAmendTarget(null)}
        onAmended={(detail) => {
          // The PATCH response is the fresh full detail — keep the View /
          // Download cache in sync and refresh the list so the new amount
          // and the "Amended" badge appear immediately.
          setInvoiceCache((prev) => ({ ...prev, [detail.session_id]: detail }));
          setAmendTarget(null);
          void loadHistory();
        }}
      />

      <AmendmentHistoryDialog
        open={prevVersionsOpen}
        onOpenChange={(open) => {
          setPrevVersionsOpen(open);
          if (!open) setPrevVersionsInvoice(null);
        }}
        invoiceNumber={prevVersionsInvoice?.invoiceNumber || ""}
        patientName={prevVersionsInvoice?.patientName || ""}
        amendments={prevVersionsAmendments}
      />
    </>
  );
}

// ────────── Amend Invoice Dialog ──────────
//
// Post-dispense correction (API_BLUEPRINT §7.14a). Loads a FRESH copy of
// the invoice on every open (no cache — another pharmacist may have
// amended it since), lets the pharmacist edit line items / payment /
// discount, and submits the whole corrected state with a mandatory
// reason. The backend reverts-then-reapplies stock and snapshots the
// previous state into the amendment audit table.

// Dose pattern and number-of-days are no longer entered during dispensing.
// Existing lines keep whatever dose/days were stored (no data loss); newly
// added lines and the submitted payload use these neutral defaults, which the
// backend still requires but never uses in any calculation.
const DEFAULT_DISPENSE_DOSE = "-";
const DEFAULT_DISPENSE_DAYS = 1;

interface AmendLineDraft {
  key: string;
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  dose: string;
  days: string;
  qty: string;
  unit_price: string;
}

function AmendInvoiceDialog({
  historyItem,
  onClose,
  onAmended,
}: {
  historyItem: DispenseHistoryItem | null;
  onClose: () => void;
  onAmended: (detail: DispenseInvoiceDetail) => void;
}) {
  const open = historyItem !== null;
  const sessionId = historyItem?.session_id || "";

  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [lines, setLines] = useState<AmendLineDraft[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash");
  const [cashAmount, setCashAmount] = useState("");
  const [onlineAmount, setOnlineAmount] = useState("");
  const [discount, setDiscount] = useState("0");
  const [consultationFee, setConsultationFee] = useState("0");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [addMedicineId, setAddMedicineId] = useState("");

  // Fresh load on every open.
  useEffect(() => {
    if (!open || !sessionId) return;
    setIsLoading(true);
    setLoadError("");
    setReason("");
    setAddMedicineId("");
    Promise.all([
      getDispenseInvoiceBySession(sessionId),
      getInventoryMedicines(),
    ])
      .then(([detail, meds]) => {
        setInvoiceNumber(detail.invoice_number);
        setLines(
          detail.items.map((item) => ({
            key: item.id,
            medicine_id: item.medicine_id,
            medicine_name: item.medicine_name,
            batch_number: item.batch_number,
            dose: item.dose,
            days: String(item.days),
            qty: String(item.quantity),
            unit_price: item.unit_price,
          })),
        );
        const method = detail.payment_method;
        setPaymentMethod(
          method === "Online" || method === "Split" ? method : "Cash",
        );
        setCashAmount(detail.cash_amount);
        setOnlineAmount(detail.online_amount);
        setDiscount(detail.discount_amount);
        setConsultationFee(detail.consultation_fee ?? "0");
        setNotes(detail.notes);
        setMedicines(meds.items || []);
      })
      .catch((error: unknown) => {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load the invoice for editing.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [open, sessionId]);

  const subtotal = useMemo(
    () =>
      lines.reduce(
        (sum, line) =>
          sum +
          (parseInt(line.qty) || 0) * (parseFloat(line.unit_price) || 0),
        0,
      ),
    [lines],
  );
  const consultationFeeNum = Math.max(0, parseFloat(consultationFee) || 0);
  const netPayable =
    Math.max(0, subtotal - (parseFloat(discount) || 0)) + consultationFeeNum;

  const updateLine = (key: string, patch: Partial<AmendLineDraft>) => {
    setLines((prev) =>
      prev.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  };

  // Batch options for a line: the medicine's active batches (FEFO order
  // from the API) plus the line's current batch if the list doesn't have
  // it (fully depleted by this very invoice, or expired). The backend
  // restores this invoice's stock before re-validating, so the quantities
  // shown here UNDERSTATE what is actually available for same-batch reuse.
  const batchOptionsFor = (line: AmendLineDraft): string[] => {
    const med = medicines.find((m) => m.id === line.medicine_id);
    const numbers = (med?.batches || []).map((b) => b.batch_number);
    if (line.batch_number && !numbers.includes(line.batch_number)) {
      return [line.batch_number, ...numbers];
    }
    return numbers;
  };

  const handleAddLine = (medicineId: string) => {
    const med = medicines.find((m) => m.id === medicineId);
    if (!med) return;
    const firstBatch = med.batches[0]?.batch_number || "";
    setLines((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        medicine_id: med.id,
        medicine_name: med.name,
        batch_number: firstBatch,
        dose: DEFAULT_DISPENSE_DOSE,
        days: String(DEFAULT_DISPENSE_DAYS),
        qty: "1",
        unit_price: med.selling_price,
      },
    ]);
    setAddMedicineId("");
  };

  const handleSubmit = async () => {
    if (!sessionId) return;
    if (!reason.trim()) {
      toast.error("Amendment reason is required.");
      return;
    }
    if (lines.length === 0) {
      toast.error(
        "At least one line item is required. Use Cancel Invoice to void the whole dispense.",
      );
      return;
    }
    for (const line of lines) {
      if (!line.batch_number) {
        toast.error(`Select a batch for ${line.medicine_name}.`);
        return;
      }
      if ((parseInt(line.qty) || 0) < 1) {
        toast.error(
          `Quantity must be at least 1 for ${line.medicine_name}.`,
        );
        return;
      }
      if ((parseFloat(line.unit_price) || -1) < 0) {
        toast.error(`Unit price is invalid for ${line.medicine_name}.`);
        return;
      }
    }
    // Partial payment is allowed; the only invalid case is paying MORE than
    // the amended net payable (which would create an unexpected credit).
    if (paymentMethod === "Split") {
      const split =
        (parseFloat(cashAmount) || 0) + (parseFloat(onlineAmount) || 0);
      if (split - netPayable > 0.01) {
        toast.error("Cash + Online cannot exceed the net payable.");
        return;
      }
    }

    const lineItems: DispenseLineItemPayload[] = lines.map((line) => ({
      medicine_id: line.medicine_id,
      batch_number: line.batch_number,
      // Dose/days are no longer editable; preserve any stored value, else
      // fall back to the neutral defaults the backend still requires.
      dose: line.dose.trim() || DEFAULT_DISPENSE_DOSE,
      days: parseInt(line.days) || DEFAULT_DISPENSE_DAYS,
      qty: parseInt(line.qty),
      unit_price: (parseFloat(line.unit_price) || 0).toFixed(2),
    }));

    setIsSubmitting(true);
    try {
      const detail = await amendDispense(sessionId, {
        amend_reason: reason.trim(),
        line_items: lineItems,
        consultation_fee: consultationFeeNum.toFixed(2),
        payment: {
          payment_method: paymentMethod,
          // Actual tendered amounts. For single-mode Cash/Online the full
          // net payable is recorded as paid (no partial-amend UI); Split
          // sends the entered legs (which may total less → outstanding).
          cash_amount:
            paymentMethod === "Cash"
              ? netPayable.toFixed(2)
              : paymentMethod === "Split"
                ? (parseFloat(cashAmount) || 0).toFixed(2)
                : 0,
          online_amount:
            paymentMethod === "Online"
              ? netPayable.toFixed(2)
              : paymentMethod === "Split"
                ? (parseFloat(onlineAmount) || 0).toFixed(2)
                : 0,
          discount: (parseFloat(discount) || 0).toFixed(2),
          notes,
        },
      });
      toast.success(`Invoice ${detail.invoice_number} amended.`);
      onAmended(detail);
    } catch (error) {
      toastApiError(error, "Failed to amend the invoice");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !isSubmitting) onClose();
      }}
    >
      <DialogContent className="w-[96vw] max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-amber-600" />
            Amend Invoice{invoiceNumber ? ` — ${invoiceNumber}` : ""}
          </DialogTitle>
          <DialogDescription>
            Corrects a wrongly recorded dispense for{" "}
            <span className="font-semibold">{historyItem?.patient}</span>.
            Stock is adjusted automatically and the previous state is kept in
            the amendment audit trail. A reason is mandatory.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading invoice…
          </div>
        ) : loadError ? (
          <p className="py-8 text-center text-sm text-rose-600">{loadError}</p>
        ) : (
          <div className="space-y-5">
            {/* ── Line items ── */}
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Line items
              </Label>
              <div className="space-y-2">
                {lines.map((line) => (
                  <div
                    key={line.key}
                    className="grid grid-cols-12 gap-2 items-end rounded-xl border border-slate-200 bg-slate-50/50 p-3"
                  >
                    <div className="col-span-12 sm:col-span-5">
                      <p className="text-xs font-bold text-slate-700 truncate">
                        {line.medicine_name}
                      </p>
                      <Select
                        value={line.batch_number}
                        onValueChange={(v) =>
                          updateLine(line.key, { batch_number: v })
                        }
                      >
                        <SelectTrigger className="h-9 mt-1 text-xs bg-white">
                          <SelectValue placeholder="Batch" />
                        </SelectTrigger>
                        <SelectContent>
                          {batchOptionsFor(line).map((batchNumber) => (
                            <SelectItem key={batchNumber} value={batchNumber}>
                              {batchNumber}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <Label className="text-[10px] text-slate-400">
                        Quantity
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        value={line.qty}
                        onChange={(e) =>
                          updateLine(line.key, { qty: e.target.value })
                        }
                        className="h-9 text-xs bg-white text-center"
                      />
                    </div>
                    <div className="col-span-5 sm:col-span-3">
                      <Label className="text-[10px] text-slate-400">
                        Price (₹)
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={line.unit_price}
                        onChange={(e) =>
                          updateLine(line.key, { unit_price: e.target.value })
                        }
                        className="h-9 text-xs bg-white text-center"
                      />
                    </div>
                    <div className="col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setLines((prev) =>
                            prev.filter((l) => l.key !== line.key),
                          )
                        }
                        className="h-9 w-9 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                        title="Remove line"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add medicine */}
              <div className="flex items-center gap-2">
                <Select value={addMedicineId} onValueChange={handleAddLine}>
                  <SelectTrigger className="h-9 flex-1 text-xs bg-white">
                    <SelectValue placeholder="Add a medicine…" />
                  </SelectTrigger>
                  <SelectContent>
                    {medicines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name} ({m.category})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Plus className="h-4 w-4 text-slate-400" />
              </div>
              <p className="text-[10px] text-slate-400">
                Batch stock checks run on save against the corrected state —
                quantities currently on this invoice are released first, so
                keeping or reducing an existing line never fails for stock.
              </p>
            </div>

            {/* ── Payment ── */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-500">
                  Payment method
                </Label>
                <Select
                  value={paymentMethod}
                  onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
                >
                  <SelectTrigger className="h-10 mt-1 bg-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Online">Online</SelectItem>
                    <SelectItem value="Split">Split (Cash + Online)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-500">
                  Discount (₹)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="h-10 mt-1 bg-white text-xs"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-500">
                  Consultation Fee (₹)
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={consultationFee}
                  onChange={(e) => setConsultationFee(e.target.value)}
                  className="h-10 mt-1 bg-white text-xs"
                />
              </div>
              {paymentMethod === "Split" && (
                <>
                  <div>
                    <Label className="text-xs font-bold text-slate-500">
                      Cash amount (₹)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      className="h-10 mt-1 bg-white text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-slate-500">
                      Online amount (₹)
                    </Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={onlineAmount}
                      onChange={(e) => setOnlineAmount(e.target.value)}
                      className="h-10 mt-1 bg-white text-xs"
                    />
                  </div>
                </>
              )}
            </div>

            {/* ── Totals preview ── */}
            <div className="flex items-center justify-between rounded-xl border border-primary/10 bg-primary/5 px-4 py-3">
              <span className="text-xs text-slate-500 font-medium">
                Subtotal ₹{subtotal.toFixed(2)}
                {(parseFloat(discount) || 0) > 0
                  ? ` − ₹${(parseFloat(discount) || 0).toFixed(2)} discount`
                  : ""}
              </span>
              <span className="text-lg font-black text-primary font-mono">
                ₹{netPayable.toFixed(2)}
              </span>
            </div>

            {/* ── Reason ── */}
            <div>
              <Label className="text-xs font-bold text-slate-500">
                Amendment reason <span className="text-rose-500">*</span>
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Typed 50 instead of 30 tablets"
                rows={2}
                maxLength={255}
                className="mt-1 bg-white text-sm"
              />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={isSubmitting || isLoading || Boolean(loadError)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-2" />
                Save amendment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
