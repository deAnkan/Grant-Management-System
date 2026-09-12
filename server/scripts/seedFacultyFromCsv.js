import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import connectDB from "../config/db.config.js";
import User from "../models/user.model.js";

const csvPath = path.join(
    process.cwd(),
    "grant in aid Faculty Data (Responses) - Form Responses 1.csv"
);

function parseCsvLine(line) {
    const values = [];
    let current = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const nextChar = line[i + 1];

        if (char === '"' && insideQuotes && nextChar === '"') {
            current += '"';
            i += 1;
        } else if (char === '"') {
            insideQuotes = !insideQuotes;
        } else if (char === "," && !insideQuotes) {
            values.push(current);
            current = "";
        } else {
            current += char;
        }
    }

    values.push(current);
    return values;
}

function normalizePhoneNo(phoneNo) {
    const digits = String(phoneNo || "").replace(/\D/g, "");
    return digits.length === 10 ? digits : undefined;
}

function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function normalizeText(value) {
    return String(value || "").trim();
}

async function seedFacultyFromCsv() {
    if (!fs.existsSync(csvPath)) {
        throw new Error("CSV file not found: " + csvPath);
    }

    const csvContent = fs.readFileSync(csvPath, "utf8");
    const lines = csvContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const dataLines = lines.slice(1);

    const seenEmails = new Set();
    const seenEmployeeIds = new Set();

    const operations = [];
    let skippedInvalid = 0;
    let skippedDuplicateInCsv = 0;

    for (const line of dataLines) {
        const columns = parseCsvLine(line);

        const employeeId = normalizeText(columns[1]);
        const fullName = normalizeText(columns[2]);
        const email = normalizeEmail(columns[3]);
        const phoneNo = normalizePhoneNo(columns[4]);

        if (!employeeId || !fullName || !email) {
            skippedInvalid += 1;
            continue;
        }

        if (seenEmails.has(email) || seenEmployeeIds.has(employeeId)) {
            skippedDuplicateInCsv += 1;
            continue;
        }

        seenEmails.add(email);
        seenEmployeeIds.add(employeeId);

        const userToInsert = {
            email,
            employeeId,
            fullName,
            role: "faculty",
        };

        if (phoneNo) {
            userToInsert.phoneNo = phoneNo;
        }

        operations.push({
            updateOne: {
                filter: {
                    $or: [
                        { email },
                        { employeeId },
                    ],
                },
                update: {
                    $setOnInsert: userToInsert,
                },
                upsert: true,
            },
        });
    }

    if (operations.length === 0) {
        console.log("No valid faculty rows found to seed.");
        return;
    }

    const result = await User.bulkWrite(operations, { ordered: false });

    console.log("Faculty CSV seed completed.");
    console.log({
        csvRows: dataLines.length,
        preparedRows: operations.length,
        inserted: result.upsertedCount,
        skippedAlreadyInDb: result.matchedCount,
        skippedInvalid,
        skippedDuplicateInCsv,
    });
}

try {
    await connectDB();
    await seedFacultyFromCsv();
    await mongoose.disconnect();
    process.exit(0);
} catch (error) {
    console.error("Faculty CSV seed failed:", error.message);
    await mongoose.disconnect();
    process.exit(1);
}