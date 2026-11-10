import { config } from "../constants.js";
import { deliverEmail, enqueueEmail } from "../services/email.service.js";

// OTP emails are time-sensitive, so they are delivered immediately (and the
// caller is told if delivery fails). Other account emails go through the outbox.
const sendAuthMail = async ({ to, subject, html }) =>
    deliverEmail({ to, subject, html });

export async function sendLoginOtpMail(email, fullName, otp) {
    return sendAuthMail({
        to: email,
        subject: "Your login OTP",
        html:
            "<p>Hello " + (fullName || "User") + ",</p>" +
            "<p>Your login OTP is:</p>" +
            "<h2>" + otp + "</h2>" +
            "<p>This OTP will expire in " + config.otpExpiryMinutes + " minutes.</p>" +
            "<p>If you did not request this, please ignore this email.</p>",
    });
}

export async function sendRoleChangedMail(email, fullName, oldRole, newRole, changedByName) {
    const roleLabel =
        newRole === "admin" ? "Admin" :
            newRole === "faculty" ? "Faculty" :
                "Reviewer";

    try {
        return await enqueueEmail({
            to: email,
            subject: "Your role has been changed",
            html:
                "<p>Hello " + (fullName || "User") + ",</p>" +
                "<p>Your role in the Grant-in-Aid portal has been changed by admin.</p>" +
                "<p><strong>Previous role:</strong> " + oldRole + "</p>" +
                "<p><strong>New role:</strong> " + roleLabel + "</p>" +
                "<p><strong>Changed by:</strong> " + (changedByName || "Admin") + "</p>" +
                "<p>You can now log in using your registered email, employee ID, and OTP.</p>" +
                "<br/>" +
                "<p>Regards,<br/>Grant-in-Aid Committee</p>",
        });
    } catch (error) {
        console.error("Failed to queue role change email:", error);
        return null;
    }
}