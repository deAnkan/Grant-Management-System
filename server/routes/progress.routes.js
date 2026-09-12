import { Router } from "express";
import { submitProgressReport, getProgressReports } from "../controllers/progress.controller.js";
import { verifyUser } from "../middlewares/auth.middleware.js";
import { upload } from "../utils/s3Upload.utils.js";

const router = Router();

// All routes require authentication
router.use(verifyUser);

router.route("/:applicationId")
    .get(getProgressReports)
    .post(
        upload.array("documents", 5), // Allows up to 5 documents
        submitProgressReport
    );

export default router;