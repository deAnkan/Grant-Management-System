import { Router } from "express";
import { 
    // registerFaculty, 
    // loginFaculty, 
    // forgotPasswordFaculty,
    // resetPasswordFaculty,
    submitApplication, 
    searchMyApplicationsByTitle,
    getMyApplications, 
    getApplicationById,
    markApplicationCompleted,
    withdrawApplication,
    reopenWithdrawnApplication,
    requestReevaluation,
    } from "../controllers/faculty.controller.js";
import { verifyFaculty } from "../middlewares/auth.middleware.js";
import { upload } from "../utils/s3Upload.utils.js";


const router = Router();

// // Faculty registration route
// router.route("/register").post(registerFaculty)
// // Faculty login route
// router.route("/login").post(loginFaculty)
// // Faculty routes for password reset
// router.route("/forgot-password").post(forgotPasswordFaculty);
// router.route("/reset-password/:token").post(resetPasswordFaculty);

// Application routes (protected)
router.route("/applications").post(verifyFaculty, upload.array("documents", 5), submitApplication)
router.route("/applications/search").get(verifyFaculty, searchMyApplicationsByTitle)
router.route("/applications").get(verifyFaculty, getMyApplications)
router.route("/applications/:applicationId").get(verifyFaculty, getApplicationById)
router.route("/applications/:applicationId/mark-completed").patch(verifyFaculty, markApplicationCompleted)
router.route("/applications/:applicationId/withdraw").patch(verifyFaculty, withdrawApplication)
router.route("/applications/:applicationId/reopen").patch(verifyFaculty, upload.array("documents", 5), reopenWithdrawnApplication)
router.route("/applications/:applicationId/re-evaluate").patch(verifyFaculty, upload.array("documents", 5), requestReevaluation)

export default router;