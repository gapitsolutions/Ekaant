"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getPatientsList, getDashboardStats } from '@/lib/hms-api';
import type { Patient, Visit, Medicine } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatientFlowTracker } from "@/components/patient-flow-tracker";
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

export default function AdminDashboard() {
  const { accessToken } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [medicines, setMedicines] = useState<Medicine[]>([]);

  useEffect(() => {
    if (!accessToken) return;
    getPatientsList(accessToken)
      .then((data) => {
        const mapped = data.items.map((item: any) => ({
          id: item.id || item._id,
          file_number: item.file_number || '',
          patient_category: item.patient_category || 'deaddiction',
          full_name: item.full_name || '',
          date_of_birth: item.date_of_birth || item.dob || '',
          gender: item.gender || 'other',
          phone: item.phone_number || item.phone || '',
          address: item.address || '',
          city: item.city || '',
          state: item.state || '',
          pincode: item.pincode || '',
          addiction_type: item.addiction_type || 'other',
          first_visit_date: item.registration_date || '',
          emergency_contact_name: item.emergency_contact_name || '',
          emergency_contact_phone: item.emergency_contact_phone || '',
          emergency_contact_relation: item.emergency_contact_relation || '',
          status: item.status || 'active',
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
        } as Patient));
        setPatients(mapped);
      })
      .catch(() => setPatients([]));
  }, [accessToken]);

  const today = new Date().toISOString().split("T")[0];
  const todayVisits = visits.filter((v) => v.visit_date === today);
  const completedToday = todayVisits.filter((v) => v.status === "completed").length;
  const inProgressToday = todayVisits.filter((v) => v.status === "in_progress").length;

  const totalRevenue = 0;
  const todayRevenue = 0;

  const lowStockMedicines: Medicine[] = [];
  const expiringMedicines = medicines.filter((m: any) => {
    if (!m.expiry_date) return false;
    const expiryDate = new Date(m.expiry_date);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiryDate <= thirtyDaysFromNow;
  });

  const users: any[] = [];

  const staffByRole = {
    reception: users.filter((s: any) => s.role === "reception").length,
    counsellor: users.filter((s: any) => s.role === "counsellor").length,
    doctor: users.filter((s: any) => s.role === "doctor").length,
    pharmacist: users.filter((s: any) => s.role === "pharmacist").length,
  };

  const statCards = [
    {
      title: "Total Patients",
      value: patients.length,
      description: "Registered patients",
      icon: Users,
      accent: "bg-primary",
      iconBg: "bg-teal-50",
      iconColor: "text-primary",
    },
    {
      title: "Today's Visits",
      value: todayVisits.length,
      description: `${completedToday} completed, ${inProgressToday} in progress`,
      icon: Calendar,
      accent: "bg-emerald-500",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
    },
    {
      title: "Today's Revenue",
      value: `₹${todayRevenue.toLocaleString('en-IN')}`,
      description: `Total: ₹${totalRevenue.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      accent: "bg-sky-500",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
    },
    {
      title: "Active Staff",
      value: users.length,
      description: "Total team members",
      icon: UserCheck,
      accent: "bg-indigo-500",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-8">
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
      <PatientFlowTracker visits={todayVisits} />

      {/* Analytics Charts */}
      <AnalyticsCards patients={patients} visits={visits} />

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
            {lowStockMedicines.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-amber-100/50 p-4">
                <div className="flex items-center gap-2">
                  <Pill className="h-4 w-4 text-amber-600" />
                  <span className="font-medium text-amber-800">Low Stock Alert</span>
                  <Badge variant="secondary" className="ml-auto bg-amber-100 text-amber-700">
                    {lowStockMedicines.length} items
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-700">
                  {lowStockMedicines.slice(0, 3).map((med) => (
                    <li key={med.id}>
                      {med.name} - {med.stock_quantity} units remaining
                    </li>
                  ))}
                  {lowStockMedicines.length > 3 && (
                    <li className="text-amber-600">
                      +{lowStockMedicines.length - 3} more items
                    </li>
                  )}
                </ul>
              </div>
            )}

            {expiringMedicines.length > 0 && (
              <div className="rounded-lg border border-rose-200 bg-gradient-to-r from-rose-50 to-rose-100/50 p-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-600" />
                  <span className="font-medium text-rose-800">Expiring Soon</span>
                  <Badge variant="destructive" className="ml-auto">
                    {expiringMedicines.length} items
                  </Badge>
                </div>
                <ul className="mt-2 space-y-1 text-sm text-rose-700">
                  {expiringMedicines.slice(0, 3).map((med) => (
                    <li key={med.id}>
                      {med.name} - Expires{" "}
                      {med.expiry_date
                        ? new Date(med.expiry_date).toLocaleDateString('en-IN')
                        : "-"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {lowStockMedicines.length === 0 && expiringMedicines.length === 0 && (
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
            <CardDescription className="text-slate-400 text-xs">Team distribution by role</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span className="text-sm font-medium text-slate-700">Reception</span>
                </div>
                <span className="font-bold text-slate-800">{staffByRole.reception}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-slate-700">Counsellors</span>
                </div>
                <span className="font-bold text-slate-800">{staffByRole.counsellor}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-indigo-500" />
                  <span className="text-sm font-medium text-slate-700">Doctors</span>
                </div>
                <span className="font-bold text-slate-800">{staffByRole.doctor}</span>
              </div>
              <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-sm font-medium text-slate-700">Pharmacists</span>
                </div>
                <span className="font-bold text-slate-800">{staffByRole.pharmacist}</span>
              </div>
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
              {patients.slice(0, 5).map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-teal-50 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">
                        {patient.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800 text-sm">{patient.full_name}</p>
                      <p className="text-xs text-slate-400">
                        {patient.addiction_type} | Age: {new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono text-[10px] text-primary border-teal-200 bg-teal-50">{patient.file_number}</Badge>
                </div>
              ))}
              {patients.length === 0 && (
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
                <span className="text-sm font-medium text-slate-700">At Reception</span>
                <Badge variant="secondary" className="bg-teal-50 text-primary border border-teal-200 font-bold text-xs">
                  {todayVisits.filter((v) => v.current_stage === "reception").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50">
                <span className="text-sm font-medium text-slate-700">With Counsellor</span>
                <Badge variant="secondary" className="bg-amber-50 text-amber-700 border border-amber-200 font-bold text-xs">
                  {todayVisits.filter((v) => v.current_stage === "counsellor").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50">
                <span className="text-sm font-medium text-slate-700">With Doctor</span>
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 border border-indigo-200 font-bold text-xs">
                  {todayVisits.filter((v) => v.current_stage === "doctor").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50">
                <span className="text-sm font-medium text-slate-700">At Pharmacy</span>
                <Badge variant="secondary" className="bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
                  {todayVisits.filter((v) => v.current_stage === "pharmacy").length}
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
