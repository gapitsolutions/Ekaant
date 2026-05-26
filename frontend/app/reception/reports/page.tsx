"use client";

import { useEffect, useMemo, useState } from "react";
import {
  type CustomRangeReportResponse,
  type DailyReportResponse,
  getReceptionCustomRangeReport,
  getReceptionDailyReport,
  getReceptionMonthlyReport,
  type MonthlyReportResponse,
  type ReportVisitItem,
} from "@/lib/hms-api";
import { useAuth } from "@/lib/auth-context";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  Calendar,
  CalendarDays,
  CheckCircle,
  ClipboardList,
  Clock,
  Download,
  Filter,
  TrendingUp,
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

  const [activeTab, setActiveTab] = useState("daily");
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [selectedMonth, setSelectedMonth] = useState(
    new Date().toISOString().slice(0, 7),
  );
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

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

  const monthlyDaysWithVisits = monthlyRows.length;
  const monthlyAverage =
    monthlyData && monthlyDaysWithVisits > 0
      ? Math.round(monthlyData.total_checkins / monthlyDaysWithVisits)
      : 0;

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

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-[#0d7377] tracking-tight flex items-center gap-3">
            <BarChart3 className="h-8 w-8" />
            Hospital Analytics &amp; Reports
          </h1>
          <p className="text-slate-500 mt-1 font-medium">
            Generate day-wise, monthly, and custom reports for hospital operations.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-slate-100 p-1.5 rounded-2xl h-14 shadow-sm border border-slate-200 w-full lg:w-[480px]">
          <TabsTrigger
            value="daily"
            className="flex items-center gap-2 rounded-xl px-6 h-full data-[state=active]:bg-[#0d7377] data-[state=active]:text-white font-bold transition-all"
          >
            <Calendar className="h-4 w-4" />
            Daily
          </TabsTrigger>
          <TabsTrigger
            value="monthly"
            className="flex items-center gap-2 rounded-xl px-6 h-full data-[state=active]:bg-[#0d7377] data-[state=active]:text-white font-bold transition-all"
          >
            <CalendarDays className="h-4 w-4" />
            Monthly
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            className="flex items-center gap-2 rounded-xl px-6 h-full data-[state=active]:bg-[#0d7377] data-[state=active]:text-white font-bold transition-all"
          >
            <Filter className="h-4 w-4" />
            Custom Range
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Date</Label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <Calendar className="h-4 w-4 text-[#0d7377]" />
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="border-none bg-transparent shadow-none focus-visible:ring-0 font-bold text-[#0d7377] p-0 h-auto"
                />
              </div>
            </div>
            <div className="ml-auto">
              <Button
                onClick={() =>
                  exportVisitsToCSV(
                    dailyData?.items || [],
                    `daily-report-${selectedDate}`,
                  )
                }
                disabled={!dailyData || dailyData.items.length === 0}
                className="bg-[#0d7377] hover:bg-[#0d7377]/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-teal-900/20"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV Report
              </Button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1.5 bg-[#0d7377] w-full" />
              <CardContent className="p-6">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Total Visits</p>
                <p className="text-4xl font-black text-slate-800">
                  {dailyData?.total_checkins || 0}
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1.5 bg-emerald-500 w-full" />
              <CardContent className="p-6">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                <p className="text-4xl font-black text-slate-800">
                  {dailyData?.completed_checkins || 0}
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1.5 bg-amber-500 w-full" />
              <CardContent className="p-6">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">In Progress</p>
                <p className="text-4xl font-black text-slate-800">
                  {dailyData?.active_checkins || 0}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50">
              <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#0d7377]" />
                Daily Visit Records
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {dailyLoading ? (
                <p className="py-20 text-center text-slate-400 italic">
                  Fetching daily records...
                </p>
              ) : dailyError ? (
                <p className="py-8 px-6 text-sm text-destructive">{dailyError}</p>
              ) : !dailyData || dailyData.items.length === 0 ? (
                <p className="py-20 text-center text-slate-300 italic">
                  No records found for the selected date.
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient Name</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Phone</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Category</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Check-in</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Stage</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyData.items.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50">
                        <TableCell className="px-6">
                          <span className="font-mono font-bold text-[#0d7377]">
                            {item.patient.file_number}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">
                          {item.patient.full_name}
                        </TableCell>
                        <TableCell className="text-slate-500">{item.patient.phone || "-"}</TableCell>
                        <TableCell className="capitalize text-slate-500">
                          {item.patient.patient_category}
                        </TableCell>
                        <TableCell className="font-medium text-slate-600">{formatTime(item.checkin_time)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={stageClass(item.current_stage)}
                          >
                            {item.current_stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={item.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}
                          >
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
        </TabsContent>

        <TabsContent value="monthly" className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-end gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Month</Label>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2">
                <CalendarDays className="h-4 w-4 text-[#0d7377]" />
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="border-none bg-transparent shadow-none focus-visible:ring-0 font-bold text-[#0d7377] p-0 h-auto"
                />
              </div>
            </div>
            <div className="ml-auto">
              <Button
                onClick={exportMonthlyRecords}
                disabled={!monthlyData || monthlyExportLoading}
                className="bg-[#0d7377] hover:bg-[#0d7377]/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-teal-900/20"
              >
                <Download className="h-4 w-4 mr-2" />
                {monthlyExportLoading ? "Exporting..." : "Export CSV Report"}
              </Button>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1.5 bg-[#0d7377] w-full" />
              <CardContent className="p-6">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Total Visits</p>
                <p className="text-4xl font-black text-slate-800">
                  {monthlyData?.total_checkins || 0}
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1.5 bg-emerald-500 w-full" />
              <CardContent className="p-6">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                <p className="text-4xl font-black text-slate-800">
                  {monthlyData?.completed_checkins || 0}
                </p>
              </CardContent>
            </Card>
            <Card className="border-none shadow-sm bg-white overflow-hidden">
              <div className="h-1.5 bg-blue-500 w-full" />
              <CardContent className="p-6">
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Days with Visits</p>
                <p className="text-4xl font-black text-slate-800">
                  {monthlyDaysWithVisits}
                </p>
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
            <CardHeader className="border-b border-slate-50">
              <CardTitle className="text-xl font-black text-slate-800">Daily Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {monthlyLoading ? (
                <p className="py-20 text-center text-slate-400 italic">
                  Processing monthly breakdown...
                </p>
              ) : monthlyError ? (
                <p className="py-8 px-6 text-sm text-destructive">{monthlyError}</p>
              ) : monthlyRows.length === 0 ? (
                <p className="py-20 text-center text-slate-300 italic">
                  No records found for the selected month.
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">Date</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-center">Total Visits</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRows.map((row) => (
                      <TableRow key={row.date} className="hover:bg-slate-50/50">
                        <TableCell className="px-6 font-bold text-slate-800">
                          {new Date(row.date).toLocaleDateString("en-IN", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </TableCell>
                        <TableCell className="font-black text-lg text-center">{row.total}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
            <CardHeader className="border-b border-slate-50">
              <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-[#0d7377]" />
                Monthly Visit Records
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {monthlyRecordsLoading ? (
                <p className="py-20 text-center text-slate-400 italic">
                  Fetching monthly patient records...
                </p>
              ) : monthlyRecordsError ? (
                <p className="py-8 px-6 text-sm text-destructive">
                  {monthlyRecordsError}
                </p>
              ) : monthlyRecords.length === 0 ? (
                <p className="py-20 text-center text-slate-300 italic">
                  No patient records found for the selected month.
                </p>
              ) : (
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient Name</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Phone</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Visit Date</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Check-in</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Stage</TableHead>
                      <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyRecords.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/50">
                        <TableCell className="px-6">
                          <span className="font-mono font-bold text-[#0d7377]">
                            {item.patient.file_number}
                          </span>
                        </TableCell>
                        <TableCell className="font-bold text-slate-800">
                          {item.patient.full_name}
                        </TableCell>
                        <TableCell className="text-slate-500">{item.patient.phone || "-"}</TableCell>
                        <TableCell className="text-slate-500 font-medium">
                          {new Date(item.visit_date).toLocaleDateString("en-IN")}
                        </TableCell>
                        <TableCell className="font-medium text-slate-600">{formatTime(item.checkin_time)}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={stageClass(item.current_stage)}
                          >
                            {item.current_stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={item.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}
                          >
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
        </TabsContent>

        <TabsContent value="custom" className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap items-end gap-6">
            <div className="flex items-center gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-xl border-slate-200 focus-visible:ring-[#0d7377]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate" className="text-[10px] font-black text-slate-400 uppercase tracking-widest">To</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-xl border-slate-200 focus-visible:ring-[#0d7377]"
                />
              </div>
            </div>
            <Button
              onClick={fetchCustomRange}
              className="bg-[#0d7377] hover:bg-[#0d7377]/90 text-white rounded-xl px-8 h-12 shadow-lg shadow-teal-900/20"
            >
              <Filter className="h-4 w-4 mr-2" />
              Fetch Records
            </Button>
            <div className="ml-auto">
              <Button
                variant="outline"
                onClick={() =>
                  exportVisitsToCSV(
                    customData?.items || [],
                    `custom-report-${startDate}-to-${endDate}`,
                  )
                }
                disabled={!customData || customData.items.length === 0}
                className="border-[#0d7377]/30 text-[#0d7377] hover:bg-[#0d7377]/10 font-bold rounded-xl h-12 px-6"
              >
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </div>

          {customError ? (
            <p className="text-sm text-destructive">{customError}</p>
          ) : null}

          {customLoading ? (
            <Card className="border-0 shadow-sm rounded-2xl bg-white">
              <CardContent className="py-20 text-center text-slate-400 italic">
                Fetching custom range records...
              </CardContent>
            </Card>
          ) : customData ? (
            <>
              <div className="grid gap-6 md:grid-cols-4">
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-[#0d7377] w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Total Visits</p>
                    <p className="text-4xl font-black text-slate-800">
                      {customData.total_checkins}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-emerald-500 w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Completed</p>
                    <p className="text-4xl font-black text-slate-800">
                      {customData.completed_checkins}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-amber-500 w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">In Progress</p>
                    <p className="text-4xl font-black text-slate-800">
                      {customData.active_checkins}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                  <div className="h-1.5 bg-blue-500 w-full" />
                  <CardContent className="p-6">
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest mb-1">Unique Patients</p>
                    <p className="text-4xl font-black text-slate-800">
                      {customData.unique_patients}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden bg-white">
                <CardHeader className="border-b border-slate-50">
                  <CardTitle className="text-xl font-black text-slate-800 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-[#0d7377]" />
                    Custom Range Records
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {customData.items.length === 0 ? (
                    <p className="py-20 text-center text-slate-300 italic">
                      No records found for this date range.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader className="bg-slate-50/50">
                        <TableRow>
                          <TableHead className="px-6 font-bold uppercase text-[10px] tracking-wider text-slate-500">File No.</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Patient Name</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Phone</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Visit Date</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Check-in</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Stage</TableHead>
                          <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {customData.items.map((item) => (
                          <TableRow key={item.id} className="hover:bg-slate-50/50">
                            <TableCell className="px-6">
                              <span className="font-mono font-bold text-[#0d7377]">
                                {item.patient.file_number}
                              </span>
                            </TableCell>
                            <TableCell className="font-bold text-slate-800">
                              {item.patient.full_name}
                            </TableCell>
                            <TableCell className="text-slate-500">{item.patient.phone || "-"}</TableCell>
                            <TableCell className="text-slate-500 font-medium">
                              {new Date(item.visit_date).toLocaleDateString("en-IN")}
                            </TableCell>
                            <TableCell className="font-medium text-slate-600">
                              {formatTime(item.checkin_time)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={stageClass(item.current_stage)}
                              >
                                {item.current_stage}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={item.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-100" : "bg-amber-50 text-amber-700 border-amber-100"}
                              >
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
            </>
          ) : (
            <Card className="border-0 shadow-sm rounded-2xl bg-white">
              <CardContent className="py-20 text-center text-slate-300 italic">
                Select a date range and click Fetch Records.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
