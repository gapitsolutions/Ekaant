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
  ArrowLeft,
  ArrowRight,
  Clock,
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  getPharmacyQueue,
  type PharmacyQueueItem,
} from "@/lib/pharmacy-api";
import { navigate } from "@/lib/navigation";

// Wait-time thresholds (minutes) for triage-priority highlighting.
const WAIT_AMBER_MIN = 30;
const WAIT_ROSE_MIN = 60;

function formatTime(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitials(name: string): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getWaitMinutes(checkedInAt?: string | null, now = Date.now()): number {
  if (!checkedInAt) return 0;
  const start = new Date(checkedInAt).getTime();
  if (Number.isNaN(start)) return 0;
  return Math.max(0, Math.round((now - start) / 60_000));
}

function formatWait(minutes: number): string {
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
}

function getWaitClass(minutes: number): string {
  if (minutes >= WAIT_ROSE_MIN) {
    return "bg-rose-50 text-rose-700 border-rose-200";
  }
  if (minutes >= WAIT_AMBER_MIN) {
    return "bg-amber-50 text-amber-700 border-amber-200";
  }
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export default function PrescriptionQueuePage() {
  const [items, setItems] = useState<PharmacyQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  // ``now`` is refreshed every 30s so wait-time displays tick without
  // hammering the API. Independent of the queue refresh.
  const [now, setNow] = useState(() => Date.now());

  const loadQueue = useCallback(() => {
    setIsLoading(true);
    setErrorMessage("");
    return getPharmacyQueue()
      .then((data) => setItems(data.items || []))
      .catch((error: unknown) => {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load pharmacy queue.",
        );
      })
      .finally(() => setIsLoading(false));
  }, []);

  // One-shot load on mount + re-fetch when the tab regains focus (catches
  // updates after switching back from another window). No interval polling
  // — users refresh manually via the Refresh button when they need a
  // fresh snapshot.
  useEffect(() => {
    void loadQueue();
    const onFocus = () => void loadQueue();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadQueue]);

  // Wait-time clock tick (independent of API refresh).
  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(tick);
  }, []);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) => {
      const name = item.patient_name?.toLowerCase() || "";
      const fileNo = item.patient?.file_number?.toLowerCase() || "";
      const phone = item.patient?.phone?.toLowerCase() || "";
      return name.includes(q) || fileNo.includes(q) || phone.includes(q);
    });
  }, [items, searchQuery]);

  const hasSearch = searchQuery.trim().length > 0;
  const totalWaiting = items.length;
  const showingCount = filteredItems.length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/pharmacy")}
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-[#0d7377]" />
              Prescription Queue
            </h1>
            <p className="text-slate-500 mt-1 font-medium italic">
              Patients currently waiting at the pharmacy stage
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="bg-[#e6f4f1] text-[#0d7377] font-bold px-4 py-2 rounded-lg border border-[#0d7377]/20 shadow-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {totalWaiting} {totalWaiting === 1 ? "Patient" : "Patients"} Waiting
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-slate-200"
            onClick={() => void loadQueue()}
            disabled={isLoading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/30 border-b border-slate-100 py-5 px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle className="text-xl font-bold text-slate-800 tracking-tight">
              Patient Queue
            </CardTitle>
          </div>
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search name, file no, or phone…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-white border-slate-200 rounded-xl focus-visible:ring-[#0d7377]"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {errorMessage ? (
            <p className="text-sm text-destructive mb-3 px-6 pt-4">
              {errorMessage}
            </p>
          ) : null}

          {hasSearch && totalWaiting > 0 ? (
            <p className="px-6 pt-4 text-xs text-slate-500">
              Showing{" "}
              <span className="font-bold text-slate-700">{showingCount}</span>{" "}
              of{" "}
              <span className="font-bold text-slate-700">{totalWaiting}</span>{" "}
              waiting
            </p>
          ) : null}

          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d7377]" />
            </div>
          ) : totalWaiting === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Users className="h-7 w-7 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                No patients in the queue
              </h3>
              <p className="text-sm text-slate-500 mt-1 max-w-[280px] mx-auto">
                Checked-in patients pending dispense will appear here
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                <Search className="h-7 w-7 text-slate-300" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">
                No matching patients
              </h3>
              <p className="text-sm text-slate-500 mt-1">
                No patient matches &ldquo;{searchQuery}&rdquo;.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-[#0d7377]"
                onClick={() => setSearchQuery("")}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-100">
                    <TableHead className="px-4 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                      Patient
                    </TableHead>
                    <TableHead className="px-4 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                      File No.
                    </TableHead>
                    <TableHead className="px-4 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                      Check-in
                    </TableHead>
                    <TableHead className="px-4 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                      Waiting
                    </TableHead>
                    <TableHead className="px-4 font-bold uppercase text-[10px] tracking-wider text-slate-500">
                      Checked In By
                    </TableHead>
                    <TableHead className="pl-4 pr-6 font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">
                      Action
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => {
                    const initials = getInitials(item.patient_name);
                    const waitMinutes = getWaitMinutes(
                      item.checked_in_at,
                      now,
                    );
                    return (
                      <TableRow
                        key={item.session_id}
                        className="hover:bg-slate-50/50 transition-colors"
                      >
                        <TableCell className="font-medium py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-[#0d7377]/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-[#0d7377]">
                                {initials}
                              </span>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">
                                {item.patient_name}
                              </div>
                              {item.patient?.phone ? (
                                <div className="text-xs text-slate-400">
                                  {item.patient.phone}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-4">
                          <span className="font-mono font-bold text-[#0d7377]">
                            {item.patient?.file_number || "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatTime(item.checked_in_at)}
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-4">
                          <Badge
                            variant="outline"
                            className={`${getWaitClass(waitMinutes)} text-[10px] font-bold uppercase tracking-tight`}
                          >
                            {formatWait(waitMinutes)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-500 py-4 px-4">
                          {item.checked_in_by_name || "—"}
                        </TableCell>
                        <TableCell className="py-4 pr-6 pl-4">
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              className="bg-[#0d7377] hover:bg-[#0a5c5f] text-white font-semibold rounded-xl shadow-sm flex items-center gap-1.5"
                              onClick={() =>
                                navigate(
                                  `/pharmacy/dispense/${item.session_id}`,
                                )
                              }
                            >
                              Dispense
                              <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
