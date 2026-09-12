import { Schema, model } from "mongoose";

const progressSchema = new Schema(
    {
        applicationId: {
            type: Schema.Types.ObjectId,
            ref: "Application",
            required: true,
        },
        submittedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        description: {
            type: String,
            trim: true,
            required: [true, "Progress description is required"],
        },
        amountSpent: {
            type: Number,
            required: [true, "Amount spent is required"],
            min: [0, "Amount spent cannot be negative"],
        },
        documentUrls: {
            type: [String],
            default: [],
        },
    },
    { timestamps: true }
);

const Progress = model("Progress", progressSchema);

export default Progress;