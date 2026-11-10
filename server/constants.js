import dotenv from 'dotenv';
dotenv.config();

export const constants = {
    CONTINUE: 100,
    SWITCHING_PROTOCOLS: 101,
    EARLY_HINTS: 103,
    PROCESSING: 102,
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    NON_AUTHORITATIVE_INFORMATION: 203,
    NO_CONTENT: 204,
    RESET_CONTENT: 205,
    PARTIAL_CONTENT: 206,
    MULTIPLE_CHOICES: 300,
    MOVED_PERMANENTLY: 301,
    FOUND: 302,
    SEE_OTHER: 303,
    NOT_MODIFIED: 304,
    USE_PROXY: 305,
    TEMPORARY_REDIRECT: 307,
    PERMANENT_REDIRECT: 308,
    VALIDATION_ERROR: 400,
    UNAUTHORIZED: 401,
    PAYMENT_REQUIRED: 402,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    METHOD_NOT_ALLOWED: 405,
    NOT_ACCEPTABLE: 406,
    PROXY_AUTHENTICATION_REQUIRED: 407,
    REQUEST_TIMEOUT: 408,
    CONFLICT: 409,
    GONE: 410,
    LENGTH_REQUIRED: 411,
    PRECONDITION_FAILED: 412,
    REQUEST_ENTITY_TOO_LARGE: 413,
    REQUEST_URI_TOO_LONG: 414,
    UNSUPPORTED_MEDIA_TYPE: 415,
    REQUESTED_RANGE_NOT_SATISFIABLE: 416,
    EXPECTATION_FAILED: 417,
    I_AM_A_TEAPOT: 418,
    UNPROCESSABLE_ENTITY: 422,
    LOCKED: 423,
    FAILED_DEPENDENCY: 424,
    UPGRADE_REQUIRED: 426,
    PRECONDITION_REQUIRED: 428,
    TOO_MANY_REQUESTS: 429,
    REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
    UNAVAILABLE_FOR_LEGAL_REASONS: 451,
    INTERNAL_SERVER_ERROR: 500,
    NOT_IMPLEMENTED: 501,
    BAD_GATEWAY: 502,
    SERVICE_UNAVAILABLE: 503,
    GATEWAY_TIMEOUT: 504,
    HTTP_VERSION_NOT_SUPPORTED: 505,
    INSUFFICIENT_STORAGE: 507,
    LOOP_DETECTED: 508,
    NOT_EXTENDED: 510,
    NETWORK_AUTHENTICATION_REQUIRED: 511,
};
  
const isProduction = process.env.NODE_ENV === "production";

/**
 * Read an environment variable without coercing missing values into the string
 * "undefined". Missing/blank values return undefined.
 */
const readEnv = (name) => {
    const value = process.env[name];
    if (value === undefined || value === null) return undefined;
    const trimmed = String(value).trim();
    return trimmed === "" ? undefined : trimmed;
};

const envOr = (name, fallback) => readEnv(name) ?? fallback;

const envNumber = (name, fallback) => {
    const parsed = Number(readEnv(name));
    return Number.isFinite(parsed) ? parsed : fallback;
};

const defaultAppBaseUrl = isProduction
    ? "https://grant-in-aid.iem.edu.in"
    : "http://localhost:8000";

export const config = {
    isProduction,
    port: envOr("PORT", "8000"),
    uri: readEnv("MONGODB_URI"),
    accessTokenSecret: readEnv("ACCESS_TOKEN_SECRET"),
    accessTokenExpiry: envOr("ACCESS_TOKEN_EXPIRY", "1d"),
    emailUser: readEnv("EMAIL_USER"),
    emailPass: readEnv("EMAIL_PASS"),
    mailProvider: envOr("MAIL_PROVIDER", "smtp").toLowerCase(),

    resendApiKey: readEnv("RESEND_API_KEY"),
    resendFromEmail: readEnv("RESEND_FROM_EMAIL"),
    otpExpiryMinutes: envNumber("OTP_EXPIRY_MINUTES", 5),
    otpHashSecret: readEnv("OTP_HASH_SECRET"),
    appBaseUrl: envOr("APP_BASE_URL", defaultAppBaseUrl).replace(/\/$/, ""),
    bootstrapAdminSecret: envOr("BOOTSTRAP_ADMIN_SECRET", ""),

    reviewerLoginUrl: envOr("REVIEWER_LOGIN_URL", "https://grant-in-aid.iem.edu.in/auth/reviewer/login"),
    adminResetPasswordUrl: envOr(
        "ADMIN_RESET_PASSWORD_URL",
        "http://localhost:5173/auth/superadmin/reset-password",
    ),
    facultyResetPasswordUrl: envOr(
        "FACULTY_RESET_PASSWORD_URL",
        "http://localhost:5173/auth/faculty/reset-password/REAL_TOKEN",
    ),
    reviewerResetPasswordUrl: envOr(
        "REVIEWER_RESET_PASSWORD_URL",
        "http://localhost:5173/auth/reviewer/reset-password/REAL_TOKEN",
    ),

    awsRegion: readEnv("AWS_REGION"),
    awsAccessKeyId: readEnv("AWS_ACCESS_KEY_ID"),
    awsSecretAccessKey: readEnv("AWS_SECRET_ACCESS_KEY"),
    s3BucketName: readEnv("AWS_S3_BUCKET"),

    // Deployment/operations
    trustProxy: envOr("TRUST_PROXY", isProduction ? "1" : ""),
    dnsServers: envOr("DNS_SERVERS", ""),
    logMaxBytes: envNumber("LOG_MAX_BYTES", 10 * 1024 * 1024),
    logMaxFiles: envNumber("LOG_MAX_FILES", 5),
};

const REQUIRED_ALWAYS = ["MONGODB_URI", "ACCESS_TOKEN_SECRET"];

const REQUIRED_IN_PRODUCTION = [
    "OTP_HASH_SECRET",
    "APP_BASE_URL",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_S3_BUCKET",
];

const REQUIRED_MAIL_VARS =
    config.mailProvider === "resend"
        ? ["RESEND_API_KEY", "RESEND_FROM_EMAIL"]
        : ["EMAIL_USER", "EMAIL_PASS"];

/**
 * Fail fast on missing configuration instead of silently using literal
 * "undefined" values for secrets.
 */
export const validateConfig = () => {
    const required = [...REQUIRED_ALWAYS];

    if (config.isProduction) {
        required.push(...REQUIRED_IN_PRODUCTION, ...REQUIRED_MAIL_VARS);
    }

    const missing = [...new Set(required.filter((name) => !readEnv(name)))];

    if (missing.length > 0) {
        throw new Error(
            `Missing required environment variables: ${missing.join(", ")}. ` +
                "Set them in .env (or GitHub Actions secrets) before starting the server.",
        );
    }

    if (config.isProduction && readEnv("ACCESS_TOKEN_SECRET").length < 32) {
        console.warn("⚠️ ACCESS_TOKEN_SECRET should be at least 32 characters long.");
    }
};
