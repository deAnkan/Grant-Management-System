import nodemailer from "nodemailer";
import { config } from "../constants.js";

const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: config.emailUser,
        pass: config.emailPass,
    },
});

const sendMail = async (to, subject, html, attachments = []) => {
    try {
        await transporter.sendMail({
            from: config.emailUser,
            to,
            subject,
            html,
            attachments,
        });
        console.log("Email sent successfully");
    } catch (error) {
        console.error("Error sending email:", error);
    }
};

export const sendRejectionMail = async (email, fullName, title, comments) => {
    await sendMail(
        email,
        "Your Grant Application Has Been Rejected",
        `
            <h3>Dear ${fullName},</h3>
            <p>Your grant application titled <strong>"${title}"</strong> has been rejected.</p>
            <p><strong>Remark:</strong> ${comments}</p>
            <p>If you have any questions, please contact the administration.</p>
            <br/>
            <p>Regards,<br/>Grant-in-Aid Committee</p>
        `
    );
};


export const sendReviewerCredentialsMail = async (email, fullName, loginEmail, plainPassword) => {
    const loginLink = config.reviewerLoginUrl || "http://localhost:5173/reviewer/login";

    await sendMail(
        email,
        "Reviewer Account Credentials - Grant-in-Aid Portal",
        "<h3>Dear " + fullName + ",</h3>" +
        "<p>Your reviewer account has been created by admin.</p>" +
        "<p><strong>Login Email:</strong> " + loginEmail + "</p>" +
        "<p><strong>Password:</strong> " + plainPassword + "</p>" +
        "<p><strong>Login Link:</strong> <a href=\"" + loginLink + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + loginLink + "</a></p>" +
        "<p>Please login and change your password after first login.</p>" +
        "<br/>" +
        "<p>Regards,<br/>Grant-in-Aid Committee</p>"
    );
};


const getFileNameFromUrl = (fileUrl, index) => {
    try {
        const url = new URL(fileUrl);
        const parts = url.pathname.split("/");
        const rawName = parts[parts.length - 1] || ("document-" + (index + 1));
        return decodeURIComponent(rawName);
    } catch (error) {
        return "document-" + (index + 1);
    }
};

export const sendReviewerAssignmentMail = async (
    reviewerEmail,
    reviewerName,
    applicationDetails
) => {
    const documentUrls = applicationDetails.documentUrls || [];

    const attachments = documentUrls.map((fileUrl, index) => ({
        filename: getFileNameFromUrl(fileUrl, index),
        path: fileUrl,
    }));

    const html =
        "<h3>Dear " + reviewerName + ",</h3>" +
        "<p>A new grant application has been assigned to you by admin.</p>" +
        "<p><strong>Application ID:</strong> " + applicationDetails.applicationId + "</p>" +
        "<p><strong>Title:</strong> " + applicationDetails.title + "</p>" +
        "<p><strong>Faculty Name:</strong> " + applicationDetails.facultyName + "</p>" +
        "<p><strong>Faculty Email:</strong> " + applicationDetails.facultyEmail + "</p>" +
        "<p><strong>Status:</strong> " + applicationDetails.status + "</p>" +
        "<p>Application documents are attached with this email.</p>" +
        "<br/>" +
        "<p>Regards,<br/>Grant-in-Aid Committee</p>";

    await sendMail(
        reviewerEmail,
        "New Application Assigned For Review",
        html,
        attachments
    );
};


export const sendGrantApprovedMail = async (
    email,
    fullName,
    title,
    grantedAmount
) => {
    const formattedAmount = Number(grantedAmount).toLocaleString("en-IN");

    const html =
        `<div style='font-family: Arial, sans-serif; color:#1f2937; line-height:1.6;'>` +
        `<h2 style='margin-bottom:8px;'>Grant Approval Notification</h2>` +
        `<p>Dear ${fullName},</p>` +
        `<p>We are pleased to inform you that your grant application has been approved.</p>` +
        `<p><strong>Application Title:</strong> ${title}</p>` +
        `<p><strong>Granted Amount:</strong> INR ${formattedAmount}</p>` +
        `<p>Please keep this email for your records. Further administrative instructions will be shared shortly.</p>` +
        `<br/>` +
        `<p>Regards,<br/>Grant-in-Aid Committee</p>` +
        `</div>`;

    await sendMail(
        email,
        "Your Grant Application Has Been Approved",
        html
    );
};


// ... at the end of the file

export const sendProgressReminderMail = async (
    email,
    fullName,
    title,
    dueDate
) => {
    const formattedDueDate = dueDate.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
    });

    const html = `
        <div style='font-family: Arial, sans-serif; color:#1f2937; line-height:1.6;'>
            <h2 style='margin-bottom:8px;'>Reminder: Half-Yearly Progress Report Due Soon</h2>
            <p>Dear ${fullName},</p>
            <p>This is a friendly reminder that your half-yearly progress report for the grant titled <strong>"${title}"</strong> is due in one week, on <strong>${formattedDueDate}</strong>.</p>
            <p>Please log in to the portal to submit your progress, including a description and any supporting documents.</p>
            <br/>
            <p>Regards,<br/>Grant-in-Aid Committee</p>
        </div>`;

    await sendMail(
        email,
        `Reminder: Progress Report for "${title}"`,
        html
    );
};

export const sendProgressDueDateMail = async (
    email,
    fullName,
    title,
    dueDate
) => {
    const formattedDueDate = dueDate.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });

    const html = `
        <div style='font-family: Arial, sans-serif; color:#1f2937; line-height:1.6;'>
            <h2 style='margin-bottom:8px;'>Action Required: Half-Yearly Progress Report Due Today</h2>
            <p>Dear ${fullName},</p>
            <p>This is a notification that your half-yearly progress report for the grant titled <strong>"${title}"</strong> is due today, <strong>${formattedDueDate}</strong>.</p>
            <p>Please ensure you submit your progress report through the portal at your earliest convenience.</p>
            <br/>
            <p>Regards,<br/>Grant-in-Aid Committee</p>
        </div>`;

    await sendMail(
        email,
        `Action Required: Progress Report for "${title}" is Due`,
        html
    );
};


export const sendPasswordResetMail = async (email, fullName, resetUrl, role) => {

    const token = String(resetUrl || "")
        .split("/")
        .filter(Boolean)
        .pop() || "";

    const html =
        "<div style='font-family: Arial, sans-serif; color:#1f2937; line-height:1.6;'>" +
        "<h2 style='margin-bottom:8px;'>Password Reset Request</h2>" +
        "<p>Dear " + fullName + ",</p>" +
        "<p>We received a request to reset your " + role + " account password.</p>" +
        "<p>Please click the link below to reset your password. This link is valid for 15 minutes.</p>" +
        "<p><a href='" + resetUrl + "' target='_blank' rel='noopener noreferrer'>Reset Password</a></p>" +
        "<p>If you did not request this, please ignore this email.</p>" +
        "<br/>" +
        "<p>Regards,<br/>Grant-in-Aid Committee</p>" +
        "</div>";

    return transporter.sendMail({
        from: config.emailUser,
        to: email,
        subject: "Reset Your Password - Grant-in-Aid Portal",
        html,
    });
};

// Faculty submits a progress report - sends notification email to faculty
export const sendProgressSubmissionNotificationFaculty = async (
    email,
    fullName,
    applicationTitle,
    description,
    amountSpent
) => {
    const formattedAmount = Number(amountSpent).toLocaleString("en-IN");

    const html = `
        <div style='font-family: Arial, sans-serif; color:#1f2937; line-height:1.6;'>
            <h2 style='margin-bottom:8px;'>Progress Report Submitted Successfully</h2>
            <p>Dear ${fullName},</p>
            <p>Your progress report for the grant application has been submitted successfully to the administration.</p>
            <p><strong>Application Title:</strong> ${applicationTitle}</p>
            <p><strong>Amount Spent:</strong> INR ${formattedAmount}</p>
            <p><strong>Progress Description:</strong></p>
            <p style='background-color:#f3f4f6; padding:12px; border-radius:4px;'>${description.replace(/\n/g, '<br>')}</p>
            <p>The administration will review your progress report and you will be notified of any further actions required.</p>
            <br/>
            <p>Regards,<br/>Grant-in-Aid Committee</p>
        </div>`;

    await sendMail(
        email,
        `Progress Report Submitted: "${applicationTitle}"`,
        html
    );
};

// Faculty submits a progress report - sends notification email to admin
export const sendProgressSubmissionNotificationAdmin = async (
    adminEmail,
    facultyName,
    facultyEmail,
    applicationTitle,
    applicationId,
    description,
    amountSpent,
    grantedAmount,
    documentCount
) => {
    const formattedAmountSpent = Number(amountSpent).toLocaleString("en-IN");
    const formattedGrantedAmount = Number(grantedAmount).toLocaleString("en-IN");
    const remainingAmount = (grantedAmount - amountSpent).toLocaleString("en-IN");
    const spentPercentage = ((amountSpent / grantedAmount) * 100).toFixed(2);

    const html = `
        <div style='font-family: Arial, sans-serif; color:#1f2937; line-height:1.6;'>
            <h2 style='margin-bottom:8px; color:#1e40af;'>New Progress Report Submitted</h2>
            <p>A faculty member has submitted a progress report for a grant-approved application.</p>
            
            <h3 style='margin-top:20px; margin-bottom:10px; color:#374151;'>Faculty Information</h3>
            <table style='width:100%; border-collapse:collapse;'>
                <tr style='background-color:#f9fafb;'>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Faculty Name:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>${facultyName}</td>
                </tr>
                <tr>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Faculty Email:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>${facultyEmail}</td>
                </tr>
            </table>

            <h3 style='margin-top:20px; margin-bottom:10px; color:#374151;'>Application Details</h3>
            <table style='width:100%; border-collapse:collapse;'>
                <tr style='background-color:#f9fafb;'>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Application ID:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>${applicationId}</td>
                </tr>
                <tr>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Application Title:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>${applicationTitle}</td>
                </tr>
            </table>

            <h3 style='margin-top:20px; margin-bottom:10px; color:#374151;'>Financial Summary</h3>
            <table style='width:100%; border-collapse:collapse;'>
                <tr style='background-color:#f9fafb;'>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Granted Amount:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>INR ${formattedGrantedAmount}</td>
                </tr>
                <tr>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Amount Spent:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb; color:#dc2626;'><strong>INR ${formattedAmountSpent}</strong></td>
                </tr>
                <tr style='background-color:#f9fafb;'>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Remaining Amount:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>INR ${remainingAmount}</td>
                </tr>
                <tr>
                    <td style='padding:8px; border:1px solid #e5e7eb; font-weight:bold;'>Spent Percentage:</td>
                    <td style='padding:8px; border:1px solid #e5e7eb;'>${spentPercentage}%</td>
                </tr>
            </table>

            <h3 style='margin-top:20px; margin-bottom:10px; color:#374151;'>Progress Description</h3>
            <div style='background-color:#f3f4f6; padding:12px; border-radius:4px; border-left:4px solid #1e40af;'>
                ${description.replace(/\n/g, '<br>')}
            </div>

            <h3 style='margin-top:20px; margin-bottom:10px; color:#374151;'>Attachments</h3>
            <p>${documentCount} document(s) submitted with this progress report.</p>

            <p style='margin-top:20px;'>
                <a href='${config.appBaseUrl}/admin/applications/${applicationId}' 
                   style='display:inline-block; padding:10px 20px; background-color:#1e40af; color:white; text-decoration:none; border-radius:4px;'>
                   View Application Details
                </a>
            </p>

            <br/>
            <p>Regards,<br/>Grant-in-Aid System</p>
        </div>`;

    await sendMail(
        adminEmail,
        `[NEW PROGRESS REPORT] ${applicationTitle} - ${facultyName}`,
        html
    );
};
