import { STATUS_LABEL, STATUS_ORDER, type TicketStatus } from "./domain";
import { HttpError } from "./utils";

/**
 * Ticket lifecycle policy.
 *
 * Statuses form a pipeline: open -> in_progress -> resolved -> closed.
 *  * Forward moves advance exactly one step (no skipping stages).
 *  * Backward moves (reopening) are allowed but ONLY with a recorded reason.
 */

function indexOf(status: TicketStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export interface TransitionRule {
  to: TicketStatus;
  /** True when the move goes backwards and therefore requires a reason. */
  requiresReason: boolean;
}

export function transitionRules(current: TicketStatus): TransitionRule[] {
  return STATUS_ORDER.filter((s) => s !== current).map((to) => ({
    to,
    requiresReason: indexOf(to) < indexOf(current),
  }));
}

export interface TransitionDecision {
  requiresReason: boolean;
}

/** Throws 400 when the requested move violates the lifecycle policy. */
export function assertTransition(
  current: TicketStatus,
  next: TicketStatus,
  reason: string | undefined
): TransitionDecision {
  const i = indexOf(current);
  const j = indexOf(next);

  if (j === i) {
    throw new HttpError(400, `Ticket is already ${STATUS_LABEL[current]}`);
  }

  if (j < i) {
    if (!reason || reason.trim().length === 0) {
      throw new HttpError(
        400,
        `Moving a ticket backwards to "${STATUS_LABEL[next]}" requires a reason`
      );
    }
    if (reason.trim().length > 500) {
      throw new HttpError(400, "Reason must be at most 500 characters");
    }
    return { requiresReason: true };
  }

  if (j === i + 1) {
    return { requiresReason: false };
  }

  const nextStep = STATUS_ORDER[i + 1];
  throw new HttpError(
    400,
    `Status must advance one step at a time: next status for "${STATUS_LABEL[current]}" is "${STATUS_LABEL[nextStep]}"`
  );
}
