export type Role = "customer" | "support_agent" | "admin";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";

export type TicketPriority = "low" | "medium" | "high" | "urgent";

export type TicketCategory = "billing" | "technical" | "account" | "other";

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  isActive: boolean;
}

export interface TicketListItem {
  id: string;
  number: number;
  title: string;
  priority: TicketPriority;
  category: TicketCategory;
  status: TicketStatus;
  createdAt: string;
  updatedAt: string;
  customerId: string;
  customerName: string;
  assigneeId: string | null;
  assigneeName: string | null;
}

export interface TicketDetail extends TicketListItem {
  description: string;
  resolvedAt: string | null;
}

export interface TicketMessage {
  id: string;
  kind: "reply" | "note";
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorRole: Role;
}

export interface StatusEvent {
  id: string;
  fromStatus: TicketStatus | null;
  toStatus: TicketStatus;
  reason: string | null;
  createdAt: string;
  changedByName: string;
}

export interface TransitionOption {
  to: TicketStatus;
  requiresReason: boolean;
}

export interface TicketDetailResponse {
  ticket: TicketDetail;
  messages: TicketMessage[];
  history: StatusEvent[];
  canManage: boolean;
  transitions: TransitionOption[];
}

export interface Agent {
  id: string;
  email: string;
  fullName: string;
  isActive: boolean;
  createdAt: string;
  openCount: number;
  closedCount: number;
  totalCount: number;
}

export interface AdminDashboardData {
  scope: "admin";
  summary: {
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    total: number;
  };
  volumeByDay: { date: string; count: number }[];
  avgResolutionHours: number | null;
  perAgent: {
    agentId: string;
    agentName: string;
    total: number;
    open: number;
    resolved: number;
  }[];
}

export interface AgentDashboardData {
  scope: "agent";
  summary: {
    open: number;
    inProgress: number;
    resolved: number;
    closed: number;
    total: number;
  };
  avgResolutionHours: number | null;
  byPriority: Record<TicketPriority, number>;
}

export const STATUS_ORDER: TicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

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

export const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer",
  support_agent: "Support agent",
  admin: "Admin",
};

export const PRIORITIES: TicketPriority[] = ["low", "medium", "high", "urgent"];
export const CATEGORIES: TicketCategory[] = ["billing", "technical", "account", "other"];
export const STATUSES: TicketStatus[] = [...STATUS_ORDER];

export const isStaff = (role: Role): boolean => role === "support_agent" || role === "admin";
