/**
 * Parse search query from request, supporting multiple query param names
 */
export const parseSearchQuery = (req, paramNames = ["q", "title"]) => {
  const value = paramNames
    .map((name) => req.query[name])
    .find((val) => val);
  
  return String(value || "").trim();
};

/**
 * Escape special regex characters
 */
export const escapeRegex = (str) => {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

/**
 * Build regex filter for title/applicationId search
 */
export const buildSearchFilter = (query, fields = ["title", "applicationId"]) => {
  const escaped = escapeRegex(query);
  const regexPattern = { $regex: escaped, $options: "i" };
  
  return {
    $or: fields.map((field) => ({
      [field]: regexPattern,
    })),
  };
};

/**
 * Parse pagination from request query
 */
export const parsePagination = (req, defaultLimit = 10) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || defaultLimit, 1), 100);
  
  return {
    page,
    limit,
    skip: (page - 1) * limit,
  };
};

/**
 * Build pagination metadata
 */
export const buildPagination = (page, limit, total) => {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
    hasPrevPage: page > 1,
  };
};
