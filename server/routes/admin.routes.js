import { Router } from "express";
import { 
    // registerAdmin,
    // loginAdmin, 
    // forgotPasswordAdmin,
    // resetPasswordAdmin,
    searchApplicationsByTitleAdmin,
    getAllApplications, 
    getApplicationByIdAdmin, 
    rejectApplication, 
    approveApplication, 
    unassignReviewer,
    grantApplication, 
    updateGrantedAmount,
    updateProjectValidity,
    closeProject,
    revertApplicationAction,
    getAllReviewers,
    getReviewerById,
    changeUserRole
} from "../controllers/admin.controller.js";
import { submitReview } from "../controllers/reviewer.controller.js";
import { verifyAdmin } from "../middlewares/auth.middleware.js";

const router = Router();

// // Admin registration route
// router.route("/register").post(registerAdmin)
// // Admin login route
// router.route("/login").post(loginAdmin)
// // Admin routes for password reset
// router.route("/forgot-password").post(forgotPasswordAdmin);
// router.route("/reset-password/:token").post(resetPasswordAdmin);
// Admin routes for managing applications
router.route("/applications/search").get(verifyAdmin, searchApplicationsByTitleAdmin)
router.route("/applications").get(verifyAdmin, getAllApplications)
router.route("/applications/:applicationId").get(verifyAdmin, getApplicationByIdAdmin)
router.route("/applications/:applicationId/reject").patch(verifyAdmin, rejectApplication)
router.route("/applications/:applicationId/approve").patch(verifyAdmin, approveApplication)
router.route("/applications/:applicationId/unassign-reviewer").patch(verifyAdmin, unassignReviewer)
router.route("/applications/:applicationId/review").patch(verifyAdmin, submitReview);
router.route("/applications/:applicationId/grant").patch(verifyAdmin, grantApplication);
router.route("/applications/:applicationId/granted-amount").patch(verifyAdmin, updateGrantedAmount);
router.route("/applications/:applicationId/project-validity").patch(verifyAdmin, updateProjectValidity);
router.route("/applications/:applicationId/close-project").patch(verifyAdmin, closeProject);
router.route("/applications/:applicationId/revert-action").patch(verifyAdmin, revertApplicationAction);

// // Admin-only reviewer registration
// router.route("/register-reviewer").post(verifyAdmin, registerReviewer);

// Admin routes for managing reviewers
router.route("/reviewers").get(verifyAdmin, getAllReviewers);
router.route("/reviewers/:reviewerId").get(verifyAdmin, getReviewerById);
router.route("/users/:userId/role").patch(verifyAdmin, changeUserRole);
export default router;