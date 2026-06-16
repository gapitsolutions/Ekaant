"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import {
  Briefcase,
  CalendarCheck,
  CreditCard,
  Download,
  FileText,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Search,
  Shield,
  ShieldCheck,
  ShieldOff,
  User,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import {
  bulkMarkAttendance,
  createStaff,
  deactivateStaff,
  generateStaffPayslip,
  getAttendanceRoster,
  getStaff,
  getStaffMonthAttendance,
  getStaffPayroll,
  getStaffSummary,
  listDesignations,
  listStaff,
  listStaffPayslips,
  markStaffAttendance,
  updateStaff,
  type AttendanceRosterItem,
  type AttendanceStatus,
  type Designation,
  type EmploymentType,
  type MonthAttendance,
  type PayrollPreview,
  type Payslip,
  type StaffDetail,
  type StaffListItem,
  type StaffSummary,
  type StaffWritePayload,
} from "@/lib/staff-api";
import { generatePayslipPdf } from "@/lib/export/generatePayslipPdf";
import { toastApiError, useApiErrors } from "@/lib/api-errors";
import { FieldError } from "@/components/ui/field-error";
import { ListPagination } from "@/components/ui/list-pagination";

const EMPLOYMENT_TYPES: { value: EmploymentType; label: string }[] = [
  { value: "permanent", label: "Permanent" },
  { value: "locum", label: "Locum" },
  { value: "contract", label: "Contract" },
];

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function StaffManagementPage() {
  const STAFF_PAGE_SIZE = 50;
  const [items, setItems] = useState<StaffListItem[]>([]);
  const [designations, setDesignations] = useState<Designation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [designationFilter, setDesignationFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    "active",
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffDetail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [consoleRefreshKey, setConsoleRefreshKey] = useState(0);
  const [summary, setSummary] = useState<StaffSummary | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<StaffListItem | null>(
    null,
  );

  const load = useCallback(
    async (overrides?: { page?: number }) => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const data = await listStaff({
          q: searchQuery || undefined,
          designation: designationFilter === "all" ? undefined : designationFilter,
          status: statusFilter === "all" ? undefined : statusFilter,
          page: overrides?.page ?? 1,
          pageSize: STAFF_PAGE_SIZE,
        });
        setItems(data.items || []);
        setTotal(data.pagination.total);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load staff.",
        );
      } finally {
        setIsLoading(false);
      }
    },
    [searchQuery, designationFilter, statusFilter],
  );

  const loadDesignations = useCallback(async () => {
    try {
      const data = await listDesignations();
      setDesignations(data.items || []);
    } catch {
      /* non-fatal — the form falls back to free text */
    }
  }, []);

  // KPI cards come from the dedicated aggregate (not the paginated list).
  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getStaffSummary());
    } catch {
      /* non-fatal — the cards just stay blank */
    }
  }, []);

  useEffect(() => {
    setPage(1);
    load({ page: 1 });
  }, [designationFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadDesignations();
    loadSummary();
  }, [loadDesignations, loadSummary]);

  const goToPage = (next: number) => {
    setPage(next);
    load({ page: next });
  };

  const openEdit = async (id: string) => {
    try {
      const detail = await getStaff(id);
      setEditTarget(detail);
    } catch (error) {
      toastApiError(error, "Failed to load staff record");
    }
  };

  const handleDeactivate = async () => {
    if (!deactivateTarget) return;
    try {
      await deactivateStaff(deactivateTarget.id);
      toast.success(`${deactivateTarget.full_name} deactivated.`);
      setDeactivateTarget(null);
      load();
      loadSummary();
    } catch (error) {
      toastApiError(error, "Failed to deactivate");
    }
  };

  const handleReactivate = async (s: StaffListItem) => {
    try {
      await updateStaff(s.id, { is_active: true });
      toast.success(`${s.full_name} reactivated.`);
      load();
      loadSummary();
    } catch (error) {
      toastApiError(error, "Failed to reactivate");
    }
  };

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-8 animate-in fade-in duration-500 pb-20">
      <PageHeader
        icon={<Users className="h-7 w-7 text-primary" />}
        title="Staff"
        subtitle="Employee directory and profiles. Distinct from login accounts — staff are HR records (designation, payroll, contact)."
        actions={
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setAttendanceOpen(true)}
              variant="outline"
              className="rounded-xl h-10 px-4 border-slate-200 font-bold flex items-center gap-2"
            >
              <CalendarCheck className="h-4 w-4 mr-1" /> Mark Attendance
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="bg-primary hover:bg-primary-dark text-white font-extrabold rounded-xl h-10 px-4 shadow-md flex items-center gap-2"
            >
              <Plus className="h-4 w-4 mr-2" /> Add Staff
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StaffKpiCard
          label="Total Staff"
          value={summary ? summary.total : "—"}
          hint="All employee records"
          icon={<Users className="h-5 w-5" />}
          tone="slate"
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <StaffKpiCard
          label="Active"
          value={summary ? summary.active : "—"}
          hint="Currently employed"
          icon={<ShieldCheck className="h-5 w-5" />}
          tone="emerald"
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <StaffKpiCard
          label="Inactive"
          value={summary ? summary.inactive : "—"}
          hint="Deactivated records"
          icon={<ShieldOff className="h-5 w-5" />}
          tone="rose"
          active={statusFilter === "inactive"}
          onClick={() => setStatusFilter("inactive")}
        />
        <StatCard label="Designations" value={designations.length} icon={<Briefcase className="h-5 w-5" />} tone="blue" />
      </div>

      <Card className="rounded-2xl border-slate-100 shadow-sm bg-white overflow-hidden">
        <CardHeader className="bg-slate-50/30 border-b border-slate-100 py-5 px-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold text-slate-800">Directory</CardTitle>
            <div className="flex flex-wrap gap-2">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setPage(1);
                  load({ page: 1 });
                }}
                className="relative"
              >
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name / code / mobile"
                  className="pl-8 w-full sm:w-64 bg-slate-50 border-slate-200 rounded-xl"
                />
              </form>
              <Select value={designationFilter} onValueChange={setDesignationFilter}>
                <SelectTrigger className="w-[160px] rounded-xl border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Designation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All designations</SelectItem>
                  {designations.map((d) => (
                    <SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[130px] rounded-xl border-slate-200 bg-slate-50">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {errorMessage && (
            <div className="flex items-center gap-2 text-sm text-rose-600 border border-rose-200 bg-rose-50 rounded-xl px-4 py-3 mb-4">
              <Shield className="h-4 w-4" /> {errorMessage}
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              className="py-24"
              icon={
                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center">
                  <Users className="h-7 w-7 text-slate-300" />
                </div>
              }
              title="No staff found"
              description="No staff match the current filters."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/50">
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Staff</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Designation</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Employment</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Contact</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500">Status</TableHead>
                    <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-500 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id} className="hover:bg-slate-50/50">
                      <TableCell className="py-4 px-4">
                        <button
                          type="button"
                          onClick={() => setSelectedId(s.id)}
                          className="text-left font-bold text-primary hover:underline"
                        >
                          {s.full_name}
                        </button>
                        <div className="text-xs text-slate-400 font-mono">{s.staff_code}</div>
                      </TableCell>
                      <TableCell className="py-4 px-4">
                        <Badge variant="outline" className="border-slate-200 text-slate-600 text-[10px] font-bold uppercase">
                          {s.designation}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-4 px-4 text-sm text-slate-600 capitalize">{s.employment_type}</TableCell>
                      <TableCell className="py-4 px-4 text-sm">
                        {s.mobile_number ? <div className="font-mono text-slate-700">{s.mobile_number}</div> : <span className="text-slate-300">—</span>}
                        {s.email && <div className="text-xs text-slate-400">{s.email}</div>}
                      </TableCell>
                      <TableCell className="py-4 px-4">
                        {s.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-700 border border-emerald-200 text-[10px] font-bold uppercase">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="border-red-200 text-red-600 bg-red-50 text-[10px] font-bold uppercase">Inactive</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4 px-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="rounded-lg hover:bg-slate-100" onClick={() => void openEdit(s.id)} title="Edit">
                            <Pencil className="h-4 w-4 text-slate-500" />
                          </Button>
                          {s.is_active ? (
                            <Button variant="ghost" size="icon" className="rounded-lg hover:bg-rose-50" onClick={() => setDeactivateTarget(s)} title="Deactivate">
                              <ShieldOff className="h-4 w-4 text-rose-600" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="rounded-lg hover:bg-emerald-50" onClick={() => void handleReactivate(s)} title="Reactivate">
                              <ShieldCheck className="h-4 w-4 text-emerald-600" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <ListPagination
                page={page}
                pageSize={STAFF_PAGE_SIZE}
                total={total}
                noun="staff member"
                onPrev={() => goToPage(page - 1)}
                onNext={() => goToPage(page + 1)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <StaffConsoleModal
        staffId={selectedId}
        refreshKey={consoleRefreshKey}
        onClose={() => setSelectedId(null)}
        onEdit={(detail) => setEditTarget(detail)}
        onChanged={() => {
          load();
          loadSummary();
        }}
      />

      <DailyAttendanceDialog open={attendanceOpen} onOpenChange={setAttendanceOpen} />

      <StaffFormDialog
        open={createOpen}
        designations={designations}
        onOpenChange={setCreateOpen}
        onSaved={() => {
          setCreateOpen(false);
          load();
          loadDesignations();
          loadSummary();
        }}
      />
      <StaffFormDialog
        open={editTarget !== null}
        existing={editTarget}
        designations={designations}
        onOpenChange={(o) => {
          if (!o) setEditTarget(null);
        }}
        onSaved={() => {
          setEditTarget(null);
          load();
          loadDesignations();
          loadSummary();
          // Refresh the open console too, if any.
          setConsoleRefreshKey((k) => k + 1);
        }}
      />

      <Dialog open={deactivateTarget !== null} onOpenChange={(o) => !o && setDeactivateTarget(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-slate-800">Deactivate staff?</DialogTitle>
            <DialogDescription className="text-slate-500">
              {deactivateTarget?.full_name} will be marked inactive. Attendance
              and payroll history are preserved. You can reactivate any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => setDeactivateTarget(null)}>Cancel</Button>
            <Button onClick={handleDeactivate} className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl">
              <ShieldOff className="h-4 w-4 mr-2" /> Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "slate" | "emerald" | "rose" | "blue";
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-600",
    emerald: "bg-emerald-100 text-emerald-600",
    rose: "bg-rose-100 text-rose-600",
    blue: "bg-blue-100 text-blue-600",
  };
  return (
    <Card className="rounded-2xl border-slate-100 shadow-sm bg-white">
      <CardContent className="p-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="text-3xl font-extrabold text-slate-900 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-2xl ${tones[tone]}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

const STAFF_KPI_TONES = {
  slate: { ring: "ring-slate-400/20 border-slate-200 bg-slate-50/60", value: "text-slate-900", iconActive: "bg-slate-700 text-white" },
  emerald: { ring: "ring-emerald-500/20 border-emerald-200 bg-emerald-50/60", value: "text-emerald-600", iconActive: "bg-emerald-600 text-white" },
  rose: { ring: "ring-rose-500/20 border-rose-200 bg-rose-50/60", value: "text-rose-600", iconActive: "bg-rose-600 text-white" },
} as const;

function StaffKpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: keyof typeof STAFF_KPI_TONES;
  active: boolean;
  onClick: () => void;
}) {
  const t = STAFF_KPI_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left rounded-2xl border shadow-sm transition-all hover:scale-[1.01] hover:shadow-md ${
        active ? `ring-2 ${t.ring}` : "bg-white border-slate-100 opacity-80 hover:opacity-100"
      }`}
    >
      <div className="p-6 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className={`text-3xl font-extrabold mt-1 ${active ? t.value : "text-slate-900"}`}>{value}</p>
          <p className="text-xs text-slate-400 font-medium pt-1">{hint}</p>
        </div>
        <div className={`p-3 rounded-2xl transition-all ${active ? t.iconActive : "bg-slate-50 text-slate-600"}`}>{icon}</div>
      </div>
    </button>
  );
}

type ConsoleTab = "profile" | "attendance" | "salary" | "records";

const CONSOLE_TABS: { id: ConsoleTab; label: string; icon: React.ReactNode }[] = [
  { id: "profile", label: "Profile", icon: <User className="h-4 w-4" /> },
  { id: "attendance", label: "Attendance", icon: <CalendarCheck className="h-4 w-4" /> },
  { id: "salary", label: "Salary", icon: <Wallet className="h-4 w-4" /> },
  { id: "records", label: "Salary Records", icon: <Receipt className="h-4 w-4" /> },
];

function StaffConsoleModal({
  staffId,
  refreshKey,
  onClose,
  onEdit,
  onChanged,
}: {
  staffId: string | null;
  refreshKey: number;
  onClose: () => void;
  onEdit: (detail: StaffDetail) => void;
  onChanged: () => void;
}) {
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState<ConsoleTab>("profile");
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  useEffect(() => {
    if (!staffId) return;
    let cancelled = false;
    setIsLoading(true);
    setTab("profile");
    getStaff(staffId)
      .then((d) => !cancelled && setStaff(d))
      .catch((e) => !cancelled && toastApiError(e, "Failed to load staff"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [staffId, refreshKey]);

  const refreshStaff = async () => {
    if (!staffId) return;
    try {
      setStaff(await getStaff(staffId));
    } catch {
      /* keep stale copy */
    }
  };

  const toggleActive = async () => {
    if (!staff) return;
    setIsTogglingActive(true);
    try {
      if (staff.is_active) {
        await deactivateStaff(staff.id);
        toast.success(`${staff.full_name} deactivated.`);
      } else {
        await updateStaff(staff.id, { is_active: true });
        toast.success(`${staff.full_name} reactivated.`);
      }
      await refreshStaff();
      onChanged();
    } catch (error) {
      toastApiError(error, "Failed to update status");
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <Dialog open={staffId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl w-[96vw] rounded-2xl p-0 overflow-hidden max-h-[92vh] flex flex-col gap-0">
        {isLoading || !staff ? (
          <div className="flex items-center justify-center py-32">
            <Spinner className="h-6 w-6 text-primary" />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 text-white shrink-0">
              <DialogTitle className="sr-only">{staff.full_name}</DialogTitle>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                    {staff.photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={staff.photo_url} alt={staff.full_name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="h-8 w-8 text-slate-300" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h1 className="text-2xl font-extrabold tracking-tight">{staff.full_name}</h1>
                      {staff.is_active ? (
                        <Badge className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 text-[10px] font-bold uppercase">Active</Badge>
                      ) : (
                        <Badge className="bg-rose-500/20 text-rose-200 border border-rose-400/30 text-[10px] font-bold uppercase">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mt-1">
                      <span className="font-mono">{staff.staff_code}</span> · {staff.designation} · <span className="capitalize">{staff.employment_type}</span>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => onEdit(staff)} variant="outline" className="rounded-xl border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                    <Pencil className="h-4 w-4 mr-2" /> Edit
                  </Button>
                  <Button
                    onClick={toggleActive}
                    disabled={isTogglingActive}
                    variant="ghost"
                    size="icon"
                    title={staff.is_active ? "Deactivate" : "Reactivate"}
                    className={`h-10 w-10 rounded-xl bg-white/5 border border-white/10 ${staff.is_active ? "text-slate-300 hover:text-rose-400 hover:bg-rose-500/10" : "text-slate-300 hover:text-emerald-300 hover:bg-emerald-500/10"}`}
                  >
                    {staff.is_active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* Premium tab nav */}
              <div className="flex gap-1 mt-6 overflow-x-auto">
                {CONSOLE_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                      tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-300 hover:bg-white/10"
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto bg-slate-50/40">
              {tab === "profile" && (
                <div className="grid gap-6 lg:grid-cols-2">
                  <DetailCard title="Personal & Contact" icon={<User className="h-4 w-4 text-primary" />}>
                    <Field label="Date of Birth" value={fmtDate(staff.date_of_birth)} />
                    <Field label="Gender" value={staff.gender || "—"} className="capitalize" />
                    <Field label="Mobile" value={staff.mobile_number || "—"} icon={<Phone className="h-3 w-3" />} />
                    <Field label="Email" value={staff.email || "—"} icon={<Mail className="h-3 w-3" />} />
                    <Field label="Joined" value={fmtDate(staff.joined_date)} />
                    <Field label="Gov. Registration" value={staff.gov_registration || "—"} />
                    <Field label="Address" value={staff.address || "—"} icon={<MapPin className="h-3 w-3" />} wide />
                  </DetailCard>

                  <DetailCard title="Employment & Payroll (confidential)" icon={<UserCog className="h-4 w-4 text-primary" />}>
                    <Field label="Monthly Salary" value={`₹${parseFloat(staff.monthly_salary).toLocaleString("en-IN")}`} />
                    <Field label="Paid Holidays / mo" value={String(staff.holiday_allowed)} />
                    <Field label="Sunday Holiday" value={staff.sunday_holiday ? "Yes" : "No"} />
                    <div className="col-span-2 border-t border-slate-100 my-1" />
                    <Field label="Aadhaar" value={staff.aadhaar_number || "—"} mono icon={<CreditCard className="h-3 w-3" />} />
                    <Field label="PAN" value={staff.pan_number || "—"} mono />
                    <Field label="Bank A/C" value={staff.bank_account_number || "—"} mono />
                    <Field label="IFSC" value={staff.bank_ifsc || "—"} mono />
                  </DetailCard>
                </div>
              )}

              {tab === "attendance" && <StaffAttendanceCard staffId={staff.id} />}

              {tab === "salary" && <StaffSalaryTab staff={staff} />}

              {tab === "records" && <StaffPayslipsTab staffId={staff.id} />}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StaffAttendanceCard({ staffId }: { staffId: string }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<MonthAttendance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [savingDate, setSavingDate] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setData(await getStaffMonthAttendance(staffId, month));
    } catch (error) {
      toastApiError(error, "Failed to load attendance");
    } finally {
      setIsLoading(false);
    }
  }, [staffId, month]);

  useEffect(() => {
    load();
  }, [load]);

  const [year, mon] = month.split("-").map(Number);
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstWeekday = new Date(year, mon - 1, 1).getDay();

  const cycle: AttendanceStatus[] = ["present", "absent", "half_day"];
  const tone: Record<AttendanceStatus, string> = {
    present: "bg-emerald-100 text-emerald-700 border-emerald-200",
    absent: "bg-rose-100 text-rose-700 border-rose-200",
    half_day: "bg-amber-100 text-amber-700 border-amber-200",
  };

  const handleDayClick = async (day: number) => {
    const dateStr = `${month}-${String(day).padStart(2, "0")}`;
    const current = data?.by_date[dateStr];
    // Cycle present → absent → half_day → present.
    const next: AttendanceStatus = current
      ? cycle[(cycle.indexOf(current) + 1) % cycle.length]
      : "present";
    setSavingDate(dateStr);
    try {
      await markStaffAttendance(staffId, dateStr, next);
      setData((prev) =>
        prev ? { ...prev, by_date: { ...prev.by_date, [dateStr]: next } } : prev,
      );
    } catch (error) {
      toastApiError(error, "Failed to mark attendance");
    } finally {
      setSavingDate(null);
    }
  };

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between px-4 py-3 bg-slate-50/50 gap-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-slate-900">Attendance</CardTitle>
        </div>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-9 w-[150px] bg-slate-50 border-slate-200 text-sm"
        />
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : (
          <>
            {data && (
              <div className="flex flex-wrap gap-3 mb-4 text-xs font-bold">
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">Present: {data.stats.present}</span>
                <span className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">Absent: {data.stats.absent}</span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">Half-day: {data.stats.half_day}</span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">Effective present: {data.stats.effective_present}</span>
              </div>
            )}
            <div className="grid grid-cols-7 gap-1.5">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center text-[10px] font-bold text-slate-400 uppercase py-1">{d}</div>
              ))}
              {Array.from({ length: firstWeekday }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = `${month}-${String(day).padStart(2, "0")}`;
                const st = data?.by_date[dateStr];
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => void handleDayClick(day)}
                    disabled={savingDate === dateStr}
                    title="Click to cycle present → absent → half-day"
                    className={`aspect-square rounded-lg border text-xs font-bold flex items-center justify-center transition-colors ${st ? tone[st] : "bg-slate-50 text-slate-400 border-slate-100 hover:border-slate-300"}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-400 mt-3">
              Click a day to cycle Present → Absent → Half-day. Use “Mark
              Attendance” on the directory to bulk-mark everyone for a date.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function rupee(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "₹0";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Shared helper — render a stored payslip snapshot to a PDF (client-side).
function downloadPayslipPdf(slip: Payslip) {
  void generatePayslipPdf({
    staff_name: slip.staff_name,
    staff_code: slip.staff_code,
    designation: slip.designation,
    year: slip.year,
    month: slip.month,
    monthly_salary: slip.monthly_salary,
    days_in_month: slip.days_in_month,
    sundays_in_month: slip.sundays_in_month,
    sunday_holiday: slip.sunday_holiday,
    holiday_allowed: slip.holiday_allowed,
    present_days: slip.present_days,
    absent_days: slip.absent_days,
    half_days: slip.half_days,
    paid_leave_used: slip.paid_leave_used,
    unpaid_absent: slip.unpaid_absent,
    per_day_rate: slip.per_day_rate,
    deduction: slip.deduction,
    net_pay: slip.net_pay,
    generated_by_name: slip.generated_by_name,
  });
}

// Salary tab — month picker → computed (preview) breakdown + generate snapshot.
function StaffSalaryTab({ staff }: { staff: StaffDetail }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setPreview(await getStaffPayroll(staff.id, month));
    } catch (error) {
      toastApiError(error, "Failed to load payroll");
    } finally {
      setIsLoading(false);
    }
  }, [staff.id, month]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const slip = await generateStaffPayslip(staff.id, month);
      toast.success("Payslip generated & saved to records");
      downloadPayslipPdf(slip);
    } catch (error) {
      toastApiError(error, "Failed to generate payslip");
    } finally {
      setIsGenerating(false);
    }
  };

  const rows: { label: string; value: string }[] = preview
    ? [
        { label: "Gross monthly salary", value: rupee(preview.monthly_salary) },
        { label: "Per-day rate", value: rupee(preview.per_day_rate) },
        { label: "Days in month", value: String(preview.days_in_month) },
        { label: "Present (incl. half-day)", value: preview.present_days },
        { label: "Absent", value: preview.absent_days },
        { label: "Paid leave used", value: preview.paid_leave_used },
        { label: "Unpaid absences", value: preview.unpaid_absent },
        { label: "Deduction", value: `- ${rupee(preview.deduction)}` },
      ]
    : [];

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 flex flex-row items-center justify-between px-4 py-3 bg-slate-50/50 gap-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-bold text-slate-900">Salary Computation</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 w-[150px] bg-slate-50 border-slate-200 text-sm"
          />
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || isLoading}
            className="h-9 bg-primary hover:bg-primary-dark text-white rounded-xl"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Generate Payslip
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : preview ? (
          <>
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-400">Computed net pay</p>
                <p className="text-2xl font-extrabold text-slate-900">{rupee(preview.net_pay)}</p>
              </div>
              <p className="text-[11px] text-slate-400 max-w-[16rem] text-right">
                Preview only — <span className="font-semibold">Generate Payslip</span> saves a snapshot to Salary Records.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {rows.map((r) => (
                <div key={r.label} className="rounded-xl border border-slate-100 bg-slate-50/50 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase text-slate-400">{r.label}</p>
                  <p className="text-sm font-bold text-slate-800">{r.value}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400 py-6 text-center">No payroll data.</p>
        )}
      </CardContent>
    </Card>
  );
}

// Salary Records tab — stored payslip history (audit; regenerable).
function StaffPayslipsTab({ staffId }: { staffId: string }) {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    listStaffPayslips(staffId)
      .then((d) => !cancelled && setPayslips(d.items))
      .catch((e) => !cancelled && toastApiError(e, "Failed to load payslips"))
      .finally(() => !cancelled && setIsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [staffId]);

  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2 px-4 py-3 bg-slate-50/50">
        <Receipt className="h-4 w-4 text-primary" />
        <CardTitle className="text-sm font-bold text-slate-900">Generated Payslips</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : payslips.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">
            No payslips generated yet. Use the Salary tab to generate one.
          </p>
        ) : (
          <div className="space-y-1.5">
            {payslips.map((slip) => (
              <div key={slip.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm">
                    {MONTH_LABELS[slip.month - 1]} {slip.year} · {rupee(slip.net_pay)}
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Generated {fmtDate(slip.generated_at)}
                    {slip.generated_by_name ? ` · ${slip.generated_by_name}` : ""}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadPayslipPdf(slip)}
                  className="h-8 rounded-lg border-slate-200 text-slate-600"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" /> PDF
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function DailyAttendanceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [date, setDate] = useState(new Date().toLocaleDateString("en-CA"));
  const [roster, setRoster] = useState<AttendanceRosterItem[]>([]);
  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const loadRoster = useCallback(async (forDate: string) => {
    setIsLoading(true);
    try {
      const data = await getAttendanceRoster(forDate);
      setRoster(data.items);
      const initial: Record<string, AttendanceStatus> = {};
      data.items.forEach((it) => {
        initial[it.staff_id] = it.status ?? "present";
      });
      setMarks(initial);
    } catch (error) {
      toastApiError(error, "Failed to load roster");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) void loadRoster(date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await bulkMarkAttendance(
        date,
        roster.map((it) => ({ staff_id: it.staff_id, status: marks[it.staff_id] })),
      );
      toast.success(`Attendance saved for ${date}`);
      onOpenChange(false);
    } catch (error) {
      toastApiError(error, "Failed to save attendance");
    } finally {
      setIsSaving(false);
    }
  };

  const cycle: { value: AttendanceStatus; label: string; cls: string }[] = [
    { value: "present", label: "P", cls: "bg-emerald-600" },
    { value: "absent", label: "A", cls: "bg-rose-600" },
    { value: "half_day", label: "½", cls: "bg-amber-500" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-primary" /> Mark Daily Attendance
          </DialogTitle>
          <DialogDescription className="text-slate-500">
            Set each active staff member&apos;s status for the selected date.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <Label className="text-xs font-bold text-slate-500 uppercase">Date</Label>
          <Input
            type="date"
            value={date}
            max={new Date().toLocaleDateString("en-CA")}
            onChange={(e) => {
              setDate(e.target.value);
              void loadRoster(e.target.value);
            }}
            className="h-9 w-[160px] bg-slate-50 border-slate-200"
          />
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="h-5 w-5 text-primary" />
          </div>
        ) : roster.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No active staff.</p>
        ) : (
          <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
            {roster.map((it) => (
              <div key={it.staff_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2">
                <div className="min-w-0">
                  <p className="font-bold text-slate-800 text-sm truncate">{it.full_name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{it.staff_code} · {it.designation}</p>
                </div>
                <div className="flex gap-1">
                  {cycle.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setMarks((prev) => ({ ...prev, [it.staff_id]: opt.value }))}
                      className={`h-8 w-8 rounded-lg text-xs font-black transition-all ${marks[it.staff_id] === opt.value ? `${opt.cls} text-white shadow-sm` : "bg-white text-slate-400 border border-slate-200 hover:border-slate-300"}`}
                      title={opt.value}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={isSaving}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving || roster.length === 0} className="bg-primary hover:bg-primary-dark text-white rounded-xl">
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Attendance
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm bg-white">
      <CardHeader className="border-b border-slate-100 flex flex-row items-center gap-2 px-4 py-3 bg-slate-50/50">
        {icon}
        <CardTitle className="text-sm font-bold text-slate-900">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 grid grid-cols-2 gap-x-4 gap-y-3">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  value,
  icon,
  mono,
  wide,
  className,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  mono?: boolean;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className={wide ? "col-span-2" : ""}>
      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">{icon} {label}</p>
      <p className={`text-sm font-semibold text-slate-800 mt-0.5 ${mono ? "font-mono" : ""} ${className ?? ""}`}>{value}</p>
    </div>
  );
}

function StaffFormDialog({
  open,
  existing,
  designations,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  existing?: StaffDetail | null;
  designations: Designation[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const isEdit = existing != null;
  const blank: StaffWritePayload = {
    staff_code: "",
    full_name: "",
    designation: "",
    employment_type: "permanent",
    is_active: true,
    joined_date: new Date().toLocaleDateString("en-CA"),
    date_of_birth: "",
    gender: "",
    mobile_number: "",
    email: "",
    address: "",
    gov_registration: "",
    aadhaar_number: "",
    pan_number: "",
    bank_account_number: "",
    bank_ifsc: "",
    monthly_salary: "",
    holiday_allowed: 0,
    sunday_holiday: true,
  };
  const [form, setForm] = useState<StaffWritePayload>(blank);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Photo: preview is a data/remote URL; pendingPhoto holds the base64 to send.
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [pendingPhoto, setPendingPhoto] = useState<
    { base64: string; mime: string } | null
  >(null);
  const apiErrors = useApiErrors();

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Photo must be a JPEG or PNG image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Photo must be under 2 MB");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      setPhotoPreview(dataUrl);
      // Strip the "data:<mime>;base64," prefix — backend wants raw base64.
      setPendingPhoto({ base64: dataUrl.split(",")[1] ?? "", mime: file.type });
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    apiErrors.clear();
    setPendingPhoto(null);
    setPhotoPreview(existing?.photo_url ?? null);
    if (existing) {
      setForm({
        staff_code: existing.staff_code,
        full_name: existing.full_name,
        designation: existing.designation,
        employment_type: existing.employment_type,
        is_active: existing.is_active,
        joined_date: existing.joined_date ?? "",
        date_of_birth: existing.date_of_birth ?? "",
        gender: existing.gender,
        mobile_number: existing.mobile_number,
        email: existing.email,
        address: existing.address,
        gov_registration: existing.gov_registration,
        aadhaar_number: existing.aadhaar_number,
        pan_number: existing.pan_number,
        bank_account_number: existing.bank_account_number,
        bank_ifsc: existing.bank_ifsc,
        monthly_salary: existing.monthly_salary,
        holiday_allowed: existing.holiday_allowed,
        sunday_holiday: existing.sunday_holiday,
      });
    } else if (open) {
      setForm(blank);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, open]);

  const set = <K extends keyof StaffWritePayload>(k: K, v: StaffWritePayload[K]) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleSubmit = async () => {
    if (!form.staff_code.trim()) return toast.error("Staff code is required");
    if (!form.full_name.trim()) return toast.error("Full name is required");
    if (!form.designation.trim()) return toast.error("Designation is required");
    apiErrors.clear();
    setIsSubmitting(true);
    try {
      const payload: StaffWritePayload = {
        ...form,
        staff_code: form.staff_code.trim(),
        full_name: form.full_name.trim(),
        designation: form.designation.trim(),
        joined_date: form.joined_date || null,
        date_of_birth: form.date_of_birth || null,
        monthly_salary: form.monthly_salary === "" ? 0 : form.monthly_salary,
        ...(pendingPhoto
          ? { photo_base64: pendingPhoto.base64, photo_mime_type: pendingPhoto.mime }
          : {}),
      };
      if (isEdit && existing) {
        await updateStaff(existing.id, payload);
        toast.success("Staff updated");
      } else {
        await createStaff(payload);
        toast.success("Staff added");
      }
      onSaved();
    } catch (error) {
      apiErrors.setFromError(error);
      toastApiError(error, isEdit ? "Failed to update staff" : "Failed to add staff");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[95vw] rounded-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-slate-800">{isEdit ? "Edit Staff" : "Add Staff"}</DialogTitle>
          <DialogDescription className="text-slate-500">
            Required: staff code, name, designation. Confidential fields are
            admin-only and masked in lists.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {photoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoPreview} alt="Staff photo" className="w-full h-full object-cover" />
            ) : (
              <User className="h-9 w-9 text-slate-300" />
            )}
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-600 uppercase">Profile Photo</Label>
            <p className="text-[11px] text-slate-400 mb-1.5">JPEG or PNG, up to 2 MB.</p>
            <input
              id="staff-photo-input"
              type="file"
              accept="image/jpeg,image/png"
              onChange={handlePhotoChange}
              className="hidden"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl border-slate-200"
              onClick={() => document.getElementById("staff-photo-input")?.click()}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" /> {photoPreview ? "Change photo" : "Upload photo"}
            </Button>
          </div>
        </div>

        <Section title="Identity & Role">
          <FormField label="Staff Code *">
            <Input value={form.staff_code} onChange={(e) => set("staff_code", e.target.value)} className="bg-slate-50 border-slate-200 font-mono" placeholder="e.g. S001" />
            <FieldError message={apiErrors.get("staff_code")} />
          </FormField>
          <FormField label="Full Name *">
            <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} className="bg-slate-50 border-slate-200" />
            <FieldError message={apiErrors.get("full_name")} />
          </FormField>
          <FormField label="Designation *">
            <Input
              value={form.designation}
              onChange={(e) => set("designation", e.target.value)}
              list="staff-designations"
              className="bg-slate-50 border-slate-200"
              placeholder="Pick or type a new one"
            />
            <datalist id="staff-designations">
              {designations.map((d) => (
                <option key={d.id} value={d.name} />
              ))}
            </datalist>
            <FieldError message={apiErrors.get("designation")} />
          </FormField>
          <FormField label="Employment Type">
            <Select value={form.employment_type} onValueChange={(v) => set("employment_type", v as EmploymentType)}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue /></SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Joined Date">
            <Input type="date" value={form.joined_date ?? ""} onChange={(e) => set("joined_date", e.target.value)} className="bg-slate-50 border-slate-200" />
          </FormField>
          <FormField label="Gov. Registration">
            <Input value={form.gov_registration} onChange={(e) => set("gov_registration", e.target.value)} className="bg-slate-50 border-slate-200" />
          </FormField>
        </Section>

        <Section title="Personal & Contact">
          <FormField label="Date of Birth">
            <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => set("date_of_birth", e.target.value)} className="bg-slate-50 border-slate-200" />
          </FormField>
          <FormField label="Gender">
            <Select value={form.gender || "unset"} onValueChange={(v) => set("gender", v === "unset" ? "" : (v as StaffWritePayload["gender"]))}>
              <SelectTrigger className="bg-slate-50 border-slate-200"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unset">—</SelectItem>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Mobile">
            <Input value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} className="bg-slate-50 border-slate-200" />
          </FormField>
          <FormField label="Email">
            <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="bg-slate-50 border-slate-200" />
            <FieldError message={apiErrors.get("email")} />
          </FormField>
          <FormField label="Address" wide>
            <Textarea value={form.address} onChange={(e) => set("address", e.target.value)} rows={2} className="bg-slate-50 border-slate-200" />
          </FormField>
        </Section>

        <Section title="Confidential — Payroll & Bank">
          <FormField label="Monthly Salary (₹)">
            <Input type="number" value={form.monthly_salary} onChange={(e) => set("monthly_salary", e.target.value)} className="bg-slate-50 border-slate-200" />
          </FormField>
          <FormField label="Paid Holidays / month">
            <Input type="number" value={form.holiday_allowed} onChange={(e) => set("holiday_allowed", parseInt(e.target.value) || 0)} className="bg-slate-50 border-slate-200" />
          </FormField>
          <FormField label="Aadhaar Number">
            <Input value={form.aadhaar_number} onChange={(e) => set("aadhaar_number", e.target.value)} className="bg-slate-50 border-slate-200 font-mono" />
          </FormField>
          <FormField label="PAN Number">
            <Input value={form.pan_number} onChange={(e) => set("pan_number", e.target.value)} className="bg-slate-50 border-slate-200 font-mono" />
          </FormField>
          <FormField label="Bank Account No.">
            <Input value={form.bank_account_number} onChange={(e) => set("bank_account_number", e.target.value)} className="bg-slate-50 border-slate-200 font-mono" />
          </FormField>
          <FormField label="IFSC">
            <Input value={form.bank_ifsc} onChange={(e) => set("bank_ifsc", e.target.value)} className="bg-slate-50 border-slate-200 font-mono" />
          </FormField>
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600 col-span-2">
            <input type="checkbox" checked={form.sunday_holiday} onChange={(e) => set("sunday_holiday", e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
            Sunday is a paid holiday
          </label>
        </Section>

        <DialogFooter>
          <Button variant="outline" className="rounded-xl border-slate-200" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting} className="bg-primary hover:bg-primary-dark text-white rounded-xl">
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save changes" : "Add staff"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function FormField({
  label,
  wide,
  children,
}: {
  label: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`space-y-1.5 ${wide ? "col-span-2" : ""}`}>
      <Label className="text-xs font-bold text-slate-500 uppercase">{label}</Label>
      {children}
    </div>
  );
}
