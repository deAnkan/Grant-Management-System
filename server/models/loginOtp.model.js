import mongoose, { Schema } from "mongoose";

const loginOtpSchema = new Schema(
    {
        userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        fullName: {
            type: String,
            required: true,
            trim: true,
        },
        employeeId: {
            type: String,
            trim: true,
        },
        role: {
            type: String,
            enum: ["admin", "faculty", "reviewer"],
            required: true,
            index: true,
        },
        otpHash: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 },
        },
        attempts: {
            type: Number,
            default: 0,
        },
        consumedAt: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

const LoginOtp = mongoose.model("LoginOtp", loginOtpSchema);

export default LoginOtp;