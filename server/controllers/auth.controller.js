import expressAsyncHandler from "express-async-handler";
import { constants, config } from "../constants.js";
import { sendSuccess, sendError, sendServerError } from "../utils/response.utils.js";
import User from "../models/user.model.js";
import LoginOtp from "../models/loginOtp.model.js";
import { generateOtp, hashOtp, getOtpExpiryDate } from "../utils/otp.utils.js";
import { sendLoginOtpMail } from "../utils/authEmail.utils.js";
import { handleForgotPassword, handleResetPassword } from "../utils/authHelpers.js";
import { generatePublicUrl, generateSignedUrl, getFileObject, uploadFile } from "../utils/s3Upload.utils.js";

const allowedRoles = ["admin", "faculty", "reviewer"];
const publicRegistrationRole = "faculty";

const userResponse = (user) => ({
    _id: user._id,
    email: user.email,
    employeeId: user.employeeId,
    fullName: user.fullName,
    role: user.role,
    profileImage: user.profileImage,
});

const profileImageForClient = async (user) => {
    const key = getProfileImageKey(user);

    if (!key) return user.profileImage;

    try {
        return await generateSignedUrl(key);
    } catch (error) {
        console.error("Failed to create profile image URL:", error.message);
        return user.profileImage;
    }
};

const getProfileImageKey = (user) => {
    if (user.profileImageKey) return user.profileImageKey;

    if (user.profileImage?.includes(".s3.")) {
        try {
            return decodeURIComponent(new URL(user.profileImage).pathname.replace(/^\//, ""));
        } catch {
            return null;
        }
    }

    return null;
};

const userResponseWithProfileImage = async (user) => ({
    ...userResponse(user),
    profileImage: await profileImageForClient(user),
});

export const register = expressAsyncHandler(async (req, res) => {
    try {
        const { email, fullName, employeeId, phoneNo, password, role } = req.body;

        if (!email || !fullName || !employeeId || !password) {
            return sendError(res, constants.VALIDATION_ERROR, "email, fullName, employeeId, and password are required");
        }

        if (String(password).length < 8) {
            return sendError(res, constants.VALIDATION_ERROR, "Password must be at least 8 characters long");
        }

        if (role && role !== publicRegistrationRole) {
            return sendError(res, constants.FORBIDDEN, "Only faculty accounts can be registered here");
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const normalizedEmployeeId = String(employeeId).trim();

        const existingUser = await User.findOne({
            $or: [{ email: normalizedEmail }, { employeeId: normalizedEmployeeId }],
        });

        if (existingUser) {
            return sendError(res, constants.CONFLICT, "An account already exists with this email or employee ID");
        }

        const user = await User.create({
            email: normalizedEmail,
            fullName: String(fullName).trim(),
            employeeId: normalizedEmployeeId,
            phoneNo: phoneNo ? String(phoneNo).trim() : undefined,
            password,
            role: publicRegistrationRole,
        });

        return sendSuccess(res, constants.CREATED, "Registration successful", {
            user: userResponse(user),
        });
    } catch (error) {
        return sendServerError(res, error);
    }
});

// One-time bootstrap for a new database. This endpoint is disabled unless the
// server has BOOTSTRAP_ADMIN_SECRET configured, and stops working after an admin exists.
export const bootstrapAdmin = expressAsyncHandler(async (req, res) => {
    try {
        const suppliedSecret = req.header("X-Bootstrap-Secret");
        const { email, fullName, employeeId, phoneNo, password } = req.body;

        if (!config.bootstrapAdminSecret || suppliedSecret !== config.bootstrapAdminSecret) {
            return sendError(res, constants.NOT_FOUND, "Route not found");
        }

        if (!email || !fullName || !employeeId || !password || String(password).length < 8) {
            return sendError(res, constants.VALIDATION_ERROR, "email, fullName, employeeId, and a password of at least 8 characters are required");
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        if (await User.exists({ role: "admin" })) {
            return sendError(res, constants.CONFLICT, "An admin account already exists");
        }

        const user = await User.create({
            email: normalizedEmail,
            fullName: String(fullName).trim(),
            employeeId: String(employeeId).trim(),
            phoneNo: phoneNo ? String(phoneNo).trim() : undefined,
            password,
            role: "admin",
        });

        return sendSuccess(res, constants.CREATED, "Admin account created", { user: userResponse(user) });
    } catch (error) {
        return sendServerError(res, error);
    }
});

export const loginWithPassword = expressAsyncHandler(async (req, res) => {
    try {
        const { email, employeeId, password, role } = req.body;

        if ((!email && !employeeId) || !password || !role) {
            return sendError(res, constants.VALIDATION_ERROR, "email or employeeId, password, and role are required");
        }

        if (!allowedRoles.includes(role)) {
            return sendError(res, constants.VALIDATION_ERROR, "Invalid role");
        }

        const lookup = { role };
        if (email) lookup.email = String(email).trim().toLowerCase();
        if (employeeId) lookup.employeeId = String(employeeId).trim();

        const user = await User.findOne(lookup);
        if (!user || !user.password || !(await user.isPasswordCorrect(password))) {
            return sendError(res, constants.UNAUTHORIZED, "Invalid credentials");
        }

        return sendSuccess(res, constants.OK, "Logged in successfully", {
            accessToken: user.generateAccessToken(),
            user: userResponse(user),
        });
    } catch (error) {
        return sendServerError(res, error);
    }
});

export const forgotPassword = expressAsyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!allowedRoles.includes(role)) {
        return sendError(res, constants.VALIDATION_ERROR, "Invalid role");
    }

    return handleForgotPassword(req, res, role, (token) =>
        `${config.appBaseUrl}/reset-password/${token}?role=${encodeURIComponent(role)}`,
    );
});

export const resetPassword = expressAsyncHandler(async (req, res) => {
    const { role } = req.body;
    if (!allowedRoles.includes(role)) {
        return sendError(res, constants.VALIDATION_ERROR, "Invalid role");
    }

    return handleResetPassword(req, res, role);
});

export const logout = expressAsyncHandler(async (req, res) => {
    try {
        await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
        return sendSuccess(res, constants.OK, "Logged out successfully");
    } catch (error) {
        return sendServerError(res, error);
    }
});

export const updateMyProfile = expressAsyncHandler(async (req, res) => {
    try {
        const { fullName, phoneNo } = req.body;
        const user = await User.findById(req.user._id);

        if (!user) {
            return sendError(res, constants.NOT_FOUND, "User not found");
        }

        if (fullName) user.fullName = String(fullName).trim();
        if (phoneNo !== undefined) user.phoneNo = String(phoneNo).trim() || undefined;

        if (req.file) {
            const key = await uploadFile(req.file, "profile-images");
            user.profileImageKey = key;
            user.profileImage = generatePublicUrl(key);
        }

        await user.save();
        return sendSuccess(res, constants.OK, "Profile updated successfully", { user: await userResponseWithProfileImage(user) });
    } catch (error) {
        return sendServerError(res, error);
    }
});

export const getMyProfile = expressAsyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return sendError(res, constants.NOT_FOUND, "User not found");
        return sendSuccess(res, constants.OK, "Profile retrieved successfully", { user: await userResponseWithProfileImage(user) });
    } catch (error) {
        return sendServerError(res, error);
    }
});

export const getMyProfileImage = expressAsyncHandler(async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        const key = getProfileImageKey(user);

        if (!key) return sendError(res, constants.NOT_FOUND, "Profile image not found");

        const object = await getFileObject(key);
        res.setHeader("Content-Type", object.ContentType || "image/jpeg");
        res.setHeader("Cache-Control", "private, max-age=300");
        object.Body.pipe(res);
    } catch (error) {
        return sendServerError(res, error);
    }
});

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
            user: userResponse(user),
        });
    } catch (error) {
        return sendServerError(res, error);
    }
});
