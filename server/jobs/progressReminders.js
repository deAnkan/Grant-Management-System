import cron from "node-cron";
import Application from "../models/application.model.js";
import {
  sendProgressReminderMail,
  sendProgressDueDateMail,
} from "../utils/mailer.utils.js";
import { createNotification } from "../services/notification.service.js";

// Function to check for upcoming and due progress reports
const checkProgressReports = async () => {
  console.log("Running scheduled job: Checking for progress reports...");

  try {
    const approvedApplications = await Application.find({
      status: "approved",
      researchCompleted: false,
      grantApprovalDate: { $ne: null },
    }).populate("submittedBy", "fullName email");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const app of approvedApplications) {
      const approvalDate = new Date(app.grantApprovalDate);
      approvalDate.setHours(0, 0, 0, 0);

      let monthsSinceApproval =
        (today.getFullYear() - approvalDate.getFullYear()) * 12 +
        (today.getMonth() - approvalDate.getMonth());

      // Check if it's a 6-month interval
      if (monthsSinceApproval > 0 && monthsSinceApproval % 6 === 0) {
        const dueDate = new Date(approvalDate);
        dueDate.setMonth(dueDate.getMonth() + monthsSinceApproval);

        const reminderDate = new Date(dueDate);
        reminderDate.setDate(reminderDate.getDate() - 7);

        // Send 1-week reminder
        if (today.getTime() === reminderDate.getTime()) {
          await sendProgressReminderMail(
            app.submittedBy.email,
            app.submittedBy.fullName,
            app.title,
            dueDate,
          );
          await createNotification({
            recipientId: app.submittedBy._id,
            recipientRole: "faculty",
            actorId: null,
            type: "PROGRESS_REMINDER",
            title: "Progress Reminder",
            message:
              'Reminder: Progress report for "' +
              app.title +
              '" is due in one week.',
            relatedApplicationId: app._id,
            data: {
              dueDate,
            },
            eventKey:
              "progress-reminder:" +
              String(app._id) +
              ":" +
              dueDate.toISOString().slice(0, 10),
          });
        }

        // Send due date notification
        if (today.getTime() === dueDate.getTime()) {
          await sendProgressDueDateMail(
            app.submittedBy.email,
            app.submittedBy.fullName,
            app.title,
            dueDate,
          );
          await createNotification({
            recipientId: app.submittedBy._id,
            recipientRole: "faculty",
            actorId: null,
            type: "PROGRESS_DUE_TODAY",
            title: "Progress Due Today",
            message:
              'Action required: Progress report for "' +
              app.title +
              '" is due today.',
            relatedApplicationId: app._id,
            data: {
              dueDate,
            },
            eventKey:
              "progress-due:" +
              String(app._id) +
              ":" +
              dueDate.toISOString().slice(0, 10),
          });
        }
      }
    }
  } catch (error) {
    console.error("Error in progress report job:", error);
  }
};

// Schedule the job to run once every day at midnight
export const scheduleProgressReminders = () => {
  cron.schedule("0 0 * * *", checkProgressReports, {
    scheduled: true,
    timezone: "Asia/Kolkata",
  });

  console.log("Progress report reminder job scheduled.");
};
