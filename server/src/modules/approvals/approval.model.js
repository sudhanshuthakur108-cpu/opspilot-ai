import mongoose from 'mongoose';
import { ACTION_NAMES } from './approval.actions.js';

export const APPROVAL_SOURCES = Object.freeze(['ai']);

export const PENDING = 'pending';
export const APPROVED = 'approved';
export const REJECTED = 'rejected';
export const EXECUTED = 'executed';
export const EXECUTION_FAILED = 'execution_failed';

export const APPROVAL_STATUSES = Object.freeze([PENDING, APPROVED, REJECTED, EXECUTED, EXECUTION_FAILED]);

// The only status changes there are. A person approves or rejects a pending proposal; an approved
// one then either runs or fails. Rejected, executed and failed proposals never change again.
export const APPROVAL_TRANSITIONS = Object.freeze({
  [PENDING]: Object.freeze([APPROVED, REJECTED]),
  [APPROVED]: Object.freeze([EXECUTED, EXECUTION_FAILED]),
  [REJECTED]: Object.freeze([]),
  [EXECUTED]: Object.freeze([]),
  [EXECUTION_FAILED]: Object.freeze([]),
});

export function canTransition(from, to) {
  return Object.hasOwn(APPROVAL_TRANSITIONS, from) && APPROVAL_TRANSITIONS[from].includes(to);
}

export const SUMMARY_MAX_LENGTH = 200;
export const REJECTION_REASON_MAX_LENGTH = 200;

const { ObjectId } = mongoose.Schema.Types;

// A proposed change, waiting for or after a person's decision.
const approvalSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    source: { type: String, required: true, enum: APPROVAL_SOURCES },
    action: { type: String, required: true, enum: ACTION_NAMES },
    status: { type: String, required: true, enum: APPROVAL_STATUSES, default: PENDING },
    summary: { type: String, required: true, trim: true, maxlength: SUMMARY_MAX_LENGTH },
    // The action's input as returned by its `prepare` (approval.actions.js). It is checked again
    // before the action runs.
    parameters: { type: mongoose.Schema.Types.Mixed, required: true },
    // The signed-in user whose assistant message led to the proposal.
    requestedByUserId: { type: ObjectId, ref: 'User', required: true },
    reviewedByUserId: { type: ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    rejectionReason: { type: String, trim: true, maxlength: REJECTION_REASON_MAX_LENGTH },
    // Set once an approved action has run: what it created, or why it failed.
    resultType: { type: String },
    resultId: { type: ObjectId },
    failureCode: { type: String },
    failureMessage: { type: String },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

// Serve the organization's newest-first list, whole or for one status.
approvalSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
approvalSchema.index({ organizationId: 1, status: 1, createdAt: -1, _id: -1 });

export const Approval = mongoose.model('Approval', approvalSchema);
