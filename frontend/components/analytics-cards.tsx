'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { Patient, Visit } from '@/lib/types';

interface AnalyticsCardsProps {
  patients: Patient[];
  visits: Visit[];
}

export function AnalyticsCards({ patients, visits }: AnalyticsCardsProps) {
  // Addiction type breakdown
  const addictionData = React.useMemo(() => {
    const grouped = patients.reduce((acc, p) => {
      const existing = acc.find(x => x.name === p.addiction_type);
      if (existing) {
        existing.value++;
      } else {
        acc.push({ name: p.addiction_type, value: 1 });
      }
      return acc;
    }, [] as { name: string; value: number }[]);
    return grouped;
  }, [patients]);

  // Daily visits trend
  const visitsTrend = React.useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (6 - i));
      return date.toISOString().split('T')[0];
    });

    return last7Days.map(date => ({
      date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      visits: visits.filter(v => v.visit_date === date).length,
    }));
  }, [visits]);

  // Stage distribution
  const stageData = [
    { name: 'Check-in', value: visits.filter(v => v.current_stage === 'reception').length },
    { name: 'Counselling', value: visits.filter(v => v.current_stage === 'counsellor').length },
    { name: 'Consultation', value: visits.filter(v => v.current_stage === 'doctor').length },
    { name: 'Pharmacy', value: visits.filter(v => v.current_stage === 'pharmacy').length },
  ].filter(s => s.value > 0);

  const COLORS = ['#3b82f6', '#a855f7', '#f97316', '#22c55e', '#ec4899', '#06b6d4'];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Addiction Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Addiction Types</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={addictionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {addictionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Patient Flow Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Current Patient Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stageData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={80} interval={0} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Visits Trend */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-sm">Visits Trend (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={visitsTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visits" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
