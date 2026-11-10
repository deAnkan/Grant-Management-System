import expressAsyncHandler from "express-async-handler";
import { constants } from "../constants.js";
import { getVerifiedUser } from "../middlewares/auth.middleware.js";
import {
  sendSuccess,
  sendError,
  sendServerError,
} from "../utils/response.utils.js";
import {
  addNotificationStreamClient,
  removeNotificationStreamClient,
} from "../services/notificationStream.service.js";
import {
  getNotificationsForUser,
  getUnreadCountForUser,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from "../services/notification.service.js";

export const streamMyNotifications = expressAsyncHandler(async (req, res) => {
  try {
    const user = await getVerifiedUser(req, { allowQueryToken: true });
    if (!user) {
      return res.status(constants.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (res.flushHeaders) {
      res.flushHeaders();
    }

    addNotificationStreamClient(user._id, res);
    res.write(
      `event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`,
    );

    const heartbeat = setInterval(() => {
      if (!res.writableEnded) {
        res.write(": heartbeat\n\n");
      }
    }, 25000);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      removeNotificationStreamClient(user._id, res);
      if (!res.writableEnded) res.end();
    };

    req.on("close", cleanup);
    res.on("close", cleanup);
    res.on("error", cleanup);
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const getMyNotifications = expressAsyncHandler(async (req, res) => {
  try {
    const page = req.query.page;
    const limit = req.query.limit;
    const unreadOnly =
      String(req.query.unreadOnly || "false").toLowerCase() === "true";
    const type = String(req.query.type || "").trim();

    const result = await getNotificationsForUser({
      recipientId: req.user._id,
      page,
      limit,
      unreadOnly,
      type,
    });

    return sendSuccess(
      res,
      constants.OK,
      "Notifications fetched successfully",
      result,
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const getMyUnreadNotificationCount = expressAsyncHandler(
  async (req, res) => {
    try {
      const unreadCount = await getUnreadCountForUser(req.user._id);

      return sendSuccess(
        res,
        constants.OK,
        "Unread notification count fetched successfully",
        {
          unreadCount,
        },
      );
    } catch (error) {
      return sendServerError(res, error);
    }
  },
);

export const markMyNotificationAsRead = expressAsyncHandler(
  async (req, res) => {
    try {
      const { notificationId } = req.params;

      const notification = await markNotificationAsRead(
        notificationId,
        req.user._id,
      );

      if (!notification) {
        return sendError(res, constants.NOT_FOUND, "Notification not found");
      }

      return sendSuccess(res, constants.OK, "Notification marked as read", {
        notification,
      });
    } catch (error) {
      return sendServerError(res, error);
    }
  },
);

export const markAllMyNotificationsAsRead = expressAsyncHandler(
  async (req, res) => {
    try {
      const modifiedCount = await markAllNotificationsAsRead(req.user._id);

      return sendSuccess(
        res,
        constants.OK,
        "All notifications marked as read",
        {
          modifiedCount,
        },
      );
    } catch (error) {
      return sendServerError(res, error);
    }
  },
);
