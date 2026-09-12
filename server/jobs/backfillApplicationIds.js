import mongoose from "mongoose";
import connectDB from "../config/db.config.js";
import Application from "../models/application.model.js";
import Counter from "../models/counter.model.js";

const formatApplicationId = (year, seq) =>
  `APP-${year}-${String(seq).padStart(6, "0")}`;

const getInitialSequenceByYear = async () => {
  const years = await Application.aggregate([
    {
      $match: {
        applicationId: { $exists: true, $type: "string" },
      },
    },
    {
      $project: {
        year: { $substrCP: ["$applicationId", 4, 4] },
        seq: { $toInt: { $substrCP: ["$applicationId", 9, 6] } },
      },
    },
    {
      $group: {
        _id: "$year",
        maxSeq: { $max: "$seq" },
      },
    },
  ]);

  const map = new Map();
  for (const row of years) {
    map.set(String(row._id), Number(row.maxSeq) || 0);
  }
  return map;
};

const run = async () => {
  const dryRun = process.argv.includes("--dry-run");

  await connectDB();

  try {
    const missing = await Application.find({
      $or: [
        { applicationId: { $exists: false } },
        { applicationId: null },
        { applicationId: "" },
      ],
    })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id createdAt applicationId")
      .lean();

    const seqByYear = await getInitialSequenceByYear();
    let updated = 0;

    for (const app of missing) {
      const year = String(new Date(app.createdAt || Date.now()).getFullYear());
      const current = seqByYear.get(year) || 0;
      const next = current + 1;
      const applicationId = formatApplicationId(year, next);

      if (!dryRun) {
        await Application.updateOne(
          { _id: app._id },
          { $set: { applicationId } },
        );

        await Counter.findByIdAndUpdate(
          `application:${year}`,
          { $max: { seq: next } },
          { upsert: true },
        );
      }

      seqByYear.set(year, next);
      updated += 1;
    }

    console.log(
      dryRun
        ? `[DRY RUN] Applications missing applicationId: ${updated}`
        : `Backfill complete. Updated applications: ${updated}`,
    );
  } finally {
    await mongoose.connection.close();
  }
};

run().catch((error) => {
  console.error("Application ID backfill failed:", error);
  process.exit(1);
});
