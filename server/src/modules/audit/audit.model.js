import mongoose from 'mongoose';
import { ACTOR_TYPES, AUDIT_ACTIONS, RESOURCE_TYPES } from './audit.events.js';

const { ObjectId } = mongoose.Schema.Types;

// One recorded event. Entries are only ever added: the store has no way to change or delete them.
const auditLogSchema = new mongoose.Schema(
  {
    organizationId: { type: ObjectId, ref: 'Organization', required: true },
    actorType: { type: String, required: true, enum: ACTOR_TYPES },
    actorUserId: { type: ObjectId, ref: 'User' },
    action: { type: String, required: true, enum: Object.keys(AUDIT_ACTIONS) },
    resourceType: { type: String, required: true, enum: RESOURCE_TYPES },
    resourceId: { type: ObjectId },
    // Only the keys AUDIT_ACTIONS allows for the action (checked in audit.service.js).
    details: { type: Map, of: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Serves the organization's newest-first list.
auditLogSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
