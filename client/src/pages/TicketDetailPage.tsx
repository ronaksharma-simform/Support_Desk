import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api, errorMessage } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { CategoryBadge, PriorityBadge, StatusBadge } from "../components/badges";
import {
  Button,
  EmptyState,
  ErrorNotice,
  Field,
  PageHeader,
  Spinner,
  cx,
  inputCls,
} from "../components/ui";
import {
  STATUS_LABEL,
  isStaff,
  type Agent,
  type TicketDetail,
  type TicketDetailResponse,
  type TicketMessage,
  type TicketStatus,
} from "../lib/types";
import { formatDateTime, timeAgo } from "../lib/format";

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();

  const { data, error, loading, reload } = useAsyncData<TicketDetailResponse>(
    () => api.get<TicketDetailResponse>(`/tickets/${id}`),
    [`ticket-detail-${id}`]
  );

  const ticket = data?.ticket ?? null;
  const role = user?.role ?? "customer";
  const staff = isStaff(role);
  const canManage = data?.canManage ?? false;
  const claimable = staff && !!ticket && ticket.status === "open" && ticket.assigneeId === null;

  if (error) {
    return (
      <div>
        <PageHeader title="Ticket" />
        <EmptyState icon="🔒" title="Ticket unavailable" hint={error}>
          <Link to="/tickets">
            <Button variant="secondary">Back to tickets</Button>
          </Link>
        </EmptyState>
      </div>
    );
  }

  if (loading || !ticket || !data) return <Spinner label="Loading ticket…" />;

  return (
    <div>
      <Link to="/tickets" className="mb-3 inline-block text-sm font-medium text-indigo-700 hover:underline">
        ← Back to tickets
      </Link>

      <div className="card mb-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Ticket #{ticket.number}</p>
            <h1 className="mt-0.5 text-xl font-semibold text-slate-900">{ticket.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.priority} />
            <CategoryBadge category={ticket.category} />
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <Meta label="Customer" value={ticket.customerName} />
          <Meta
            label="Assignee"
            value={ticket.assigneeName ?? (ticket.status === "open" ? "Unassigned" : "—")}
            muted={!ticket.assigneeName}
          />
          <Meta label="Opened" value={formatDateTime(ticket.createdAt)} />
          <Meta label="Last activity" value={timeAgo(ticket.updatedAt)} />
        </dl>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Description</h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{ticket.description}</p>
          </section>

          <Conversation
            messages={data.messages}
            currentUserId={user?.id ?? ""}
            canManage={canManage}
            claimable={claimable}
            onChanged={reload}
          />

          {canManage || user?.role === "customer" ? (
            <ComposeBox
              ticketId={ticket.id}
              onPosted={reload}
              customerOnly={user?.role === "customer"}
              closed={ticket.status === "closed"}
            />
          ) : null}

          <StatusHistory history={data.history} />
        </div>

        <aside className="space-y-4">
          {canManage ? (
            <StatusCard ticket={ticket} transitions={data.transitions} onChangeDone={reload} />
          ) : claimable ? (
            <ClaimCard ticket={ticket} onClaimed={reload} />
          ) : null}

          {user?.role === "admin" && canManage ? (
            <AssignmentCard ticket={ticket} onChangeDone={reload} />
          ) : null}

          <section className="card p-5 text-sm">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">About this ticket</h2>
            <ul className="space-y-2 text-slate-600">
              <li><span className="text-slate-400">Priority:</span> {ticket.priority}</li>
              <li><span className="text-slate-400">Category:</span> {ticket.category}</li>
              {ticket.resolvedAt ? (
                <li><span className="text-slate-400">Resolved:</span> {formatDateTime(ticket.resolvedAt)}</li>
              ) : null}
              <li>
                <span className="text-slate-400">Replies:</span>{" "}
                {data.messages.filter((m) => m.kind === "reply").length}
              </li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Meta({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={cx("mt-0.5 text-slate-800", muted && "text-slate-400")}>{value}</dd>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Conversation({
  messages,
  currentUserId,
  canManage,
  claimable,
  onChanged,
}: {
  messages: TicketMessage[];
  currentUserId: string;
  canManage: boolean;
  claimable: boolean;
  onChanged: () => void;
}) {
  if (messages.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">Conversation</h2>
        <p className="text-sm text-slate-500">No messages yet. Replies from the support team will appear here.</p>
        {claimable && !canManage ? <ClaimCta onClaimed={onChanged} /> : null}
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Conversation</h2>
      <ol className="space-y-3">
        {messages.map((m) => (
          <li
            key={m.id}
            className={cx(
              "rounded-lg border p-3",
              m.kind === "note"
                ? "border-amber-200 bg-amber-50/60"
                : m.authorId === currentUserId
                  ? "border-indigo-100 bg-indigo-50/50"
                  : "border-slate-200 bg-white"
            )}
          >
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-800">{m.authorName}</span>
              <span
                className={cx(
                  "rounded px-1.5 py-px text-[11px]",
                  m.authorRole === "customer" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-600"
                )}
              >
                {m.authorRole === "customer" ? "Customer" : m.authorRole === "admin" ? "Admin" : "Support agent"}
              </span>
              {m.kind === "note" ? (
                <span className="rounded bg-amber-200/70 px-1.5 py-px font-medium text-amber-900">
                  Internal note · never shown to the customer
                </span>
              ) : null}
              <time className="ml-auto text-slate-400" dateTime={m.createdAt} title={formatDateTime(m.createdAt)}>
                {timeAgo(m.createdAt)}
              </time>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{m.body}</p>
          </li>
        ))}
      </ol>
      {claimable && !canManage ? <ClaimCta onClaimed={onChanged} /> : null}
    </section>
  );
}

function ClaimCta({ onClaimed }: { onClaimed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const { id = "" } = useParams();

  return (
    <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
      <ErrorNotice message={err} className="mb-2" />
      <p className="mb-2 text-sm text-slate-600">You can see this ticket, but you are not assigned to it yet.</p>
      <Button
        size="sm"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setErr("");
          void api
            .patch(`/tickets/${id}/claim`, {})
            .then(onClaimed)
            .catch((e) => setErr(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Claiming…" : "Claim this ticket"}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ComposeBox({
  ticketId,
  onPosted,
  customerOnly = false,
  closed = false,
}: {
  ticketId: string;
  onPosted: () => void;
  customerOnly?: boolean;
  closed?: boolean;
}) {
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setErr("");
    try {
      if (customerOnly || mode === "reply") {
        await api.post(`/tickets/${ticketId}/replies`, { body });
      } else {
        await api.post(`/tickets/${ticketId}/notes`, { body });
      }
      setBody("");
      onPosted();
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {customerOnly ? "Add a reply" : mode === "reply" ? "Reply to customer" : "Internal note"}
      </h2>

      {!customerOnly ? (
        <div className="mb-3 inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("reply")}
            className={cx(
              "rounded-md px-3 py-1.5 font-medium",
              mode === "reply" ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            Reply (customer sees)
          </button>
          <button
            type="button"
            onClick={() => setMode("note")}
            className={cx(
              "rounded-md px-3 py-1.5 font-medium",
              mode === "note" ? "bg-amber-500 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            Internal note (staff only)
          </button>
        </div>
      ) : null}

      {closed ? (
        <p className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          This ticket is closed. Adding a reply lets the team know you need it reopened.
        </p>
      ) : null}

      <form onSubmit={submit} className="space-y-3">
        <ErrorNotice message={err} />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          required
          maxLength={4000}
          placeholder={
            mode === "note"
              ? "Internal context for other agents and admins. Customers never see this."
              : "Write your message…"
          }
          className={cx(inputCls, "resize-y")}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={busy || !body.trim()}>
            {busy ? "Sending…" : customerOnly ? "Send reply" : mode === "note" ? "Save note" : "Send reply"}
          </Button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

function StatusCard({
  ticket,
  transitions,
  onChangeDone,
}: {
  ticket: TicketDetail;
  transitions: { to: TicketStatus; requiresReason: boolean }[];
  onChangeDone: () => void;
}) {
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const selected = transitions.find((t) => t.to === next);
  const needReason = !!selected?.requiresReason;
  const forward = transitions.find((t) => !t.requiresReason)?.to ?? null;

  async function run(body: { status: string; reason?: string }) {
    setBusy(true);
    setErr("");
    try {
      await api.patch(`/tickets/${ticket.id}/status`, body);
      setNext("");
      setReason("");
      onChangeDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!next) return;
    await run({ status: next, reason: needReason ? reason : undefined });
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Status</h2>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm text-slate-600">Current:</span>
        <StatusBadge status={ticket.status} />
      </div>

      {forward ? (
        <div className="mb-3">
          <p className="mb-1.5 text-xs text-slate-500">Advance to the next stage:</p>
          <Button className="w-full" disabled={busy} onClick={() => void run({ status: forward })}>
            {busy ? "Updating…" : `Mark ${STATUS_LABEL[forward]}`}
          </Button>
        </div>
      ) : null}

      <form onSubmit={submit} className="space-y-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          Other transitions (reopening a resolved/closed ticket needs a reason):
        </p>
        <select value={next} onChange={(e) => setNext(e.target.value)} className={inputCls}>
          <option value="">Select a status…</option>
          {transitions.map((t) => (
            <option key={t.to} value={t.to}>
              {STATUS_LABEL[t.to]}
              {t.requiresReason ? " (needs reason)" : ""}
            </option>
          ))}
        </select>
        {needReason ? (
          <Field label="Reason (required)" htmlFor="status-reason">
            <textarea
              id="status-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              maxLength={500}
              required
              className={cx(inputCls, "resize-y")}
              placeholder="Why is the ticket moving backwards?"
            />
          </Field>
        ) : null}
        <ErrorNotice message={err} />
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          disabled={busy || !next || (needReason && !reason.trim())}
        >
          {busy ? "Updating…" : "Change status"}
        </Button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------

function ClaimCard({ ticket, onClaimed }: { ticket: TicketDetail; onClaimed: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  return (
    <section className="card border-indigo-200 p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-indigo-700">Unclaimed ticket</h2>
      <p className="mb-3 text-sm text-slate-600">Claim it to assign it to yourself and start working on it.</p>
      <ErrorNotice message={err} className="mb-2" />
      <Button
        className="w-full"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setErr("");
          void api
            .patch(`/tickets/${ticket.id}/claim`, {})
            .then(onClaimed)
            .catch((e) => setErr(errorMessage(e)))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Claiming…" : "Claim ticket"}
      </Button>
    </section>
  );
}

// ---------------------------------------------------------------------------

function AssignmentCard({ ticket, onChangeDone }: { ticket: TicketDetail; onChangeDone: () => void }) {
  const [assigneeId, setAssigneeId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const agents = useAsyncData<Agent[]>(
    () => api.get<{ agents: Agent[] }>("/admin/agents").then((d) => d.agents),
    ["assign-agents"]
  );
  const active = (agents.data ?? []).filter((a) => a.isActive);

  if (ticket.status === "closed") {
    return <section className="card p-5 text-sm text-slate-500">Closed tickets cannot be reassigned.</section>;
  }

  async function run(target: string | null) {
    setBusy(true);
    setErr("");
    try {
      await api.patch(`/tickets/${ticket.id}/assign`, { assigneeId: target });
      setAssigneeId("");
      onChangeDone();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Assignment</h2>
      <p className="mb-1.5 text-xs text-slate-500">Currently:</p>
      <p className="mb-3 text-sm font-medium text-slate-800">
        {ticket.assigneeName ?? <span className="text-slate-400">Unassigned</span>}
      </p>

      <div className="space-y-2">
        <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} className={inputCls}>
          <option value="">Assign to…</option>
          {active.map((a) => (
            <option key={a.id} value={a.id}>
              {a.fullName}
            </option>
          ))}
        </select>
        <ErrorNotice message={err} />
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={busy || !assigneeId} onClick={() => void run(assigneeId)}>
            {busy ? "Saving…" : "Reassign"}
          </Button>
          {ticket.assigneeId ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy || ticket.status !== "open"}
              title={
                ticket.status === "open"
                  ? "Return to the queue"
                  : "Only open tickets can be returned to the queue"
              }
              onClick={() => void run(null)}
            >
              Unassign
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function StatusHistory({ history }: { history: TicketDetailResponse["history"] }) {
  if (history.length === 0) {
    return (
      <section className="card p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Status history</h2>
        <p className="text-sm text-slate-500">No status changes recorded yet.</p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Status history</h2>
      <ol className="relative ml-2 space-y-4 border-l border-slate-200 pl-5">
        {history.map((h) => (
          <li key={h.id} className="relative text-sm">
            <span className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-indigo-500 ring-1 ring-indigo-200" />
            <p className="text-slate-800">
              {h.fromStatus ? (
                <>
                  <span className="font-medium">{STATUS_LABEL[h.fromStatus]}</span>
                  <span className="mx-1 text-slate-400">→</span>
                  <span className="font-medium">{STATUS_LABEL[h.toStatus]}</span>
                </>
              ) : (
                <span className="font-medium">Ticket opened</span>
              )}{" "}
              <span className="text-slate-400">by {h.changedByName}</span>
            </p>
            {h.reason ? <p className="mt-0.5 italic text-amber-700">“{h.reason}”</p> : null}
            <time className="text-xs text-slate-400" dateTime={h.createdAt}>
              {formatDateTime(h.createdAt)}
            </time>
          </li>
        ))}
      </ol>
    </section>
  );
}
