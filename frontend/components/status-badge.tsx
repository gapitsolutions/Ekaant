import { cn } from '@/lib/utils';

type StatusVariant = 'default' | 'success' | 'warning' | 'danger' | 'info' | 'primary';

const variantStyles: Record<StatusVariant, string> = {
  default: 'bg-secondary text-secondary-foreground',
  success: 'bg-emerald-100 text-emerald-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-red-100 text-red-800',
  info: 'bg-sky-100 text-sky-800',
  primary: 'bg-[#0d7377]/10 text-[#0d7377]',
};

interface StatusBadgeProps {
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
}

export function StatusBadge({ children, variant = 'default', className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// Predefined status badges
export function StageStatus({ stage }: { stage: string }) {
  const stageConfig: Record<string, { label: string; variant: StatusVariant }> = {
    checkin: { label: 'Check-in', variant: 'primary' },
    counsellor: { label: 'Counsellor', variant: 'warning' },
    doctor: { label: 'Doctor', variant: 'info' },
    pharmacy: { label: 'Pharmacy', variant: 'primary' },
    completed: { label: 'Completed', variant: 'success' },
  };

  const config = stageConfig[stage] || { label: stage, variant: 'default' };
  return <StatusBadge variant={config.variant}>{config.label}</StatusBadge>;
}

export function RiskBadge({ level }: { level: string }) {
  const riskConfig: Record<string, { label: string; variant: StatusVariant }> = {
    low: { label: 'Low Risk', variant: 'success' },
    medium: { label: 'Medium Risk', variant: 'warning' },
    high: { label: 'High Risk', variant: 'danger' },
  };

  const config = riskConfig[level] || { label: level, variant: 'default' };
  return <StatusBadge variant={config.variant}>{config.label}</StatusBadge>;
}

export function PaymentBadge({ status }: { status: string }) {
  const paymentConfig: Record<string, { label: string; variant: StatusVariant }> = {
    pending: { label: 'Pending', variant: 'warning' },
    paid: { label: 'Paid', variant: 'success' },
    partial: { label: 'Partial', variant: 'primary' },
  };

  const config = paymentConfig[status] || { label: status, variant: 'default' };
  return <StatusBadge variant={config.variant}>{config.label}</StatusBadge>;
}

export function StockBadge({ quantity, reorderLevel }: { quantity: number; reorderLevel: number }) {
  if (quantity === 0) {
    return <StatusBadge variant="danger">Out of Stock</StatusBadge>;
  }
  if (quantity <= reorderLevel) {
    return <StatusBadge variant="warning">Low Stock</StatusBadge>;
  }
  return <StatusBadge variant="success">In Stock</StatusBadge>;
}
