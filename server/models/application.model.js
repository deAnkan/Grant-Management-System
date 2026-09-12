import { Schema, model } from "mongoose";
import Counter from "./counter.model.js";

const APPLICATION_ID_PREFIX = "APP";

const formatApplicationId = (year, seq) => {
    return `${APPLICATION_ID_PREFIX}-${year}-${String(seq).padStart(6, "0")}`;
};

const getNextApplicationSequence = async (year) => {
    const counterKey = `application:${year}`;
    const counter = await Counter.findByIdAndUpdate(
        counterKey,
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return counter.seq;
};

const markSchema = new Schema({
    interviewScore: {
        type: Number,
        min: [0, "Interview score cannot be less than 0"],
    },
    presentationScore: {
        type: Number,
        min: [0, "Presentation score cannot be less than 0"],
    },
    averageScore: {
        type: Number,
        min: [0, "Average score cannot be less than 0"],
    },
    reviewerSignature: {
        type: String,
        required: [true, "Reviewer signature is required"],
    },
    remark: { // Added field for reviewer remarks
        type: String,
        trim: true,
    },
    evaluatedBy: {
        type: Schema.Types.ObjectId,
        ref: "User",
    },
    evaluatorRole: {
        type: String,
        enum: ["reviewer", "admin"],
    },
    evaluatedAt: {
        type: Date,
        default: Date.now,
    },
});

const applicationSchema = new Schema(
    {
        title: {
            type: String,
            trim: true,
            required: [true, "Title is required"],
        },
        category: {
            type: String,
            enum: ["research", "product", "startup"],
            default: "research",
            trim: true,
            lowercase: true,
        },
        applicationId: {
            type: String,
            trim: true,
            uppercase: true,
            unique: true,
            sparse: true,
            index: true,
            match: [/^APP-\d{4}-\d{6}$/, "Invalid application ID format"],
        },
        synopsis: {
            type: String,
            trim: true,
            required: [true, "Synopsis is required"],
        },
        amountRequested: {
            type: Number,
            required: [true, "Amount requested is required"],
            min: [0, "Amount requested cannot be negative"],
        },
        grantedAmount: {
            type: Number,
            min: [0, "Granted amount cannot be negative"],
        },
        documentUrls: {
            type: [String],
        },
        status: {
            type: String,
            enum: ["draft", "submitted", "initialScreening", "sentToReviewer", "underReview", "reviewCompleted", "approved", "rejected", "withdrawn"],
            default: "draft",
        },
        submittedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        marks: [markSchema],
        reviewer: {
            type: Schema.Types.ObjectId,
            ref: "User",
        },
        reviewers: [
            {
                type: Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        comments: {
            type: String,
        },
        grantApprovalDate: {
            type: Date,
        },
        researchCompleted: {
            type: Boolean,
            default: false,
        },
        researchCompletedAt: {
            type: Date,
        },
        projectValidityStartDate: {
            type: Date,
        },
        projectValidityEndDate: {
            type: Date,
        },
        projectStatus: {
            type: String,
            enum: ["active", "closed", "extended"],
            default: "active",
        },
        projectClosedAt: {
            type: Date,
        },
        reevaluationRequested: {
            type: Boolean,
            default: false,
        },
        reevaluationRequestedAt: {
            type: Date,
        },
        validityExtensions: [
            {
                extendedFrom: Date,
                extendedTo: Date,
                extendedOn: {
                    type: Date,
                    default: Date.now,
                },
                extendedBy: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
                reason: String,
            }
        ],
        grantAmountUpdatedAt: {
            type: Date,
        },
        adminActions: [
            {
                type: {
                    type: String,
                    enum: ["REVIEWER_UNASSIGNED", "GRANTED_AMOUNT_UPDATED"],
                    required: true,
                },
                note: {
                    type: String,
                    trim: true,
                },
                at: {
                    type: Date,
                    default: Date.now,
                },
                by: {
                    type: Schema.Types.ObjectId,
                    ref: "User",
                },
                data: {
                    type: Schema.Types.Mixed,
                    default: {},
                },
            }
        ],
    },
    { timestamps: true },
);

applicationSchema.pre("validate", async function () {
    if (this.applicationId) {
        return;
    }

    const now = new Date();
    const candidateDate = this.createdAt instanceof Date ? this.createdAt : now;
    const year = candidateDate.getFullYear();
    const seq = await getNextApplicationSequence(year);
    this.applicationId = formatApplicationId(year, seq);
});

const Application = model("Application", applicationSchema);

export default Application;
