"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  MapPin,
  FileText,
  Eye,
  X,
} from "lucide-react";

interface StatData {
  title: string;
  description: string;
  patients: Array<{
    patient: Patient;
    visit?: Visit;
  }>;
}

interface DashboardVisitItem extends QueueItem {
  file_number?: string;
  date_of_birth?: string;
  gender?: "male" | "female" | "other";
  phone?: string;
}

export default function ReceptionDashboard() {
  const { accessToken } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [todayVisitItems, setTodayVisitItems] = useState<DashboardVisitItem[]>(
    [],
  );
  const [selectedStat, setSelectedStat] = useState<StatData | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientDetailOpen, setPatientDetailOpen] = useState(false);

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

  const handleViewPatient = (patient: Patient) => {
    setSelectedPatient(patient);
    setPatientDetailOpen(true);
  };

  const quickActions = [
    {
      title: "Patient Check-in",
      description: "Scan fingerprint to check in a patient",
      href: "/reception/checkin",
      icon: Fingerprint,
      gradient: "from-primary/20 to-primary/5",
      iconBg: "bg-primary/15",
      iconColor: "text-primary",
    },
    {
      title: "Register New Patient",
      description: "Add a new patient to the system",
      href: "/reception/register",
      icon: UserPlus,
      gradient: "from-emerald-500/20 to-emerald-500/5",
      iconBg: "bg-emerald-500/15",
      iconColor: "text-emerald-600",
    },
    {
      title: "Patient Data",
      description: "View and edit all patient records",
      href: "/reception/patients",
      icon: Database,
      gradient: "from-sky-500/20 to-sky-500/5",
      iconBg: "bg-sky-500/15",
      iconColor: "text-sky-600",
    },
    {
      title: "Reports",
      description: "View daily, monthly and custom reports",
      href: "/reception/reports",
      icon: BarChart3,
      gradient: "from-indigo-500/20 to-indigo-500/5",
      iconBg: "bg-indigo-500/15",
      iconColor: "text-indigo-600",
    },
    {
      title: "Follow-Up Calls",
      description: "Track pending, completed and successful follow-ups",
      href: "/reception/follow-up",
      icon: Phone,
      gradient: "from-pink-500/20 to-pink-500/5",
      iconBg: "bg-pink-500/15",
      iconColor: "text-pink-600",
    },
  ];

  const statCards = stats
    ? [
        {
          title: "Today's Visits",
          value: stats.todayVisits,
          icon: Clock,
          gradient: "from-sky-500 to-sky-600",
          trend: "+5%",
          statType: "today_visits",
        },
        {
          title: "Completed Today",
          value: stats.completedToday,
          icon: CheckCircle,
          gradient: "from-emerald-500 to-emerald-600",
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
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Reception Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Manage patient check-ins and registrations
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </div>
      </div>

      {/* Stats Overview - Now Clickable Buttons */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2">
        {statCards.map((stat) => (
          <button
            key={stat.title}
            onClick={() => handleStatClick(stat.statType)}
            className="text-left"
          >
            <Card className="overflow-hidden border-0 shadow-md hover:shadow-xl transition-all duration-300 hover:scale-105 cursor-pointer group">
              <div className={`h-1.5 bg-gradient-to-r ${stat.gradient}`} />
              <CardContent className="p-4 min-h-[132px] flex flex-col justify-between">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-3xl font-bold group-hover:text-primary transition-colors">
                      {stat.value}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {stat.title}
                    </p>
                  </div>
                  <div
                    className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} text-white group-hover:scale-110 transition-transform`}
                  >
                    <stat.icon className="h-4 w-4" />
                  </div>
                </div>
                {stat.trend && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-emerald-600">
                    <TrendingUp className="h-3 w-3" />
                    {stat.trend} from last week
                  </div>
                )}
                {!stat.trend && <div className="h-[18px] mt-2" />}
                <div className="flex items-center gap-1 mt-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  <Eye className="h-3 w-3" />
                  Click to view details
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Card
              key={action.href}
              className={`group hover:shadow-lg transition-all duration-300 border-0 shadow-md bg-gradient-to-br ${action.gradient} overflow-hidden`}
            >
              <CardHeader className="pb-3">
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${action.iconBg} group-hover:scale-110 transition-transform duration-300`}
                >
                  <action.icon className={`h-6 w-6 ${action.iconColor}`} />
                </div>
              </CardHeader>
              <CardContent>
                <CardTitle className="text-base mb-1 group-hover:text-primary transition-colors">
                  {action.title}
                </CardTitle>
                <CardDescription className="text-sm mb-4 line-clamp-2">
                  {action.description}
                </CardDescription>
                <Button
                  asChild
                  variant="ghost"
                  className="p-0 h-auto group-hover:translate-x-1 transition-transform"
                >
                  <span
                    onClick={() => navigate(action.href)}
                    className="flex items-center gap-1 text-primary font-medium cursor-pointer"
                  >
                    View <ArrowRight className="h-4 w-4" />
                  </span>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <Card className="border-0 shadow-md">
        <CardHeader className="border-b bg-muted/30">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Recent Check-ins</CardTitle>
              <CardDescription>Patients checked in today</CardDescription>
            </div>
            <Button asChild variant="outline" size="sm">
              <span
                onClick={() => navigate("/reception/queue")}
                className="cursor-pointer"
              >
                View All
              </span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {stats && stats.todayVisits > 0 ? (
            <div className="divide-y">
              {queueItems.slice(0, 5).map((q) => {
                if (!q.patient_name) return null;
                return (
                  <div
                    key={q.session_id}
                    className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">
                          {q.patient_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium">{q.patient_name}</p>
                        <p className="text-sm text-muted-foreground">
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
                      className={`text-sm px-3 py-1 rounded-full font-medium capitalize
                      ${
                        q.current_stage === "completed"
                          ? "bg-emerald-100 text-emerald-700"
                          : q.current_stage === "counsellor"
                            ? "bg-amber-100 text-amber-700"
                            : q.current_stage === "doctor"
                              ? "bg-indigo-100 text-indigo-700"
                              : q.current_stage === "pharmacy"
                                ? "bg-rose-100 text-rose-700"
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
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">
                No check-ins yet today
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Patients will appear here once they check in
              </p>
              <Button asChild className="mt-4">
                <span
                  onClick={() => navigate("/reception/checkin")}
                  className="cursor-pointer"
                >
                  Start Check-in
                </span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
                      <TableHead className="text-right">Action</TableHead>
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
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewPatient(patient)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
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

      {/* Patient Detail Sheet */}
      <Sheet open={patientDetailOpen} onOpenChange={setPatientDetailOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Patient Details
            </SheetTitle>
            <SheetDescription>
              Complete information for {selectedPatient?.full_name}
            </SheetDescription>
          </SheetHeader>

          {selectedPatient && (
            <ScrollArea className="h-[calc(100vh-120px)] mt-6">
              <div className="space-y-6 pr-4">
                {/* Basic Info */}
                <div className="flex items-center gap-4 p-4 bg-primary/5 rounded-lg">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xl font-bold text-primary">
                      {selectedPatient.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">
                      {selectedPatient.full_name}
                    </h3>
                    <p className="text-primary font-medium">
                      {selectedPatient.file_number}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {calculateAge(selectedPatient.date_of_birth)} years,{" "}
                      {selectedPatient.gender}
                    </p>
                  </div>
                </div>

                {/* Contact Information */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    Contact Information
                  </h4>
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Phone</p>
                        <p className="font-medium">{selectedPatient.phone}</p>
                      </div>
                    </div>
                    {selectedPatient.email && (
                      <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-lg">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm text-muted-foreground">Email</p>
                          <p className="font-medium">{selectedPatient.email}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div>
                        <p className="text-sm text-muted-foreground">Address</p>
                        <p className="font-medium">
                          {selectedPatient.address}, {selectedPatient.city},{" "}
                          {selectedPatient.state} - {selectedPatient.pincode}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Medical Information */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    Medical Information
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Blood Group
                      </p>
                      <p className="font-medium">
                        {selectedPatient.blood_group || "Not specified"}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Addiction Type
                      </p>
                      <p className="font-medium capitalize">
                        {selectedPatient.addiction_type}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        Addiction Duration
                      </p>
                      <p className="font-medium">
                        {selectedPatient.addiction_duration}
                      </p>
                    </div>
                    <div className="p-3 bg-muted/30 rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        First Visit
                      </p>
                      <p className="font-medium">
                        {new Date(
                          selectedPatient.first_visit_date,
                        ).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                    Emergency Contact
                  </h4>
                  <div className="p-4 bg-rose-50 border border-rose-200 rounded-lg">
                    <p className="font-medium">
                      {selectedPatient.emergency_contact_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedPatient.emergency_contact_relation}
                    </p>
                    <p className="text-sm font-medium text-rose-600 mt-1">
                      {selectedPatient.emergency_contact_phone}
                    </p>
                  </div>
                </div>

                {/* Medical History */}
                {(selectedPatient.medical_history ||
                  selectedPatient.allergies ||
                  selectedPatient.family_history) && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                      Medical History
                    </h4>
                    <div className="space-y-3">
                      {selectedPatient.medical_history && (
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            Medical History
                          </p>
                          <p className="font-medium">
                            {selectedPatient.medical_history}
                          </p>
                        </div>
                      )}
                      {selectedPatient.allergies && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <p className="text-sm text-amber-600">Allergies</p>
                          <p className="font-medium text-amber-800">
                            {selectedPatient.allergies}
                          </p>
                        </div>
                      )}
                      {selectedPatient.family_history && (
                        <div className="p-3 bg-muted/30 rounded-lg">
                          <p className="text-sm text-muted-foreground">
                            Family History
                          </p>
                          <p className="font-medium">
                            {selectedPatient.family_history}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button asChild className="flex-1">
                    <span
                      onClick={() => navigate("/reception/patients")}
                      className="cursor-pointer"
                    >
                      Edit Patient
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPatientDetailOpen(false)}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </ScrollArea>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
