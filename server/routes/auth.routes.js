import { Router } from "express";
import { requestLoginOtp, verifyLoginOtp } from "../controllers/auth.controller.js";

const router = Router();

router.route("/request-otp").post(requestLoginOtp);
router.route("/verify-otp").post(verifyLoginOtp);

export default router;