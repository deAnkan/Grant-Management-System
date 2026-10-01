import expressAsyncHandler from "express-async-handler";
import { randomInt } from "node:crypto";
import { constants, config } from "../constants.js";
import {
  sendSuccess,
  sendError,
  sendServerError,
} from "../utils/response.utils.js";
import {
  sendReviewerCredentialsMail,
  sendPasswordResetMail,
} from "../utils/mailer.utils.js";
import User from "../models/user.model.js";
import Application from "../models/application.model.js";
import {
  createNotification,
  createNotificationsForRole,
} from "../services/notification.service.js";
import {
  handleForgotPassword,
  handleResetPassword,
} from "../utils/authHelpers.js";
import {
  parseSearchQuery,
  buildSearchFilter,
  parsePagination,
  buildPagination,
} from "../utils/queryHelpers.js";

const generateTemporaryPassword = (length = 12) => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  let password = "";

  for (let i = 0; i < length; i += 1) {
    password += chars[randomInt(0, chars.length)];
  }

  return password;
};

// Register reviewer (admin only)
// export const registerReviewer = expressAsyncHandler(async (req, res) => {
//     try {
//         if (req.user?.role !== "admin") {
//             return sendError(res, constants.FORBIDDEN, "Only admin can register reviewers");
//         }

//         const { email, fullName } = req.body;

//         if (!email || !fullName) {
//             return sendError(res, constants.VALIDATION_ERROR, "email and fullName are required");
//         }

//         const normalizedEmail = String(email).trim().toLowerCase();
//         const reviewerPassword = generateTemporaryPassword(10);

//         if (reviewerPassword.length < 8) {
//             return sendError(res, constants.VALIDATION_ERROR, "Password must be at least 8 characters long");
//         }

//         const existingUser = await User.findOne({ email: normalizedEmail });
//         if (existingUser) {
//             return sendError(res, constants.CONFLICT, "User with this email already exists");
//         }

//         const reviewer = await User.create({
//             email: normalizedEmail,
//             fullName,
//             password: reviewerPassword,
//             role: "reviewer",
//         });

//         try {
//             await sendReviewerCredentialsMail(
//                 normalizedEmail,
//                 fullName,
//                 normalizedEmail,
//                 reviewerPassword
//             );
//         } catch (mailError) {
//             // Roll back reviewer if credentials mail fails
//             await User.findByIdAndDelete(reviewer._id);
//             return sendServerError(res, mailError);
//         }

//         return sendSuccess(res, constants.CREATED, "Reviewer registered successfully and credentials sent by email", {
//             reviewerId: reviewer._id,
//             email: reviewer.email,
//         });
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Reviewer login
// export const loginReviewer = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         if (!email || !password) {
//             return sendError(res, constants.VALIDATION_ERROR, "email and password are required");
//         }

//         const normalizedEmail = String(email).trim().toLowerCase();
//         const user = await User.findOne({ email: normalizedEmail });

//         if (!user || user.role !== "reviewer") {
//             return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
//         }

//         const isPasswordValid = await user.isPasswordCorrect(password);
//         if (!isPasswordValid) {
//             return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
//         }

//         const accessToken = user.generateAccessToken();

//         return sendSuccess(res, constants.OK, "Reviewer logged in successfully", { accessToken });
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Reviewer forgot password - generates reset token, saves to user, sends reset email
// export const forgotPasswordReviewer = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email } = req.body;
//         if (!email) {
//             return sendError(res, constants.VALIDATION_ERROR, "Email is required");
//         }

//         const normalizedEmail = String(email).trim().toLowerCase();
//         const user = await User.findOne({ email: normalizedEmail, role: "reviewer" });

//         if (!user) {
//             return sendError(res, constants.NOT_FOUND, "Email is not registered");
//         }

//         if (user.role !== "reviewer") {
//             return sendError(res, constants.FORBIDDEN, "This email is not registered as reviewer");
//         }

//         const rawToken = user.generatePasswordResetToken();
//         await user.save({ validateBeforeSave: false });

//         const resetUrl = config.reviewerResetPasswordUrl + "/" + rawToken;
//         await sendPasswordResetMail(user.email, user.fullName, resetUrl, "reviewer");

//         return sendSuccess(res, constants.OK, "Reset link sent successfully");
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Reviewer reset password - verifies token, resets password
// export const resetPasswordReviewer = expressAsyncHandler(async (req, res) => {
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
//             role: "reviewer",
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

// Reviewer searches assigned applications by title
export const searchAssignedApplicationsByTitle = expressAsyncHandler(
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
        $and: [
          {
            $or: [{ reviewer: req.user._id }, { reviewers: req.user._id }],
          },
          {
            $or: [
              { title: { $regex: escapedQuery, $options: "i" } },
              { applicationId: { $regex: escapedQuery, $options: "i" } },
            ],
          },
        ],
      })
        .populate("submittedBy", "fullName email employeeId")
        .sort({ createdAt: -1 });

      return sendSuccess(
        res,
        constants.OK,
        "Assigned applications searched successfully",
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

// Reviewer gets all applications assigned to them
export const getAssignedApplications = expressAsyncHandler(async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {
      $or: [{ reviewer: req.user._id }, { reviewers: req.user._id }],
    };
    const status = String(req.query.status || "").trim();
    const queryText = String(req.query.q || req.query.title || "").trim();

    if (status) {
      filter.status = status;
    }

    if (queryText) {
      const escapedQuery = queryText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$and = [{
        $or: [
          { title: { $regex: escapedQuery, $options: "i" } },
          { applicationId: { $regex: escapedQuery, $options: "i" } },
        ],
      }];
    }

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .populate("submittedBy", "fullName email employeeId")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Application.countDocuments(filter),
    ]);

    return sendSuccess(
      res,
      constants.OK,
      "Assigned applications retrieved successfully",
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

// Reviewer gets a single assigned application by ID
export const getAssignedApplicationById = expressAsyncHandler(
  async (req, res) => {
    try {
      const { applicationId } = req.params;

      const application = await Application.findOne({
        _id: applicationId,
        $or: [{ reviewer: req.user._id }, { reviewers: req.user._id }],
      }).populate("submittedBy", "fullName email employeeId");

      if (!application) {
        return sendError(
          res,
          constants.NOT_FOUND,
          "Application not found or not assigned to you",
        );
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
  },
);

// Reviewer submits review marks — interview + presentation → calculates average
export const submitReview = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const {
      interviewScore,
      presentationScore,
      reviewerSignature,
      remark,
      reviewerId,
    } =
      req.body;

    if (!["reviewer", "admin"].includes(req.user.role)) {
      return sendError(
        res,
        constants.FORBIDDEN,
        "Only reviewer or admin can submit marks",
      );
    }

    if (interviewScore == null || presentationScore == null) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Both interviewScore and presentationScore are required",
      );
    }

    if (!reviewerSignature) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Reviewer signature is required",
      );
    }

    const iScore = Number(interviewScore);
    const pScore = Number(presentationScore);

    if (
      Number.isNaN(iScore) ||
      Number.isNaN(pScore) ||
      iScore < 0 ||
      pScore < 0
    ) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Scores must be valid non-negative numbers",
      );
    }

    const query =
      req.user.role === "reviewer"
        ? {
            _id: applicationId,
            $or: [{ reviewer: req.user._id }, { reviewers: req.user._id }],
          }
        : { _id: applicationId };

    const application = await Application.findOne(query).populate(
      "submittedBy",
      "fullName email role",
    );

    if (!application) {
      return sendError(
        res,
        constants.NOT_FOUND,
        "Application not found or not assigned to you",
      );
    }

    if (
      !["sentToReviewer", "underReview", "reviewCompleted"].includes(
        application.status,
      )
    ) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Marks can be submitted only after reviewer assignment",
      );
    }

    const averageScore = Number(((iScore + pScore) / 2).toFixed(2));

    const assignedReviewerIds =
      application.reviewers?.length > 0
        ? application.reviewers.map((id) => String(id))
        : application.reviewer
          ? [String(application.reviewer)]
          : [];

    let targetEvaluatorId = req.user._id;
    let targetEvaluatorRole = req.user.role;

    if (req.user.role === "admin" && reviewerId) {
      const targetReviewerId = String(reviewerId).trim();
      const targetReviewer = await User.findOne({
        _id: targetReviewerId,
        role: "reviewer",
      }).select("_id");

      if (!targetReviewer) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Invalid reviewer selected for on-behalf review",
        );
      }

      if (!assignedReviewerIds.includes(targetReviewerId)) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Selected reviewer is not assigned to this application",
        );
      }

      targetEvaluatorId = targetReviewer._id;
      targetEvaluatorRole = "reviewer";
    }

    const markPayload = {
      interviewScore: iScore,
      presentationScore: pScore,
      averageScore,
      reviewerSignature,
      remark: remark || "",
      evaluatedBy: targetEvaluatorId,
      evaluatorRole: targetEvaluatorRole,
      evaluatedAt: new Date(),
    };

    const existingMarkIndex = (application.marks || []).findIndex(
      (item) => String(item?.evaluatedBy) === String(targetEvaluatorId),
    );

    if (existingMarkIndex >= 0) {
      application.marks[existingMarkIndex] = markPayload;
    } else {
      application.marks = [...(application.marks || []), markPayload];
    }

    const submittedReviewerIds = new Set(
      (application.marks || []).map((item) => String(item?.evaluatedBy)),
    );
    const allAssignedReviewersSubmitted =
      assignedReviewerIds.length > 0 &&
      assignedReviewerIds.every((reviewerId) =>
        submittedReviewerIds.has(reviewerId),
      );

    application.status = allAssignedReviewersSubmitted
      ? "reviewCompleted"
      : "underReview";
    await application.save();

    try {
      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "REVIEW_COMPLETED",
        title: "Review Completed",
        message:
          'Review has been completed for your application "' +
          application.title +
          '".',
        relatedApplicationId: application._id,
        data: {
          status: application.status,
          averageScore,
        },
      });

      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "REVIEW_COMPLETED",
        title: "Review Completed",
        message:
          'Review completed for application "' + application.title + '".',
        relatedApplicationId: application._id,
        data: {
          status: application.status,
          averageScore,
        },
        eventKeyPrefix: "review-completed:" + String(application._id),
      });
    } catch (notificationError) {
      console.error(
        "Failed to create review completion notifications:",
        notificationError,
      );
    }

    return sendSuccess(res, constants.OK, "Review submitted successfully", {
      applicationId: application._id,
      marks: markPayload,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});
