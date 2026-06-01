import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Standard page header used across every page for a consistent visual
 * hierarchy (title + optional subtitle + optional right-aligned actions).
 *
 * Typography is fixed here so titles never drift between pages:
 *   - title:    text-2xl font-bold tracking-tight text-foreground
 *   - subtitle: text-muted-foreground
 *
 * Presentational only — it renders whatever `actions` you pass (buttons keep
 * their own handlers), so swapping a bespoke header for <PageHeader> never
 * changes behavior.
 */
export interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Right-aligned actions (buttons, etc.). */
  actions?: React.ReactNode;
  /** Optional icon rendered before the title. */
  icon?: React.ReactNode;
  /**
   * Optional element rendered before the title block (e.g. a back button on
   * a drill-in detail page). Top-level pages reachable from the sidebar
   * should NOT use this — their navigation is already covered.
   */
  leading?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  leading,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        {leading}
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground">
            {icon}
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
