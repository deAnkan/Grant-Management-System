import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import connectDB from "./server/config/db.config.js";
import { config } from "./server/constants.js";
import { verifyAdmin } from "./server/middlewares/auth.middleware.js";

import dns from "dns";


const app = express();
let server;

dns.setServers(["8.8.8.8", "8.8.4.4", "1.1.1.1"]); // Set DNS servers to Google's and Cloudflare's public DNS

// -----------------------
// EJS frontend setup
// -----------------------
app.set("view engine", "ejs");
app.set("views", path.join(process.cwd(), "views"));

app.use(express.static(path.join(process.cwd(), "public")));

// -----------------------
// Create logs directory
// -----------------------
const logDirectory = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDirectory)) {
    fs.mkdirSync(logDirectory, { recursive: true });
}

// Create a write stream (append mode) for logging requests
const accessLogStream = fs.createWriteStream(
    path.join(logDirectory, "access.log"),
    { flags: "a" },
);

// -----------------------
// Console Logging to File
// -----------------------
const logFile = fs.createWriteStream(path.join(logDirectory, "console.log"), {
    flags: "a",
});

const logStdout = process.stdout;

// Override console.log
console.log = function (...args) {
    const message = args.join(" ") + "\n";
    logFile.write(`[LOG] ${new Date().toISOString()} - ${message}`);
    logStdout.write(message);
};

// Override console.error
console.error = function (...args) {
    const message = args.join(" ") + "\n";
    logFile.write(`[ERROR] ${new Date().toISOString()} - ${message}`);
    logStdout.write(message);
};

// Use Morgan to log requests to the file and console
app.use(morgan("combined", { stream: accessLogStream }));
app.use(morgan("dev"));

// -----------------------
// Middlewares
// -----------------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "https://unpkg.com", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", "data:", "blob:", "https:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'", "https:"],
            },
        },
    }),
);

// Allowed domains
const allowedDomains = [
    // for Deployed frontend URL
    "https://grant-in-aid.iem.edu.in", // for Deployed frontend URL
    "http://localhost:5173", // for development
    "http://localhost:5174", // for development
    `http://localhost:${config.port}`, // EJS frontend served by this backend
    `http://127.0.0.1:${config.port}`,
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
];
app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true); // allow non-browser requests like Postman

            if (allowedDomains.includes(origin)) {
                callback(null, true); // ✅ allow request
            } else {
                callback(new Error("Not allowed by CORS")); // ❌ block request
            }
        },
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
        credentials: true,
    }),
);

connectDB()
    .then(() => {
        server = app.listen(config.port, () =>
            console.log(`Server running on port ${config.port}`),
        );
        server.on("error", (error) => {
            console.error("Error on the server: ", error);
        });
    })
    .catch((error) => console.log("MongoDB Connection Failed: ", error));

// -----------------------
// Health Check Route
// -----------------------
app.get("/api/health", (req, res) => {
    return res.status(200).json({
        success: true,
        message: "The server is running fine 👍🏻- v1.0.0",
    });
});

// ----------------------------------------
// Route to fetch last 100 lines of logs
// ----------------------------------------
app.get("/logs", verifyAdmin, (req, res) => {
    const logFilePath = path.join(logDirectory, "access.log");

    // Read last 100 lines from the log file
    fs.readFile(logFilePath, "utf8", (err, data) => {
        if (err) {
            return res
                .status(500)
                .json({ success: false, message: "Error reading log file" });
        }

        const lines = data.trim().split("\n");
        const last100Lines = lines.slice(-100).join("\n");

        res.setHeader("Content-Type", "text/plain");
        res.send(last100Lines);
    });
});

// ----------------------------------------
// Route to fetch last 100 lines of console.logs
// ----------------------------------------
app.get("/console-logs", verifyAdmin, (req, res) => {
    const logFilePath = path.join(logDirectory, "console.log");

    // Read last 100 lines from the log file
    fs.readFile(logFilePath, "utf8", (err, data) => {
        if (err) {
            return res
                .status(500)
                .json({ success: false, message: "Error reading log file" });
        }

        const lines = data.trim().split("\n");
        const last100Lines = lines.slice(-100).join("\n");

        res.setHeader("Content-Type", "text/plain");
        res.send(last100Lines);
    });
});

// ------------------------
// Import Routes
// ------------------------
import authRoutes from "./server/routes/auth.routes.js";
import adminRoutes from "./server/routes/admin.routes.js";
import facultyRoutes from "./server/routes/faculty.routes.js";
import reviewerRoutes from "./server/routes/reviewer.routes.js";
import progressRouter from "./server/routes/progress.routes.js";
import { scheduleProgressReminders } from "./server/jobs/progressReminders.js";
import notificationRoutes from "./server/routes/notification.routes.js";
import uiRoutes from "./server/routes/ui.routes.js";
// ------------------------
// Schedule background jobs
// ------------------------
scheduleProgressReminders();

// ------------------------
// Use the routes
// ------------------------
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/faculty", facultyRoutes);
app.use("/api/v1/reviewer", reviewerRoutes);
app.use("/api/v1/progress", progressRouter);
app.use("/api/v1/notifications", notificationRoutes);
// EJS frontend pages
app.use("/", uiRoutes);
// ------------------------
// 404 route handler
// ------------------------
app.use((req, res, next) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// -----------------------
// Graceful Shutdown Handler
// -----------------------
const gracefulExit = (signal) => {
    console.log(`\n⚠️ Received ${signal}. Shutting down gracefully...`);

    if (server) {
        server.close(() => {
            console.log("🛑 Express server closed");

            mongoose.connection.close(false, () => {
                console.log("📦 MongoDB connection closed");
                process.exit(0);
            });
        });
    } else {
        process.exit(0);
    }
};

// -----------------------
// Handle OS Signals
// -----------------------
let isShuttingDown = false;

const gracefulExitAsync = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`\nReceived ${signal}. Shutting down gracefully...`);

    try {
        if (server) {
            await new Promise((resolve, reject) => {
                server.close((error) => (error ? reject(error) : resolve()));
            });
            console.log("Express server closed");
        }

        // Mongoose 8+ returns a promise; connection.close() no longer accepts callbacks.
        if (mongoose.connection.readyState !== 0) {
            await mongoose.connection.close();
            console.log("MongoDB connection closed");
        }

        process.exit(0);
    } catch (error) {
        console.error("Error during graceful shutdown:", error);
        process.exit(1);
    }
};

process.on("SIGINT", () => gracefulExitAsync("SIGINT")); // Ctrl + C
process.on("SIGTERM", () => gracefulExitAsync("SIGTERM")); // Kill signal (Docker, PM2)

export default app;
