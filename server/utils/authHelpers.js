import crypto from "crypto";
import { constants } from "../constants.js";
import { sendError, sendSuccess, sendServerError } from "./response.utils.js";
import User from "../models/user.model.js";
import { sendPasswordResetMail } from "./mailer.utils.js";

/**
 * Generic forgot password handler for any role
 */
export const handleForgotPassword = async (req, res, role, resetUrlBuilder) => {
  try {
    const { email } = req.body;
    if (!email) {
      return sendError(res, constants.VALIDATION_ERROR, "Email is required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail, role });

    if (!user) {
      return sendError(res, constants.NOT_FOUND, "Email is not registered as " + role);
    }

    const rawToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });

    const resetUrl = resetUrlBuilder(rawToken);

    try {
      await sendPasswordResetMail(user.email, user.fullName, resetUrl, role);
    } catch (mailError) {
      console.error(`Error sending ${role} password reset email:`, mailError);
      user.resetPasswordToken = undefined;
      user.resetPasswordTokenExpiry = undefined;
      await user.save({ validateBeforeSave: false });
      return sendError(res, constants.INTERNAL_SERVER_ERROR, "Email could not be sent");
    }

    return sendSuccess(res, constants.OK, "Reset link sent successfully");
  } catch (error) {
    return sendServerError(res, error);
  }
};

/**
 * Generic reset password handler for any role
 */
export const handleResetPassword = async (req, res, role) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return sendError(res, constants.VALIDATION_ERROR, "password and confirmPassword are required");
    }

    if (password !== confirmPassword) {
      return sendError(res, constants.VALIDATION_ERROR, "Password and confirmPassword must match");
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      role,
      resetPasswordToken: hashedToken,
      resetPasswordTokenExpiry: { $gt: new Date() },
    });

    if (!user) {
      return sendError(res, constants.VALIDATION_ERROR, "Invalid or expired reset token");
    }

    user.password = password;
    user.tokenVersion = Number(user.tokenVersion || 0) + 1;
    user.resetPasswordToken = undefined;
    user.resetPasswordTokenExpiry = undefined;
    await user.save();

    return sendSuccess(res, constants.OK, "Password reset successfully");
  } catch (error) {
    return sendServerError(res, error);
  }
};

/**
 * Generic login handler for any role
 */
export const handleLogin = async (req, res, role) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, constants.VALIDATION_ERROR, "email and password are required");
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user || user.role !== role) {
      return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
      return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
    }

    const accessToken = user.generateAccessToken();

    return sendSuccess(res, constants.OK, `${role} logged in successfully`, { accessToken });
  } catch (error) {
    return sendServerError(res, error);
  }
};

/**
 * Wrap notification side-effects to avoid blocking main response
 */
export const safeNotify = async (notifyFn, contextLabel = "notification") => {
  try {
    await notifyFn();
  } catch (error) {
    console.error(`Warning: Failed to create ${contextLabel}:`, error.message);
  }
};
