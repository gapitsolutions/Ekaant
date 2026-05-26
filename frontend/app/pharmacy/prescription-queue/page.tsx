"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Users,
} from "lucide-react";
import {
  getPharmacyQueue,
  type PharmacyQueueItem,
} from "@/lib/pharmacy-api";
import { navigate } from "@/lib/navigation";

export default function PrescriptionQueuePage() {
  const [items, setItems] = useState<PharmacyQueueItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

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

  useEffect(() => {
    loadQueue();
    const refreshTimer = window.setInterval(loadQueue, 10000);
    const onFocus = () => loadQueue();
    window.addEventListener("focus", onFocus);

    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadQueue]);

  const formatTime = (value?: string | null) => {
    if (!value) return "-";
    return new Date(value).toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const calculateAge = (dob?: string | null) => {
    if (!dob) return "-";
    const today = new Date();
    const birthDate = new Date(dob);
    if (Number.isNaN(birthDate.getTime())) return "-";
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return `${age}y`;
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
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
        <div className="flex items-center gap-3">
          <div className="bg-[#e6f4f1] text-[#0d7377] font-bold px-4 py-2 rounded-lg border border-[#0d7377]/20 shadow-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {items.length} {items.length === 1 ? "Patient" : "Patients"} Waiting
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 rounded-xl border-slate-200"
            onClick={() => loadQueue()}
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
        <CardHeader className="bg-slate-50/30 border-b border-slate-100 py-6 px-6">
          <CardTitle className="text-xl font-bold text-slate-800 tracking-tight">Patient Queue</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {errorMessage ? (
            <p className="text-sm text-destructive mb-3 px-6 pt-4">{errorMessage}</p>
          ) : null}

          {isLoading && items.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-6 w-6 animate-spin text-[#0d7377]" />
            </div>
          ) : items.length === 0 ? (
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
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50 border-b border-slate-100">
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Age / Sex</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Check-in Time</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Checked In By</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Outstanding</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Stage</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => {
                    const initials = item.patient_name
                      ? item.patient_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()
                      : "?";
                    const outstanding = Number(item.outstanding_debt) || 0;
                    return (
                      <TableRow key={item.session_id} className="hover:bg-slate-50/50 transition-colors">
                        <TableCell className="font-medium py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-[#0d7377]/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs font-bold text-[#0d7377]">
                                {initials}
                              </span>
                            </div>
                            <div>
                              <div className="font-semibold text-slate-800">{item.patient_name}</div>
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
                        <TableCell className="py-4 px-4 text-slate-600">
                          {calculateAge(item.patient?.date_of_birth)}{" "}
                          {item.patient?.sex === "male"
                            ? "/ M"
                            : item.patient?.sex === "female"
                              ? "/ F"
                              : ""}
                        </TableCell>
                        <TableCell className="py-4 px-4">
                          <div className="flex items-center gap-1.5 text-slate-600">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            {formatTime(item.checked_in_at)}
                          </div>
                        </TableCell>
                        <TableCell className="text-slate-500 py-4 px-4">
                          {item.checked_in_by_name || "—"}
                        </TableCell>
                        <TableCell className="py-4 px-4">
                          {outstanding > 0 ? (
                            <Badge
                              variant="outline"
                              className="border-rose-200 text-rose-700 bg-rose-50 text-[10px] font-bold uppercase"
                            >
                              ₹{outstanding.toLocaleString("en-IN")}
                            </Badge>
                          ) : (
                            <span className="text-sm text-slate-400">
                              ₹0
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="py-4 px-4">
                          <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border border-amber-200 capitalize text-[10px] font-bold uppercase">
                            {item.current_stage}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right py-4 px-4">
                          <Button
                            size="sm"
                            className="bg-[#0d7377] hover:bg-[#0a5c5f] text-white font-semibold rounded-xl shadow-sm flex items-center gap-1.5"
                            onClick={() =>
                              navigate(`/pharmacy/dispense/${item.session_id}`)
                            }
                          >
                            Dispense
                            <ArrowRight className="h-3.5 w-3.5 opacity-60" />
                          </Button>
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
