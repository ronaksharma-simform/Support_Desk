// ---------------------------------------------------------------------------
// Domain types shared across the API layer.
// ---------------------------------------------------------------------------

export type Role = "customer" | "support_agent" | "admin";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketCategory = "billing" | "technical" | "account" | "other";

export type MessageKind = "reply" | "note";

/** Authenticated principal attached to Express requests by requireAuth. */
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

// ---------------------------------------------------------------------------
// Canonical orderings, labels and helpers used by the API and the UI.
// ---------------------------------------------------------------------------

export const STATUS_ORDER: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer",
  support_agent: "Support agent",
  admin: "Admin",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const CATEGORY_LABEL: Record<TicketCategory, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  other: "Other",
};

export const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
export const CATEGORIES: TicketCategory[] = ["billing", "technical", "account", "other"];
export const STATUSES: TicketStatus[] = [...STATUS_ORDER];

export function isStaffRole(role: Role): boolean {
  return role === "support_agent" || role === "admin";
}
