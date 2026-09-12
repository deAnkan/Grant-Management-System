import crypto from "crypto";
import { config } from "../constants.js";

export function generateOtp() {
    return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(otp) {
    return crypto
        .createHmac("sha256", config.otpHashSecret)
        .update(String(otp))
        .digest("hex");
}

export function getOtpExpiryDate() {
    return new Date(Date.now() + config.otpExpiryMinutes * 60 * 1000);
}