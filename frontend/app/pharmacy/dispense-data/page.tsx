"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  Download,
  Loader2,
  Search,
  FileText,
  User,
  CheckCircle2,
} from "lucide-react";
import {
  getDispenseHistory,
  type DispenseHistoryItem,
  type DispenseStatus,
} from "@/lib/pharmacy-api";

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
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [todayOnly, setTodayOnly] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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
      today_only: todayOnly,
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
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load invoice history.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [debouncedSearch, page, pageSize, statusFilter, startDate, endDate, todayOnly]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const totalRevenue = useMemo(() => {
    return items.reduce((sum, it) => sum + (parseFloat(it.amount) || 0), 0);
  }, [items]);

  const uniquePatients = useMemo(() => {
    return new Set(items.map((it) => it.patient_id)).size;
  }, [items]);

  const totalPages = Math.max(
    1,
    Math.ceil((pagination.total || 0) / pageSize),
  );

  const handleExportCSV = () => {
    if (items.length === 0) return;
    const header = [
      "Invoice #",
      "Patient",
      "File No.",
      "Date",
      "Time",
      "Amount",
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
      it.payment_method,
      it.status,
      it.pharmacist,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
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

  return (
    <div className="max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500 pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-5 w-5 text-[#0d7377]" />
            </div>
            Invoice History
          </h1>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Historical record of dispensed and cancelled invoices
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-teal-50 hover:bg-teal-50 text-[#0d7377] font-bold px-3 py-1.5 rounded-lg border border-teal-200 shadow-sm flex items-center gap-1.5">
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
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
              <User className="h-7 w-7 text-blue-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Unique Patients (page)</p>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">{uniquePatients}</h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-black text-emerald-600 tracking-tight">₹</span>
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Revenue (page)</p>
              <h3 className="text-2xl font-black text-[#0d7377] tracking-tight mt-0.5">
                ₹{totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
              </h3>
            </div>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
          <CardContent className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center flex-shrink-0">
              <FileText className="h-7 w-7 text-amber-500" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Total Records</p>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight mt-0.5">{pagination.total}</h3>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
        <CardHeader className="bg-white border-b border-slate-100 py-4 px-6">
          <CardTitle className="text-lg font-bold text-slate-800 tracking-tight">Invoice Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 p-6">
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_160px_160px_140px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient, file no., invoice"
                className="pl-9 h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium focus:ring-[#0d7377]/10 focus:border-[#0d7377]"
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
              value={todayOnly ? "today" : "any"}
              onValueChange={(v) => {
                setPage(1);
                setTodayOnly(v === "today");
              }}
            >
              <SelectTrigger className="h-10 bg-slate-50 border-slate-200 rounded-xl text-sm font-medium">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Day</SelectItem>
                <SelectItem value="today">Today Only</SelectItem>
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
                setStartDate("");
                setEndDate("");
                setTodayOnly(false);
              }}
            >
              Clear Filters
            </Button>
          </div>

          {errorMessage ? (
            <p className="text-sm text-red-600 font-medium bg-red-50 border border-red-100 rounded-xl px-4 py-3">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <FileText className="h-7 w-7 text-slate-400" />
              </div>
              <p className="font-bold text-slate-700 text-sm">No invoices found</p>
              <p className="text-xs text-slate-500 mt-1">No invoices match your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-200 hover:bg-transparent bg-slate-50/80">
                    <TableHead className="px-6 h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Invoice #</TableHead>
                    <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient</TableHead>
                    <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                    <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Date / Time</TableHead>
                    <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Payment</TableHead>
                    <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Pharmacist</TableHead>
                    <TableHead className="h-10 font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                    <TableHead className="h-10 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500 px-6">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {items.map((it) => (
                    <TableRow key={it.id} className="hover:bg-slate-50/50 transition-colors border-slate-100">
                      <TableCell className="px-6 py-4">
                        <div className="font-mono font-bold text-xs text-[#0d7377]">
                          {it.invoice_number}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <p className="font-bold text-slate-800 text-sm tracking-tight">{it.patient}</p>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className="font-mono font-bold text-[#0d7377] border-teal-200 bg-teal-50/50">
                          {it.file_number || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="text-sm font-bold text-slate-700">{it.date}</div>
                        <div className="text-[10px] font-medium text-slate-500">
                          {it.time}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge variant="outline" className="border-slate-200 text-slate-600 font-semibold">{it.payment_method}</Badge>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-slate-500 font-medium">
                        {it.pharmacist || "—"}
                      </TableCell>
                      <TableCell className="py-4">
                        <Badge
                          className={
                            it.status === "success"
                              ? "bg-emerald-600 hover:bg-emerald-600 font-semibold"
                              : "bg-rose-600 hover:bg-rose-600 font-semibold"
                          }
                        >
                          {it.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-bold text-slate-800 text-sm px-6 py-4">
                        ₹{parseFloat(it.amount).toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
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
  );
}
