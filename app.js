import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";
import connectDB from "./server/config/db.config.js";
import { config, validateConfig } from "./server/constants.js";
import { verifyAdmin } from "./server/middlewares/auth.middleware.js";
import { RotatingFileStream, readLastLines } from "./server/utils/logStream.utils.js";

const app = express();
let server;

// Behind Nginx/PM2 we must trust exactly the proxy hop so req.ip (used by the
// rate limiter) is the real client and not 127.0.0.1.
if (config.trustProxy) {
    const hops = Number(config.trustProxy);
    app.set("trust proxy", Number.isInteger(hops) ? hops : config.trustProxy);
}

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

// Size-rotated write streams (prevents unbounded growth / disk exhaustion)
const accessLogStream = new RotatingFileStream(
    path.join(logDirectory, "access.log"),
    { maxBytes: config.logMaxBytes, maxFiles: config.logMaxFiles },
);

const logFile = new RotatingFileStream(
    path.join(logDirectory, "console.log"),
    { maxBytes: config.logMaxBytes, maxFiles: config.logMaxFiles },
);

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

// Redact tokens that may appear in the query string (SSE uses ?token=...)
morgan.token("safe-url", (req) => {
    try {
        const url = new URL(req.originalUrl, "http://localhost");
        if (url.searchParams.has("token")) {
            url.searchParams.set("token", "[REDACTED]");
        }
        return `${url.pathname}${url.search}`;
    } catch {
        return req.originalUrl;
    }
});

const accessLogFormat =
    ':remote-addr - :remote-user [:date[clf]] ":method :safe-url HTTP/:http-version" ' +
    ':status :res[content-length] ":referrer" ":user-agent"';

app.use(morgan(accessLogFormat, { stream: accessLogStream }));
if (!config.isProduction) {
    app.use(morgan(":method :safe-url :status :response-time ms - :res[content-length]"));
}

// -----------------------
// Middlewares
// -----------------------
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
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
    config.appBaseUrl, // configured public base URL for this deployment
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

// -----------------------
// Validate configuration
// -----------------------
try {
    validateConfig();
} catch (error) {
    console.error("❌ Configuration error:", error.message);
    process.exit(1);
}

connectDB()
    .then(() => {
        server = app.listen(config.port, () =>
            console.log(`Server running on port ${config.port}`),
        );
        server.on("error", (error) => {
            console.error("Error on the server: ", error);
        });

        startEmailWorker();
    })
    .catch((error) => console.log("MongoDB Connection Failed: ", error));

// -----------------------
// Health Check Route
// -----------------------
const healthCheckHandler = (req, res) => {
    const databaseConnected = mongoose.connection.readyState === 1;

    return res.status(databaseConnected ? 200 : 503).json({
        success: databaseConnected,
        message: databaseConnected
            ? "The server is running fine 👍🏻- v1.0.0"
            : "The server is running but the database is not connected",
        database: databaseConnected ? "connected" : "disconnected",
    });
};

app.get("/api/health", healthCheckHandler);
// Convenience alias used by some load balancers / uptime checks.
app.get("/health", healthCheckHandler);

// ----------------------------------------
// Route to fetch last N lines of logs
// ----------------------------------------
const sendLogTail = async (fileName, req, res) => {
    try {
        const text = await readLastLines(
            path.join(logDirectory, fileName),
            req.query.lines,
        );
        res.type("text/plain").send(text);
    } catch (error) {
        if (error.code === "ENOENT") {
            return res
                .status(404)
                .json({ success: false, message: "Log file not found" });
        }

        console.error("Error reading log file:", error);
        return res
            .status(500)
            .json({ success: false, message: "Error reading log file" });
    }
};

app.get("/logs", verifyAdmin, (req, res) => sendLogTail("access.log", req, res));

app.get("/console-logs", verifyAdmin, (req, res) =>
    sendLogTail("console.log", req, res),
);

// ------------------------
// Import Routes
// ------------------------
import authRoutes from "./server/routes/auth.routes.js";
import adminRoutes from "./server/routes/admin.routes.js";
import facultyRoutes from "./server/routes/faculty.routes.js";
import reviewerRoutes from "./server/routes/reviewer.routes.js";
import progressRouter from "./server/routes/progress.routes.js";
import { scheduleProgressReminders } from "./server/jobs/progressReminders.js";
import { startEmailWorker, stopEmailWorker } from "./server/services/email.service.js";
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
app.use((req, res) => {
    res.status(404).json({ success: false, message: "Route not found" });
});

// ------------------------
// Central error handler
// ------------------------
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }

    if (err?.name === "MulterError") {
        const message =
            err.code === "LIMIT_FILE_SIZE"
                ? "Uploaded file is too large (maximum 10 MB per file)"
                : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE"
                    ? "Too many files uploaded (maximum 5 documents)"
                    : "File upload failed";
        return res.status(400).json({ success: false, message });
    }

    if (err?.name === "VersionError") {
        return res.status(409).json({
            success: false,
            message: "This record was modified by another request. Please refresh and try again.",
        });
    }

    if (err?.name === "ValidationError") {
        return res.status(400).json({
            success: false,
            message: "Validation failed",
            errors: Object.values(err.errors || {}).map((item) => item.message),
        });
    }

    if (err?.name === "CastError") {
        return res.status(400).json({ success: false, message: "Invalid identifier supplied" });
    }

    if (err?.type === "entity.parse.failed") {
        return res.status(400).json({ success: false, message: "Invalid JSON body" });
    }

    if (err?.message === "Not allowed by CORS") {
        return res.status(403).json({ success: false, message: "Origin not allowed" });
    }

    if (err?.message === "Only PDF and image files are allowed (.pdf, .jpg, .jpeg, .png)") {
        return res.status(400).json({ success: false, message: err.message });
    }

    if (err?.isUploadValidation) {
        return res.status(400).json({ success: false, message: err.message });
    }

    console.error("Unhandled error:", err);

    return res.status(500).json({
        success: false,
        message: config.isProduction
            ? "Internal server error"
            : err?.message || "Internal server error",
    });
});

// -----------------------
// Graceful Shutdown Handler
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

        stopEmailWorker();

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
