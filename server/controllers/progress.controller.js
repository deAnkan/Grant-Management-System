import expressAsyncHandler from "express-async-handler";
import { constants } from "../constants.js";
import {
  sendSuccess,
  sendError,
  sendServerError,
} from "../utils/response.utils.js";
import Application from "../models/application.model.js";
import Progress from "../models/progress.model.js";
import { uploadFile, generatePublicUrl } from "../utils/s3Upload.utils.js";
import {
  createNotification,
  createNotificationsForRole,
} from "../services/notification.service.js";

// Anyone authenticated can fetch progress reports for an application
export const getProgressReports = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId);
    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    const reports = await Progress.find({ applicationId })
      .sort({ createdAt: -1 })
      .populate("submittedBy", "fullName email employeeId");

    return sendSuccess(
      res,
      constants.OK,
      "Progress reports fetched successfully",
      { reports },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Faculty submits a progress report for an application
export const submitProgressReport = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { description, amountSpent } = req.body;
    const documentFiles = req.files || []; // From multer middleware

    if (!description) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Progress description is required",
      );
    }

    if (
      amountSpent === undefined ||
      amountSpent === null ||
      amountSpent === ""
    ) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Amount spent is required",
      );
    }

    const parsedAmountSpent = parseFloat(amountSpent);
    if (isNaN(parsedAmountSpent) || parsedAmountSpent < 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Amount spent must be a valid positive number",
      );
    }

    if (!documentFiles || documentFiles.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "At least one document is required",
      );
    }

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "_id fullName email role",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    const ownerID = String(
      application?.submittedBy?._id || application?.submittedBy,
    );
    if (ownerID !== String(req.user._id)) {
      return sendError(
        res,
        constants.FORBIDDEN,
        "You are not authorized to submit progress for this application",
      );
    }

    if (application.status !== "approved") {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Progress reports can be submitted only for grant-approved applications",
      );
    }

    // Validate amountSpent does not exceed grantedAmount
    if (parsedAmountSpent > application.grantedAmount) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        `Amount spent cannot exceed the granted amount of ${application.grantedAmount}`,
      );
    }

    // Enforce cumulative spending across all progress reports for this application
    const existingSpendSummary = await Progress.aggregate([
      {
        $match: {
          applicationId: application._id,
        },
      },
      {
        $group: {
          _id: null,
          totalSpent: {
            $sum: "$amountSpent",
          },
        },
      },
    ]);

    const currentTotalSpent = Number(
      existingSpendSummary?.[0]?.totalSpent || 0,
    );
    const projectedTotalSpent = currentTotalSpent + parsedAmountSpent;

    if (projectedTotalSpent > Number(application.grantedAmount || 0)) {
      const remainingAmount = Math.max(
        Number(application.grantedAmount || 0) - currentTotalSpent,
        0,
      );
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        `Progress amount exceeds remaining grant. Remaining allowable amount is INR ${remainingAmount.toLocaleString("en-IN")}.`,
      );
    }

    // Upload documents to S3 and get their URLs
    const uploadedKeys = [];
    for (const file of documentFiles) {
      const key = await uploadFile(file, "progress-documents");
      uploadedKeys.push(key);
    }
    const documentUrls = uploadedKeys.map((key) => generatePublicUrl(key));

    const progress = await Progress.create({
      applicationId,
      submittedBy: req.user._id,
      description,
      amountSpent: parsedAmountSpent,
      documentUrls,
    });

    // Send email to faculty
    try {
      const { sendProgressSubmissionNotificationFaculty } =
        await import("../utils/mailer.utils.js");
      await sendProgressSubmissionNotificationFaculty(
        application.submittedBy.email,
        application.submittedBy.fullName,
        application.title,
        description,
        parsedAmountSpent,
      );
    } catch (mailError) {
      console.error("Error sending faculty notification email:", mailError);
    }

    // Send detailed email to admin
    try {
      const User = (await import("../models/user.model.js")).default;
      const { sendProgressSubmissionNotificationAdmin } =
        await import("../utils/mailer.utils.js");

      const adminUser = await User.findOne({ role: "admin" });
      if (adminUser) {
        await sendProgressSubmissionNotificationAdmin(
          adminUser.email,
          application.submittedBy.fullName,
          application.submittedBy.email,
          application.title,
          applicationId,
          description,
          parsedAmountSpent,
          application.grantedAmount,
          documentFiles.length,
        );
      }
    } catch (mailError) {
      console.error("Error sending admin notification email:", mailError);
    }

    try {
      await createNotification({
        recipientId: req.user._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "PROGRESS_SUBMITTED",
        title: "Progress Submitted",
        message:
          'Your progress report for "' +
          application.title +
          '" has been submitted.',
        relatedApplicationId: application._id,
        relatedProgressId: progress._id,
        data: {
          amountSpent: parsedAmountSpent,
          status: application.status,
        },
      });

      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "PROGRESS_SUBMITTED",
        title: "New Progress Report Submitted",
        message:
          application.submittedBy.fullName +
          ' submitted progress for "' +
          application.title +
          '" (Amount spent: INR ' +
          Number(parsedAmountSpent).toLocaleString("en-IN") +
          ").",
        relatedApplicationId: application._id,
        relatedProgressId: progress._id,
        data: {
          facultyId: application.submittedBy._id,
          amountSpent: parsedAmountSpent,
          grantedAmount: application.grantedAmount,
          documentCount: documentFiles.length,
        },
        eventKeyPrefix: "progress-submitted:" + String(progress._id),
      });
    } catch (notificationError) {
      console.error(
        "Failed to create progress notifications:",
        notificationError,
      );
    }

    return sendSuccess(
      res,
      constants.CREATED,
      "Progress report submitted successfully",
      {
        progress,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});
