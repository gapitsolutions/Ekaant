"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/lib/auth-context";
import {
  getDashboardStats,
  getReceptionDailyReport,
  getQueueStatus,
  type QueueItem,
} from "@/lib/hms-api";
import { navigate } from "@/lib/navigation";
import type { DashboardStats, Patient, Visit } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  getAttendanceRoster,
  getTodayAttendanceStatus,
  bulkMarkAttendance,
  type AttendanceRosterItem,
  type AttendanceStatus,
  type AttendanceDaySubmission,
} from "@/lib/staff-api";
import { toastApiError } from "@/lib/api-errors";
import {
  Fingerprint,
  UserPlus,
  Users,
  ArrowRight,
  CheckCircle,
  Database,
  BarChart3,
  TrendingUp,
  Clock,
  Phone,
  FileText,
  Link,
  CalendarCheck,
  Loader2,
  Lock,
} from "lucide-react";

interface StatData {
  title: string;
  description: string;
  patients: Array<{
    patient: Patient;
    visit?: Visit;
  }>;
}

type DashboardVisitItem = QueueItem;

export default function ReceptionDashboard() {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [todayVisitItems, setTodayVisitItems] = useState<DashboardVisitItem[]>(
    [],
  );
  const [selectedStat, setSelectedStat] = useState<StatData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  // Today's attendance submission/lock state (null = not yet submitted).
  const [todaySubmission, setTodaySubmission] =
    useState<AttendanceDaySubmission | null>(null);

  const today = new Date().toLocaleDateString("en-CA");

  const refreshAttendanceStatus = () => {
    // Lightweight status check (not the full roster) just for the button state.
    getTodayAttendanceStatus()
      .then((data) => setTodaySubmission(data.submission))
      .catch(() => {
        /* non-fatal — button stays enabled */
      });
  };

  useEffect(() => {
    refreshAttendanceStatus();
    ///eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    getDashboardStats(accessToken)
      .then((data) => setStats(data))
      .catch(() => setStats(null));
    getQueueStatus(accessToken)
      .then((data) => setQueueItems(data.items))
      .catch(() => setQueueItems([]));

    getReceptionDailyReport(accessToken)
      .then((data: any) => {
        const items: DashboardVisitItem[] = Array.isArray(data?.items)
          ? data.items.map((item: any, idx: number) => ({
              session_id: item.id || `visit-${idx}`,
              patient_id: item.patient_id || "",
              patient_name: item.patient?.full_name || "Unknown",
              checked_in_at: item.checkin_time || "",
              checked_in_by_name: "",
              status: item.status || "completed",
              current_stage: item.current_stage || "completed",
              outstanding_debt: 0,
              file_number: item.patient?.file_number || "",
              date_of_birth: item.patient?.date_of_birth || "",
              gender: (item.patient?.gender || "other") as
                | "male"
                | "female"
                | "other",
              phone: item.patient?.phone || "",
            }))
          : [];
        setTodayVisitItems(items);
      })
      .catch(() => setTodayVisitItems([]));
  }, [accessToken]);

  const getStatData = (statType: string): StatData => {
    const stageMap: Record<
      string,
      { title: string; description: string; stage?: string }
    > = {
      total_patients: {
        title: "Total Patients",
        description: "All registered patients",
      },
      today_visits: {
        title: "Today's Visits",
        description: "Patients who visited today",
      },
      at_counsellor: {
        title: "At Counsellor",
        description: "Currently with counsellor",
        stage: "counsellor",
      },
      at_doctor: {
        title: "At Doctor",
        description: "Currently with doctor",
        stage: "doctor",
      },
      at_pharmacy: {
        title: "At Pharmacy",
        description: "Currently at pharmacy",
        stage: "pharmacy",
      },
      completed_today: {
        title: "Completed Today",
        description: "Completed visit today",
        stage: "completed",
      },
    };
    const meta = stageMap[statType] || { title: "", description: "" };
    let filtered: DashboardVisitItem[] = queueItems.map((q) => ({ ...q }));
    if (statType === "today_visits") {
      filtered = todayVisitItems;
    } else if (statType === "completed_today") {
      filtered = todayVisitItems.filter(
        (q) => q.current_stage === "completed" || q.status === "completed",
      );
    } else if (meta.stage) {
      filtered = queueItems.filter((q) => q.current_stage === meta.stage);
    }
    const patientItems = filtered.map((q) => ({
      patient: {
        id: q.patient_id,
        full_name: q.patient_name,
        file_number: q.file_number || "",
        phone: q.phone || "",
        date_of_birth: q.date_of_birth || "",
        gender: (q.gender || "male") as "male" | "female" | "other",
        status: "active" as const,
      } as Patient,
      visit: {
        id: q.session_id,
        patient_id: q.patient_id,
        visit_date: q.checked_in_at || new Date().toISOString(),
        visit_number: 1,
        current_stage: (q.current_stage as any) || "counsellor",
        checkin_time: q.checked_in_at,
        status:
          q.status === "completed" || q.current_stage === "completed"
            ? "completed"
            : "in_progress",
      } as Visit,
    }));
    return {
      title: meta.title,
      description: meta.description,
      patients: patientItems,
    };
  };

  const handleStatClick = (statType: string) => {
    const data = getStatData(statType);
    setSelectedStat(data);
    setSheetOpen(true);
  };

  const quickActions = [
    {
      title: "Register Patient",
      description: "Add a new patient to the system",
      href: "/reception/register",
      icon: UserPlus,
      bgColor: "bg-[#e8f5e9]",
      iconBg: "bg-[#c8e6c9]",
      iconColor: "text-[#2e7d32]",
    },
    {
      title: "Check In Patient",
      description: "Verify identity and check in a patient",
      href: "/reception/checkin",
      icon: Fingerprint,
      bgColor: "bg-[#e0f2f1]",
      iconBg: "bg-[#b2dfdb]",
      iconColor: "text-[#00695c]",
    },
    {
      title: "Patient Data",
      description: "View and edit all patient records",
      href: "/reception/patients",
      icon: Database,
      bgColor: "bg-[#e3f2fd]",
      iconBg: "bg-[#bbdefb]",
      iconColor: "text-[#1565c0]",
    },
    {
      title: "Reports",
      description: "View daily and monthly records",
      href: "/reception/reports",
      icon: BarChart3,
      bgColor: "bg-[#ede7f6]",
      iconBg: "bg-[#d1c4e9]",
      iconColor: "text-[#4527a0]",
    },
    {
      title: "Follow-Up Calls",
      description: "Manage patient follow-up communication",
      href: "/reception/follow-up",
      icon: Phone,
      bgColor: "bg-[#fce4ec]",
      iconBg: "bg-[#f8bbd0]",
      iconColor: "text-[#c2185b]",
    },
  ];

  const statCards = stats
    ? [
        {
          title: "Today's Visits",
          value: stats.todayVisits,
          icon: Clock,
          borderColor: "border-t-[#1976d2]",
          iconClass: "bg-[#1976d2] text-white",
          trend: null,
          statType: "today_visits",
        },
        {
          title: "Patient in Pharmacy",
          value: queueItems.filter((q) => q.current_stage === "pharmacy")
            .length,
          icon: Link,
          borderColor: "border-t-[#f57c00]",
          iconClass: "bg-[#f57c00] text-white",
          trend: null,
          statType: "at_pharmacy",
        },
        {
          title: "Completed Today",
          value: stats.completedToday,
          icon: CheckCircle,
          borderColor: "border-t-[#388e3c]",
          iconClass: "bg-[#388e3c] text-white",
          trend: null,
          statType: "completed_today",
        },
      ]
    : [];

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birthDate.getDate())
    ) {
      age--;
    }
    return age;
  };

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <PageHeader
        title="Reception Dashboard"
        subtitle="Welcome back! Manage patient check-ins and registrations"
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setAttendanceOpen(true)}
              className={`rounded-xl h-10 px-4 font-bold flex items-center gap-2 ${
                todaySubmission
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                  : "bg-primary hover:bg-primary-dark text-white shadow-md"
              }`}
            >
              {todaySubmission ? (
                <CheckCircle className="h-4 w-4" />
              ) : (
                <CalendarCheck className="h-4 w-4" />
              )}
              {todaySubmission ? "Attendance Marked" : "Mark Attendance"}
            </Button>
            <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
              <Clock className="h-4 w-4" />
              {new Date().toLocaleDateString("en-IN", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </div>
          </div>
        }
      />

      {/* Stats Overview */}
      <div className="grid gap-6 md:grid-cols-3">
        {statCards.map((stat) => (
          <button
            key={stat.title}
            onClick={() => handleStatClick(stat.statType)}
            className="text-left"
          >
            <Card
              className={`border-0 border-t-[6px] ${stat.borderColor} shadow-sm hover:shadow-md transition-shadow cursor-pointer`}
            >
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-4xl font-bold text-foreground">
                    {stat.value}
                  </p>
                  <div className={`p-2 rounded-full ${stat.iconClass}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground font-medium">
                  {stat.title}
                </p>
                {stat.trend ? (
                  <div className="flex items-center gap-1 mt-2 text-xs text-emerald-600 font-medium">
                    <TrendingUp className="h-3 w-3" />
                    {stat.trend}
                  </div>
                ) : (
                  <div className="h-[20px] mt-2" />
                )}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-bold text-foreground mb-4">
          Quick Actions
        </h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
          {quickActions.map((action) => (
            <Card
              key={action.href}
              className={`border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer ${action.bgColor}`}
              onClick={() => navigate(action.href)}
            >
              <CardContent className="p-5 flex flex-col h-full">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center mb-4 ${action.iconBg}`}
                >
                  <action.icon className={`h-5 w-5 ${action.iconColor}`} />
                </div>
                <h3 className="font-bold text-foreground mb-1">
                  {action.title}
                </h3>
                <p className="text-xs text-muted-foreground mb-4 flex-1">
                  {action.description}
                </p>
                <div
                  className={`text-xs font-semibold flex items-center gap-1 ${action.iconColor}`}
                >
                  View <ArrowRight className="h-3 w-3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Recent Check Ins
            </h2>
            <p className="text-sm text-muted-foreground">
              Patients checked in today
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="bg-white font-medium shadow-sm"
            onClick={() => navigate("/reception/queue")}
          >
            View All
          </Button>
        </div>

        <Card className="border-0 shadow-sm overflow-hidden">
          <CardContent className="p-0">
            {stats && stats.todayVisits > 0 ? (
              <div className="divide-y divide-border">
                {queueItems.slice(0, 5).map((q) => {
                  if (!q.patient_name) return null;
                  return (
                    <div
                      key={q.session_id}
                      className="flex items-center justify-between p-5 hover:bg-muted/30 transition-colors bg-white"
                    >
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-[#e0f2f1] flex items-center justify-center text-[#00695c] font-bold text-sm">
                          {q.patient_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-foreground text-sm">
                              {q.patient_name}
                            </p>
                            {q.file_number && (
                              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary bg-[#e0f2f1] px-1.5 py-0.5 rounded">
                                <FileText className="h-3 w-3" />
                                {q.file_number}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Checked in at{" "}
                            {q.checked_in_at
                              ? new Date(q.checked_in_at).toLocaleTimeString(
                                  "en-IN",
                                  { hour: "2-digit", minute: "2-digit" },
                                )
                              : "N/A"}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs px-3 py-1 rounded-full font-semibold capitalize
                        ${
                          q.current_stage === "completed"
                            ? "bg-[#e8f5e9] text-[#2e7d32]"
                            : q.current_stage === "pharmacy"
                              ? "bg-[#fce4ec] text-[#c2185b]"
                              : "bg-secondary text-secondary-foreground"
                        }`}
                      >
                        {q.current_stage}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center bg-white">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">
                  No check-ins yet today
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Patients will appear here once they check in
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Stat Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader className="border-b pb-4">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl">
                  {selectedStat?.title}
                </SheetTitle>
                <SheetDescription>{selectedStat?.description}</SheetDescription>
              </div>
              <Badge variant="secondary" className="text-lg px-3 py-1">
                {selectedStat?.patients.length || 0}
              </Badge>
            </div>
          </SheetHeader>

          <div className="mt-6">
            {selectedStat?.patients.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                  <Users className="h-8 w-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">
                  No patients found
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  There are no patients in this category
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[calc(100vh-200px)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>File No.</TableHead>
                      <TableHead>Patient Name</TableHead>
                      <TableHead>Age/Gender</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedStat?.patients.map(({ patient, visit }) => (
                      <TableRow key={patient.id} className="hover:bg-muted/50">
                        <TableCell className="font-medium text-primary">
                          {patient.file_number}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">
                                {patient.full_name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .slice(0, 2)}
                              </span>
                            </div>
                            {patient.full_name}
                          </div>
                        </TableCell>
                        <TableCell>
                          {calculateAge(patient.date_of_birth)}y /{" "}
                          {patient.gender === "male"
                            ? "M"
                            : patient.gender === "female"
                              ? "F"
                              : "O"}
                        </TableCell>
                        <TableCell>{patient.phone}</TableCell>
                        <TableCell>
                          {visit ? (
                            <Badge
                              variant="outline"
                              className={`capitalize
                                ${
                                  visit.current_stage === "completed"
                                    ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                    : visit.current_stage === "counsellor"
                                      ? "border-amber-500 text-amber-700 bg-amber-50"
                                      : visit.current_stage === "doctor"
                                        ? "border-indigo-500 text-indigo-700 bg-indigo-50"
                                        : visit.current_stage === "pharmacy"
                                          ? "border-rose-500 text-rose-700 bg-rose-50"
                                          : ""
                                }`}
                            >
                              {visit.current_stage}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`capitalize
                              ${
                                patient.status === "active"
                                  ? "border-emerald-500 text-emerald-700 bg-emerald-50"
                                  : "border-gray-500 text-gray-700 bg-gray-50"
                              }`}
                            >
                              {patient.status}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <ReceptionAttendanceDialog
        open={attendanceOpen}
        date={today}
        onOpenChange={setAttendanceOpen}
        onSubmitted={(submission) => setTodaySubmission(submission)}
      />
    </div>
  );
}

// Reception's daily staff-attendance entry. Marks **today** only, **once** —
// after submission the day is locked (read-only here); corrections are an admin
// task. The submitting user + their auth role are recorded server-side.
function ReceptionAttendanceDialog({
  open,
  date,
  onOpenChange,
  onSubmitted,
}: {
  open: boolean;
  date: string;
  onOpenChange: (open: boolean) => void;
  onSubmitted: (submission: AttendanceDaySubmission) => void;
}) {
  const [roster, setRoster] = useState<AttendanceRosterItem[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [submission, setSubmission] = useState<AttendanceDaySubmission | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    getAttendanceRoster(date)
      .then((data) => {
        setRoster(data.items);
        setSubmission(data.submission);
        const initial: Record<string, AttendanceStatus> = {};
        data.items.forEach((it) => {
          initial[it.staff_id] = it.status ?? "present";
        });
        setMarks(initial);
      })
      .catch((error) => toastApiError(error, "Failed to load roster"))
      .finally(() => setIsLoading(false));
  }, [open, date]);

  const locked = submission !== null;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await bulkMarkAttendance(
        date,
        roster.map((it) => ({ staff_id: it.staff_id, status: marks[it.staff_id] })),
      );
      toast.success("Attendance submitted for today");
      if (result.submission) {
        setSubmission(result.submission);
        onSubmitted(result.submission);
      }
      onOpenChange(false);
    } catch (error) {
      toastApiError(error, "Failed to submit attendance");
    } finally {
      setIsSaving(false);
    }
  };

  const cycle: { value: AttendanceStatus; label: string; cls: string }[] = [
    { value: "present", label: "P", cls: "bg-emerald-600" },
    { value: "absent", label: "A", cls: "bg-rose-600" },
    { value: "half_day", label: "½", cls: "bg-amber-500" },
  ];

  const prettyTime = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Mark Today&apos;s Attendance
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            {new Date(date).toLocaleDateString("en-IN", {
              weekday: "long",
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
            . Attendance can be submitted only once per day; corrections are made
            by an admin.
          </DialogDescription>
        </DialogHeader>

        {locked && submission && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <Lock className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Already submitted today by{" "}
              <span className="font-bold">{submission.submitted_by_name || "—"}</span>{" "}
              <span className="capitalize">({submission.submitted_by_role})</span> at{" "}
              {prettyTime(submission.submitted_at)}. This is read-only — ask an
              admin to make corrections.
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : roster.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No active staff.</p>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {roster.map((it) => (
              <div
                key={it.staff_id}
                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{it.full_name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {it.staff_code} · {it.designation}
                  </p>
                </div>
                <div className="flex gap-1">
                  {cycle.map((opt) => {
                    const selected = (marks[it.staff_id] ?? it.status) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        disabled={locked}
                        onClick={() =>
                          setMarks((prev) => ({ ...prev, [it.staff_id]: opt.value }))
                        }
                        className={`h-8 w-8 rounded-lg text-xs font-black transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
                          selected
                            ? `${opt.cls} text-white shadow-sm`
                            : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"
                        }`}
                        title={opt.value}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            className="rounded-xl border-slate-200"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Close
          </Button>
          {!locked && (
            <Button
              onClick={handleSave}
              disabled={isSaving || roster.length === 0}
              className="bg-primary hover:bg-primary-dark text-white rounded-xl"
            >
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Attendance
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
