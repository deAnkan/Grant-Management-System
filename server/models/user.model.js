import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { config } from "../constants.js";

const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: [true, "Email is already registered"],
      lowercase: true,
      trim: true,
      match: [
        /^\S+@\S+\.\S+$/,
        "Please enter a valid email address", // Validates proper email format
      ],
    },
    phoneNo: {
      type: String,
      match: [
        /^\d{10}$/,
        "Please enter a valid 10-digit phone number", // Validates 10-digit phone numbers
      ],
    },
    fullName: {
      type: String,
      required: [true, "Full name is required"],
    },
    role: {
      type: String,
      enum: ["admin", "faculty", "reviewer"],
      default: "faculty",
    },
    employeeId: {
      type: String,
      unique: [true, "Employee ID must be unique"],
      sparse: true, // Allows multiple null values for employeeId
    },
    password: {
      type: String,
      minlength: [8, "Password must be at least 8 characters long"],
    },
    tokenVersion: {
      type: Number,
      default: 0,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordTokenExpiry: {
      type: Date,
    },
    profileImage: {
      type: String,
      default: "https://cdn-icons-png.flaticon.com/512/9131/9131529.png",
    },
    profileImageKey: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

// Hash the password before saving the user model
userSchema.pre("save", async function () {
  if (!this.password) return;
  if (!this.isModified("password")) {
    return;
  }
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  } catch (error) {
    console.error(error);
    throw error;
  }
});

// Check if the provided password matches the hashed password
userSchema.methods.isPasswordCorrect = async function (password) {
  return bcrypt.compare(password, this.password);
};

// Generate an access token
userSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      email: this.email,
      fullName: this.fullName,
      role: this.role,
      tokenVersion: this.tokenVersion,
    },
    config.accessTokenSecret,
    { expiresIn: config.accessTokenExpiry || "1d" } // Fallback to "1h" if the environment variable is not set
  );
};

// Generate a password reset token
userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  this.resetPasswordTokenExpiry = new Date(Date.now() + 15 * 60 * 1000);

  return resetToken;
};

const User = mongoose.model("User", userSchema);

export default User;
