import expressAsyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { constants } from "../constants.js";
import { config } from "../constants.js";
import User from "../models/user.model.js";
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

const extractToken = (req) => {
  const headerToken = req.header("Authorization")?.replace("Bearer ", "");
  if (headerToken) return headerToken;

  const queryToken = String(req.query.token || "").trim();
  if (queryToken) return queryToken;

  return null;
};

export const streamMyNotifications = expressAsyncHandler(async (req, res) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(constants.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    let payload;
    try {
      payload = jwt.verify(token, config.accessTokenSecret);
    } catch {
      return res.status(constants.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const user = await User.findById(payload?._id).select("_id role");
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
      res.write(": heartbeat\n\n");
    }, 25000);

    req.on("close", () => {
      clearInterval(heartbeat);
      removeNotificationStreamClient(user._id, res);
      res.end();
    });
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
