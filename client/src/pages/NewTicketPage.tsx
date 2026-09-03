import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../auth/AuthContext";
import { Button, ErrorNotice, Field, PageHeader, inputCls } from "../components/ui";
import type { TicketCategory, TicketListItem, TicketPriority } from "../lib/types";
import { CATEGORIES, CATEGORY_LABEL, PRIORITIES, PRIORITY_LABEL } from "../lib/types";

export function NewTicketPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<TicketPriority>("medium");
  const [category, setCategory] = useState<TicketCategory>("technical");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const created = await api.post<{ ticket: TicketListItem }>("/tickets", {
        title,
        description,
        priority,
        category,
      });
      navigate(`/tickets/${created.ticket.id}`, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Submit a new ticket"
        subtitle={
          user?.role === "customer"
            ? "Tell us what happened — the team will pick it up from the queue."
            : "File a ticket on behalf of the signed-in account."
        }
      />

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <ErrorNotice message={error} />
        <Field label="Title" htmlFor="title" hint="Short summary, e.g. “Cannot log in after update”">
          <input
            id="title"
            required
            minLength={3}
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputCls}
            placeholder="What is the issue about?"
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea
            id="description"
            required
            rows={8}
            maxLength={20000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={`${inputCls} resize-y`}
            placeholder="Include what you were doing, what you expected, and what happened instead…"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Priority" htmlFor="priority">
            <select
              id="priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as TicketPriority)}
              className={inputCls}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category" htmlFor="category">
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
              className={inputCls}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={() => navigate(-1)}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Submitting…" : "Submit ticket"}
          </Button>
        </div>
      </form>
    </div>
  );
}
