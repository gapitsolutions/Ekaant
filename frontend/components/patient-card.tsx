import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { StageStatus } from './status-badge';
import type { Patient, Visit } from '@/lib/types';
import { User, Phone, Calendar } from 'lucide-react';

interface PatientCardProps {
  patient: Patient;
  visit?: Visit;
  onClick?: () => void;
  showStage?: boolean;
  waitTime?: string;
}

export function PatientCard({ patient, visit, onClick, showStage = true, waitTime }: PatientCardProps) {
  const initials = patient.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const age = patient.date_of_birth
    ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;

  return (
    <Card
      className={`border-0 shadow-md bg-card/80 backdrop-blur overflow-hidden ${onClick ? 'cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5' : ''}`}
      onClick={onClick}
    >
      <div className="h-1 bg-gradient-to-r from-[#0d7377] to-[#14919b]"></div>
      <CardContent className="flex items-center gap-4 p-4">
        <Avatar className="h-12 w-12 ring-2 ring-[#0d7377]/20">
          <AvatarImage src={patient.photo_url} alt={patient.full_name} />
          <AvatarFallback className="bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 text-[#0d7377] font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-foreground truncate">
              {patient.full_name}
            </h3>
            {showStage && visit && <StageStatus stage={visit.current_stage} />}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-[#0d7377]" />
              {patient.registration_number}
            </span>
            {age && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-[#0d7377]" />
                {age} yrs, {patient.gender}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5 text-[#0d7377]" />
              {patient.phone}
            </span>
          </div>

          {patient.addiction_type && (
            <p className="text-sm text-muted-foreground mt-1 capitalize">
              {patient.addiction_type} dependency
              {patient.addiction_duration && ` - ${patient.addiction_duration}`}
            </p>
          )}
        </div>

        {waitTime && (
          <div className="text-right text-sm">
            <span className="text-muted-foreground">Waiting</span>
            <p className="font-medium text-[#0d7377]">{waitTime}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Compact version for queues
export function PatientQueueItem({
  patient,
  visit,
  waitTime,
  onClick,
}: {
  patient: Patient;
  visit: Visit;
  waitTime: string;
  onClick: () => void;
}) {
  const initials = patient.full_name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg border border-[#0d7377]/10 bg-card hover:bg-[#0d7377]/5 hover:border-[#0d7377]/30 cursor-pointer transition-all"
    >
      <Avatar className="h-10 w-10 ring-2 ring-[#0d7377]/10">
        <AvatarImage src={patient.photo_url} alt={patient.full_name} />
        <AvatarFallback className="bg-gradient-to-br from-[#0d7377]/10 to-[#14919b]/10 text-[#0d7377] text-sm font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{patient.full_name}</p>
        <p className="text-xs text-muted-foreground">{patient.registration_number}</p>
      </div>

      <div className="text-right">
        <p className="text-xs text-muted-foreground">Wait time</p>
        <p className="text-sm font-medium text-[#0d7377]">{waitTime}</p>
      </div>
    </div>
  );
}
