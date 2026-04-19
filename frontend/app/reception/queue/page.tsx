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
import { Eye, Loader2, Search, Trash2 } from "lucide-react";
import {
  deleteReceptionCheckinHistoryVisit,
  getReceptionCheckinHistory,
  type CheckinHistoryItem,
  type CheckinHistoryVerificationMethod,
} from "@/lib/hms-api";
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

  useEffect(() => {
    if (!accessToken) return;

    const refreshTimer = window.setInterval(() => {
      loadCheckinHistory();
    }, 10000);
    const onFocus = () => loadCheckinHistory();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [accessToken, loadCheckinHistory]);

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / pageSize));

  const pageStart = pagination.total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd = Math.min(page * pageSize, pagination.total || 0);

  const verificationCounts = useMemo(() => {
    let fingerprint = 0;
    let photo = 0;
    historyItems.forEach((item) => {
      if (item.verification_method === "photo") {
        photo += 1;
      } else {
        fingerprint += 1;
      }
    });
    return { fingerprint, photo };
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Check-in History</h1>
        <p className="text-muted-foreground">
          Search, review, and manage completed and in-progress visit check-ins.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{pagination.total}</p>
            <p className="text-muted-foreground text-sm">
              Matching history entries
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Fingerprint Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {verificationCounts.fingerprint}
            </p>
            <p className="text-muted-foreground text-sm">Current page count</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Photo Verified</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{verificationCounts.photo}</p>
            <p className="text-muted-foreground text-sm">Current page count</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visit Records</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px_140px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by file no., visit ID, patient name, phone"
                className="pl-9"
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
              <SelectTrigger>
                <SelectValue placeholder="Verification Method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Methods</SelectItem>
                <SelectItem value="fingerprint">Fingerprint</SelectItem>
                <SelectItem value="photo">Photo</SelectItem>
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
              <SelectTrigger>
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
              <SelectTrigger>
                <SelectValue placeholder="Page Size" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="25">25 / page</SelectItem>
                <SelectItem value="50">50 / page</SelectItem>
                <SelectItem value="100">100 / page</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(180px,1fr)_minmax(180px,1fr)_auto]">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => {
                setPage(1);
                setStartDate(event.target.value);
              }}
              aria-label="Start date"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(event) => {
                setPage(1);
                setEndDate(event.target.value);
              }}
              aria-label="End date"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPage(1);
                setStatusFilter("all");
                setVerificationFilter("all");
                setStartDate("");
                setEndDate("");
                setSearchQuery("");
                setDebouncedSearchQuery("");
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
          ) : historyItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matching history records found.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Visit ID</TableHead>
                    <TableHead>File No.</TableHead>
                    <TableHead>Patient Name</TableHead>
                    <TableHead>Check-in Time</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historyItems.map((visit) => (
                    <TableRow key={visit.id}>
                      <TableCell className="font-mono text-xs">
                        {visit.visit_uid}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono">
                          {visit.patient.registration_number}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{visit.patient.full_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {visit.patient.phone}
                        </div>
                      </TableCell>
                      <TableCell>{formatTime(visit.checkin_time)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {visit.verification_method}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            visit.status === "completed" ? "default" : "outline"
                          }
                          className={
                            visit.status === "completed" ? "bg-emerald-600" : ""
                          }
                        >
                          {visit.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Sheet>
                            <SheetTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedVisit(visit)}
                                aria-label="View visit details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            </SheetTrigger>
                            <SheetContent className="overflow-y-auto">
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
                                              .registration_number
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

                                  <div className="rounded-lg border p-4 space-y-3">
                                    <h4 className="font-semibold text-sm">
                                      Verification
                                    </h4>
                                    <div className="space-y-2 text-sm">
                                      <p>
                                        <span className="text-muted-foreground">
                                          Method:
                                        </span>{" "}
                                        <span className="font-medium capitalize">
                                          {selectedVisit.verification_method}
                                        </span>
                                      </p>
                                      <p>
                                        <span className="text-muted-foreground">
                                          Captured At:
                                        </span>{" "}
                                        <span className="font-medium">
                                          {formatDate(
                                            selectedVisit.verification_photo_captured_at,
                                          )}{" "}
                                          {formatTime(
                                            selectedVisit.verification_photo_captured_at,
                                          )}
                                        </span>
                                      </p>
                                    </div>

                                    {selectedVisit.verification_method ===
                                    "photo" ? (
                                      selectedVisit.verification_photo_available &&
                                      selectedVisit.verification_photo_url ? (
                                        <div className="space-y-2">
                                          <p className="text-xs text-muted-foreground">
                                            Secure verification photo
                                          </p>
                                          <img
                                            src={
                                              selectedVisit.verification_photo_url
                                            }
                                            alt="Verification photo"
                                            className="w-full rounded-md border object-cover max-h-72"
                                          />
                                        </div>
                                      ) : (
                                        <p className="text-sm text-muted-foreground">
                                          Verification photo is not available
                                          for this record.
                                        </p>
                                      )
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        Fingerprint verification was used for
                                        this visit.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </SheetContent>
                          </Sheet>

                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setVisitPendingDelete(visit)}
                            className="text-red-600 hover:text-red-700"
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

          <div className="flex flex-col gap-3 pt-2 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-muted-foreground">
              Showing {pageStart} to {pageEnd} of {pagination.total} records
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isLoading}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
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
