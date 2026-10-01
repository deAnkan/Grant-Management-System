import expressAsyncHandler from "express-async-handler";
import jwt from "jsonwebtoken";
import { config } from "../constants.js";
import User from "../models/user.model.js";
import { sendUnauthorized, sendServerError } from "../utils/response.utils.js";

const getVerifiedUser = async (req) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return null;

  let payload;
  try {
    payload = jwt.verify(token, config.accessTokenSecret);
  } catch {
    return null;
  }

  const user = await User.findById(payload?._id).select("-password");
  if (!user || payload.tokenVersion !== user.tokenVersion) return null;
  return user;
};

export const verifyUser = expressAsyncHandler(async (req, res, next) => {
  try {
    const user = await getVerifiedUser(req);

    if (!user) {
      return sendUnauthorized(res);
    }

    req.user = user;
    next();
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const verifyAdmin = expressAsyncHandler(async (req, res, next) => {
  try {
    const user = await getVerifiedUser(req);

    if (!user || user.role !== "admin") {
      return sendUnauthorized(res);
    }

    req.user = user;
    next();
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const verifyFaculty = expressAsyncHandler(async (req, res, next) => {
  try {
    const user = await getVerifiedUser(req);

    if (!user || user.role !== "faculty") {
      return sendUnauthorized(res);
    }

    req.user = user;
    next();
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const verifyReviewer = expressAsyncHandler(async (req, res, next) => {
  try {
    const user = await getVerifiedUser(req);

    if (!user || user.role !== "reviewer") {
      return sendUnauthorized(res);
    }

    req.user = user;
    next();
  } catch (error) {
    return sendServerError(res, error);
  }
});

export const verifyAdminOrFaculty = expressAsyncHandler(
  async (req, res, next) => {
    try {
      const user = await getVerifiedUser(req);

      if (!user || (user.role !== "admin" && user.role !== "faculty")) {
        return sendUnauthorized(res);
      }

      req.user = user;
      next();
    } catch (error) {
      return sendServerError(res, error);
    }
  },
);
