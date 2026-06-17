'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export interface AnalyticsCardsProps {
  // Active staff headcount per designation (from /staff/summary/ aggregate).
  staffByDesignation: Record<string, number>;
  // Today's in-flight patients per current stage (from the daily report).
  flowDistribution: { name: string; value: number }[];
  // Visits per day for the current month (from the monthly report breakdown).
  visitsTrend: { label: string; visits: number }[];
}

const COLORS = ['#3b82f6', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#06b6d4', '#eab308', '#14b8a6'];

export function AnalyticsCards({
  staffByDesignation,
  flowDistribution,
  visitsTrend,
}: AnalyticsCardsProps) {
  const staffData = React.useMemo(
    () =>
      Object.entries(staffByDesignation)
        .map(([name, value]) => ({ name, value }))
        .filter((d) => d.value > 0),
    [staffByDesignation],
  );

  const flowData = React.useMemo(
    () => flowDistribution.filter((d) => d.value > 0),
    [flowDistribution],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Staff by Designation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Staff by Designation</CardTitle>
        </CardHeader>
        <CardContent>
          {staffData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={staffData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${value}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {staffData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
              No active staff records
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Patient Flow */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Today&apos;s Patient Flow</CardTitle>
        </CardHeader>
        <CardContent>
          {flowData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={flowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-sm text-slate-400">
              No patients in flow today
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visits Trend (This Month) */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">Visits Trend (This Month)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={visitsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="visits" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
