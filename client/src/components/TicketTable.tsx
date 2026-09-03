import { Link } from "react-router-dom";
import type { TicketListItem } from "../lib/types";
import { timeAgo } from "../lib/format";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./badges";
import { EmptyState } from "./ui";

export function TicketTable({
  tickets,
  showCustomer = true,
  showAssignee = false,
  emptyTitle = "No tickets found",
  emptyHint,
}: {
  tickets: TicketListItem[];
  showCustomer?: boolean;
  showAssignee?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
}) {
  if (tickets.length === 0) {
    return <EmptyState title={emptyTitle} hint={emptyHint} icon="🎫" />;
  }

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
            <th className="px-4 py-2.5 font-medium">#</th>
            <th className="px-4 py-2.5 font-medium">Title</th>
            <th className="px-4 py-2.5 font-medium">Priority</th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            {showCustomer ? <th className="px-4 py-2.5 font-medium">Customer</th> : null}
            {showAssignee ? <th className="px-4 py-2.5 font-medium">Agent</th> : null}
            <th className="px-4 py-2.5 font-medium">Created</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((t) => (
            <tr
              key={t.id}
              className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50"
            >
              <td className="px-4 py-3 text-slate-400">#{t.number}</td>
              <td className="max-w-xs px-4 py-3">
                <Link to={`/tickets/${t.id}`} className="font-medium text-indigo-700 hover:underline">
                  {t.title}
                </Link>
              </td>
              <td className="px-4 py-3">
                <PriorityBadge priority={t.priority} />
              </td>
              <td className="px-4 py-3">
                <CategoryBadge category={t.category} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge status={t.status} />
              </td>
              {showCustomer ? <td className="px-4 py-3 text-slate-700">{t.customerName}</td> : null}
              {showAssignee ? (
                <td className="px-4 py-3 text-slate-700">
                  {t.assigneeName ?? <span className="text-slate-400">Unassigned</span>}
                </td>
              ) : null}
              <td className="whitespace-nowrap px-4 py-3 text-slate-500" title={t.createdAt}>
                {timeAgo(t.createdAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
