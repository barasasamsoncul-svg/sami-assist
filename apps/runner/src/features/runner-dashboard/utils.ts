export function money(value: number | null, currency = "KES"): string {
  if (value === null || !Number.isFinite(value)) return "Awaiting payout";
  return `${currency} ${value.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function activeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "Errand accepted",
    in_progress: "Errand in progress",
    completion_submitted: "Awaiting customer confirmation",
    completed: "Completed",
  };
  return labels[status] ?? titleCase(status);
}

export function isRestrictedAccount(status?: string): boolean {
  return status === "suspended" || status === "closed";
}

export function isSessionError(message: string): boolean {
  return /HTTP 401|session has expired|no valid runner session|sign in again|unauthorized/i.test(message);
}

export function formatRouteDistance(distanceMeters?: number | null): string | null {
  if (distanceMeters == null || !Number.isFinite(distanceMeters) || distanceMeters < 0) return null;
  if (distanceMeters < 1000) return `${Math.round(distanceMeters)} m`;
  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10000 ? 1 : 0)} km`;
}

export function formatRouteDuration(durationSeconds?: number | null): string | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0) return null;
  const totalMinutes = Math.ceil(durationSeconds / 60);
  if (totalMinutes < 1) return "Less than 1 min";
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}
