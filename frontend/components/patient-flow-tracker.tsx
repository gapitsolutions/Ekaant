'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Visit } from '@/lib/types';

interface PatientFlowTrackerProps {
  visits: Visit[];
}

export function PatientFlowTracker({ visits }: PatientFlowTrackerProps) {
  const stageColors: Record<string, string> = {
    reception: 'bg-blue-100 text-blue-800',
    counsellor: 'bg-purple-100 text-purple-800',
    doctor: 'bg-orange-100 text-orange-800',
    pharmacy: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
  };

  const stageTitles: Record<string, string> = {
    reception: 'Check-in',
    counsellor: 'Counselling',
    doctor: 'Consultation',
    pharmacy: 'Pharmacy',
    completed: 'Completed',
  };

  const stageCounts = {
    reception: visits.filter(v => v.current_stage === 'reception').length,
    counsellor: visits.filter(v => v.current_stage === 'counsellor').length,
    doctor: visits.filter(v => v.current_stage === 'doctor').length,
    pharmacy: visits.filter(v => v.current_stage === 'pharmacy').length,
    completed: visits.filter(v => v.status === 'completed').length,
  };

  const stages: (keyof typeof stageCounts)[] = ['reception', 'counsellor', 'doctor', 'pharmacy', 'completed'];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Patient Flow Today</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          {stages.map((stage, index) => (
            <React.Fragment key={stage}>
              <div className="flex flex-col items-center gap-2">
                <Badge className={stageColors[stage]}>
                  {stageCounts[stage]}
                </Badge>
                <span className="text-xs font-medium text-center">
                  {stageTitles[stage]}
                </span>
              </div>
              {index < stages.length - 1 && (
                <div className="flex-1 h-1 bg-gradient-to-r from-primary/30 to-transparent mx-2" />
              )}
            </React.Fragment>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
