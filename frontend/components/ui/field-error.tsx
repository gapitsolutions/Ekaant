import { cn } from "@/lib/utils";

/** Inline form-field error message.
 *
 * Renders nothing when there is no message, so it's safe to drop below
 * every input — it only takes up space when the backend says so.
 */
export function FieldError({
  message,
  className,
}: {
  message?: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className={cn("text-xs text-rose-600 mt-1", className)}
    >
      {message}
    </p>
  );
}
