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
  CardDescription,
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

function statusClass(status: string) {
  if (status === "completed") return "bg-emerald-600";
  return "";
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
    item.patient.registration_number,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold bg-gradient-to-r from-[#0d7377] to-[#14919b] bg-clip-text text-transparent">
          Reports
        </h1>
        <p className="text-muted-foreground">
          Backend report records for daily, monthly, and custom date ranges.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 lg:w-[400px] bg-[#0d7377]/10">
          <TabsTrigger
            value="daily"
            className="flex items-center gap-2 data-[state=active]:bg-[#0d7377] data-[state=active]:text-white"
          >
            <Calendar className="h-4 w-4" />
            Daily
          </TabsTrigger>
          <TabsTrigger
            value="monthly"
            className="flex items-center gap-2 data-[state=active]:bg-[#0d7377] data-[state=active]:text-white"
          >
            <CalendarDays className="h-4 w-4" />
            Monthly
          </TabsTrigger>
          <TabsTrigger
            value="custom"
            className="flex items-center gap-2 data-[state=active]:bg-[#0d7377] data-[state=active]:text-white"
          >
            <Filter className="h-4 w-4" />
            Custom
          </TabsTrigger>
        </TabsList>

        <TabsContent value="daily" className="space-y-6">
          <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
            <CardHeader className="pb-3 border-b bg-gradient-to-r from-[#0d7377]/5 to-[#14919b]/5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Daily Report</CardTitle>
                  <CardDescription>
                    Records fetched from backend for the selected date.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-auto focus-visible:ring-[#0d7377]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      exportVisitsToCSV(
                        dailyData?.items || [],
                        `daily-report-${selectedDate}`,
                      )
                    }
                    disabled={!dailyData || dailyData.items.length === 0}
                    className="border-[#0d7377]/30 hover:bg-[#0d7377]/10"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-[#0d7377]" />
                  <div>
                    <p className="text-2xl font-bold">
                      {dailyData?.total_checkins || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total Visits
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {dailyData?.completed_checkins || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {dailyData?.active_checkins || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">In Progress</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily Visit Records</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading daily records...
                </p>
              ) : dailyError ? (
                <p className="text-sm text-destructive">{dailyError}</p>
              ) : !dailyData || dailyData.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No records found for the selected date.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File No.</TableHead>
                        <TableHead>Patient Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Check-in Time</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {dailyData.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {item.patient.registration_number}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.patient.full_name}
                          </TableCell>
                          <TableCell>{item.patient.phone || "-"}</TableCell>
                          <TableCell className="capitalize">
                            {item.patient.patient_category}
                          </TableCell>
                          <TableCell>{formatTime(item.checkin_time)}</TableCell>
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
                              variant={
                                item.status === "completed"
                                  ? "default"
                                  : "outline"
                              }
                              className={statusClass(item.status)}
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-6">
          <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
            <CardHeader className="pb-3 border-b bg-gradient-to-r from-[#0d7377]/5 to-[#14919b]/5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Monthly Report</CardTitle>
                  <CardDescription>
                    Month-wise records fetched from backend.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-auto focus-visible:ring-[#0d7377]"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportMonthlyRecords}
                    disabled={!monthlyData || monthlyExportLoading}
                    className="border-[#0d7377]/30 hover:bg-[#0d7377]/10"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {monthlyExportLoading ? "Exporting..." : "Export"}
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-5 w-5 text-[#0d7377]" />
                  <div>
                    <p className="text-2xl font-bold">
                      {monthlyData?.total_checkins || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total Visits
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {monthlyData?.completed_checkins || 0}
                    </p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-2xl font-bold">
                      {monthlyDaysWithVisits}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Days with Visits
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-2xl font-bold">{monthlyAverage}</p>
                    <p className="text-sm text-muted-foreground">
                      Avg. Visits/Day
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Daily Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading monthly records...
                </p>
              ) : monthlyError ? (
                <p className="text-sm text-destructive">{monthlyError}</p>
              ) : monthlyRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No records found for the selected month.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Total Visits</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyRows.map((row) => (
                        <TableRow key={row.date}>
                          <TableCell className="font-medium">
                            {new Date(row.date).toLocaleDateString("en-IN", {
                              weekday: "short",
                              day: "numeric",
                              month: "short",
                            })}
                          </TableCell>
                          <TableCell>{row.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Visit Records</CardTitle>
            </CardHeader>
            <CardContent>
              {monthlyRecordsLoading ? (
                <p className="text-sm text-muted-foreground">
                  Loading monthly patient records...
                </p>
              ) : monthlyRecordsError ? (
                <p className="text-sm text-destructive">
                  {monthlyRecordsError}
                </p>
              ) : monthlyRecords.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No patient records found for the selected month.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File No.</TableHead>
                        <TableHead>Patient Name</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Visit Date</TableHead>
                        <TableHead>Check-in Time</TableHead>
                        <TableHead>Stage</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {monthlyRecords.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Badge variant="outline" className="font-mono">
                              {item.patient.registration_number}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            {item.patient.full_name}
                          </TableCell>
                          <TableCell>{item.patient.phone || "-"}</TableCell>
                          <TableCell>
                            {new Date(item.visit_date).toLocaleDateString(
                              "en-IN",
                            )}
                          </TableCell>
                          <TableCell>{formatTime(item.checkin_time)}</TableCell>
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
                              variant={
                                item.status === "completed"
                                  ? "default"
                                  : "outline"
                              }
                              className={statusClass(item.status)}
                            >
                              {item.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="custom" className="space-y-6">
          <Card className="shadow-lg border-0 bg-card/80 backdrop-blur">
            <CardHeader className="pb-3 border-b bg-gradient-to-r from-[#0d7377]/5 to-[#14919b]/5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <CardTitle className="text-lg">Custom Date Range</CardTitle>
                  <CardDescription>
                    Fetch and list report rows from backend for the selected
                    range.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="startDate"
                      className="text-sm whitespace-nowrap"
                    >
                      From:
                    </Label>
                    <Input
                      id="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-auto focus-visible:ring-[#0d7377]"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="endDate"
                      className="text-sm whitespace-nowrap"
                    >
                      To:
                    </Label>
                    <Input
                      id="endDate"
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-auto focus-visible:ring-[#0d7377]"
                    />
                  </div>
                  <Button
                    onClick={fetchCustomRange}
                    className="bg-[#0d7377] hover:bg-[#0d7377]/90"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Fetch Records
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      exportVisitsToCSV(
                        customData?.items || [],
                        `custom-report-${startDate}-to-${endDate}`,
                      )
                    }
                    disabled={!customData || customData.items.length === 0}
                    className="border-[#0d7377]/30 hover:bg-[#0d7377]/10"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          {customError ? (
            <p className="text-sm text-destructive">{customError}</p>
          ) : null}

          {customLoading ? (
            <Card>
              <CardContent className="py-8 text-sm text-muted-foreground">
                Loading custom range records...
              </CardContent>
            </Card>
          ) : customData ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">
                      {customData.total_checkins}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Total Visits
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-emerald-600">
                      {customData.completed_checkins}
                    </p>
                    <p className="text-sm text-muted-foreground">Completed</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold text-amber-600">
                      {customData.active_checkins}
                    </p>
                    <p className="text-sm text-muted-foreground">In Progress</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-2xl font-bold">
                      {customData.unique_patients}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Unique Patients
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>Custom Range Records</CardTitle>
                </CardHeader>
                <CardContent>
                  {customData.items.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No records found for this date range.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>File No.</TableHead>
                            <TableHead>Patient Name</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Visit Date</TableHead>
                            <TableHead>Check-in Time</TableHead>
                            <TableHead>Stage</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {customData.items.map((item) => (
                            <TableRow key={item.id}>
                              <TableCell>
                                <Badge variant="outline" className="font-mono">
                                  {item.patient.registration_number}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-medium">
                                {item.patient.full_name}
                              </TableCell>
                              <TableCell>{item.patient.phone || "-"}</TableCell>
                              <TableCell>
                                {new Date(item.visit_date).toLocaleDateString(
                                  "en-IN",
                                )}
                              </TableCell>
                              <TableCell>
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
                                  variant={
                                    item.status === "completed"
                                      ? "default"
                                      : "outline"
                                  }
                                  className={statusClass(item.status)}
                                >
                                  {item.status}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Select a date range and click Fetch Records.
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
