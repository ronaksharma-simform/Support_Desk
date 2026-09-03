import { useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { CategoryBadge, PriorityBadge } from "../components/badges";
import {
  Button,
  EmptyState,
  ErrorNotice,
  PageHeader,
  Spinner,
  cx,
} from "../components/ui";
import type { TicketListItem } from "../lib/types";
import { timeAgo } from "../lib/format";

type QueueSort = "age" | "priority" | "newest";

const SORT_LABEL: Record<QueueSort, string> = {
  age: "Oldest first",
  priority: "Highest priority",
  newest: "Newest first",
};

export function QueuePage() {
  const [sort, setSort] = useState<QueueSort>("age");
  const [notice, setNotice] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState("");

  const { data, error, loading, reload } = useAsyncData<TicketListItem[]>(
    () =>
      api
        .get<{ tickets: TicketListItem[] }>(`/tickets/queue?sort=${sort}`)
        .then((d) => d.tickets),
    [`queue-${sort}`]
  );

  async function claim(ticket: TicketListItem) {
    setActionError("");
    setNotice("");
    setClaimingId(ticket.id);
    try {
      await api.patch(`/tickets/${ticket.id}/claim`, {});
      setNotice(`Claimed “${ticket.title}” — it now lives under My tickets.`);
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setClaimingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Shared queue"
        subtitle="Open tickets that nobody has claimed yet"
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          {(["age", "priority", "newest"] as QueueSort[]).map((s) => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={cx(
                "rounded-md px-3 py-1.5 font-medium transition-colors",
                sort === s ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
              )}
            >
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
        {data ? (
          <span className="text-sm text-slate-500">
            {data.length} unclaimed {data.length === 1 ? "ticket" : "tickets"}
          </span>
        ) : null}
      </div>

      {notice ? (
        <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {actionError ? <ErrorNotice message={actionError} className="mb-3" /> : null}
      {error ? <ErrorNotice message={error} className="mb-4" /> : null}

      {loading ? (
        <Spinner />
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="Queue is clear"
          hint="There are no unclaimed open tickets right now. New customer tickets will appear here."
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">#</th>
                <th className="px-4 py-2.5 font-medium">Title</th>
                <th className="px-4 py-2.5 font-medium">Priority</th>
                <th className="px-4 py-2.5 font-medium">Category</th>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Waiting</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
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
                  <td className="px-4 py-3 text-slate-700">{t.customerName}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-slate-500" title={t.createdAt}>
                    {timeAgo(t.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" disabled={claimingId === t.id} onClick={() => void claim(t)}>
                      {claimingId === t.id ? "Claiming…" : "Claim"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
