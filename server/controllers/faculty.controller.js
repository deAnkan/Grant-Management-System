import expressAsyncHandler from "express-async-handler";
import { constants, config } from "../constants.js";
import {
  sendSuccess,
  sendError,
  sendServerError,
} from "../utils/response.utils.js";
import User from "../models/user.model.js";
import Application from "../models/application.model.js";
import { uploadFile, generatePublicUrl } from "../utils/s3Upload.utils.js";
import {
  createNotification,
  createNotificationsForRole,
} from "../services/notification.service.js";
import {
  handleForgotPassword,
  handleResetPassword,
} from "../utils/authHelpers.js";
import { parseSearchQuery, buildSearchFilter } from "../utils/queryHelpers.js";

const ALLOWED_APPLICATION_CATEGORIES = new Set([
  "research",
  "product",
  "startup",
]);

const normalizeApplicationCategory = (category) => {
  const normalizedCategory = String(category || "").trim().toLowerCase();

  if (normalizedCategory === "start up" || normalizedCategory === "start-up") {
    return "startup";
  }

  return normalizedCategory;
};

// export const registerFaculty = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email, fullName, password, phoneNo, employeeId } = req.body;

//         if (!email || !fullName || !password || !phoneNo || !employeeId) {
//             return sendError(res, constants.VALIDATION_ERROR, "All fields are required");
//         }

//         // Validate email domain
//         const allowedDomains = ["iem.edu.in", "uem.edu.in"];
//         const emailDomain = email.split("@")[1]?.toLowerCase();
//         if (!emailDomain || !allowedDomains.includes(emailDomain)) {
//             return sendError(res, constants.VALIDATION_ERROR, "Only emails ending with @iem.edu.in or @uem.edu.in are allowed");
//         }

//         // Check if user already exists
//         const existingUser = await User.findOne({ email });
//         if (existingUser) {
//             return sendError(res, constants.CONFLICT, "User with this email already exists");
//         }

//         // Create new faculty user
//         const faculty = await User.create({
//             email: email.toLowerCase(),
//             fullName,
//             password,
//             role: "faculty",
//             phoneNo,
//             employeeId,
//         })

//         return sendSuccess(res, constants.CREATED, "Faculty registered successfully", { facultyId: faculty._id });
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// export const loginFaculty = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email, employeeId, password } = req.body;

//         // Find user by email or employee ID
//         const query = email ? { email } : { employeeId };
//         const user = await User.findOne(query);

//         if (!user || user.role !== "faculty") {
//             return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
//         }

//         // Check if password is correct
//         const isPasswordValid = await user.isPasswordCorrect(password);
//         if (!isPasswordValid) {
//             return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
//         }

//         const accessToken = user.generateAccessToken();

//         return sendSuccess(res, constants.OK, "Faculty logged in successfully", { accessToken });
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Faculty forgot password - generates reset token, saves to user, sends reset email
// export const forgotPasswordFaculty = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email } = req.body;
//         if (!email) {
//             return sendError(res, constants.VALIDATION_ERROR, "Email is required");
//         }

//         const normalizedEmail = String(email).trim().toLowerCase();
//         const user = await User.findOne({ email: normalizedEmail, role: "faculty" });

//         if (!user) {
//             return sendError(res, constants.NOT_FOUND, "Email is not registered");
//         }

//         if (user.role !== "faculty") {
//             return sendError(res, constants.FORBIDDEN, "This email is not registered as faculty");
//         }

//         const rawToken = user.generatePasswordResetToken();
//         await user.save({ validateBeforeSave: false });

//         const resetUrl = config.facultyResetPasswordUrl + "/" + rawToken;
//         await sendPasswordResetMail(user.email, user.fullName, resetUrl, "faculty");

//         return sendSuccess(res, constants.OK, "Reset link sent successfully");
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Faculty reset password - verifies token, resets password
// export const resetPasswordFaculty = expressAsyncHandler(async (req, res) => {
//     try {
//         const { token } = req.params;
//         const { password, confirmPassword } = req.body;

//         if (!password || !confirmPassword) {
//             return sendError(res, constants.VALIDATION_ERROR, "password and confirmPassword are required");
//         }

//         if (password !== confirmPassword) {
//             return sendError(res, constants.VALIDATION_ERROR, "Password and confirmPassword must match");
//         }

//         const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

//         const user = await User.findOne({
//             role: "faculty",
//             resetPasswordToken: hashedToken,
//             resetPasswordTokenExpiry: { $gt: new Date() },
//         });

//         if (!user) {
//             return sendError(res, constants.VALIDATION_ERROR, "Invalid or expired reset token");
//         }

//         user.password = password;
//         user.resetPasswordToken = undefined;
//         user.resetPasswordTokenRaw = undefined;
//         user.resetPasswordTokenExpiry = undefined;
//         await user.save();

//         return sendSuccess(res, constants.OK, "Password reset successfully");
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// Faculty submits a new application

export const submitApplication = expressAsyncHandler(async (req, res) => {
  try {
    const { title, amountRequested, synopsis, category } = req.body;
    const normalizedCategory = normalizeApplicationCategory(category);

    if (!title || !amountRequested || !synopsis || !normalizedCategory) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Title, category, synopsis, and amount requested are required",
      );
    }

    if (!ALLOWED_APPLICATION_CATEGORIES.has(normalizedCategory)) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Invalid application category",
      );
    }

    // Collect uploaded document URLs from multer
    const uploadedKeys = [];
    for (const file of req.files || []) {
      const key = await uploadFile(file, "documents");
      uploadedKeys.push(key);
    }
    const documentUrls = uploadedKeys.map((key) => generatePublicUrl(key));

    if (documentUrls.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "At least one document must be uploaded",
      );
    }

    const application = await Application.create({
      title,
      category: normalizedCategory,
      amountRequested,
      synopsis,
      documentUrls: documentUrls,
      submittedBy: req.user._id,
      status: "submitted",
      reevaluationRequested: false,
      reevaluationRequestedAt: undefined,
    });

    try {
      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "APPLICATION_SUBMITTED",
        title: "New Application Submitted",
        message: req.user.fullName + " submitted a new application: " + title,
        relatedApplicationId: application._id,
        data: {
          applicationTitle: title,
          status: application.status,
        },
        eventKeyPrefix: "application-submitted:" + String(application._id),
      });

      await createNotification({
        recipientId: req.user._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_SUBMITTED",
        title: "Application Submitted",
        message: "Your application has been submitted successfully.",
        relatedApplicationId: application._id,
        data: {
          applicationTitle: title,
          status: application.status,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create application submission notifications:",
        notificationError,
      );
    }

    return sendSuccess(
      res,
      constants.CREATED,
      "Application submitted successfully",
      { applicationId: application._id },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Faculty views their own applications (to track status)
export const searchMyApplicationsByTitle = expressAsyncHandler(
  async (req, res) => {
    try {
      const queryText = String(req.query.q || req.query.title || "").trim();

      if (!queryText) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Query parameter q or title is required",
        );
      }

      const escapedQuery = queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const applications = await Application.find({
        submittedBy: req.user._id,
        $or: [
          { title: { $regex: escapedQuery, $options: "i" } },
          { applicationId: { $regex: escapedQuery, $options: "i" } },
        ],
      }).sort({ createdAt: -1 });

      return sendSuccess(
        res,
        constants.OK,
        "Your applications searched successfully",
        {
          applications,
          count: applications.length,
        },
      );
    } catch (error) {
      return sendServerError(res, error);
    }
  },
);

// Faculty views their own applications (to track status)
export const getMyApplications = expressAsyncHandler(async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = { submittedBy: req.user._id };
    const status = String(req.query.status || "").trim();

    if (status) {
      filter.status = status;
    }

    const [applications, total] = await Promise.all([
      Application.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Application.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      constants.OK,
      "Applications retrieved successfully",
      {
        applications,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page * limit < total,
          hasPrevPage: page > 1,
        },
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Faculty views a single application by ID
export const getApplicationById = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findOne({
      _id: applicationId,
      submittedBy: req.user._id,
    });

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    return sendSuccess(
      res,
      constants.OK,
      "Application retrieved successfully",
      { application },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const markApplicationCompleted = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findOne({
      _id: applicationId,
      submittedBy: req.user._id,
    });

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.grantedAmount == null) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Only granted applications can be marked as completed",
      );
    }

    if (application.projectStatus === "closed") {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Project is already closed",
      );
    }

    if (application.researchCompleted) {
      return sendSuccess(
        res,
        constants.OK,
        "Application is already marked as completed",
        {
          application,
        },
      );
    }

    application.researchCompleted = true;
    application.researchCompletedAt = new Date();
    await application.save();

    try {
      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "PROJECT_COMPLETION_MARKED",
        title: "Project Marked Completed",
        message:
          req.user.fullName +
          ' marked project "' +
          application.title +
          '" as completed. Review and close if appropriate.',
        relatedApplicationId: application._id,
        data: {
          researchCompleted: application.researchCompleted,
          researchCompletedAt: application.researchCompletedAt,
          projectStatus: application.projectStatus,
        },
        eventKeyPrefix: "project-completed:" + String(application._id),
      });

      await createNotification({
        recipientId: req.user._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "PROJECT_COMPLETION_MARKED",
        title: "Completion Submitted",
        message:
          "You marked this project as completed. Admin will review and close it.",
        relatedApplicationId: application._id,
        data: {
          researchCompleted: application.researchCompleted,
          researchCompletedAt: application.researchCompletedAt,
          projectStatus: application.projectStatus,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create project completion notifications:",
        notificationError,
      );
    }

    return sendSuccess(
      res,
      constants.OK,
      "Application marked as completed successfully",
      {
        application,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const withdrawApplication = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findOne({
      _id: applicationId,
      submittedBy: req.user._id,
    });

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.status === "withdrawn") {
      return sendSuccess(res, constants.OK, "Application already withdrawn", {
        application,
      });
    }

    if (!["submitted", "initialScreening"].includes(application.status)) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Application can only be withdrawn before it is sent to reviewers",
      );
    }

    application.status = "withdrawn";
    application.reviewers = [];
    application.reviewer = undefined;
    application.marks = [];
    await application.save();

    try {
      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "APPLICATION_WITHDRAWN",
        title: "Application Withdrawn",
        message:
          req.user.fullName + ' withdrew application "' + application.title + '".',
        relatedApplicationId: application._id,
        data: {
          applicationTitle: application.title,
          status: application.status,
        },
        eventKeyPrefix: "application-withdrawn:" + String(application._id),
      });

      await createNotification({
        recipientId: req.user._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_WITHDRAWN",
        title: "Application Withdrawn",
        message: "You withdrew this application successfully.",
        relatedApplicationId: application._id,
        data: {
          applicationTitle: application.title,
          status: application.status,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create withdrawal notifications:",
        notificationError,
      );
    }

    return sendSuccess(res, constants.OK, "Application withdrawn successfully", {
      application,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const reopenWithdrawnApplication = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { title, amountRequested, synopsis, category } = req.body;

    const application = await Application.findOne({
      _id: applicationId,
      submittedBy: req.user._id,
    });

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.status !== "withdrawn") {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Only withdrawn applications can be reopened",
      );
    }

    const normalizedTitle =
      title !== undefined && title !== null ? String(title).trim() : undefined;
    const normalizedSynopsis =
      synopsis !== undefined && synopsis !== null
        ? String(synopsis).trim()
        : undefined;
    const normalizedCategory =
      category !== undefined && category !== null
        ? normalizeApplicationCategory(category)
        : undefined;
    const hasAmountField = amountRequested !== undefined && amountRequested !== null;
    const normalizedAmount = hasAmountField ? Number(amountRequested) : undefined;

    if (normalizedTitle !== undefined && !normalizedTitle) {
      return sendError(res, constants.VALIDATION_ERROR, "Title cannot be empty");
    }

    if (normalizedSynopsis !== undefined && !normalizedSynopsis) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Synopsis cannot be empty",
      );
    }

    if (
      hasAmountField &&
      (!Number.isFinite(normalizedAmount) || normalizedAmount < 0)
    ) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Amount requested must be a valid non-negative number",
      );
    }

    if (normalizedCategory !== undefined) {
      if (!normalizedCategory) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Category cannot be empty",
        );
      }

      if (!ALLOWED_APPLICATION_CATEGORIES.has(normalizedCategory)) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Invalid application category",
        );
      }
    }

    const uploadedKeys = [];
    for (const file of req.files || []) {
      const key = await uploadFile(file, "documents");
      uploadedKeys.push(key);
    }
    const newDocumentUrls = uploadedKeys.map((key) => generatePublicUrl(key));

    if (normalizedTitle !== undefined) {
      application.title = normalizedTitle;
    }

    if (normalizedSynopsis !== undefined) {
      application.synopsis = normalizedSynopsis;
    }

    if (hasAmountField) {
      application.amountRequested = normalizedAmount;
    }

    if (normalizedCategory !== undefined) {
      application.category = normalizedCategory;
    }

    if (newDocumentUrls.length > 0) {
      application.documentUrls = newDocumentUrls;
    }

    application.status = "submitted";
    application.reevaluationRequested = false;
    application.reevaluationRequestedAt = undefined;
    application.comments = "";
    application.reviewers = [];
    application.reviewer = undefined;
    application.marks = [];

    await application.save();

    try {
      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "APPLICATION_REOPENED",
        title: "Application Reopened",
        message:
          req.user.fullName +
          ' reopened application "' +
          application.title +
          '" for processing.',
        relatedApplicationId: application._id,
        data: {
          applicationTitle: application.title,
          status: application.status,
          documentsUpdated: newDocumentUrls.length > 0,
        },
        eventKeyPrefix: "application-reopened:" + String(application._id),
      });

      await createNotification({
        recipientId: req.user._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_REOPENED",
        title: "Application Reopened",
        message:
          "Your withdrawn application has been reopened and sent for screening.",
        relatedApplicationId: application._id,
        data: {
          applicationTitle: application.title,
          status: application.status,
          documentsUpdated: newDocumentUrls.length > 0,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create reopen notifications:",
        notificationError,
      );
    }

    return sendSuccess(res, constants.OK, "Application reopened successfully", {
      application,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const requestReevaluation = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { title, amountRequested, synopsis, category } = req.body;
    const normalizedCategory = normalizeApplicationCategory(category);

    if (!title || !amountRequested || !synopsis || !normalizedCategory) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Title, category, synopsis, and amount requested are required",
      );
    }

    if (!ALLOWED_APPLICATION_CATEGORIES.has(normalizedCategory)) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Invalid application category",
      );
    }

    const application = await Application.findOne({
      _id: applicationId,
      submittedBy: req.user._id,
    });

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.status !== "rejected") {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Only rejected applications can be submitted for re-evaluation",
      );
    }

    const uploadedKeys = [];
    for (const file of req.files || []) {
      const key = await uploadFile(file, "documents");
      uploadedKeys.push(key);
    }
    const documentUrls = uploadedKeys.map((key) => generatePublicUrl(key));

    if (documentUrls.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "At least one updated document must be uploaded",
      );
    }

    application.title = title;
    application.category = normalizedCategory;
    application.amountRequested = Number(amountRequested);
    application.synopsis = synopsis;
    application.documentUrls = documentUrls;
    application.status = "submitted";
    application.reevaluationRequested = true;
    application.reevaluationRequestedAt = new Date();
    application.comments = "";
    application.reviewers = [];
    application.reviewer = undefined;
    application.marks = [];

    await application.save();

    try {
      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "APPLICATION_REEVALUATION_REQUESTED",
        title: "Re-evaluation Requested",
        message:
          req.user.fullName +
          ' resubmitted application "' +
          application.title +
          '" for re-evaluation.',
        relatedApplicationId: application._id,
        data: {
          applicationTitle: application.title,
          status: application.status,
        },
        eventKeyPrefix: "application-reevaluation:" + String(application._id),
      });

      await createNotification({
        recipientId: req.user._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_REEVALUATION_REQUESTED",
        title: "Re-evaluation Request Submitted",
        message:
          "Your rejected application has been resubmitted for re-evaluation.",
        relatedApplicationId: application._id,
        data: {
          applicationTitle: application.title,
          status: application.status,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create re-evaluation notifications:",
        notificationError,
      );
    }

    return sendSuccess(
      res,
      constants.OK,
      "Re-evaluation request submitted successfully",
      { application },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});
