'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface PatientFlowCounts {
  reception: number;
  pharmacy: number;
  completed: number;
}

interface PatientFlowTrackerProps {
  counts: PatientFlowCounts;
}

export function PatientFlowTracker({ counts }: PatientFlowTrackerProps) {
  const stageColors: Record<string, string> = {
    reception: 'bg-blue-100 text-blue-800',
    pharmacy: 'bg-green-100 text-green-800',
    completed: 'bg-gray-100 text-gray-800',
  };

  const stageTitles: Record<string, string> = {
    reception: 'Check-in',
    pharmacy: 'Pharmacy',
    completed: 'Completed',
  };

  const stages: (keyof PatientFlowCounts)[] = [
    'reception',
    'pharmacy',
    'completed',
  ];

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
                  {counts[stage]}
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
