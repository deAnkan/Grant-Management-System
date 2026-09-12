import Notification from "../models/notification.model.js";
import User from "../models/user.model.js";
import { publishNotificationEventToUser } from "./notificationStream.service.js";

export const createNotification = async ({
recipientId,
recipientRole,
actorId = null,
type,
title,
message,
relatedApplicationId = null,
relatedProgressId = null,
data = {},
eventKey = null,
}) => {
if (!recipientId || !recipientRole || !type || !title || !message) {
return null;
}

const notification = await Notification.create({
recipient: recipientId,
recipientRole,
actor: actorId,
type,
title,
message,
relatedApplication: relatedApplicationId,
relatedProgress: relatedProgressId,
data,
...(eventKey ? { eventKey } : {}),
});

publishNotificationEventToUser(recipientId, {
kind: "notification_created",
notification,
});

return notification;
};

export const createNotificationsForRole = async ({
role,
actorId = null,
type,
title,
message,
relatedApplicationId = null,
relatedProgressId = null,
data = {},
eventKeyPrefix = null,
excludeUserId = null,
}) => {
const users = await User.find({ role }).select("_id role");
const recipients = excludeUserId
? users.filter((u) => String(u._id) !== String(excludeUserId))
: users;

if (!recipients.length) {
return [];
}

const docs = recipients.map((u) => ({
recipient: u._id,
recipientRole: u.role,
actor: actorId,
type,
title,
message,
relatedApplication: relatedApplicationId,
relatedProgress: relatedProgressId,
data,
...(eventKeyPrefix ? { eventKey: eventKeyPrefix + ":" + String(u._id) } : {}),
}));

try {
const inserted = await Notification.insertMany(docs, { ordered: false });

for (const notification of inserted) {
publishNotificationEventToUser(notification.recipient, {
kind: "notification_created",
notification,
});
}

return inserted;
} catch (error) {
if (error?.writeErrors?.length) {
const onlyDuplicates = error.writeErrors.every((e) => e.code === 11000);
if (onlyDuplicates) {
return [];
}
}
throw error;
}
};

export const getNotificationsForUser = async ({
recipientId,
page = 1,
limit = 20,
unreadOnly = false,
type = "",
}) => {
const normalizedPage = Math.max(Number(page) || 1, 1);
const normalizedLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
const skip = (normalizedPage - 1) * normalizedLimit;

const filter = { recipient: recipientId };
if (unreadOnly) {
filter.isRead = false;
}
if (type) {
filter.type = type;
}

const [notifications, total] = await Promise.all([
Notification.find(filter)
.sort({ createdAt: -1 })
.skip(skip)
.limit(normalizedLimit)
.populate("actor", "fullName email role")
.populate("relatedApplication", "title status")
.lean(),
Notification.countDocuments(filter),
]);

return {
notifications,
pagination: {
page: normalizedPage,
limit: normalizedLimit,
total,
totalPages: Math.ceil(total / normalizedLimit),
hasNextPage: normalizedPage * normalizedLimit < total,
hasPrevPage: normalizedPage > 1,
},
};
};

export const getUnreadCountForUser = async (recipientId) => {
return Notification.countDocuments({
recipient: recipientId,
isRead: false,
});
};

export const markNotificationAsRead = async (notificationId, recipientId) => {
const notification = await Notification.findOneAndUpdate(
{ _id: notificationId, recipient: recipientId },
{ $set: { isRead: true, readAt: new Date() } },
{ new: true }
);

if (notification) {
publishNotificationEventToUser(recipientId, {
kind: "notification_updated",
notification,
});
}

return notification;
};

export const markAllNotificationsAsRead = async (recipientId) => {
const result = await Notification.updateMany(
{ recipient: recipientId, isRead: false },
{ $set: { isRead: true, readAt: new Date() } }
);

if ((result.modifiedCount || 0) > 0) {
publishNotificationEventToUser(recipientId, {
kind: "notifications_all_read",
modifiedCount: result.modifiedCount || 0,
});
}

return result.modifiedCount || 0;
};