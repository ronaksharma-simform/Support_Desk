import { useState, type FormEvent } from "react";
import { api, errorMessage } from "../lib/api";
import { useAsyncData } from "../hooks/useAsyncData";
import {
  Button,
  ErrorNotice,
  Field,
  PageHeader,
  Spinner,
  cx,
  inputCls,
} from "../components/ui";
import type { Agent } from "../lib/types";
import { formatDate } from "../lib/format";

export function AgentsPage() {
  const { data, error, loading, reload } = useAsyncData<Agent[]>(
    () => api.get<{ agents: Agent[] }>("/admin/agents").then((d) => d.agents),
    ["agents-manage"]
  );

  const [showForm, setShowForm] = useState(false);

  return (
    <div>
      <PageHeader
        title="Agent accounts"
        subtitle="Invite new support agents or deactivate existing ones"
        actions={!showForm ? <Button onClick={() => setShowForm(true)}>Invite agent</Button> : null}
      />

      {showForm ? (
        <InviteForm
          onDone={() => {
            setShowForm(false);
            reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      ) : null}

      {error ? <ErrorNotice message={error} className="mb-4" /> : null}
      {loading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Agent</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Open</th>
                <th className="px-4 py-2.5 font-medium">Closed</th>
                <th className="px-4 py-2.5 font-medium">Total</th>
                <th className="px-4 py-2.5 font-medium">Joined</th>
                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((a) => (
                <AgentRow key={a.id} agent={a} onChange={reload} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent, onChange }: { agent: Agent; onChange: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function toggle() {
    setBusy(true);
    setErr("");
    try {
      await api.patch(`/admin/agents/${agent.id}`, { isActive: !agent.isActive });
      onChange();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-800">{agent.fullName}</p>
        <p className="text-xs text-slate-400">{agent.email}</p>
      </td>
      <td className="px-4 py-3">
        <span
          className={cx(
            "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
            agent.isActive
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-slate-100 text-slate-500 ring-slate-200"
          )}
        >
          {agent.isActive ? "Active" : "Deactivated"}
        </span>
      </td>
      <td className="px-4 py-3 text-sky-700">{agent.openCount}</td>
      <td className="px-4 py-3 text-emerald-700">{agent.closedCount}</td>
      <td className="px-4 py-3 text-slate-600">{agent.totalCount}</td>
      <td className="px-4 py-3 text-slate-500">{formatDate(agent.createdAt)}</td>
      <td className="px-4 py-3 text-right">
        <ErrorNotice message={err} className="mb-1 text-left" />
        <Button
          size="sm"
          variant={agent.isActive ? "danger" : "secondary"}
          disabled={busy}
          onClick={() => void toggle()}
        >
          {busy ? "Saving…" : agent.isActive ? "Deactivate" : "Activate"}
        </Button>
      </td>
    </tr>
  );
}

interface InviteResult {
  agent: Agent;
  temporaryPassword?: string;
}

function InviteForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<InviteResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const res = await api.post<InviteResult>("/admin/agents", {
        fullName,
        email,
        password: password || undefined,
      });
      setResult(res);
    } catch (e2) {
      setErr(errorMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="card mb-4 border-emerald-200 p-5">
        <h3 className="text-sm font-semibold text-emerald-800">
          Agent invited — {result.agent.fullName}
        </h3>
        <p className="mt-2 text-sm text-slate-700">
          {result.temporaryPassword ? (
            <>
              A temporary password was generated. Since SupportDesk has no mailer in this demo,
              share it with the agent once:
            </>
          ) : (
            <>The agent can now sign in with the password you chose.</>
          )}
        </p>
        {result.temporaryPassword ? (
          <p className="mt-3 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 px-4 py-3 font-mono text-lg text-emerald-900">
            {result.temporaryPassword}
          </p>
        ) : null}
        <p className="mt-3 font-mono text-sm text-slate-600">{result.agent.email}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Close
          </Button>
          <Button onClick={onDone}>Invite another</Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card mb-4 space-y-4 p-5">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Invite a support agent
      </h3>
      <ErrorNotice message={err} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Full name" htmlFor="agent-name">
          <input
            id="agent-name"
            required
            minLength={2}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className={inputCls}
            placeholder="Robin Patel"
          />
        </Field>
        <Field label="Work email" htmlFor="agent-email">
          <input
            id="agent-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="robin@example.com"
          />
        </Field>
        <Field
          label="Initial password"
          htmlFor="agent-password"
          hint="Leave blank to generate a temporary one"
        >
          <input
            id="agent-password"
            type="text"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="(auto-generated)"
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? "Inviting…" : "Invite agent"}
        </Button>
      </div>
    </form>
  );
}
