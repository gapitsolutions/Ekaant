'use client';

import type { Patient, Visit, User } from './types';

export function searchPatients(patients: Patient[], query: string): Patient[] {
  if (!query.trim()) return patients;
  
  const q = query.toLowerCase();
  return patients.filter(p =>
    p.full_name.toLowerCase().includes(q) ||
    p.registration_number.toLowerCase().includes(q) ||
    p.phone.includes(q) ||
    p.email?.toLowerCase().includes(q)
  );
}

export function filterPatients(
  patients: Patient[],
  filters: {
    addiction_type?: string;
    status?: string;
    city?: string;
    gender?: string;
  }
): Patient[] {
  return patients.filter(p => {
    if (filters.addiction_type && p.addiction_type !== filters.addiction_type) return false;
    if (filters.status && p.status !== filters.status) return false;
    if (filters.city && p.city !== filters.city) return false;
    if (filters.gender && p.gender !== filters.gender) return false;
    return true;
  });
}

export function filterVisits(
  visits: Visit[],
  filters: {
    stage?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
  }
): Visit[] {
  return visits.filter(v => {
    if (filters.stage && v.current_stage !== filters.stage) return false;
    if (filters.status && v.status !== filters.status) return false;
    if (filters.date_from && v.visit_date < filters.date_from) return false;
    if (filters.date_to && v.visit_date > filters.date_to) return false;
    return true;
  });
}

export function sortPatients(
  patients: Patient[],
  sortBy: 'name' | 'date' | 'addiction',
  order: 'asc' | 'desc' = 'asc'
): Patient[] {
  const sorted = [...patients].sort((a, b) => {
    let compareA: string | number = '';
    let compareB: string | number = '';

    switch (sortBy) {
      case 'name':
        compareA = a.full_name.toLowerCase();
        compareB = b.full_name.toLowerCase();
        break;
      case 'date':
        compareA = a.first_visit_date || '';
        compareB = b.first_visit_date || '';
        break;
      case 'addiction':
        compareA = a.addiction_type.toLowerCase();
        compareB = b.addiction_type.toLowerCase();
        break;
    }

    if (compareA < compareB) return order === 'asc' ? -1 : 1;
    if (compareA > compareB) return order === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
}

export function getUniqueValues(patients: Patient[], field: keyof Patient): string[] {
  const values = patients.map(p => p[field] as string).filter(Boolean);
  return Array.from(new Set(values)).sort();
}
