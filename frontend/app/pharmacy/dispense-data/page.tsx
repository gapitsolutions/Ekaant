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
  Users,
  IndianRupee,
  ShieldCheck,
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
      "Display Invoice",
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
      it.display_invoice_number || "",
      it.patient,
      it.file_number || it.registration_number || "",
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoice History</h1>
          <p className="text-muted-foreground">
            Historical record of dispensed and cancelled invoices
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500 text-emerald-700 bg-emerald-50">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Audit Compliant
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCSV}
            disabled={items.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Unique Patients (page)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{uniquePatients}</p>
            <p className="text-sm text-muted-foreground">Current page</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <IndianRupee className="h-4 w-4 text-primary" />
              Total Revenue (page)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              ₹
              {totalRevenue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </p>
            <p className="text-sm text-muted-foreground">Current page</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pagination.total}</p>
            <p className="text-sm text-muted-foreground">Matching invoices</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoice Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_160px_160px_140px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by patient, file no., invoice"
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => {
                setPage(1);
                setStatusFilter(v as "all" | DispenseStatus);
              }}
            >
              <SelectTrigger>
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
              <SelectTrigger>
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
              <SelectTrigger>
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
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPage(1);
                setEndDate(e.target.value);
              }}
              aria-label="End date"
            />
            <Button
              variant="outline"
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
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No invoices match your filters.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>File No.</TableHead>
                    <TableHead>Date / Time</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Pharmacist</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => (
                    <TableRow key={it.id}>
                      <TableCell>
                        <div className="font-mono text-xs">
                          {it.invoice_number}
                        </div>
                        {it.display_invoice_number ? (
                          <div className="text-xs text-muted-foreground font-mono">
                            {it.display_invoice_number}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="font-medium">
                        {it.patient}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {it.file_number || it.registration_number || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{it.date}</div>
                        <div className="text-xs text-muted-foreground">
                          {it.time}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{it.payment_method}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {it.pharmacist || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            it.status === "success"
                              ? "bg-emerald-600 hover:bg-emerald-600"
                              : "bg-rose-600 hover:bg-rose-600"
                          }
                        >
                          {it.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        ₹{parseFloat(it.amount).toLocaleString("en-IN")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm text-muted-foreground pt-2">
            <span>
              Showing {items.length} of {pagination.total} record
              {pagination.total === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page <= 1 || isLoading}
              >
                Previous
              </Button>
              <span>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
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
