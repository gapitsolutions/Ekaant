export const CALL_RESULT_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  busy_later: "Busy / Call Later",
  wrong_number: "Wrong Number",
  not_reachable: "Not Reachable",
  do_not_call: "Do Not Call",
  other: "Other",
};

export const CALL_RESULT_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-500",
  busy_later: "bg-amber-500",
  wrong_number: "bg-red-500",
  not_reachable: "bg-slate-400",
  do_not_call: "bg-rose-500",
  other: "bg-blue-400",
};

export const CALL_RESULT_BADGE: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 border-emerald-100",
  busy_later: "bg-amber-50 text-amber-700 border-amber-100",
  wrong_number: "bg-red-50 text-red-700 border-red-100",
  not_reachable: "bg-slate-50 text-slate-600 border-slate-200",
  do_not_call: "bg-rose-50 text-rose-700 border-rose-100",
  other: "bg-blue-50 text-blue-700 border-blue-100",
};
