import nodemailer from "nodemailer";
import { Resend } from "resend";
import { config } from "../constants.js";
import EmailOutbox from "../models/emailOutbox.model.js";

const STALE_CLAIM_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ATTEMPTS = 5;
const WORKER_INTERVAL_MS = 30 * 1000;

let smtpTransporter = null;
let resendClient = null;
let workerTimer = null;
let processing = false;

const getSmtpTransporter = () => {
  if (!smtpTransporter) {
    smtpTransporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: config.emailUser,
        pass: config.emailPass,
      },
    });
  }

  return smtpTransporter;
};

/**
 * Deliver an email immediately. Throws on failure so callers/worker can retry.
 */
export const deliverEmail = async ({ to, subject, html, attachments = [] }) => {
  if (!to || !subject || !html) {
    throw new Error("Email requires to, subject and html");
  }

  if (config.mailProvider === "resend") {
    if (!resendClient) {
      if (!config.resendApiKey) throw new Error("RESEND_API_KEY is missing");
      resendClient = new Resend(config.resendApiKey);
    }

    const { data, error } = await resendClient.emails.send({
      from: config.resendFromEmail,
      to: [to],
      subject,
      html,
      ...(attachments.length > 0 ? { attachments } : {}),
    });

    if (error) throw new Error(error.message || "Failed to send email with Resend");
    return data;
  }

  return getSmtpTransporter().sendMail({
    from: config.emailUser,
    to,
    subject,
    html,
    attachments,
  });
};

/**
 * Persist an email in MongoDB so it survives a process restart and is retried.
 */
export const enqueueEmail = async ({
  to,
  subject,
  html,
  attachments = [],
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) => {
  if (!to || !subject || !html) {
    throw new Error("Email requires to, subject and html");
  }

  return EmailOutbox.create({
    to,
    subject,
    html,
    attachments,
    maxAttempts,
  });
};

const claimNextEmail = () => {
  const now = new Date();

  return EmailOutbox.findOneAndUpdate(
    {
      $or: [
        { status: "pending", nextAttemptAt: { $lte: now } },
        {
          // Reclaim work from a crashed process.
          status: "sending",
          updatedAt: { $lte: new Date(now.getTime() - STALE_CLAIM_MS) },
        },
      ],
    },
    { $set: { status: "sending" } },
    { returnDocument: "after", sort: { nextAttemptAt: 1 } },
  );
};

const handleDeliveryFailure = async (email, error) => {
  const attempts = Number(email.attempts || 0) + 1;
  const maxAttempts = Number(email.maxAttempts || DEFAULT_MAX_ATTEMPTS);

  email.attempts = attempts;
  email.lastError = String(error?.message || error).slice(0, 1000);

  if (attempts >= maxAttempts) {
    email.status = "failed";
  } else {
    // Exponential backoff: 2, 4, 8, 16 minutes (capped at 1 hour).
    const backoffMs = Math.min(2 ** attempts * 60 * 1000, 60 * 60 * 1000);
    email.status = "pending";
    email.nextAttemptAt = new Date(Date.now() + backoffMs);
  }

  await email.save();
  console.error(
    `Email delivery failed (attempt ${attempts}/${maxAttempts}) to ${email.to}:`,
    error?.message || error,
  );
};

/**
 * Process a batch of queued emails. Safe to call concurrently: records are
 * claimed with an atomic findOneAndUpdate.
 */
export const processEmailOutbox = async ({ limit = 20 } = {}) => {
  if (processing) return 0;
  processing = true;

  let processed = 0;

  try {
    for (let index = 0; index < limit; index += 1) {
      const email = await claimNextEmail();
      if (!email) break;

      try {
        await deliverEmail(email);
        email.status = "sent";
        email.sentAt = new Date();
        email.lastError = null;
        await email.save();
      } catch (error) {
        await handleDeliveryFailure(email, error);
      }

      processed += 1;
    }
  } finally {
    processing = false;
  }

  return processed;
};

export const startEmailWorker = ({ intervalMs = WORKER_INTERVAL_MS } = {}) => {
  if (workerTimer) return workerTimer;

  workerTimer = setInterval(() => {
    processEmailOutbox().catch((error) =>
      console.error("Email outbox worker error:", error),
    );
  }, intervalMs);

  // Never keep the process alive just for the worker.
  workerTimer.unref?.();

  processEmailOutbox().catch((error) =>
    console.error("Email outbox initial run error:", error),
  );

  console.log("Email outbox worker started.");
  return workerTimer;
};

export const stopEmailWorker = () => {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
  }
};
