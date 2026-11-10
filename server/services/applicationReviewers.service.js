/**
 * Helpers for the application's reviewer assignment.
 *
 * Historically applications stored both a legacy single `reviewer` field and a
 * newer `reviewers` array. Writing through these helpers keeps both in sync so
 * every query/view sees the same assignment, without requiring a data migration.
 */

export const getReviewerIdStrings = (application) => {
  const ids = [
    ...(application?.reviewers || []).map((id) => String(id)),
    ...(application?.reviewer ? [String(application.reviewer)] : []),
  ];

  return [...new Set(ids.filter(Boolean))];
};

export const hasReviewerAssigned = (application) =>
  getReviewerIdStrings(application).length > 0;

/**
 * Persist the assigned reviewer ids, keeping the legacy primary field aligned
 * with the first reviewer in the list.
 */
export const setAssignedReviewers = (application, reviewerIds = []) => {
  const uniqueIds = [...new Set(reviewerIds.map((id) => String(id)).filter(Boolean))];

  application.reviewers = uniqueIds;
  application.reviewer = uniqueIds.length > 0 ? uniqueIds[0] : undefined;

  return uniqueIds;
};
