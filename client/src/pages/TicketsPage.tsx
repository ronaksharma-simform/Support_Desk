import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { api } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import { TicketTable } from "../components/TicketTable";
import { Button, ErrorNotice, PageHeader, Spinner, inputCls } from "../components/ui";
import type { Agent, TicketListItem } from "../lib/types";
import { PRIORITIES, PRIORITY_LABEL, STATUSES, STATUS_LABEL } from "../lib/types";

export function TicketsPage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === "admin" ? <AdminTickets /> : <PersonalTickets />;
}

function PersonalTickets() {
  const { user } = useAuth();
  const isAgent = user?.role === "support_agent";
  const { data, error, loading } = useAsyncData<TicketListItem[]>(
    () => api.get<{ tickets: TicketListItem[] }>("/tickets").then((d) => d.tickets),
    ["personal-tickets"]
  );

  return (
    <div>
      <PageHeader
        title="My tickets"
        subtitle={
          isAgent
            ? "Tickets assigned to you, across all statuses"
            : "Every support ticket you have submitted"
        }
        actions={
          <Link to="/tickets/new">
            <Button>New ticket</Button>
          </Link>
        }
      />
      {error ? <ErrorNotice message={error} className="mb-4" /> : null}
      {loading ? (
        <Spinner />
      ) : (
        <TicketTable
          tickets={data ?? []}
          showCustomer={false}
          showAssignee={isAgent}
          emptyTitle={isAgent ? "Nothing assigned to you yet" : "You have not filed any tickets yet"}
          emptyHint={
            isAgent
              ? "Pick up a ticket from the shared queue to get started."
              : "Describe your issue and the team will pick it up."
          }
        />
      )}
    </div>
  );
}

interface TicketFilters {
  status: string;
  priority: string;
  agentId: string;
  from: string;
  to: string;
}

function AdminTickets() {
  const [filters, setFilters] = useState<TicketFilters>({
    status: "",
    priority: "",
    agentId: "",
    from: "",
    to: "",
  });

  const agents = useAsyncData<Agent[]>(
    () => api.get<{ agents: Agent[] }>("/admin/agents").then((d) => d.agents),
    ["agents-list"]
  );

  const query = buildQuery(filters);
  const tickets = useAsyncData<TicketListItem[]>(
    () =>
      api
        .get<{ tickets: TicketListItem[] }>(`/tickets${query ? `?${query}` : ""}`)
        .then((d) => d.tickets),
    [`admin-tickets-${query}`]
  );

  const activeAgents = (agents.data ?? []).filter((a) => a.isActive);

  return (
    <div>
      <PageHeader
        title="All tickets"
        subtitle="Every ticket across all agents and customers"
        actions={
          <span className="text-sm text-slate-500">
            {tickets.data ? `${tickets.data.length} result(s)` : ""}
          </span>
        }
      />

      <div className="card mb-4 p-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <FilterSelect
            label="Status"
            value={filters.status}
            onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
            options={STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
          <FilterSelect
            label="Priority"
            value={filters.priority}
            onChange={(v) => setFilters((f) => ({ ...f, priority: v }))}
            options={PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          />
          <FilterSelect
            label="Agent"
            value={filters.agentId}
            onChange={(v) => setFilters((f) => ({ ...f, agentId: v }))}
            options={activeAgents.map((a) => ({ value: a.id, label: a.fullName }))}
          />
          <FilterDate
            label="From"
            value={filters.from}
            onChange={(v) => setFilters((f) => ({ ...f, from: v }))}
          />
          <FilterDate
            label="To"
            value={filters.to}
            onChange={(v) => setFilters((f) => ({ ...f, to: v }))}
          />
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setFilters({ status: "", priority: "", agentId: "", from: "", to: "" })}
          >
            Clear filters
          </Button>
        </div>
      </div>

      {tickets.error ? <ErrorNotice message={tickets.error} className="mb-4" /> : null}
      {tickets.loading ? (
        <Spinner />
      ) : (
        <TicketTable
          tickets={tickets.data ?? []}
          showCustomer
          showAssignee
          emptyTitle="No tickets match these filters"
          emptyHint="Try widening the date range or clearing the status filter."
        />
      )}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Any</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{label}</span>
      <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
    </label>
  );
}

function buildQuery(f: TicketFilters): string {
  const params = new URLSearchParams();
  if (f.status) params.set("status", f.status);
  if (f.priority) params.set("priority", f.priority);
  if (f.agentId) params.set("agentId", f.agentId);
  if (f.from) params.set("from", f.from);
  if (f.to) params.set("to", f.to);
  return params.toString();
}
