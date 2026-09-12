import { Router } from "express";
import { verifyUser } from "../middlewares/auth.middleware.js";
import {
streamMyNotifications,
getMyNotifications,
getMyUnreadNotificationCount,
markMyNotificationAsRead,
markAllMyNotificationsAsRead,
} from "../controllers/notification.controller.js";

const router = Router();

router.route("/stream").get(streamMyNotifications);

router.use(verifyUser);

router.route("/").get(getMyNotifications);
router.route("/unread-count").get(getMyUnreadNotificationCount);
router.route("/read-all").patch(markAllMyNotificationsAsRead);
router.route("/:notificationId/read").patch(markMyNotificationAsRead);

export default router;