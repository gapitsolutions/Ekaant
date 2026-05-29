"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Eye, Loader2, Search, Trash2, RotateCcw, Calendar, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  deleteReceptionCheckinHistoryVisit,
  getReceptionCheckinHistory,
  type CheckinHistoryItem,
  type CheckinHistoryVerificationMethod,
} from "@/lib/hms-api";
import {
  ALL_VERIFICATION_METHODS,
  getMethodMeta,
} from "@/lib/verification-methods";
import { useAuth } from "@/lib/auth-context";

export default function ReceptionQueuePage() {
  const { accessToken } = useAuth();
  const [historyItems, setHistoryItems] = useState<CheckinHistoryItem[]>([]);
  const [selectedVisit, setSelectedVisit] = useState<CheckinHistoryItem | null>(
    null,
  );
  const [visitPendingDelete, setVisitPendingDelete] =
    useState<CheckinHistoryItem | null>(null);
  const [isDeletingVisit, setIsDeletingVisit] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [verificationFilter, setVerificationFilter] = useState<
    "all" | CheckinHistoryVerificationMethod
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "in_progress" | "completed" | "cancelled"
  >("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 50,
    total: 0,
  });

  useEffect(() => {
    const debounceTimer = window.setTimeout(() => {
      setPage(1);
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);
    return () => window.clearTimeout(debounceTimer);
  }, [searchQuery]);

  const loadCheckinHistory = useCallback(() => {
    if (!accessToken) return Promise.resolve();

    setIsLoading(true);
    setErrorMessage("");

    return getReceptionCheckinHistory(accessToken, {
      q: debouncedSearchQuery || undefined,
      page,
      pageSize,
      verification_method:
        verificationFilter === "all" ? undefined : verificationFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    })
      .then((response) => {
        setHistoryItems(response.items || []);
        setPagination(
          response.pagination || {
            page,
            pageSize,
            total: response.items?.length || 0,
          },
        );
        setLastRefreshedAt(new Date());
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load check-in history.",
        );
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [
    accessToken,
    debouncedSearchQuery,
    page,
    pageSize,
    verificationFilter,
    statusFilter,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    loadCheckinHistory();
  }, [loadCheckinHistory]);

  const handleManualRefresh = useCallback(() => {
    if (!accessToken) return;
    setIsRefreshing(true);
    setErrorMessage("");

    getReceptionCheckinHistory(accessToken, {
      q: debouncedSearchQuery || undefined,
      page,
      pageSize,
      verification_method:
        verificationFilter === "all" ? undefined : verificationFilter,
      status: statusFilter === "all" ? undefined : statusFilter,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    })
      .then((response) => {
        setHistoryItems(response.items || []);
        setPagination(
          response.pagination || {
            page,
            pageSize,
            total: response.items?.length || 0,
          },
        );
        setLastRefreshedAt(new Date());
      })
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to refresh check-in history.",
        );
      })
      .finally(() => {
        setIsRefreshing(false);
      });
  }, [
    accessToken,
    debouncedSearchQuery,
    page,
    pageSize,
    verificationFilter,
    statusFilter,
    startDate,
    endDate,
  ]);

  const formatLastRefreshed = (date: Date | null) => {
    if (!date) return "";
    const now = new Date();
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    if (diffSeconds < 5) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    return date.toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Re-render the "X ago" label periodically
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastRefreshedAt) return;
    const timer = window.setInterval(() => setTick((t) => t + 1), 15000);
    return () => window.clearInterval(timer);
  }, [lastRefreshedAt]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize));

  const pageStart = pagination.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, pagination.total || 0);

  const verificationCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of ALL_VERIFICATION_METHODS) counts[m] = 0;
    for (const item of historyItems) {
      counts[item.verification_method] =
        (counts[item.verification_method] ?? 0) + 1;
    }
    return counts;
  }, [historyItems]);

  const formatTime = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-IN");
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case "counsellor":
        return "bg-amber-100 text-amber-800";
      case "doctor":
        return "bg-blue-100 text-blue-800";
      case "pharmacy":
        return "bg-purple-100 text-purple-800";
      case "completed":
        return "bg-emerald-100 text-emerald-800";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  const calculateAge = (dob?: string) => {
    if (!dob) return "-";
    const today = new Date();
    const birthDate = new Date(dob);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return `${age} years`;
  };

  const handleDeleteVisit = async () => {
    if (!accessToken || !visitPendingDelete) return;

    setIsDeletingVisit(true);
    setErrorMessage("");
    try {
      await deleteReceptionCheckinHistoryVisit(
        accessToken,
        visitPendingDelete.id,
      );
      if (selectedVisit?.id === visitPendingDelete.id) {
        setSelectedVisit(null);
      }
      setVisitPendingDelete(null);
      if (historyItems.length === 1 && page > 1) {
        setPage((current) => Math.max(1, current - 1));
      } else {
        await loadCheckinHistory();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to delete visit.",
      );
    } finally {
      setIsDeletingVisit(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#0d7377]">Check-in History</h1>
          <p className="text-muted-foreground">
            Search, review, and manage completed and in-progress visit check-ins.
          </p>
        </div>
        <div className="bg-[#e6f4f1] text-[#0d7377] font-bold px-4 py-2 rounded-lg border border-[#0d7377]/20 shadow-sm flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          {pagination.total} {pagination.total === 1 ? 'Check-in' : 'Check-ins'} Total
        </div>
      </div>

      {/* 1 total-records card + 1 card per verification method */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-none shadow-sm bg-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-slate-800">{pagination.total}</p>
            <p className="text-muted-foreground text-xs mt-1">
              Matching history entries
            </p>
          </CardContent>
        </Card>
        {ALL_VERIFICATION_METHODS.map((method) => {
          const meta = getMethodMeta(method);
          const Icon = meta.icon;
          return (
            <Card key={method} className="border-none shadow-sm bg-white">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-slate-500 flex items-center gap-2">
                  <Icon className={cn("h-4 w-4", meta.iconColor)} />
                  {meta.label} Verified
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-slate-800">
                  {verificationCounts[method] ?? 0}
                </p>
                <p className="text-muted-foreground text-xs mt-1">Current page count</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-none shadow-sm bg-white">
        <CardContent className="pt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by file no., visit ID, patient name, phone"
                className="pl-10 bg-[#f9fafb] border-slate-200 h-11"
              />
            </div>
            <Select
              value={verificationFilter}
              onValueChange={(value) => {
                setPage(1);
                setVerificationFilter(
                  value as "all" | CheckinHistoryVerificationMethod,
                );
              }}
            >
              <SelectTrigger className="w-[180px] h-11 bg-[#f9fafb] border-slate-200">
                <SelectValue placeholder="Verification Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                {ALL_VERIFICATION_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {getMethodMeta(method).label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(value) => {
                setPage(1);
                setStatusFilter(
                  value as "all" | "in_progress" | "completed" | "cancelled",
                );
              }}
            >
              <SelectTrigger className="w-[180px] h-11 bg-[#f9fafb] border-slate-200">
                <SelectValue placeholder="Visit Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPage(1);
                setPageSize(Number(value));
              }}
            >
              <SelectTrigger className="w-[140px] h-11 bg-[#f9fafb] border-slate-200">
                <SelectValue placeholder="Page Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#f9fafb] border border-slate-200 rounded-md px-3 h-11">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">From:</span>
              <Input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setPage(1);
                  setStartDate(event.target.value);
                }}
                className="border-none bg-transparent shadow-none focus-visible:ring-0 p-0 w-[130px] h-full text-sm font-medium"
                aria-label="Start date"
              />
            </div>
            <div className="flex items-center gap-2 bg-[#f9fafb] border border-slate-200 rounded-md px-3 h-11">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">To:</span>
              <Input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setPage(1);
                  setEndDate(event.target.value);
                }}
                className="border-none bg-transparent shadow-none focus-visible:ring-0 p-0 w-[130px] h-full text-sm font-medium"
                aria-label="End date"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setPage(1);
                setStatusFilter("all");
                setVerificationFilter("all");
                setStartDate("");
                setEndDate("");
                setSearchQuery("");
                setDebouncedSearchQuery("");
              }}
              className="h-11 w-11 text-slate-400 hover:text-[#0d7377] hover:bg-[#0d7377]/5"
              title="Reset Filters"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>

            <div className="border-l border-slate-200 h-7 mx-1" />

            <Button
              variant="outline"
              onClick={handleManualRefresh}
              disabled={isRefreshing || isLoading}
              className="h-11 px-3 border-[#0d7377]/20 text-[#0d7377] hover:bg-[#0d7377]/5 hover:text-[#0a5c5f] hover:border-[#0d7377]/40 transition-all gap-2"
              title="Refresh data"
            >
              <RefreshCw
                className={cn(
                  "h-4 w-4",
                  isRefreshing && "animate-spin",
                )}
              />
              {isRefreshing ? "Refreshing…" : "Refresh"}
            </Button>
            {lastRefreshedAt && (
              <span className="text-[10px] text-slate-400 font-medium whitespace-nowrap">
                {formatLastRefreshed(lastRefreshedAt)}
              </span>
            )}
          </div>

          {errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : null}

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : historyItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-10 w-10 text-slate-300 mb-3" />
              <p className="text-sm font-medium text-slate-500">
                No matching history records found.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Try adjusting your search or filter criteria.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader className="bg-slate-50/50">
                  <TableRow>
                    <TableHead className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Visit ID</TableHead>
                    <TableHead className="w-[120px] font-bold text-slate-700 uppercase text-[10px] tracking-wider">File No.</TableHead>
                    <TableHead className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Patient Name</TableHead>
                    <TableHead className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Check-in Time</TableHead>
                    <TableHead className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Verification</TableHead>
                    <TableHead className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-700 uppercase text-[10px] tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyItems.map((visit) => (
                    <TableRow key={visit.id} className="hover:bg-slate-50 transition-colors">
                      <TableCell className="font-mono text-xs text-slate-500">
                        {visit.visit_uid}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-[#f0f9f8] text-[#0d7377] border-[#0d7377]/20 font-bold font-mono">
                          {visit.patient.file_number}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-bold text-slate-800">{visit.patient.full_name}</div>
                        <div className="text-xs text-slate-400">
                          {visit.patient.phone}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-700">{formatTime(visit.checkin_time)}</span>
                          <span className="text-[10px] text-slate-400">{formatDate(visit.checkin_time)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const meta = getMethodMeta(visit.verification_method);
                          const Icon = meta.icon;
                          return (
                            <div className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-bold",
                              meta.badgeBg, meta.badgeText, meta.badgeBorder,
                            )}>
                              <Icon className="h-3 w-3" />
                              {meta.label}
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={cn(
                            "capitalize",
                            visit.status === "completed"
                              ? "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                              : visit.status === "in_progress"
                                ? "bg-amber-50 text-amber-700 border-amber-100 hover:bg-amber-100"
                                : visit.status === "cancelled"
                                  ? "bg-red-50 text-red-700 border-red-100 hover:bg-red-100"
                                  : "bg-slate-50 text-slate-700 border-slate-100 hover:bg-slate-100"
                          )}
                        >
                          {visit.status.replace("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end items-center gap-1">
                          <Sheet>
                            <SheetTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedVisit(visit)}
                                className="h-8 w-8 text-slate-400 hover:text-[#0d7377] hover:bg-[#0d7377]/5 rounded-full"
                                aria-label="View visit details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </SheetTrigger>
                            <SheetContent className="overflow-y-auto sm:max-w-md">
                              <SheetHeader>
                                <SheetTitle>Visit Details</SheetTitle>
                                <SheetDescription>
                                  Complete visit context for{" "}
                                  {selectedVisit?.patient.full_name}
                                </SheetDescription>
                              </SheetHeader>

                              {selectedVisit && (
                                <div className="mt-6 space-y-4">
                                  <div className="rounded-lg border p-4 space-y-3">
                                    <h4 className="font-semibold text-sm">
                                      Patient Information
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <p className="text-muted-foreground">
                                          File No.
                                        </p>
                                        <p className="font-medium">
                                          {
                                            selectedVisit.patient
                                              .file_number
                                          }
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Name
                                        </p>
                                        <p className="font-medium">
                                          {selectedVisit.patient.full_name}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Phone
                                        </p>
                                        <p className="font-medium">
                                          {selectedVisit.patient.phone}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Age
                                        </p>
                                        <p className="font-medium">
                                          {calculateAge(
                                            selectedVisit.patient.date_of_birth,
                                          )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Gender
                                        </p>
                                        <p className="font-medium capitalize">
                                          {selectedVisit.patient.gender}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Blood Group
                                        </p>
                                        <p className="font-medium">
                                          {selectedVisit.patient.blood_group ||
                                            "-"}
                                        </p>
                                      </div>
                                    </div>
                                  </div>

                                  <div className="rounded-lg border p-4 space-y-3">
                                    <h4 className="font-semibold text-sm">
                                      Visit Information
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3 text-sm">
                                      <div>
                                        <p className="text-muted-foreground">
                                          Visit UID
                                        </p>
                                        <p className="font-medium font-mono text-xs">
                                          {selectedVisit.visit_uid}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Visit Type
                                        </p>
                                        <p className="font-medium capitalize">
                                          {selectedVisit.visit_type.replace(
                                            "_",
                                            " ",
                                          )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Visit Date
                                        </p>
                                        <p className="font-medium">
                                          {formatDate(selectedVisit.visit_date)}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Check-in Time
                                        </p>
                                        <p className="font-medium">
                                          {formatTime(
                                            selectedVisit.checkin_time,
                                          )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Completed Time
                                        </p>
                                        <p className="font-medium">
                                          {formatTime(
                                            selectedVisit.completed_time,
                                          )}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Checked In By
                                        </p>
                                        <p className="font-medium">
                                          {selectedVisit.checked_in_by_name ||
                                            "-"}
                                        </p>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Current Stage
                                        </p>
                                        <div>
                                          <Badge
                                            variant="secondary"
                                            className={getStageColor(
                                              selectedVisit.current_stage,
                                            )}
                                          >
                                            {selectedVisit.current_stage}
                                          </Badge>
                                        </div>
                                      </div>
                                      <div>
                                        <p className="text-muted-foreground">
                                          Status
                                        </p>
                                        <div>
                                          <Badge
                                            variant={
                                              selectedVisit.status ===
                                              "completed"
                                                ? "default"
                                                : "outline"
                                            }
                                            className={
                                              selectedVisit.status ===
                                              "completed"
                                                ? "bg-emerald-600"
                                                : ""
                                            }
                                          >
                                            {selectedVisit.status}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {(() => {
                                    const meta = getMethodMeta(selectedVisit.verification_method);
                                    const Icon = meta.icon;
                                    return (
                                      <div className="rounded-lg border p-4 space-y-3">
                                        <h4 className="font-semibold text-sm">
                                          Verification
                                        </h4>
                                        <div className="space-y-2 text-sm">
                                          <p className="flex items-center gap-2">
                                            <span className="text-muted-foreground">
                                              Method:
                                            </span>
                                            <span className={cn(
                                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-xs font-bold",
                                              meta.badgeBg, meta.badgeText, meta.badgeBorder,
                                            )}>
                                              <Icon className="h-3 w-3" />
                                              {meta.label}
                                            </span>
                                          </p>
                                          {selectedVisit.verification_photo_captured_at && (
                                            <p>
                                              <span className="text-muted-foreground">
                                                Captured At:
                                              </span>{" "}
                                              <span className="font-medium">
                                                {formatDate(selectedVisit.verification_photo_captured_at)}{" "}
                                                {formatTime(selectedVisit.verification_photo_captured_at)}
                                              </span>
                                            </p>
                                          )}
                                        </div>

                                        {selectedVisit.verification_method === "photo" ? (
                                          selectedVisit.verification_photo_available &&
                                          selectedVisit.verification_photo_url ? (
                                            <div className="space-y-2">
                                              <p className="text-xs text-muted-foreground">
                                                Secure verification photo
                                              </p>
                                              <img
                                                src={selectedVisit.verification_photo_url}
                                                alt="Verification photo"
                                                className="w-full rounded-md border object-cover max-h-72"
                                              />
                                            </div>
                                          ) : (
                                            <p className="text-sm text-muted-foreground">
                                              Verification photo is not available for this record.
                                            </p>
                                          )
                                        ) : (
                                          <p className="text-sm text-muted-foreground">
                                            {meta.detailText}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </SheetContent>
                          </Sheet>

                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setVisitPendingDelete(visit)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"
                            aria-label="Delete visit"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <div className="flex flex-col gap-3 pt-4 md:flex-row md:items-center md:justify-between border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Showing {pageStart} to {pageEnd} of {pagination.total} records
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="h-9 border-slate-200 text-slate-600"
              >
                Previous
              </Button>
              <span className="text-xs font-medium text-slate-500 px-2">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
                className="h-9 border-slate-200 text-slate-600"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(visitPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !isDeletingVisit) {
            setVisitPendingDelete(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Check-in Record
            </DialogTitle>
            <DialogDescription>
              Delete visit {visitPendingDelete?.visit_uid} for{" "}
              {visitPendingDelete?.patient.full_name}. This will remove the
              visit and verification photo (if present) but will not delete
              patient data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setVisitPendingDelete(null)}
              disabled={isDeletingVisit}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteVisit}
              disabled={isDeletingVisit}
            >
              {isDeletingVisit ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Visit
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
