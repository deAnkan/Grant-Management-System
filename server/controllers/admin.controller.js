import expressAsyncHandler from "express-async-handler";
import { constants, config } from "../constants.js";
import {
  sendSuccess,
  sendError,
  sendServerError,
} from "../utils/response.utils.js";
import crypto from "crypto";
import User from "../models/user.model.js";
import Application from "../models/application.model.js";
import { sendRoleChangedMail } from "../utils/authEmail.utils.js";
import Progress from "../models/progress.model.js";
import {
  sendRejectionMail,
  sendReviewerAssignmentMail,
  sendGrantApprovedMail,
  sendPasswordResetMail,
} from "../utils/mailer.utils.js";
import {
  createNotification,
  createNotificationsForRole,
} from "../services/notification.service.js";
import {
  handleForgotPassword,
  handleResetPassword,
  handleLogin,
} from "../utils/authHelpers.js";
import {
  parseSearchQuery,
  buildSearchFilter,
  parsePagination,
  buildPagination,
  escapeRegex,
} from "../utils/queryHelpers.js";

const getAssignedReviewerList = (application) => {
  if (Array.isArray(application?.reviewers) && application.reviewers.length > 0) {
    return application.reviewers;
  }

  return application?.reviewer ? [application.reviewer] : [];
};

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

// export const registerAdmin = expressAsyncHandler(async (req, res) => {
//   try {
//     const { email, fullName, password } = req.body;

//     // Check if user already exists
//     const existingUser = await User.findOne({ email });
//     if (existingUser) {
//       return sendError(
// res,
//   constants.CONFLICT,
//   "User with this email already exists",
// );
//     }

//         // Create new admin user
//         const admin = await User.create({
//             email: email.toLowerCase(),
//             fullName,
//             password,
//             role: "admin",
//         })

//         return sendSuccess(res, constants.CREATED, "Admin registered successfully", { adminId: admin._id });
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// export const loginAdmin = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         // Find user by email
//         const user = await User.findOne({ email });
//         if (!user || user.role !== "admin") {
//             return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
//         }

//         // Check if password is correct
//         const isPasswordValid = await user.isPasswordCorrect(password);
//         if (!isPasswordValid) {
//             return sendError(res, constants.UNAUTHORIZED, "Invalid email or password");
//         }

//         const accessToken = user.generateAccessToken();

//         return sendSuccess(res, constants.OK, "Admin logged in successfully", { accessToken });
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Admin forgot password - generates reset token, saves to user, sends reset email
// export const forgotPasswordAdmin = expressAsyncHandler(async (req, res) => {
//     try {
//         const { email } = req.body;
//         if (!email) {
//             return sendError(res, constants.VALIDATION_ERROR, "Email is required");
//         }

//         const normalizedEmail = String(email).trim().toLowerCase();
//         const user = await User.findOne({ email: normalizedEmail, role: "admin" });

//         if (!user) {
//             return sendError(res, constants.NOT_FOUND, "Email is not registered");
//         }

//         if (user.role !== "admin") {
//             return sendError(res, constants.FORBIDDEN, "This email is not registered as admin");
//         }

//         const rawToken = user.generatePasswordResetToken();
//         await user.save({ validateBeforeSave: false });

//         const resetUrl = config.adminResetPasswordUrl + "/" + rawToken;

//         await sendPasswordResetMail(user.email, user.fullName, resetUrl, "admin");

//         return sendSuccess(res, constants.OK, "Reset link sent successfully");
//     } catch (error) {
//         return sendServerError(res, error);
//     }
// });

// // Admin reset password - verifies token, resets password
// export const resetPasswordAdmin = expressAsyncHandler(async (req, res) => {
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
//             role: "admin",
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

// Admin searches applications by title (case-insensitive, partial match)
export const searchApplicationsByTitleAdmin = expressAsyncHandler(async (req, res) => {
  try {
    const queryText = parseSearchQuery(req);
    if (!queryText) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Query parameter q or title is required",
      );
    }

    const filter = buildSearchFilter(queryText);
    const applications = await Application.find(filter)
      .populate("submittedBy", "fullName email employeeId")
      .populate("reviewer", "fullName email")
      .populate("reviewers", "fullName email")
      .sort({ createdAt: -1 });

    return sendSuccess(
      res,
      constants.OK,
      "Applications searched successfully",
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

export const getAllApplications = expressAsyncHandler(async (req, res) => {
  try {
    const shouldReturnAll = String(req.query.all || "").toLowerCase() === "true";
    const { page, limit, skip } = parsePagination(req, 4);

    const baseFilter = {};
    const statusQuery = String(req.query.status || "").trim();
    const reviewerFilter = String(req.query.reviewerFilter || "all").trim();
    const grantUpdateFilter = String(req.query.grantUpdateFilter || "all").trim();
    const categoryFilter = normalizeApplicationCategory(req.query.category || "all");
    const queryText = parseSearchQuery(req, ["q", "title", "search"]);

    if (reviewerFilter === "assigned") {
      baseFilter.reviewer = { $ne: null };
    } else if (reviewerFilter === "unassigned") {
      baseFilter.reviewer = null;
    }

    if (grantUpdateFilter === "recent") {
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
      baseFilter.grantAmountUpdatedAt = {
        $gte: new Date(Date.now() - THIRTY_DAYS_MS),
      };
    }

    if (categoryFilter !== "all" && ALLOWED_APPLICATION_CATEGORIES.has(categoryFilter)) {
      baseFilter.category = categoryFilter;
    }

    if (queryText) {
      const safePattern = { $regex: escapeRegex(queryText), $options: "i" };
      const matchedUsers = await User.find(
        {
          $or: [{ fullName: safePattern }, { email: safePattern }],
        },
        "_id",
      ).lean();

      const matchedUserIds = matchedUsers.map((user) => user._id);
      baseFilter.$or = [
        { title: safePattern },
        { applicationId: safePattern },
        { submittedBy: { $in: matchedUserIds } },
      ];
    }

    const filter = { ...baseFilter };
    if (statusQuery) {
      const statusList = statusQuery
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (statusList.length === 1) {
        filter.status = statusList[0];
      } else if (statusList.length > 1) {
        filter.status = { $in: statusList };
      }
    }

    const statusCountPipeline = [
      ...(Object.keys(baseFilter).length > 0 ? [{ $match: baseFilter }] : []),
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ];

    const [applications, total, baseTotal, groupedStatusCounts] = await Promise.all([
      (shouldReturnAll
        ? Application.find(filter)
          .populate("submittedBy", "fullName email employeeId")
          .populate("reviewer", "fullName email")
          .populate("reviewers", "fullName email")
          .sort({ createdAt: -1 })
        : Application.find(filter)
          .populate("submittedBy", "fullName email employeeId")
          .populate("reviewer", "fullName email")
          .populate("reviewers", "fullName email")
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)),
      Application.countDocuments(filter),
      Application.countDocuments(baseFilter),
      Application.aggregate(statusCountPipeline),
    ]);

    const statusCounts = groupedStatusCounts.reduce(
      (acc, entry) => {
        acc[String(entry._id)] = Number(entry.count || 0);
        return acc;
      },
      { all: baseTotal },
    );

    const pagination = shouldReturnAll
      ? {
        page: 1,
        limit: total,
        total,
        totalPages: 1,
        hasNextPage: false,
        hasPrevPage: false,
      }
      : buildPagination(page, limit, total);

    return sendSuccess(
      res,
      constants.OK,
      "Applications retrieved successfully",
      {
        applications,
        pagination,
        statusCounts,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin views a single application
export const getApplicationByIdAdmin = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId)
      .populate("submittedBy", "fullName email employeeId")
      .populate("reviewer", "fullName email")
      .populate("reviewers", "fullName email")
      .populate("adminActions.by", "fullName email role");

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    let statusAutoUpdated = false;

    // Auto-move submitted applications to initial screening when admin views them
    if (application.status === "submitted") {
      application.status = "initialScreening";
      application.reevaluationRequested = false;
      await application.save();
      try {
        await createNotification({
          recipientId: application.submittedBy?._id,
          recipientRole: "faculty",
          actorId: req.user._id,
          type: "SCREENING_STARTED",
          title: "Screening In Progress",
          message:
            'Your application "' +
            application.title +
            '" is now under initial screening.',
          relatedApplicationId: application._id,
          data: { status: application.status },
          eventKey: "screening-started:" + String(application._id),
        });
      } catch (notificationError) {
        console.error(
          "Failed to create screening notification:",
          notificationError,
        );
      }
      statusAutoUpdated = true;
    }

    return sendSuccess(
      res,
      constants.OK,
      "Application retrieved successfully",
      {
        application,
        statusAutoUpdated,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin rejects an application — sets status, adds remark, sends rejection email
export const rejectApplication = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { comments } = req.body;

    if (!comments) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Rejection comments are required",
      );
    }

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "fullName email",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (
      !["initialScreening", "reviewCompleted", "submitted"].includes(
        application.status,
      )
    ) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Only initialScreening/submitted or reviewCompleted applications can be rejected",
      );
    }

    application.status = "rejected";
    application.comments = comments;
    await application.save();

    try {
      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_REJECTED",
        title: "Application Rejected",
        message:
          'Your application "' +
          application.title +
          '" was rejected. Remark: ' +
          comments,
        relatedApplicationId: application._id,
        data: { status: application.status, comments },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create rejection notification:",
        notificationError,
      );
    }

    // Send rejection email to the faculty
    await sendRejectionMail(
      application.submittedBy.email,
      application.submittedBy.fullName,
      application.title,
      comments,
    );

    return sendSuccess(
      res,
      constants.OK,
      "Application rejected and email sent successfully",
      { applicationId: application._id },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin approves an application — sets status to "processing" and assigns a reviewer

export const approveApplication = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const candidateReviewerIds = Array.isArray(req.body?.reviewerIds)
      ? req.body.reviewerIds
      : req.body?.reviewerId
        ? [req.body.reviewerId]
        : [];

    const reviewerIds = [...new Set(candidateReviewerIds.map((id) => String(id).trim()).filter(Boolean))];

    if (reviewerIds.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "At least one reviewer ID is required for approval",
      );
    }

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "fullName email",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (
      ![
        "initialScreening",
        "sentToReviewer",
        "underReview",
        "reviewCompleted",
      ].includes(application.status)
    ) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Reviewers can only be assigned while application is in review workflow",
      );
    }

    const currentAssignedReviewerIds = [
      ...(application.reviewers || []).map((id) => String(id)),
      ...(application.reviewer ? [String(application.reviewer)] : []),
    ];
    const uniqueCurrentAssignedReviewerIds = [...new Set(currentAssignedReviewerIds)];

    const reviewerIdsToAdd = reviewerIds.filter(
      (id) => !uniqueCurrentAssignedReviewerIds.includes(id),
    );

    if (reviewerIdsToAdd.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "All selected reviewers are already assigned to this application",
      );
    }

    // Verify all reviewers exist and have correct role
    const reviewers = await User.find({
      _id: { $in: reviewerIdsToAdd },
      role: "reviewer",
    }).select("fullName email");

    if (reviewers.length !== reviewerIdsToAdd.length) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "One or more selected reviewers are invalid",
      );
    }

    const mergedReviewerIds = [
      ...uniqueCurrentAssignedReviewerIds,
      ...reviewerIdsToAdd,
    ];

    if (application.status === "initialScreening") {
      application.status = "sentToReviewer";
    } else if (application.status === "reviewCompleted") {
      // New reviewer assignment re-opens the review stage until they submit marks.
      application.status = "underReview";
    }

    application.reviewers = mergedReviewerIds;
    application.reviewer = mergedReviewerIds[0];
    await application.save();

    try {
      await Promise.all(
        reviewers.map((reviewer) =>
          createNotification({
            recipientId: reviewer._id,
            recipientRole: "reviewer",
            actorId: req.user._id,
            type: "SENT_TO_REVIEWER",
            title: "Application Assigned",
            message:
              'A new application "' +
              application.title +
              '" has been assigned to you for review.',
            relatedApplicationId: application._id,
            data: { status: application.status },
          }),
        ),
      );

      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "SENT_TO_REVIEWER",
        title: "Application Under Review",
        message:
          'Your application "' +
          application.title +
          `" has been assigned to ${mergedReviewerIds.length} reviewer${mergedReviewerIds.length > 1 ? "s" : ""}.`,
        relatedApplicationId: application._id,
        data: { status: application.status },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create reviewer assignment notifications:",
        notificationError,
      );
    }

    await Promise.all(
      reviewers.map((reviewer) =>
        sendReviewerAssignmentMail(reviewer.email, reviewer.fullName, {
          applicationId: String(application._id),
          title: application.title,
          facultyName: application.submittedBy?.fullName || "",
          facultyEmail: application.submittedBy?.email || "",
          status: application.status,
          documentUrls: application.documentUrls || [],
        }),
      ),
    );

    return sendSuccess(
      res,
      constants.OK,
      "Application sent to reviewer(s) successfully and email sent",
      {
        applicationId: application._id,
        reviewerIds: mergedReviewerIds,
        addedReviewerIds: reviewerIdsToAdd,
        status: application.status,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin unassigns reviewer from an application and rolls back review stage
export const unassignReviewer = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const candidateReviewerIds = Array.isArray(req.body?.reviewerIds)
      ? req.body.reviewerIds
      : req.body?.reviewerId
        ? [req.body.reviewerId]
        : [];
    const requestedReviewerIds = [
      ...new Set(candidateReviewerIds.map((id) => String(id).trim()).filter(Boolean)),
    ];

    const application = await Application.findById(applicationId)
      .populate("submittedBy", "fullName email")
      .populate("reviewer", "fullName email")
      .populate("reviewers", "fullName email");

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    const previousReviewers = getAssignedReviewerList(application);

    if (previousReviewers.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "No reviewer is currently assigned to this application",
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
        "Reviewer can only be unassigned while application is in review workflow",
      );
    }

    const previousReviewerIds = previousReviewers.map((reviewer) => String(reviewer?._id || reviewer));
    const previousReviewerEmails = previousReviewers
      .map((reviewer) => reviewer?.email)
      .filter(Boolean);

    const reviewerIdsToRemove =
      requestedReviewerIds.length > 0
        ? requestedReviewerIds.filter((id) => previousReviewerIds.includes(id))
        : previousReviewerIds;

    if (reviewerIdsToRemove.length === 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "No selected reviewers are currently assigned to this application",
      );
    }

    const removedReviewers = previousReviewers.filter((reviewer) =>
      reviewerIdsToRemove.includes(String(reviewer?._id || reviewer)),
    );

    const remainingReviewerIds = previousReviewerIds.filter(
      (id) => !reviewerIdsToRemove.includes(id),
    );

    application.reviewers = remainingReviewerIds;
    application.reviewer = remainingReviewerIds.length > 0 ? remainingReviewerIds[0] : undefined;
    application.marks = (application.marks || []).filter(
      (mark) => !reviewerIdsToRemove.includes(String(mark?.evaluatedBy)),
    );

    if (remainingReviewerIds.length === 0) {
      application.status = "initialScreening";
    } else {
      const submittedReviewerIds = new Set(
        (application.marks || []).map((mark) => String(mark?.evaluatedBy)),
      );
      const hasAnySubmittedMarks = submittedReviewerIds.size > 0;
      const allRemainingSubmitted = remainingReviewerIds.every((id) =>
        submittedReviewerIds.has(id),
      );

      if (allRemainingSubmitted) {
        application.status = "reviewCompleted";
      } else if (hasAnySubmittedMarks) {
        application.status = "underReview";
      } else {
        application.status = "sentToReviewer";
      }
    }

    const removedReviewerEmails = removedReviewers
      .map((reviewer) => reviewer?.email)
      .filter(Boolean);

    application.adminActions = [
      {
        type: "REVIEWER_UNASSIGNED",
        note: `Reviewer assignment(s) removed by admin (${reviewerIdsToRemove.length} removed)`,
        by: req.user._id,
        data: {
          previousReviewerIds,
          previousReviewerEmails,
          removedReviewerIds: reviewerIdsToRemove,
          removedReviewerEmails,
          remainingReviewerIds,
        },
      },
      ...(application.adminActions || []),
    ];
    await application.save();

    try {
      await Promise.all(
        removedReviewers.map((reviewer) =>
          createNotification({
            recipientId: reviewer._id,
            recipientRole: "reviewer",
            actorId: req.user._id,
            type: "REVIEWER_UNASSIGNED",
            title: "Review Assignment Removed",
            message:
              'Your assignment for application "' +
              application.title +
              '" has been removed by admin.',
            relatedApplicationId: application._id,
            data: { status: application.status },
          }),
        ),
      );

      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "REVIEWER_UNASSIGNED",
        title: "Reviewer Unassigned",
        message:
          remainingReviewerIds.length === 0
            ? 'Reviewer assignment for your application "' +
            application.title +
            '" has been removed and it is back under screening.'
            : 'One or more reviewer assignments were removed for your application "' +
            application.title +
            `". It is currently assigned to ${remainingReviewerIds.length} reviewer${remainingReviewerIds.length > 1 ? "s" : ""}.`,
        relatedApplicationId: application._id,
        data: { status: application.status },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create reviewer unassignment notifications:",
        notificationError,
      );
    }

    return sendSuccess(res, constants.OK, "Reviewer unassigned successfully", {
      applicationId: application._id,
      removedReviewerIds: reviewerIdsToRemove,
      remainingReviewerIds,
      status: application.status,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin grants an application — sets status to "approved", updates granted amount
export const grantApplication = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { grantedAmount } = req.body;

    if (grantedAmount == null || grantedAmount < 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "A valid grantedAmount is required",
      );
    }

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "fullName email role",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.status !== "reviewCompleted") {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Only reviewCompleted applications can be granted",
      );
    }

    application.status = "approved";
    application.grantedAmount = grantedAmount;
    application.grantApprovalDate = new Date();
    await application.save();

    // Send grant approval email to the faculty
    if (application.submittedBy?.email) {
      await sendGrantApprovedMail(
        application.submittedBy.email,
        application.submittedBy.fullName || "Faculty Member",
        application.title,
        grantedAmount,
      );
    }

    try {
      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_APPROVED",
        title: "Grant Approved",
        message:
          'Congratulations. Your application "' +
          application.title +
          '" has been approved.',
        relatedApplicationId: application._id,
        data: {
          status: application.status,
          grantedAmount,
        },
      });

      await createNotificationsForRole({
        role: "admin",
        actorId: req.user._id,
        type: "APPLICATION_APPROVED",
        title: "Application Approved",
        message: 'Application "' + application.title + '" has been approved.',
        relatedApplicationId: application._id,
        data: {
          status: application.status,
          grantedAmount,
        },
        eventKeyPrefix: "application-approved:" + String(application._id),
        excludeUserId: req.user._id,
      });
    } catch (notificationError) {
      console.error(
        "Failed to create grant approval notifications:",
        notificationError,
      );
    }

    return sendSuccess(res, constants.OK, "Application granted successfully", {
      applicationId: application._id,
      grantedAmount,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin updates already allotted grant amount (increase/decrease)
export const updateGrantedAmount = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { grantedAmount } = req.body;

    if (grantedAmount == null || Number(grantedAmount) < 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "A valid non-negative grantedAmount is required",
      );
    }

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "fullName email role",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.grantedAmount == null || application.status !== "approved") {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Granted amount can only be updated for approved applications",
      );
    }

    const nextGrantedAmount = Number(grantedAmount);
    const progressSummary = await Progress.aggregate([
      { $match: { applicationId: application._id } },
      {
        $group: {
          _id: "$applicationId",
          totalSpent: { $sum: { $ifNull: ["$amountSpent", 0] } },
        },
      },
    ]);

    const totalSpent = Number(progressSummary?.[0]?.totalSpent || 0);
    if (nextGrantedAmount < totalSpent) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Granted amount cannot be lower than the total amount already spent",
      );
    }

    const previousGrantedAmount = Number(application.grantedAmount || 0);
    application.grantedAmount = nextGrantedAmount;
    application.grantAmountUpdatedAt = new Date();
    application.adminActions = [
      {
        type: "GRANTED_AMOUNT_UPDATED",
        note:
          "Granted amount changed from INR " +
          previousGrantedAmount.toLocaleString("en-IN") +
          " to INR " +
          nextGrantedAmount.toLocaleString("en-IN"),
        by: req.user._id,
        data: {
          previousGrantedAmount,
          grantedAmount: nextGrantedAmount,
        },
      },
      ...(application.adminActions || []),
    ];
    await application.save();

    try {
      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "GRANTED_AMOUNT_UPDATED",
        title: "Granted Amount Updated",
        message:
          'Granted amount for your application "' +
          application.title +
          '" was updated to INR ' +
          nextGrantedAmount.toLocaleString("en-IN") +
          ".",
        relatedApplicationId: application._id,
        data: {
          previousGrantedAmount,
          grantedAmount: nextGrantedAmount,
          status: application.status,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create granted amount update notification:",
        notificationError,
      );
    }

    return sendSuccess(
      res,
      constants.OK,
      "Granted amount updated successfully",
      {
        applicationId: application._id,
        previousGrantedAmount,
        grantedAmount: nextGrantedAmount,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin sets or updates project validity period
export const updateProjectValidity = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;
    const { mode, durationCounts = {}, reason } = req.body;

    const addDuration = (baseDate, unit, count = 1) => {
      const next = new Date(baseDate);
      if (unit === "day") next.setDate(next.getDate() + count);
      if (unit === "week") next.setDate(next.getDate() + (7 * count));
      if (unit === "month") next.setMonth(next.getMonth() + count);
      if (unit === "year") next.setFullYear(next.getFullYear() + count);
      return next;
    };

    const normalizeCount = (value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
    };

    const normalizedCounts = {
      day: normalizeCount(durationCounts.day),
      week: normalizeCount(durationCounts.week),
      month: normalizeCount(durationCounts.month),
      year: normalizeCount(durationCounts.year),
    };

    const totalCount =
      normalizedCounts.day +
      normalizedCounts.week +
      normalizedCounts.month +
      normalizedCounts.year;

    const applyDurationCounts = (baseDate, counts) => {
      let next = new Date(baseDate);
      next = addDuration(next, "year", counts.year);
      next = addDuration(next, "month", counts.month);
      next = addDuration(next, "week", counts.week);
      next = addDuration(next, "day", counts.day);
      return next;
    };

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "fullName email role",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    // Only allowed for approved/granted applications
    if (application.grantedAmount == null) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Project validity can only be set for approved applications with granted amount",
      );
    }

    if (totalCount <= 0) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "At least one increment is required in durationCounts",
      );
    }

    let nextEndDate;

    if (mode === "set") {
      if (!application.grantApprovalDate) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Approval date not found for this application",
        );
      }

      const startDate = new Date(application.grantApprovalDate);
      nextEndDate = applyDurationCounts(startDate, normalizedCounts);
      application.projectValidityStartDate = startDate;
      application.projectValidityEndDate = nextEndDate;
      application.projectStatus = "active";
    } else if (mode === "extend") {
      if (!application.projectValidityEndDate) {
        return sendError(
          res,
          constants.VALIDATION_ERROR,
          "Current end date not found. Set validity first",
        );
      }

      const currentEndDate = new Date(application.projectValidityEndDate);
      nextEndDate = applyDurationCounts(currentEndDate, normalizedCounts);

      // Record the extension in history
      if (!application.validityExtensions) {
        application.validityExtensions = [];
      }

      application.validityExtensions.push({
        extendedFrom: application.projectValidityEndDate,
        extendedTo: nextEndDate,
        extendedOn: new Date(),
        extendedBy: req.user._id,
        reason:
          reason?.trim() ||
          `Extended by ${normalizedCounts.day} day(s), ${normalizedCounts.week} week(s), ${normalizedCounts.month} month(s), ${normalizedCounts.year} year(s)`,
      });

      application.projectValidityEndDate = nextEndDate;
      application.projectStatus = "extended";
    } else {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Invalid mode. Must be 'set' or 'extend'",
      );
    }

    await application.save();

    // Notify faculty about the validity update
    try {
      const actionType = mode === "set" ? "Project Validity Set" : "Project Validity Extended";
      const actionMessage =
        mode === "set"
          ? `Your project validity period has been set from ${new Date(application.projectValidityStartDate).toLocaleDateString()} to ${new Date(application.projectValidityEndDate).toLocaleDateString()}`
          : `Your project validity period has been extended and now ends on ${new Date(application.projectValidityEndDate).toLocaleDateString()}`;

      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: mode === "set" ? "PROJECT_VALIDITY_SET" : "PROJECT_VALIDITY_EXTENDED",
        title: actionType,
        message: actionMessage,
        relatedApplicationId: application._id,
        data: {
          projectValidityStartDate: application.projectValidityStartDate,
          projectValidityEndDate: application.projectValidityEndDate,
          mode,
          durationCounts: normalizedCounts,
          reason: reason || null,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create project validity notification:",
        notificationError,
      );
    }

    return sendSuccess(
      res,
      constants.OK,
      `Project validity ${mode === "set" ? "set" : "extended"} successfully`,
      {
        applicationId: application._id,
        projectValidityStartDate: application.projectValidityStartDate,
        projectValidityEndDate: application.projectValidityEndDate,
        projectStatus: application.projectStatus,
      },
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin can close project after faculty marks the project as completed
export const closeProject = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId).populate(
      "submittedBy",
      "fullName email role",
    );

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    if (application.projectStatus === "closed") {
      return sendSuccess(res, constants.OK, "Project is already closed", {
        applicationId: application._id,
        projectStatus: application.projectStatus,
        projectClosedAt: application.projectClosedAt,
      });
    }

    if (!application.researchCompleted) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Faculty must mark this project as completed before it can be closed",
      );
    }

    const closedAt = new Date();
    application.projectStatus = "closed";
    application.projectClosedAt = closedAt;
    if (!application.projectValidityStartDate && application.grantApprovalDate) {
      application.projectValidityStartDate = new Date(application.grantApprovalDate);
    }
    application.projectValidityEndDate = closedAt;
    await application.save();

    try {
      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "PROJECT_CLOSED",
        title: "Project Closed",
        message: `Your project "${application.title}" has been closed by admin.`,
        relatedApplicationId: application._id,
        data: {
          projectStatus: application.projectStatus,
          projectClosedAt: application.projectClosedAt,
          projectValidityEndDate: application.projectValidityEndDate,
        },
      });
    } catch (notificationError) {
      console.error("Failed to create project close notification:", notificationError);
    }

    return sendSuccess(res, constants.OK, "Project closed successfully", {
      applicationId: application._id,
      projectStatus: application.projectStatus,
      projectClosedAt: application.projectClosedAt,
      projectValidityEndDate: application.projectValidityEndDate,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const revertApplicationAction = expressAsyncHandler(async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await Application.findById(applicationId)
      .populate("submittedBy", "fullName email role")
      .populate("reviewer", "fullName email")
      .populate("reviewers", "fullName email");

    if (!application) {
      return sendError(res, constants.NOT_FOUND, "Application not found");
    }

    let actionReverted = "";
    const hasReviewerAssigned = getAssignedReviewerList(application).length > 0;

    if (application.projectStatus === "closed") {
      application.projectStatus = "active";
      application.projectClosedAt = undefined;
      actionReverted = "Project closure reverted";
    } else if (application.status === "approved") {
      application.status = "reviewCompleted";
      application.grantedAmount = undefined;
      application.grantApprovalDate = undefined;
      application.researchCompleted = false;
      application.researchCompletedAt = undefined;
      application.projectValidityStartDate = undefined;
      application.projectValidityEndDate = undefined;
      application.projectStatus = "active";
      application.projectClosedAt = undefined;
      application.validityExtensions = [];
      actionReverted = "Grant approval reverted";
    } else if (application.status === "rejected") {
      application.status = hasReviewerAssigned ? "sentToReviewer" : "initialScreening";
      application.comments = "";
      actionReverted = "Rejection reverted";
    } else if (application.status === "reviewCompleted") {
      application.status = hasReviewerAssigned ? "underReview" : "initialScreening";
      application.marks = [];
      actionReverted = "Review completion reverted";
    } else if (application.status === "underReview") {
      application.status = "sentToReviewer";
      actionReverted = "Under-review state reverted";
    } else if (application.status === "sentToReviewer") {
      application.status = "initialScreening";
      application.reviewers = [];
      application.reviewer = undefined;
      application.marks = [];
      actionReverted = "Reviewer assignment reverted";
    } else if (application.status === "initialScreening") {
      application.status = "submitted";
      actionReverted = "Initial screening reverted";
    } else if (application.status === "submitted") {
      application.status = "draft";
      actionReverted = "Submission reverted to draft";
    } else {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "No revertible action found for this application",
      );
    }

    await application.save();

    try {
      await createNotification({
        recipientId: application.submittedBy?._id,
        recipientRole: "faculty",
        actorId: req.user._id,
        type: "APPLICATION_ACTION_REVERTED",
        title: "Application Action Reverted",
        message: `Admin reverted an action on your application "${application.title}".`,
        relatedApplicationId: application._id,
        data: {
          status: application.status,
          projectStatus: application.projectStatus,
          actionReverted,
        },
      });
    } catch (notificationError) {
      console.error(
        "Failed to create action revert notification:",
        notificationError,
      );
    }

    return sendSuccess(res, constants.OK, `${actionReverted} successfully`, {
      applicationId: application._id,
      status: application.status,
      projectStatus: application.projectStatus,
      actionReverted,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin gets all reviewers
export const getAllReviewers = expressAsyncHandler(async (req, res) => {
  try {
    const reviewers = await User.find({ role: "reviewer" })
      .select("fullName email phoneNo employeeId createdAt")
      .sort({ createdAt: -1 });

    return sendSuccess(res, constants.OK, "Reviewers retrieved successfully", {
      reviewers,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

// Admin gets a single reviewer by ID
export const getReviewerById = expressAsyncHandler(async (req, res) => {
  try {
    const { reviewerId } = req.params;

    const reviewer = await User.findOne({
      _id: reviewerId,
      role: "reviewer",
    }).select("fullName email phoneNo employeeId createdAt");

    if (!reviewer) {
      return sendError(res, constants.NOT_FOUND, "Reviewer not found");
    }

    // Fetch applications assigned to this reviewer
    const assignedApplications = await Application.find({
      $or: [{ reviewer: reviewerId }, { reviewers: reviewerId }],
    })
      .select(
        "_id title status amountRequested grantedAmount submittedBy createdAt",
      )
      .populate("submittedBy", "fullName email employeeId")
      .sort({ createdAt: -1 });

    return sendSuccess(res, constants.OK, "Reviewer retrieved successfully", {
      reviewer,
      assignedApplications,
    });
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const changeUserRole = expressAsyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Roles that can be assigned
    const allowedTargetRoles = ["faculty", "reviewer", "admin"];

    if (!role) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Role is required"
      );
    }

    if (!allowedTargetRoles.includes(role)) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Role can only be changed to faculty, reviewer, or admin"
      );
    }

    const user = await User.findById(userId);

    if (!user) {
      return sendError(
        res,
        constants.NOT_FOUND,
        "User not found"
      );
    }

    // Existing admin users cannot have their roles changed
    if (user.role === "admin") {
      return sendError(
        res,
        constants.FORBIDDEN,
        "Admin role cannot be changed"
      );
    }

    // Only faculty and reviewer users can be modified
    if (!["faculty", "reviewer"].includes(user.role)) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "Only faculty and reviewer users can be changed"
      );
    }

    // Prevent assigning the same role
    if (user.role === role) {
      return sendError(
        res,
        constants.VALIDATION_ERROR,
        "User already has this role"
      );
    }

    const oldRole = user.role;

    user.role = role;

    await user.save({
      validateBeforeSave: false,
    });

    await sendRoleChangedMail(
      user.email,
      user.fullName,
      oldRole,
      role,
      req.user?.fullName
    );

    return sendSuccess(
      res,
      constants.OK,
      "User role changed successfully",
      {
        user: {
          _id: user._id,
          email: user.email,
          employeeId: user.employeeId,
          fullName: user.fullName,
          oldRole,
          newRole: user.role,
        },
      }
    );
  } catch (error) {
    return sendServerError(res, error);
  }
});