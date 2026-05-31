"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getReceptionCallingReport,
  type CallingReportResponse,
} from "@/lib/hms-api";
import {
  CALL_RESULT_LABELS,
  CALL_RESULT_BADGE,
} from "@/lib/call-result-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Phone,
  Search,
  CheckCircle2,
  BarChart3,
  Loader2,
} from "lucide-react";

interface PatientCallingHistoryProps {
  patientId: string;
  patientName: string;
  accessToken: string;
}

function formatDateTime(date: string): string {
  return new Date(date).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PatientCallingHistory({
  patientId,
  patientName,
  accessToken,
}: PatientCallingHistoryProps) {
  const [data, setData] = useState<CallingReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().split("T")[0];
  });
  const [endDate, setEndDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!accessToken || !patientId) return;

    setIsLoading(true);
    setError(null);
    getReceptionCallingReport(accessToken, {
      start_date: startDate,
      end_date: endDate,
      patient_id: patientId,
    })
      .then((res) => setData(res))
      .catch(() => setError("Failed to load calling history"))
      .finally(() => setIsLoading(false));
  }, [accessToken, patientId, startDate, endDate]);

  const filteredItems = useMemo(() => {
    if (!data?.items) return [];
    if (!searchQuery.trim()) return data.items;
    const q = searchQuery.toLowerCase();
    return data.items.filter(
      (item) =>
        item.note?.toLowerCase().includes(q) ||
        item.staff_name?.toLowerCase().includes(q),
    );
  }, [data?.items, searchQuery]);

  const totalCalls = data?.total_calls ?? 0;
  const confirmedCalls = data?.outcome_distribution?.confirmed ?? 0;
  const successRate =
    totalCalls > 0 ? Math.round((confirmedCalls / totalCalls) * 100) : 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground flex items-center justify-center">
          <Loader2 className="h-5 w-5 mr-2 animate-spin" />
          Loading calling history...
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-muted-foreground">
          <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label className="text-xs text-slate-500 font-bold mb-1.5 block">
                Search
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search notes or staff name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 bg-[#f9fafb] border-slate-200"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-slate-500 font-bold mb-1.5 block">
                Start Date
              </Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-[#f9fafb] border-slate-200"
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500 font-bold mb-1.5 block">
                End Date
              </Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-[#f9fafb] border-slate-200"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Phone className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Calls</p>
                <p className="text-2xl font-bold">{totalCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Confirmed</p>
                <p className="text-2xl font-bold">{confirmedCalls}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="text-2xl font-bold">{successRate}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Call History Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-[#0d7377]" />
            Call History
          </CardTitle>
          <CardDescription>
            Calling records for {patientName}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredItems.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No calling history found for this patient.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Staff</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatDateTime(item.called_at)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          CALL_RESULT_BADGE[item.result] ||
                          "bg-slate-50 text-slate-600 border-slate-200"
                        }
                      >
                        {CALL_RESULT_LABELS[item.result] || item.result}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[250px]">
                      {item.note ? (
                        <span
                          className="italic text-muted-foreground truncate block"
                          title={item.note}
                        >
                          {item.note}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-[#0d7377]/10 flex items-center justify-center text-xs font-bold text-[#0d7377]">
                          {item.staff_name?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        <span className="text-sm">{item.staff_name}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
