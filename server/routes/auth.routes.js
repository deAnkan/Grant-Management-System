import { Router } from "express";
import { bootstrapAdmin, forgotPassword, getMyProfile, getMyProfileImage, loginWithPassword, logout, register, requestLoginOtp, resetPassword, updateMyProfile, verifyLoginOtp } from "../controllers/auth.controller.js";
import { loginRateLimit, otpVerificationRateLimit, registrationRateLimit } from "../middlewares/authRateLimit.middleware.js";
import { verifyUser } from "../middlewares/auth.middleware.js";
import { upload } from "../utils/s3Upload.utils.js";

const router = Router();

router.route("/bootstrap-admin").post(registrationRateLimit, bootstrapAdmin);
router.route("/register").post(registrationRateLimit, register);
router.route("/login-password").post(loginRateLimit, loginWithPassword);
router.route("/request-otp").post(loginRateLimit, requestLoginOtp);
router.route("/verify-otp").post(otpVerificationRateLimit, verifyLoginOtp);
router.route("/forgot-password").post(loginRateLimit, forgotPassword);
router.route("/reset-password/:token").post(otpVerificationRateLimit, resetPassword);
router.route("/logout").post(verifyUser, logout);
router.route("/profile").patch(verifyUser, upload.single("profileImage"), updateMyProfile);
router.route("/profile").get(verifyUser, getMyProfile);
router.route("/profile/image").get(verifyUser, getMyProfileImage);

export default router;
