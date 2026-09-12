import { Schema, model } from "mongoose";

export const NOTIFICATION_TYPES = [
    "APPLICATION_SUBMITTED",
    "APPLICATION_WITHDRAWN",
    "APPLICATION_REOPENED",
    "SCREENING_STARTED",
    "SENT_TO_REVIEWER",
    "REVIEWER_UNASSIGNED",
    "UNDER_REVIEW",
    "REVIEW_COMPLETED",
    "APPLICATION_APPROVED",
    "GRANTED_AMOUNT_UPDATED",
    "APPLICATION_REJECTED",
    "APPLICATION_ACTION_REVERTED",
    "APPLICATION_REEVALUATION_REQUESTED",
    "PROJECT_VALIDITY_SET",
    "PROJECT_VALIDITY_EXTENDED",
    "PROJECT_COMPLETION_MARKED",
    "PROJECT_CLOSED",
    "PROGRESS_SUBMITTED",
    "PROGRESS_REMINDER",
    "PROGRESS_DUE_TODAY",
];

const notificationSchema = new Schema(
{
    recipient: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
},
    recipientRole: {
    type: String,
    enum: ["admin", "faculty", "reviewer"],
    required: true,
    index: true,
},
    actor: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
},
    type: {
    type: String,
    enum: NOTIFICATION_TYPES,
    required: true,
    index: true,
},
    title: {
    type: String,
    required: true,
    trim: true,
},
    message: {
    type: String,
    required: true,
    trim: true,
},
    relatedApplication: {
    type: Schema.Types.ObjectId,
    ref: "Application",
    default: null,
    index: true,
},
    relatedProgress: {
    type: Schema.Types.ObjectId,
    ref: "Progress",
    default: null,
},
    data: {
    type: Schema.Types.Mixed,
    default: {},
},
    isRead: {
    type: Boolean,
    default: false,
    index: true,
},
    readAt: {
    type: Date,
    default: null,
},
    eventKey: {
    type: String,
    sparse: true,
    unique: true,
},
},
{ timestamps: true }
);

notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });

const Notification = model("Notification", notificationSchema);

export default Notification;