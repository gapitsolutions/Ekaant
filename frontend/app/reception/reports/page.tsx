"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type CallingReportItem,
  type CallingReportResponse,
  type CustomRangeReportResponse,
  type DailyReportResponse,
  getReceptionCallingReport,
  getReceptionCustomRangeReport,
  getReceptionDailyReport,
  getReceptionMonthlyReport,
  type MonthlyReportResponse,
  type ReportVisitItem,
} from "@/lib/hms-api";
import { useAuth } from "@/lib/auth-context";
import {
  CALL_RESULT_LABELS,
  CALL_RESULT_COLORS,
  CALL_RESULT_BADGE,
} from "@/lib/call-result-utils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Calendar,
  CalendarDays,
  ClipboardList,
  Download,
  Filter,
  Phone,
  Search,
  Users,
} from "lucide-react";

function formatTime(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stageClass(stage: string) {
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
}


function exportVisitsToCSV(items: ReportVisitItem[], filename: string) {
  const headers = [
    "File No",
    "Patient Name",
    "Phone",
    "Category",
    "Visit Date",
    "Check-in Time",
    "Stage",
    "Status",
  ];

  const rows = items.map((item) => [
    item.patient.file_number,
    item.patient.full_name,
    item.patient.phone,
    item.patient.patient_category,
    item.visit_date,
    formatTime(item.checkin_time),
    item.current_stage,
    item.status,
  ]);

  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n",
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

interface CategoryBreakdownRow {
  date: string;
  total: number;
  deAddiction: number;
  psychiatric: number;
}

function exportCategoryBreakdownToCSV(
  rows: CategoryBreakdownRow[],
  filename: string,
) {
  const headers = ["Date", "Total Visits", "De-Addiction", "Psychiatric"];
  const csvRows = rows.map((r) => [
    r.date,
    String(r.total),
    String(r.deAddiction),
    String(r.psychiatric),
  ]);
  const csv = [headers.join(","), ...csvRows.map((row) => row.join(","))].join(
    "\n",
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

function exportCallingToCSV(items: CallingReportItem[], filename: string) {
  const headers = [
    "File No",
    "Patient Name",
    "Phone",
    "Date",
    "Result",
    "Notes",
    "Staff",
  ];
  const rows = items.map((item) => [
    item.file_number,
    `"${item.patient_name}"`,
    item.phone,
    new Date(item.called_at).toLocaleDateString("en-IN"),
    CALL_RESULT_LABELS[item.result] || item.result,
    `"${(item.note || "").replace(/"/g, '""')}"`,
    item.staff_name,
  ]);
  const csv = [headers.join(","), ...rows.map((row) => row.join(","))].join(
    "\n",
  );
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
}

function filterRecordsBySearch(
  items: ReportVisitItem[],
  query: string,
): ReportVisitItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.patient.full_name.toLowerCase().includes(q) ||
      item.patient.file_number.toLowerCase().includes(q) ||
      item.patient.phone.includes(q),
  );
}

function getMonthDateRange(monthValue: string) {
  const [year, month] = monthValue.split("-").map(Number);
  if (!year || !month) return null;

  const startDate = `${String(year)}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${String(year)}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  return { year, month, startDate, endDate };
}


export default function ReportsPage() {
  const { accessToken } = useAuth();

  // Top-level: checkin vs calling
  const [mainTab, setMainTab] = useState("checkin");

  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Calling report state — uses the same date controls as check-in (shared
  // sub-tab picker drives both main tabs).
  const [callingData, setCallingData] =
    useState<CallingReportResponse | null>(null);
  const [callingLoading, setCallingLoading] = useState(false);
  const [callingError, setCallingError] = useState("");
  const [callingSearchQuery, setCallingSearchQuery] = useState("");

  const [dailyData, setDailyData] = useState<DailyReportResponse | null>(null);
  const [monthlyData, setMonthlyData] = useState<MonthlyReportResponse | null>(
    null,
  );
  const [monthlyRecords, setMonthlyRecords] = useState<ReportVisitItem[]>([]);
  const [customData, setCustomData] =
    useState<CustomRangeReportResponse | null>(null);

  const [dailyLoading, setDailyLoading] = useState(false);
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const [monthlyRecordsLoading, setMonthlyRecordsLoading] = useState(false);
  const [customLoading, setCustomLoading] = useState(false);
  const [monthlyExportLoading, setMonthlyExportLoading] = useState(false);

  const [dailyError, setDailyError] = useState("");
  const [monthlyError, setMonthlyError] = useState("");
  const [monthlyRecordsError, setMonthlyRecordsError] = useState("");
  const [customError, setCustomError] = useState("");

  const [recordsSearchQuery, setRecordsSearchQuery] = useState("");

  useEffect(() => {
    if (!accessToken) return;

    setDailyLoading(true);
    setDailyError("");

    getReceptionDailyReport(accessToken, { date: selectedDate })
      .then((data) => setDailyData(data))
      .catch(() => {
        setDailyData(null);
        setDailyError("Unable to load daily report data.");
      })
      .finally(() => setDailyLoading(false));
  }, [accessToken, selectedDate]);

  useEffect(() => {
    if (!accessToken || activeTab !== "monthly") return;

    const monthRange = getMonthDateRange(selectedMonth);
    if (!monthRange) return;
    const { year, month, startDate, endDate } = monthRange;

    setMonthlyLoading(true);
    setMonthlyError("");

    getReceptionMonthlyReport(accessToken, { year, month })
      .then((data) => setMonthlyData(data))
      .catch(() => {
        setMonthlyData(null);
        setMonthlyError("Unable to load monthly report data.");
      })
      .finally(() => setMonthlyLoading(false));

    setMonthlyRecordsLoading(true);
    setMonthlyRecordsError("");

    getReceptionCustomRangeReport(accessToken, {
      start_date: startDate,
      end_date: endDate,
    })
      .then((data) => setMonthlyRecords(data.items || []))
      .catch(() => {
        setMonthlyRecords([]);
        setMonthlyRecordsError("Unable to load monthly patient records.");
      })
      .finally(() => setMonthlyRecordsLoading(false));
  }, [accessToken, selectedMonth, activeTab]);

  const exportMonthlyRecords = async () => {
    if (!accessToken) return;

    const monthRange = getMonthDateRange(selectedMonth);
    if (!monthRange) {
      setMonthlyError("Invalid month selected.");
      return;
    }
    const { startDate, endDate } = monthRange;

    setMonthlyExportLoading(true);
    setMonthlyError("");

    try {
      const monthRecords = await getReceptionCustomRangeReport(accessToken, {
        start_date: startDate,
        end_date: endDate,
      });
      exportVisitsToCSV(
        monthRecords.items,
        `monthly-report-records-${selectedMonth}`,
      );
    } catch {
      setMonthlyError("Unable to export monthly records.");
    } finally {
      setMonthlyExportLoading(false);
    }
  };

  const monthlyRows = useMemo(() => {
    if (!monthlyData) return [];
    return monthlyData.breakdown
      .map((row) => ({
        date: `${String(monthlyData.year)}-${String(monthlyData.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}`,
        total: row.count,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [monthlyData]);

  // Category breakdown: group monthly records by date with De-Addiction /
  // Psychiatric split.  Computed from the individual visit items (which
  // carry patient.patient_category) — NOT from the aggregate-only monthly
  // breakdown endpoint (which only has day + total count).
  const monthlyCategoryBreakdown = useMemo((): CategoryBreakdownRow[] => {
    if (!monthlyRecords.length) return [];

    const days: Record<
      string,
      { total: number; deAddiction: number; psychiatric: number }
    > = {};

    for (const record of monthlyRecords) {
      const date = record.visit_date;
      if (!days[date]) {
        days[date] = { total: 0, deAddiction: 0, psychiatric: 0 };
      }
      days[date].total++;
      if (record.patient.patient_category === "deaddiction") {
        days[date].deAddiction++;
      } else if (record.patient.patient_category === "psychiatric") {
        days[date].psychiatric++;
      }
    }

    return Object.entries(days)
      .map(([date, counts]) => ({ date, ...counts }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [monthlyRecords]);

  const monthlyDaysWithVisits = monthlyRows.length;
  const monthlyAverage =
    monthlyData && monthlyDaysWithVisits > 0
      ? Math.round(monthlyData.total_checkins / monthlyDaysWithVisits)
      : 0;

  // Client-side search filtering for record tables.
  const filteredDailyRecords = useMemo(
    () => filterRecordsBySearch(dailyData?.items || [], recordsSearchQuery),
    [dailyData, recordsSearchQuery],
  );
  const filteredMonthlyRecords = useMemo(
    () => filterRecordsBySearch(monthlyRecords, recordsSearchQuery),
    [monthlyRecords, recordsSearchQuery],
  );
  const filteredCustomRecords = useMemo(
    () => filterRecordsBySearch(customData?.items || [], recordsSearchQuery),
    [customData, recordsSearchQuery],
  );

  const fetchCustomRange = () => {
    if (!accessToken) return;

    if (!startDate || !endDate) {
      setCustomError("Please select both start and end dates.");
      return;
    }

    if (startDate > endDate) {
      setCustomError("Start date cannot be after end date.");
      return;
    }

    setCustomLoading(true);
    setCustomError("");

    getReceptionCustomRangeReport(accessToken, {
      start_date: startDate,
      end_date: endDate,
    })
      .then((data) => setCustomData(data))
      .catch(() => {
        setCustomData(null);
        setCustomError("Unable to load custom range report data.");
      })
      .finally(() => setCustomLoading(false));
  };

  // Derive calling report date range from the same date controls used by
  // the check-in sub-tabs.  Daily → single day; Monthly → full month;
  // Custom → startDate..endDate (auto-fetch when both set).
  const callingDateRange = useMemo((): {
    start: string;
    end: string;
  } | null => {
    if (activeTab === "daily" && selectedDate) {
      return { start: selectedDate, end: selectedDate };
    }
    if (activeTab === "monthly" && selectedMonth) {
      const range = getMonthDateRange(selectedMonth);
      return range ? { start: range.startDate, end: range.endDate } : null;
    }
    if (activeTab === "custom" && startDate && endDate && startDate <= endDate) {
      return { start: startDate, end: endDate };
    }
    return null;
  }, [activeTab, selectedDate, selectedMonth, startDate, endDate]);

  // Auto-fetch calling report when dates change while on calling tab.
  useEffect(() => {
    if (mainTab !== "calling" || !accessToken || !callingDateRange) return;

    setCallingLoading(true);
    setCallingError("");

    getReceptionCallingReport(accessToken, {
      start_date: callingDateRange.start,
      end_date: callingDateRange.end,
    })
      .then((data) => setCallingData(data))
      .catch(() => {
        setCallingData(null);
        setCallingError("Unable to load calling report data.");
      })
      .finally(() => setCallingLoading(false));
  }, [accessToken, mainTab, callingDateRange]);

  const filteredCallingItems = useMemo(() => {
    if (!callingData) return [];
    if (!callingSearchQuery) return callingData.items;
    const q = callingSearchQuery.toLowerCase();
    return callingData.items.filter(
      (item) =>
        item.patient_name.toLowerCase().includes(q) ||
        item.file_number.toLowerCase().includes(q) ||
        item.phone.includes(q),
    );
  }, [callingData, callingSearchQuery]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <PageHeader
        icon={<BarChart3 className="h-8 w-8 text-primary" />}
        title="Hospital Analytics & Reports"
        subtitle="Generate day-wise, monthly, and custom reports for hospital operations."
      />

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        {/* ── Both tab rows on one line ── */}
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
          <TabsList className="bg-slate-100 p-1.5 rounded-2xl h-14 shadow-sm border border-slate-200">
            <TabsTrigger value="checkin" className="rounded-xl px-8 h-full data-[state=active]:bg-primary data-[state=active]:text-white font-bold transition-all">
              <ClipboardList className="h-4 w-4 mr-2" />
              Check-in Reports
            </TabsTrigger>
            <TabsTrigger value="calling" className="rounded-xl px-8 h-full data-[state=active]:bg-primary data-[state=active]:text-white font-bold transition-all">
              <Phone className="h-4 w-4 mr-2" />
              Calling Reports
            </TabsTrigger>
          </TabsList>

          <Tabs value={activeTab} onValueChange={(tab) => { setActiveTab(tab); setRecordsSearchQuery(""); setCallingSearchQuery(""); }} className="w-full md:w-auto">
            <TabsList className="bg-white p-1 rounded-xl h-11 border border-slate-200 shadow-sm">
              <TabsTrigger value="daily" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold">Daily</TabsTrigger>
              <TabsTrigger value="monthly" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold">Monthly</TabsTrigger>
              <TabsTrigger value="custom" className="rounded-lg data-[state=active]:bg-primary/10 data-[state=active]:text-primary font-bold">Custom Range</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* ── Global filter bar ── */}
        <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm mb-8 flex flex-wrap items-end gap-6">
          {activeTab === "daily" && (
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Date</Label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <Calendar className="h-4 w-4 text-primary" />
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="border-none bg-transparent shadow-none focus-visible:ring-0 font-bold text-primary p-0 h-auto" />
              </div>
            </div>
          )}
          {activeTab === "monthly" && (
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Month</Label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                <Input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} className="border-none bg-transparent shadow-none focus-visible:ring-0 font-bold text-primary p-0 h-auto" />
              </div>
            </div>
          )}
          {activeTab === "custom" && (
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">From</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-xl border-slate-200 focus-visible:ring-primary" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="rounded-xl border-slate-200 focus-visible:ring-primary" />
              </div>
            </div>
          )}
          {mainTab === "checkin" && activeTab === "custom" && (
            <Button
              onClick={fetchCustomRange}
              className="bg-primary hover:bg-primary/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-teal-900/20"
            >
              <Filter className="h-4 w-4 mr-2" />
              Fetch Records
            </Button>
          )}
          <div className="ml-auto">
            <Button
              onClick={() => {
                if (mainTab === "checkin") {
                  if (activeTab === "daily") exportVisitsToCSV(dailyData?.items || [], `daily-report-${selectedDate}`);
                  else if (activeTab === "monthly") void exportMonthlyRecords();
                  else if (activeTab === "custom") exportVisitsToCSV(customData?.items || [], `custom-report-${startDate}-to-${endDate}`);
                } else if (mainTab === "calling" && callingData) {
                  const range = callingDateRange;
                  exportCallingToCSV(callingData.items, `calling-report-${range?.start ?? "all"}-to-${range?.end ?? "all"}`);
                }
              }}
              disabled={
                mainTab === "checkin"
                  ? (activeTab === "daily" && (!dailyData || dailyData.items.length === 0))
                    || (activeTab === "custom" && (!customData || customData.items.length === 0))
                  : !callingData || callingData.items.length === 0
              }
              className="bg-primary hover:bg-primary/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-teal-900/20"
            >
              <Download className="h-4 w-4 mr-2" />
              Export CSV Report
            </Button>
          </div>
        </div>

        {/* ═══════ CHECK-IN REPORTS ═══════ */}
        <TabsContent value="checkin" className="space-y-8">

          {/* ── Summary cards (dynamic based on sub-tab) ── */}
          {activeTab === "daily" && (
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <div className="h-1.5 bg-primary w-full" />
                <CardContent className="p-6">
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Total Visits</p>
                  <p className="text-4xl font-black text-slate-800">{dailyData?.total_checkins || 0}</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <div className="h-1.5 bg-emerald-500 w-full" />
                <CardContent className="p-6">
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                  <p className="text-4xl font-black text-slate-800">{dailyData?.completed_checkins || 0}</p>
                </CardContent>
              </Card>
              <Card className="border-none shadow-sm bg-white overflow-hidden">
                <div className="h-1.5 bg-amber-500 w-full" />
                <CardContent className="p-6">
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">In Progress</p>
                  <p className="text-4xl font-black text-slate-800">{dailyData?.active_checkins || 0}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {activeTab === "monthly" && (
            <>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-primary w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Total Visits</p>
                    <p className="text-4xl font-black text-slate-800">{monthlyData?.total_checkins || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-emerald-500 w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                    <p className="text-4xl font-black text-slate-800">{monthlyData?.completed_checkins || 0}</p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-blue-500 w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Days with Visits</p>
                    <p className="text-4xl font-black text-slate-800">{monthlyDaysWithVisits}</p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-amber-500 w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Avg. Visits/Day</p>
                    <p className="text-4xl font-black text-slate-800">{monthlyAverage}</p>
                  </CardContent>
                </Card>
              </div>

          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <CardTitle className="text-xl font-black text-slate-800">Day-wise Category Breakdown</CardTitle>
                <p className="text-sm text-slate-500 mt-1">Daily split between De-Addiction and Psychiatric patients.</p>
              </div>
              {monthlyCategoryBreakdown.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    exportCategoryBreakdownToCSV(
                      monthlyCategoryBreakdown,
                      `category-breakdown-${selectedMonth}`,
                    )
                  }
                  className="border-primary/30 text-primary hover:bg-primary/10 font-bold rounded-xl h-10 px-6"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Breakdown
                </Button>
              )}
            </CardHeader>
            <CardContent className="p-0">
              {monthlyRecordsLoading ? (
                <p className="py-20 text-center text-slate-400 italic">
                  Processing monthly breakdown...
                </p>
              ) : monthlyError ? (
                <p className="py-8 px-6 text-sm text-destructive">{monthlyError}</p>
              ) : monthlyCategoryBreakdown.length === 0 ? (
                <p className="py-20 text-center text-slate-300 italic">
                  No records found for the selected month.
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Date</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Total Visits</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-primary text-center">De-Addiction</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-blue-600 text-center">Psychiatric</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyCategoryBreakdown.map((row) => (
                      <TableRow key={row.date} className="hover:bg-slate-50/50">
                        <TableCell className="px-6 font-bold text-slate-800">
                          {new Date(row.date).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "2-digit",
                            month: "short",
                          })}
                        </TableCell>
                        <TableCell className="font-black text-lg text-center">{row.total}</TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-teal-50 text-teal-700 border-teal-100 font-bold px-4 py-1">{row.deAddiction}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge className="bg-blue-50 text-blue-700 border-blue-100 font-bold px-4 py-1">{row.psychiatric}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter className="bg-slate-900 text-white border-t-0">
                    <TableRow>
                      <TableCell className="px-6 font-black uppercase text-xs tracking-wider">Monthly Total</TableCell>
                      <TableCell className="text-center text-xl font-black">
                        {monthlyCategoryBreakdown.reduce((sum, r) => sum + r.total, 0)}
                      </TableCell>
                      <TableCell className="text-center text-xl font-black text-teal-300">
                        {monthlyCategoryBreakdown.reduce((sum, r) => sum + r.deAddiction, 0)}
                      </TableCell>
                      <TableCell className="text-center text-xl font-black text-blue-300">
                        {monthlyCategoryBreakdown.reduce((sum, r) => sum + r.psychiatric, 0)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </CardContent>
          </Card>

            </>
          )}

          {/* ── Custom range cards ── */}
          {activeTab === "custom" && (
            <>
              {customError && <p className="text-sm text-destructive">{customError}</p>}
              {customLoading ? (
                <Card className="border-0 shadow-sm rounded-2xl bg-white">
                  <CardContent className="py-20 text-center text-slate-400 italic">Fetching custom range records...</CardContent>
                </Card>
              ) : customData ? (
                <div className="grid gap-6 md:grid-cols-4">
                  <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <div className="h-1.5 bg-primary w-full" />
                    <CardContent className="p-6">
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Total Visits</p>
                      <p className="text-4xl font-black text-slate-800">{customData.total_checkins}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <div className="h-1.5 bg-emerald-500 w-full" />
                    <CardContent className="p-6">
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                      <p className="text-4xl font-black text-slate-800">{customData.completed_checkins}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <div className="h-1.5 bg-amber-500 w-full" />
                    <CardContent className="p-6">
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">In Progress</p>
                      <p className="text-4xl font-black text-slate-800">{customData.active_checkins}</p>
                    </CardContent>
                  </Card>
                  <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <div className="h-1.5 bg-blue-500 w-full" />
                    <CardContent className="p-6">
                      <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Unique Patients</p>
                      <p className="text-4xl font-black text-slate-800">{customData.unique_patients}</p>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <Card className="border-0 shadow-sm rounded-2xl bg-white">
                  <CardContent className="py-20 text-center text-slate-300 italic">Select a date range and click Fetch Records.</CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── Unified visit records table ── */}
          {(() => {
            const loading = activeTab === "daily" ? dailyLoading : activeTab === "monthly" ? monthlyRecordsLoading : customLoading;
            const error = activeTab === "daily" ? dailyError : activeTab === "monthly" ? monthlyRecordsError : customError;
            const records = activeTab === "daily" ? filteredDailyRecords : activeTab === "monthly" ? filteredMonthlyRecords : filteredCustomRecords;
            const hasRawData = activeTab === "daily" ? (dailyData?.items?.length ?? 0) > 0 : activeTab === "monthly" ? monthlyRecords.length > 0 : (customData?.items?.length ?? 0) > 0;
            const showDate = activeTab !== "daily";

            return (
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-primary" />
                    Visit Records — {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
                  </CardTitle>
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search name, file no, or phone..."
                      value={recordsSearchQuery}
                      onChange={(e) => setRecordsSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-primary"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {loading ? (
                    <p className="py-20 text-center text-slate-400 italic">Fetching records...</p>
                  ) : error ? (
                    <p className="py-8 px-6 text-sm text-destructive">{error}</p>
                  ) : !hasRawData ? (
                    <p className="py-20 text-center text-slate-300 italic">
                      {activeTab === "custom" ? "Select a date range and click Fetch Records." : `No records found for the selected ${activeTab} range.`}
                    </p>
                  ) : records.length === 0 ? (
                    <p className="py-20 text-center text-slate-300 italic">No matching records found for your search.</p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient Name</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Phone</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Category</TableHead>
                          {showDate && <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Date</TableHead>}
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Check-in</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {records.map((item) => (
                          <TableRow key={item.id} className="hover:bg-slate-50/50">
                            <TableCell className="px-6 font-mono font-bold text-primary">{item.patient.file_number}</TableCell>
                            <TableCell className="font-bold text-slate-800">{item.patient.full_name}</TableCell>
                            <TableCell className="text-slate-500">{item.patient.phone || "-"}</TableCell>
                            <TableCell className="capitalize text-slate-500">{item.patient.patient_category}</TableCell>
                            {showDate && <TableCell className="text-slate-500 font-medium">{new Date(item.visit_date).toLocaleDateString("en-IN")}</TableCell>}
                            <TableCell className="font-medium text-slate-600">{formatTime(item.checkin_time)}</TableCell>
                            <TableCell>
                              <Badge className={item.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}>
                                {item.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })()}
        </TabsContent>

        {/* ═══════ CALLING REPORTS ═══════ */}
        <TabsContent value="calling" className="space-y-8">
          {callingError && <p className="text-sm text-destructive">{callingError}</p>}

          {callingLoading ? (
            <Card className="border-0 shadow-sm rounded-2xl bg-white">
              <CardContent className="py-20 text-center text-slate-400 italic">Fetching calling report...</CardContent>
            </Card>
          ) : callingData ? (
            <>
              {/* Summary cards — left-side color bars */}
              <div className="grid gap-6 md:grid-cols-3">
                <Card className="border-none shadow-sm bg-white overflow-hidden p-6 relative">
                  <div className="absolute top-0 left-0 h-full w-1.5 bg-blue-600" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Total Calls</p>
                  <p className="text-4xl font-black text-slate-800">{callingData.total_calls}</p>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden p-6 relative">
                  <div className="absolute top-0 left-0 h-full w-1.5 bg-indigo-500" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Confirmed</p>
                  <p className="text-4xl font-black text-slate-800">{callingData.outcome_distribution.confirmed}</p>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden p-6 relative">
                  <div className="absolute top-0 left-0 h-full w-1.5 bg-emerald-500" />
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">Successful (Confirmed)</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-4xl font-black text-emerald-600">
                      {callingData.total_calls > 0
                        ? `${Math.round((callingData.outcome_distribution.confirmed / callingData.total_calls) * 100)}%`
                        : "—"}
                    </p>
                    {callingData.total_calls > 0 && (
                      <span className="text-xs font-bold text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full">
                        {callingData.outcome_distribution.confirmed}/{callingData.total_calls} Rate
                      </span>
                    )}
                  </div>
                </Card>
              </div>

              {/* Outcome distribution bars */}
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-50">
                  <CardTitle className="text-lg font-bold">Call Outcomes Distribution</CardTitle>
                </CardHeader>
                <CardContent className="p-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-8">
                    {(Object.entries(callingData.outcome_distribution) as [string, number][]).map(
                      ([key, value]) => {
                        const pct =
                          callingData.total_calls > 0
                            ? Math.round((value / callingData.total_calls) * 100)
                            : 0;
                        return (
                          <div key={key} className="space-y-2">
                            <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-slate-500">
                              <span>{CALL_RESULT_LABELS[key] || key}</span>
                              <span>{value} ({pct}%)</span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${CALL_RESULT_COLORS[key] || "bg-slate-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        );
                      },
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Staff breakdown */}
              {callingData.staff_breakdown.length > 0 && (
                <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
                  <CardHeader className="border-b border-slate-50">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      Staff Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Staff</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Total</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-emerald-600 text-center">Confirmed</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-amber-600 text-center">Busy</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-red-600 text-center">Wrong No.</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Unreachable</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-rose-600 text-center">Do Not Call</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-blue-600 text-center">Other</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {callingData.staff_breakdown.map((row) => (
                          <TableRow key={row.staff_name} className="hover:bg-slate-50/50">
                            <TableCell className="px-6 font-bold text-slate-800">{row.staff_name}</TableCell>
                            <TableCell className="font-black text-lg text-center">{row.total}</TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold px-3 py-1">{row.confirmed}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-amber-50 text-amber-700 border-amber-100 font-bold px-3 py-1">{row.busy_later}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-red-50 text-red-700 border-red-100 font-bold px-3 py-1">{row.wrong_number}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-slate-50 text-slate-600 border-slate-200 font-bold px-3 py-1">{row.not_reachable}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-rose-50 text-rose-700 border-rose-100 font-bold px-3 py-1">{row.do_not_call}</Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-blue-50 text-blue-700 border-blue-100 font-bold px-3 py-1">{row.other}</Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Call history table */}
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <Phone className="h-5 w-5 text-blue-600" />
                    Detailed Call History
                  </CardTitle>
                  <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      placeholder="Search call logs..."
                      value={callingSearchQuery}
                      onChange={(e) => setCallingSearchQuery(e.target.value)}
                      className="pl-10 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-blue-600"
                    />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  {filteredCallingItems.length === 0 ? (
                    <p className="py-20 text-center text-slate-300 italic">
                      {callingSearchQuery
                        ? "No matching call records found."
                        : "No call records found for this date range."}
                    </p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient Name</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Date</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Result</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Feedback / Notes</TableHead>
                          <TableHead className="px-6 text-right font-bold uppercase text-[10px] tracking-wider text-slate-500">Log Staff</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCallingItems.map((item) => (
                          <TableRow key={item.id} className="hover:bg-slate-50/50">
                            <TableCell className="px-6 font-mono font-bold text-primary">{item.file_number}</TableCell>
                            <TableCell className="font-bold text-slate-800">{item.patient_name}</TableCell>
                            <TableCell className="text-slate-500 font-medium">
                              {new Date(item.called_at).toLocaleDateString("en-IN")}
                            </TableCell>
                            <TableCell className="text-center">
                              <Badge className={CALL_RESULT_BADGE[item.result] || "bg-slate-50 text-slate-600 border-slate-200"}>
                                {CALL_RESULT_LABELS[item.result] || item.result}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-600 italic max-w-[300px] truncate">
                              &ldquo;{item.note}&rdquo;
                            </TableCell>
                            <TableCell className="px-6 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-6 h-6 rounded-full bg-blue-50 flex items-center justify-center text-[10px] font-bold text-blue-600">
                                  {item.staff_name.split(" ").pop()?.charAt(0) || "?"}
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-tight">{item.staff_name}</span>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-0 shadow-sm rounded-2xl bg-white">
              <CardContent className="py-20 text-center text-slate-300 italic">
                Select a date range and click Fetch Report to view calling data.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
