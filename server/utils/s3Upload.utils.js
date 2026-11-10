import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import multer from "multer";
import path from "path";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../constants.js";

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

/**
 * Verify the file bytes match an allowed document type. The extension and MIME
 * type are supplied by the client, so they cannot be trusted on their own.
 */
const sniffDocumentType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;

  // %PDF
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return "application/pdf";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, index) => buffer[index] === byte)) {
    return "image/png";
  }

  return null;
};

export const uploadFile = async (file, folder = "documents") => {
  try {
    if (!file) {
      throw new Error("Invalid file input");
    }

    const fileContent = file.buffer;
    if (!fileContent) {
      throw new Error("File buffer is missing");
    }

    const detectedType = sniffDocumentType(fileContent);
    if (!detectedType) {
      const error = new Error(
        "Uploaded file content is not a valid PDF or image (.pdf, .jpg, .jpeg, .png)",
      );
      error.isUploadValidation = true;
      throw error;
    }

    const originalName = String(file.originalname || "file").replace(/\s+/g, "-");
    const key = `${folder}/${Date.now()}-${originalName}`;

    const command = new PutObjectCommand({
      Bucket: config.s3BucketName,
      Key: key,
      Body: fileContent,
      // Trust the sniffed type, not the client-provided MIME type.
      ContentType: detectedType,
      ServerSideEncryption: "AES256",
    });

    await s3Client.send(command);

    return key;
  } catch (err) {
    if (err.isUploadValidation) throw err;
    throw new Error(`Failed to upload to S3: ${err.message}`);
  }
};

/**
 * Delete a single object. Errors are swallowed by default so cleanup failures
 * never break the user-facing request.
 */
export const deleteFile = async (key, { ignoreErrors = true } = {}) => {
  if (!key) return false;

  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: config.s3BucketName,
        Key: key,
      }),
    );
    return true;
  } catch (err) {
    if (!ignoreErrors) throw err;
    console.error(`Failed to delete S3 object ${key}:`, err.message);
    return false;
  }
};

/**
 * Extract the S3 object key from a stored public URL (or return the key as-is).
 */
export const getKeyFromUrl = (urlOrKey) => {
  if (!urlOrKey) return null;
  if (!/^https?:\/\//i.test(urlOrKey)) return urlOrKey;

  try {
    const { pathname } = new URL(urlOrKey);
    return decodeURIComponent(pathname.replace(/^\/+/, ""));
  } catch {
    return null;
  }
};

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

/**
 * Best-effort removal of a list of stored document URLs.
 */
export const deleteFilesByUrl = async (urls = []) => {
  const keys = [...new Set(urls.map(getKeyFromUrl).filter(Boolean))];
  await Promise.all(keys.map((key) => deleteFile(key)));
  return keys.length;
};

export const getFileObject = async (key) => {
  if (!key) throw new Error("File key is required");

  return s3Client.send(new GetObjectCommand({
    Bucket: config.s3BucketName,
    Key: key,
  }));
};
