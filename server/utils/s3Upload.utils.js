import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import multer from "multer";
import path from "path";
import dotenv from "dotenv";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../constants.js";

dotenv.config();

const documentFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = [".pdf", ".jpg", ".jpeg", ".png"];
  const allowedMimeTypes = ["application/pdf", "image/jpeg", "image/png"];

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF and image files are allowed (.pdf, .jpg, .jpeg, .png)"));
  }
};

export const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: documentFileFilter,
  limits: { fileSize: 10 * 1024 * 1024 },
});

const s3Client = new S3Client({
  region: config.awsRegion,
  credentials: {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  },
});

export const uploadFile = async (file, folder = "documents") => {
  try {
    if (!file) {
      throw new Error("Invalid file input");
    }

    const fileContent = file.buffer;
    if (!fileContent) {
      throw new Error("File buffer is missing");
    }

    const originalName = String(file.originalname || "file").replace(/\s+/g, "-");
    const key = `${folder}/${Date.now()}-${originalName}`;

    const command = new PutObjectCommand({
      Bucket: config.s3BucketName,
      Key: key,
      Body: fileContent,
      ContentType: file.mimetype || "application/octet-stream",
    });

    await s3Client.send(command);

    return key;
  } catch (err) {
    throw new Error(`Failed to upload to S3: ${err.message}`);
  }
};

export const generateSignedUrl = async (key, expiresIn = 2 * 60 * 60) => {
  try {
    const command = new GetObjectCommand({
      Bucket: config.s3BucketName,
      Key: key,
    });

    return await getSignedUrl(s3Client, command, { expiresIn });
  } catch (err) {
    throw new Error(`Failed to generate signed URL: ${err.message}`);
  }
};

const encodeS3Key = (key) => key.split("/").map(encodeURIComponent).join("/");

export const generatePublicUrl = (key) => {
  try {
    if (!key) {
      throw new Error("File key is required");
    }

    return `https://${config.s3BucketName}.s3.${config.awsRegion}.amazonaws.com/${encodeS3Key(key)}`;
  } catch (err) {
    throw new Error(`Failed to generate public URL: ${err.message}`);
  }
};

export const getFileObject = async (key) => {
  if (!key) throw new Error("File key is required");

  return s3Client.send(new GetObjectCommand({
    Bucket: config.s3BucketName,
    Key: key,
  }));
};
