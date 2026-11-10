import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { getKeyFromUrl } from "../utils/s3Upload.utils.js";
import { readLastLines } from "../utils/logStream.utils.js";
import Application from "../models/application.model.js";
import Progress from "../models/progress.model.js";
import {
  getReviewerIdStrings,
  hasReviewerAssigned,
  setAssignedReviewers,
} from "../services/applicationReviewers.service.js";

test("getKeyFromUrl extracts keys from S3 URLs and passes raw keys through", () => {
  assert.equal(getKeyFromUrl("documents/123-report.pdf"), "documents/123-report.pdf");
  assert.equal(
    getKeyFromUrl(
      "https://bucket.s3.ap-south-1.amazonaws.com/documents/123-report.pdf",
    ),
    "documents/123-report.pdf",
  );
  assert.equal(
    getKeyFromUrl(
      "https://bucket.s3.ap-south-1.amazonaws.com/progress-documents/a%20b.pdf",
    ),
    "progress-documents/a b.pdf",
  );
  assert.equal(getKeyFromUrl(null), null);
});

test("readLastLines returns only the requested trailing lines", async () => {
  const filePath = path.join(os.tmpdir(), `log-test-${Date.now()}.log`);
  const lines = Array.from({ length: 50 }, (_, index) => `line-${index + 1}`);
  await fs.promises.writeFile(filePath, lines.join("\n"), "utf8");

  try {
    const output = await readLastLines(filePath, 5);
    assert.deepEqual(output.split("\n"), lines.slice(-5));
  } finally {
    await fs.promises.rm(filePath, { force: true });
  }
});

test("application schema enables optimistic concurrency and indexes", () => {
  assert.equal(Application.schema.get("optimisticConcurrency"), true);

  const indexKeys = Application.schema.indexes().map(([keys]) => JSON.stringify(keys));
  assert.ok(indexKeys.includes(JSON.stringify({ status: 1, createdAt: -1 })));
  assert.ok(indexKeys.includes(JSON.stringify({ submittedBy: 1, createdAt: -1 })));
});

test("progress schema indexes reports by application", () => {
  const indexKeys = Progress.schema.indexes().map(([keys]) => JSON.stringify(keys));
  assert.ok(indexKeys.includes(JSON.stringify({ applicationId: 1, createdAt: -1 })));
});

test("reviewer helpers keep legacy reviewer and reviewers in sync", () => {
  const application = { reviewer: "legacy-id", reviewers: [] };

  assert.deepEqual(getReviewerIdStrings(application).sort(), ["legacy-id"]);
  assert.equal(hasReviewerAssigned(application), true);

  setAssignedReviewers(application, ["a", "b", "a"]);
  assert.deepEqual(application.reviewers, ["a", "b"]);
  assert.equal(application.reviewer, "a");

  setAssignedReviewers(application, []);
  assert.deepEqual(application.reviewers, []);
  assert.equal(application.reviewer, undefined);
  assert.equal(hasReviewerAssigned(application), false);
});
