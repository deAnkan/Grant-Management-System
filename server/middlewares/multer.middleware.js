import multer from "multer";
import path from "path";

// File filter to accept only image files (.jpg, .jpeg, .png)
const imageFileFilter = (req, file, cb) => {
  // Get the file extension without the dot
  const ext = path.extname(file.originalname).toLowerCase();
  
  // Define allowed extensions and MIME types
  const allowedExtensions = ['.jpg', '.jpeg', '.png'];
  const allowedMimeTypes = [
    'image/jpeg',
    'image/png'
  ];

  if (allowedExtensions.includes(ext) && allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (.jpg, .jpeg, .png)"));
  }
};

export const uploadImage = multer({ 
  storage: multer.memoryStorage(),
  fileFilter: imageFileFilter,
});

export const upload = multer({ storage: multer.memoryStorage() })