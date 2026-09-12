import nodemailer from "nodemailer";
import { Resend } from "resend";
import { config } from "../constants.js";

const smtpTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: config.emailUser,
        pass: config.emailPass,
    },
});

const resend = config.resendApiKey ? new Resend(config.resendApiKey) : null;

const sendAuthMail = async ({ to, subject, html }) => {
    if (config.mailProvider === "resend") {
        if (!resend) {
            throw new Error("RESEND_API_KEY is missing");
        }

        const { data, error } = await resend.emails.send({
            from: config.resendFromEmail,
            to: [to],
            subject,
            html,
        });

        if (error) {
            throw new Error(error.message || "Failed to send email with Resend");
        }

        return data;
    }

    await smtpTransporter.sendMail({
        from: config.emailUser,
        to,
        subject,
        html,
    });

    return true;
};

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

    return sendAuthMail({
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
}