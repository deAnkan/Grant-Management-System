import mongoose from "mongoose";
import connectDB from "../config/db.config.js";
import Application from "../models/application.model.js";
import Notification from "../models/notification.model.js";

const NOTIFICATION_TYPE = "APPLICATION_REJECTED";

const run = async () => {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();

  try {
    const rejectedApplications = await Application.find({
      status: "rejected",
      submittedBy: { $exists: true, $ne: null },
    })
      .select("_id title comments submittedBy")
      .lean();

    let created = 0;
    let skipped = 0;

    for (const app of rejectedApplications) {
      const alreadyExists = await Notification.exists({
        type: NOTIFICATION_TYPE,
        recipient: app.submittedBy,
        relatedApplication: app._id,
      });

      if (alreadyExists) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        created += 1;
        continue;
      }

      const appTitle = app.title || "Untitled proposal";
      const comments = String(app.comments || "").trim();

      await Notification.create({
        recipient: app.submittedBy,
        recipientRole: "faculty",
        actor: null,
        type: NOTIFICATION_TYPE,
        title: "Application Rejected",
        message: comments
          ? `Your application "${appTitle}" was rejected. Remark: ${comments}`
          : `Your application "${appTitle}" was rejected.`,
        relatedApplication: app._id,
        data: {
          status: "rejected",
          comments,
          source: "backfill",
        },
        eventKey: `backfill-rejection:${String(app._id)}:${String(app.submittedBy)}`,
      });

      created += 1;
    }

    console.log(
      dryRun
        ? `[DRY RUN] Missing rejection notifications found: ${created}. Already present: ${skipped}.`
        : `Backfill complete. Created: ${created}. Already present: ${skipped}.`,
    );
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
