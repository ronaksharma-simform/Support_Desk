import type { Role, TicketCategory, TicketPriority, TicketStatus } from "../lib/types";
import { CATEGORY_LABEL, PRIORITY_LABEL, ROLE_LABEL, STATUS_LABEL } from "../lib/types";
import { cx } from "../lib/format";

const STATUS_STYLE: Record<TicketStatus, string> = {
  open: "bg-sky-50 text-sky-700 ring-sky-200",
  in_progress: "bg-amber-50 text-amber-700 ring-amber-200",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  closed: "bg-slate-100 text-slate-600 ring-slate-200",
};

const PRIORITY_STYLE: Record<TicketPriority, string> = {
  low: "bg-slate-100 text-slate-600 ring-slate-200",
  medium: "bg-blue-50 text-blue-700 ring-blue-200",
  high: "bg-amber-50 text-amber-700 ring-amber-200",
  urgent: "bg-rose-50 text-rose-700 ring-rose-200",
};

const CATEGORY_STYLE: Record<TicketCategory, string> = {
  billing: "bg-teal-50 text-teal-700 ring-teal-200",
  technical: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  account: "bg-purple-50 text-purple-700 ring-purple-200",
  other: "bg-slate-100 text-slate-600 ring-slate-200",
};

const ROLE_STYLE: Record<Role, string> = {
  customer: "bg-sky-50 text-sky-700 ring-sky-200",
  support_agent: "bg-violet-50 text-violet-700 ring-violet-200",
  admin: "bg-rose-50 text-rose-700 ring-rose-200",
};

const base =
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

export function StatusBadge({ status }: { status: TicketStatus }) {
  return <span className={cx(base, STATUS_STYLE[status])}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span className={cx(base, PRIORITY_STYLE[priority])}>{PRIORITY_LABEL[priority]}</span>
  );
}

export function CategoryBadge({ category }: { category: TicketCategory }) {
  return (
    <span className={cx(base, CATEGORY_STYLE[category])}>{CATEGORY_LABEL[category]}</span>
  );
}

export function RoleBadge({ role }: { role: Role }) {
  return <span className={cx(base, ROLE_STYLE[role])}>{ROLE_LABEL[role]}</span>;
}
