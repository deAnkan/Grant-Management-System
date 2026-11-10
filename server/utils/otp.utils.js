import crypto from "crypto";
import { config } from "../constants.js";

export function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(otp) {
    // OTP_HASH_SECRET is mandatory in production (see validateConfig). In
    // development fall back to the access-token secret so local OTP login works.
    const secret = config.otpHashSecret || config.accessTokenSecret;

    return crypto
        .createHmac("sha256", secret)
        .update(String(otp))
        .digest("hex");
}

export function getOtpExpiryDate() {
    return new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);
}