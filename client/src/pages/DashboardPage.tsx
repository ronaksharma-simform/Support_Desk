import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { ErrorNotice, PageHeader, Spinner, cx } from "../components/ui";
import { PRIORITY_LABEL, type AdminDashboardData, type AgentDashboardData } from "../lib/types";
import { hoursLabel } from "../lib/format";

export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const admin = useAsyncData<AdminDashboardData>(
    () => api.get<AdminDashboardData>("/dashboard"),
    ["admin-dashboard"]
  );
  const agent = useAsyncData<AgentDashboardData>(
    () => api.get<AgentDashboardData>("/dashboard"),
    ["agent-dashboard"]
  );

  const error = isAdmin ? admin.error : agent.error;
  const loading = isAdmin ? admin.loading : agent.loading;

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Team dashboard" : "My dashboard"}
        subtitle={
          isAdmin
            ? "Volume, resolution time and workload across the whole team"
            : "Your personal workload at a glance"
        }
      />
      {error ? <ErrorNotice message={error} className="mb-4" /> : null}
      {loading ? (
        <Spinner />
      ) : isAdmin ? (
        admin.data ? (
          <AdminDashboard data={admin.data} />
        ) : null
      ) : agent.data ? (
        <AgentDashboard data={agent.data} />
      ) : null}
    </div>
  );
}

function StatCards({
  summary,
}: {
  summary: { open: number; inProgress: number; resolved: number; closed: number; total: number };
}) {
  const items = [
    { label: "Open", value: summary.open, tone: "text-sky-700" },
    { label: "In progress", value: summary.inProgress, tone: "text-amber-700" },
    { label: "Resolved", value: summary.resolved, tone: "text-emerald-700" },
    { label: "Closed", value: summary.closed, tone: "text-slate-700" },
    { label: "Total", value: summary.total, tone: "text-slate-900" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {items.map((it) => (
        <div key={it.label} className="card px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{it.label}</p>
          <p className={cx("mt-1 text-2xl font-semibold", it.tone)}>{it.value}</p>
        </div>
      ))}
    </div>
  );
}

function AgentDashboard({ data }: { data: AgentDashboardData }) {
  return (
    <div className="space-y-4">
      <StatCards summary={data.summary} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Average resolution time (my resolved tickets)
          </h2>
          <p className="text-3xl font-semibold text-indigo-700">{hoursLabel(data.avgResolutionHours)}</p>
        </div>
        <div className="card p-5">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Open workload by priority
          </h2>
          <ul className="space-y-2">
            {(["urgent", "high", "medium", "low"] as const).map((p) => (
              <li key={p} className="flex items-center justify-between text-sm">
                <span
                  className={cx(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    p === "urgent" && "bg-rose-50 text-rose-700",
                    p === "high" && "bg-amber-50 text-amber-700",
                    p === "medium" && "bg-blue-50 text-blue-700",
                    p === "low" && "bg-slate-100 text-slate-600"
                  )}
                >
                  {PRIORITY_LABEL[p]}
                </span>
                <span className="font-semibold text-slate-800">{data.byPriority[p]}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const maxCount = Math.max(1, ...data.volumeByDay.map((d) => d.count));
  return (
    <div className="space-y-4">
      <StatCards summary={data.summary} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ticket volume — last 14 days
          </h2>
          <div className="flex h-40 items-end gap-1">
            {data.volumeByDay.map((d) => (
              <div key={d.date} className="group relative flex-1" title={`${d.date}: ${d.count}`}>
                <div
                  className="w-full rounded-t bg-indigo-500 transition-colors group-hover:bg-indigo-700"
                  style={{ height: `${Math.max(4, (d.count / maxCount) * 100)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-slate-400">
            <span>{data.volumeByDay[0]?.date}</span>
            <span>{data.volumeByDay[data.volumeByDay.length - 1]?.date}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Average resolution time
            </h2>
            <p className="text-3xl font-semibold text-indigo-700">{hoursLabel(data.avgResolutionHours)}</p>
          </div>
          <div className="card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Open vs resolved
            </h2>
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
              <div
                className="bg-sky-500"
                style={{ width: `${pct(data.summary.open + data.summary.inProgress, data.summary.total)}%` }}
              />
              <div
                className="bg-emerald-500"
                style={{ width: `${pct(data.summary.resolved + data.summary.closed, data.summary.total)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-slate-600">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-500" />
                Open / in progress ({data.summary.open + data.summary.inProgress})
              </span>
              <span>
                Resolved / closed ({data.summary.resolved + data.summary.closed})
                <span className="ml-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="px-5 pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Tickets per agent
          </h2>
        </div>
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-5 py-2.5 font-medium">Agent</th>
              <th className="px-4 py-2.5 font-medium">Total</th>
              <th className="px-4 py-2.5 font-medium">Open</th>
              <th className="px-4 py-2.5 font-medium">Resolved</th>
              <th className="px-5 py-2.5 font-medium">Workload bar</th>
            </tr>
          </thead>
          <tbody>
            {data.perAgent.map((a) => {
              const total = Math.max(1, a.total);
              return (
                <tr key={a.agentId} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 font-medium text-slate-800">{a.agentName}</td>
                  <td className="px-4 py-3 text-slate-600">{a.total}</td>
                  <td className="px-4 py-3 text-sky-700">{a.open}</td>
                  <td className="px-4 py-3 text-emerald-700">{a.resolved}</td>
                  <td className="px-5 py-3">
                    <div className="flex h-2 w-40 overflow-hidden rounded-full bg-slate-200">
                      <div className="bg-sky-500" style={{ width: `${(a.open / total) * 100}%` }} />
                      <div className="bg-emerald-500" style={{ width: `${(a.resolved / total) * 100}%` }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function pct(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return (part / whole) * 100;
}
