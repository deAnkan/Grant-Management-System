import mongoose from "mongoose";
import connectDB from "../config/db.config.js";
import User from "../models/user.model.js";

const seedAdmin = async () => {
    const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const employeeId = String(process.env.ADMIN_EMPLOYEE_ID || "").trim();
    const fullName = String(process.env.ADMIN_FULL_NAME || "").trim();
    const phoneNo = String(process.env.ADMIN_PHONE_NO || "").trim();

    if (!email || !employeeId || !fullName) {
        throw new Error("ADMIN_EMAIL, ADMIN_EMPLOYEE_ID, and ADMIN_FULL_NAME are required in .env");
    }

    const existingUserWithEmployeeId = await User.findOne({ employeeId });

    if (existingUserWithEmployeeId && existingUserWithEmployeeId.email !== email) {
        throw new Error("ADMIN_EMPLOYEE_ID is already used by another user");
    }

    const existingAdmin = await User.findOne({ email });

    if (existingAdmin) {
        if (existingAdmin.role !== "admin") {
            throw new Error("ADMIN_EMAIL already exists but is not an admin");
        }

        existingAdmin.fullName = fullName;
        existingAdmin.employeeId = employeeId;

        if (phoneNo) {
            existingAdmin.phoneNo = phoneNo;
        }

        await existingAdmin.save({ validateBeforeSave: false });

        console.log("Admin already existed. Admin details updated.");
        console.log({
            id: existingAdmin._id,
            email: existingAdmin.email,
            employeeId: existingAdmin.employeeId,
            role: existingAdmin.role,
        });

        return;
    }

    const admin = await User.create({
        email,
        employeeId,
        fullName,
        phoneNo: phoneNo || undefined,
        role: "admin",
    });

    console.log("Admin seeded successfully.");
    console.log({
        id: admin._id,
        email: admin.email,
        employeeId: admin.employeeId,
        role: admin.role,
    });
};

try {
    await connectDB();
    await seedAdmin();
    await mongoose.disconnect();
    process.exit(0);
} catch (error) {
    console.error("Admin seed failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
}