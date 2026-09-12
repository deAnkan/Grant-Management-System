import { Router } from "express";
import {
    // loginReviewer,
    // forgotPasswordReviewer,
    // resetPasswordReviewer,
    searchAssignedApplicationsByTitle,
    getAssignedApplications,
    getAssignedApplicationById,
    submitReview,
} from "../controllers/reviewer.controller.js";
import { verifyReviewer } from "../middlewares/auth.middleware.js";

const router = Router();


// router.route("/login").post(loginReviewer);
// router.route("/forgot-password").post(forgotPasswordReviewer);
// router.route("/reset-password/:token").post(resetPasswordReviewer);
router.route("/applications/search").get(verifyReviewer, searchAssignedApplicationsByTitle);
router.route("/applications").get(verifyReviewer, getAssignedApplications);
router.route("/applications/:applicationId").get(verifyReviewer, getAssignedApplicationById);
router.route("/applications/:applicationId/review").patch(verifyReviewer, submitReview);

export default router;