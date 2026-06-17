"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  getPatientsList,
  getDashboardStats,
  getReceptionDailyReport,
  getReceptionMonthlyReport,
  type DashboardStatsResponse,
  type DailyReportResponse,
  type ReportVisitItem,
  type PatientLookupResponse,
} from '@/lib/hms-api';
import {
  getInventoryStats,
  getRevenueReport,
  getLowStockReport,
  getExpiryReport,
  type InventoryStats,
  type LowStockReportItem,
  type ExpiryReportRow,
} from '@/lib/pharmacy-api';
import { getStaffSummary, type StaffSummary } from '@/lib/staff-api';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatientFlowTracker, type PatientFlowCounts } from "@/components/patient-flow-tracker";
import { AnalyticsCards } from "@/components/analytics-cards";
import { BRANDING } from "@/lib/branding";
import { PageHeader } from "@/components/ui/page-header";
import {
  Users,
  UserCheck,
  Pill,
  TrendingUp,
  Calendar,
  Activity,
  AlertTriangle,
  Clock,
  LayoutDashboard,
} from "lucide-react";

function inr(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) || 0 : value;
  return `₹${n.toLocaleString("en-IN")}`;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export default function AdminDashboard() {
  const { accessToken } = useAuth();

  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [dailyReport, setDailyReport] = useState<DailyReportResponse | null>(null);
  const [monthBreakdown, setMonthBreakdown] = useState<{ day: number; count: number }[]>([]);
  const [inventory, setInventory] = useState<InventoryStats | null>(null);
  const [monthRevenue, setMonthRevenue] = useState<string>("0");
  const [lowStock, setLowStock] = useState<LowStockReportItem[]>([]);
  const [nearExpiry, setNearExpiry] = useState<ExpiryReportRow[]>([]);
  const [staffSummary, setStaffSummary] = useState<StaffSummary | null>(null);
  const [recentPatients, setRecentPatients] = useState<PatientLookupResponse[]>([]);

  useEffect(() => {
    if (!accessToken) return;

    // Every metric comes from a dedicated aggregate/summary or report endpoint —
    // no dashboard count is derived from a paginated list. Each call fails
    // independently so one unavailable section never blanks the whole page.
    getDashboardStats(accessToken)
      .then(setStats)
      .catch(() => setStats(null));

    getReceptionDailyReport(accessToken)
      .then(setDailyReport)
      .catch(() => setDailyReport(null));

    getReceptionMonthlyReport(accessToken)
      .then((data) => setMonthBreakdown(data.breakdown))
      .catch(() => setMonthBreakdown([]));

    getInventoryStats()
      .then(setInventory)
      .catch(() => setInventory(null));

    getRevenueReport({ range: "monthly" })
      .then((data) => setMonthRevenue(data.summary.total_revenue))
      .catch(() => setMonthRevenue("0"));

    getLowStockReport()
      .then((data) => setLowStock(data.items))
      .catch(() => setLowStock([]));

    getExpiryReport()
      .then((data) => setNearExpiry(data.near_expiry))
      .catch(() => setNearExpiry([]));

    getStaffSummary()
      .then(setStaffSummary)
      .catch(() => setStaffSummary(null));

    // "Recent Patients" is a list widget (not a count) so a list endpoint is
    // appropriate here. Counts above never depend on this.
    getPatientsList(accessToken, { page: 1, pageSize: 5 })
      .then((data) => setRecentPatients(data.items))
      .catch(() => setRecentPatients([]));
  }, [accessToken]);

  const todayItems: ReportVisitItem[] = dailyReport?.items ?? [];
  const totalPatients = stats?.totalPatients ?? 0;
  const todayVisits = dailyReport?.total_checkins ?? stats?.todayVisits ?? 0;
  const completedToday = dailyReport?.completed_checkins ?? stats?.completedToday ?? 0;
  const inProgressToday = dailyReport?.active_checkins ?? 0;

  // Per-stage counts of today's in-flight visits (completed comes from status).
  const stageCount = (stage: ReportVisitItem["current_stage"]) =>
    todayItems.filter((v) => v.status === "in_progress" && v.current_stage === stage).length;

  const flowCounts: PatientFlowCounts = {
    reception: 0, // no reception stage in this workflow; kept for the tracker shape
    pharmacy: stageCount("pharmacy"),
    completed: completedToday,
  };

  const flowDistribution = [
    { name: "Pharmacy", value: flowCounts.pharmacy },
    { name: "Completed", value: flowCounts.completed },
  ];

  const now = new Date();
  const visitsTrend = monthBreakdown.map((row) => ({
    label: `${MONTH_NAMES[now.getMonth()]} ${row.day}`,
    visits: row.count,
  }));

  const todaysRevenue = inventory?.todays_revenue ?? "0";

  const statCards = [
    {
      title: "Total Patients",
      value: totalPatients,
      description: "Registered patients",
      icon: Users,
      accent: "bg-primary",
      iconBg: "bg-teal-50",
      iconColor: "text-primary",
    },
    {
      title: "Today's Visits",
      value: todayVisits,
      description: `${completedToday} completed, ${inProgressToday} in progress`,
      icon: Calendar,
      accent: "bg-emerald-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      title: "Today's Revenue",
      value: inr(todaysRevenue),
      description: `This month: ${inr(monthRevenue)}`,
      icon: TrendingUp,
      accent: "bg-sky-500",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
    },
    {
      title: "Active Staff",
      value: staffSummary?.active ?? 0,
      description: `${staffSummary?.total ?? 0} total members`,
      icon: UserCheck,
      accent: "bg-indigo-500",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
    },
  ];

  const lowStockCount = inventory?.low_stock_count ?? lowStock.length;
  const expiringCount = inventory?.near_expiry_count ?? nearExpiry.length;
  const staffByDesignation = staffSummary?.by_designation ?? {};

  return (
    <div className="max-w-7xl 2xl:max-w-[1600px] mx-auto space-y-8">
      {/* Header */}
      <PageHeader
        icon={<LayoutDashboard className="h-7 w-7 text-primary" />}
        title="Admin Dashboard"
        subtitle={`Overview of ${BRANDING.name} operations`}
        actions={
          <div className="flex items-center gap-2 text-slate-500 text-sm font-medium">
            <Clock className="h-4 w-4" />
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        }
      />

      {/* Stats Grid */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="overflow-hidden border-slate-100 shadow-sm hover:shadow-md hover:border-slate-300 transition-all rounded-2xl">
            <div className={`h-1 w-full ${stat.accent}`} />
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                  <p className="text-sm text-slate-500 mt-0.5">{stat.title}</p>
                </div>
                <div className={`w-10 h-10 rounded-full ${stat.iconBg} flex items-center justify-center`}>
                  <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                </div>
              </div>
              <p className="text-xs text-slate-400">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Patient Flow Tracker */}
      <PatientFlowTracker counts={flowCounts} />

      {/* Analytics Charts */}
      <AnalyticsCards
        staffByDesignation={staffByDesignation}
        flowDistribution={flowDistribution}
        visitsTrend={visitsTrend}
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Alerts Section */}
        <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30">
            <CardTitle className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Alerts &amp; Notifications
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Items requiring attention</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            {lowStockCount > 0 && (
              <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 p-4">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-amber-800">Low Stock Alert</span>
                  <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700">
                    {lowStockCount} items
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {lowStock.slice(0, 3).map((med) => (
                    <li key={med.id}>
                      {med.name} - {med.current_stock} units remaining
                    </li>
                  ))}
                  {lowStock.length > 3 && (
                    <li className="text-amber-600">
                      +{lowStock.length - 3} more items
                    </li>
                  )}
                </ul>
              </div>
            )}

            {expiringCount > 0 && (
              <div className="rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100/50 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span className="font-medium text-rose-800">Expiring Soon</span>
                  <Badge variant="destructive" className="ml-auto">
                    {expiringCount} items
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-rose-700">
                  {nearExpiry.slice(0, 3).map((batch) => (
                    <li key={`${batch.medicine_id}-${batch.batch_number}`}>
                      {batch.medicine_name} - Expires{" "}
                      {new Date(batch.expiry_date).toLocaleDateString('en-IN')}
                    </li>
                  ))}
                  {nearExpiry.length > 3 && (
                    <li className="text-rose-600">
                      +{nearExpiry.length - 3} more batches
                    </li>
                  )}
                </ul>
              </div>
            )}

            {lowStockCount === 0 && expiringCount === 0 && (
              <div className="rounded-lg border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/50 p-4">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-emerald-600" />
                  <span className="font-medium text-emerald-800">All Clear</span>
                </div>
                <p className="mt-1 text-sm text-emerald-700">
                  No critical alerts at this time.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Staff Overview */}
        <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30">
            <CardTitle className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Users className="h-4 w-4 text-primary" />
              Staff Overview
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Active team by designation</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-3">
              {Object.entries(staffByDesignation).length > 0 ? (
                Object.entries(staffByDesignation).map(([designation, count], idx) => {
                  const dots = ["bg-primary", "bg-emerald-500", "bg-indigo-500", "bg-amber-500", "bg-rose-500", "bg-sky-500"];
                  return (
                    <div key={designation} className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`h-3 w-3 rounded-full ${dots[idx % dots.length]}`} />
                        <span className="text-sm font-medium text-slate-700">{designation}</span>
                      </div>
                      <span className="font-bold text-slate-800">{count}</span>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Users className="h-7 w-7 text-slate-200 mb-2" />
                  <p className="text-slate-400 text-sm font-medium">No active staff records</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30">
            <CardTitle className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Users className="h-4 w-4 text-primary" />
              Recent Patients
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Newly registered patients</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {recentPatients.map((patient) => (
                <div
                  key={patient.patient_id}
                  className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">
                        {patient.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{patient.full_name}</p>
                      <p className="text-xs text-slate-400">
                        {patient.addiction_type || patient.patient_category || "—"}
                        {patient.date_of_birth
                          ? ` | Age: ${new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] text-primary border-teal-200 bg-teal-50">{patient.file_number}</Badge>
                </div>
              ))}
              {recentPatients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-14 w-14 rounded-full bg-slate-50 flex items-center justify-center mb-3">
                    <Users className="h-7 w-7 text-slate-200" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">No patients registered yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today's Flow */}
        <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="border-b border-slate-100 bg-slate-50/30">
            <CardTitle className="flex items-center gap-2 text-slate-800 font-bold text-sm">
              <Activity className="h-4 w-4 text-primary" />
              Today&apos;s Patient Flow
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">Current status of visits</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50">
                <span className="text-sm font-medium text-slate-700">At Pharmacy</span>
                <Badge variant="secondary" className="bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
                  {flowCounts.pharmacy}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50">
                <span className="text-sm font-bold text-emerald-700">Completed</span>
                <Badge className="bg-emerald-500 text-white font-bold text-xs border-0">
                  {completedToday}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
