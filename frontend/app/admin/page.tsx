"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { getPatientsList, getDashboardStats } from '@/lib/hms-api';
import type { Patient, Visit, Medicine } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatientFlowTracker } from "@/components/patient-flow-tracker";
import { AnalyticsCards } from "@/components/analytics-cards";
import {
  Users,
  UserCheck,
  Pill,
  TrendingUp,
  Calendar,
  Activity,
  AlertTriangle,
  Clock,
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
          registration_number: item.registration_number || '',
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
      gradient: "from-primary to-primary/80",
    },
    {
      title: "Today's Visits",
      value: todayVisits.length,
      description: `${completedToday} completed, ${inProgressToday} in progress`,
      icon: Calendar,
      gradient: "from-emerald-500 to-emerald-600",
    },
    {
      title: "Today's Revenue",
      value: `Rs. ${todayRevenue.toLocaleString('en-IN')}`,
      description: `Total: Rs. ${totalRevenue.toLocaleString('en-IN')}`,
      icon: TrendingUp,
      gradient: "from-sky-500 to-sky-600",
    },
    {
      title: "Active Staff",
      value: users.length,
      description: "Total team members",
      icon: UserCheck,
      gradient: "from-indigo-500 to-indigo-600",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Overview of Aggarwal Psychiatric & De-Addiction Centre operations
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-4 w-4" />
          {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="overflow-hidden border-0 shadow-md hover:shadow-lg transition-shadow">
            <div className={`h-1.5 bg-gradient-to-r ${stat.gradient}`} />
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.title}</p>
                  <p className="text-xs text-muted-foreground/70">{stat.description}</p>
                </div>
                <div className={`p-2 rounded-lg bg-gradient-to-br ${stat.gradient} text-white`}>
                  <stat.icon className="h-4 w-4" />
                </div>
              </div>
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
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Alerts & Notifications
            </CardTitle>
            <CardDescription>Items requiring attention</CardDescription>
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
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Staff Overview
            </CardTitle>
            <CardDescription>Team distribution by role</CardDescription>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-primary" />
                  <span className="text-sm text-foreground">Reception</span>
                </div>
                <span className="font-semibold text-foreground">{staffByRole.reception}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="text-sm text-foreground">Counsellors</span>
                </div>
                <span className="font-semibold text-foreground">{staffByRole.counsellor}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-indigo-500" />
                  <span className="text-sm text-foreground">Doctors</span>
                </div>
                <span className="font-semibold text-foreground">{staffByRole.doctor}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="text-sm text-foreground">Pharmacists</span>
                </div>
                <span className="font-semibold text-foreground">{staffByRole.pharmacist}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Recent Patients
            </CardTitle>
            <CardDescription>Newly registered patients</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {patients.slice(0, 5).map((patient) => (
                <div
                  key={patient.id}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-semibold text-primary">
                        {patient.full_name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{patient.full_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {patient.addiction_type} | Age: {new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="font-mono">{patient.registration_number}</Badge>
                </div>
              ))}
              {patients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
                    <Users className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground font-medium">No patients registered yet</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Today's Flow */}
        <Card className="border-0 shadow-md">
          <CardHeader className="border-b bg-muted/30">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-primary" />
              Today&apos;s Patient Flow
            </CardTitle>
            <CardDescription>Current status of visits</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-foreground">At Reception</span>
                <Badge variant="secondary" className="bg-primary/10 text-primary">
                  {todayVisits.filter((v) => v.current_stage === "reception").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-foreground">With Counsellor</span>
                <Badge variant="secondary" className="bg-amber-100 text-amber-700">
                  {todayVisits.filter((v) => v.current_stage === "counsellor").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-foreground">With Doctor</span>
                <Badge variant="secondary" className="bg-indigo-100 text-indigo-700">
                  {todayVisits.filter((v) => v.current_stage === "doctor").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                <span className="text-sm text-foreground">At Pharmacy</span>
                <Badge variant="secondary" className="bg-rose-100 text-rose-700">
                  {todayVisits.filter((v) => v.current_stage === "pharmacy").length}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50">
                <span className="text-sm font-medium text-emerald-700">Completed</span>
                <Badge className="bg-emerald-500 text-white">
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
