import { Router } from "express";

const router = Router();

const institutionName = "IEM-UEM Grant Office";

const getUser = (req) => {
    return {
        name: "Guest User",
        initials: "GU",
        roleLabel: "Guest",
    };
};

const facultyNavigation = [
    {
        label: "Dashboard",
        icon: "layout-dashboard",
        href: "/faculty/dashboard",
    },
    {
        label: "Applications",
        icon: "file-text",
        href: "/faculty/applications",
    },
    {
        label: "New Application",
        icon: "plus-circle",
        href: "/faculty/applications/new",
    },
    {
        label: "Projects",
        icon: "folder-kanban",
        href: "/faculty/projects",
    },
    {
        label: "Notifications",
        icon: "bell",
        href: "/notifications",
    },
    {
        label: "Profile",
        icon: "user",
        href: "/profile",
    },
];

const reviewerNavigation = [
    {
        label: "Dashboard",
        icon: "layout-dashboard",
        href: "/reviewer/dashboard",
    },
    {
        label: "Assigned Applications",
        icon: "clipboard-check",
        href: "/reviewer/applications",
    },
    {
        label: "Notifications",
        icon: "bell",
        href: "/notifications",
    },
    {
        label: "Profile",
        icon: "user",
        href: "/profile",
    },
];

const adminNavigation = [
    {
        label: "Dashboard",
        icon: "layout-dashboard",
        href: "/admin/dashboard",
    },
    {
        label: "Applications",
        icon: "file-text",
        href: "/admin/applications",
    },
    {
        label: "Reviewers",
        icon: "users",
        href: "/admin/reviewers",
    },
    {
        label: "Notifications",
        icon: "bell",
        href: "/notifications",
    },
    {
        label: "Profile",
        icon: "user",
        href: "/profile",
    },
];

const renderPage = (view, navItems = []) => {
    return (req, res) => {
        res.render(view, {
            user: getUser(req),
            navItems,
            institutionName,
        });
    };
};

// Authentication
router.get("/", (req, res) => res.redirect("/login"));
router.get("/dashboard", renderPage("auth/dashboard-redirect"));
router.get("/login", renderPage("auth/login"));
router.get("/register", renderPage("auth/register"));
router.get("/verify-otp", renderPage("auth/otp"));
router.get("/forgot-password", renderPage("auth/forgot-password"));
router.get("/reset-password/:token", renderPage("auth/reset-password"));

// Faculty
router.get(
    "/faculty/dashboard",
    renderPage("faculty/dashboard", facultyNavigation),
);

router.get(
    "/faculty/applications",
    renderPage("faculty/applications", facultyNavigation),
);

router.get(
    "/faculty/applications/new",
    renderPage("faculty/application-new", facultyNavigation),
);

router.get(
    "/faculty/applications/:applicationId",
    renderPage("faculty/application-detail", facultyNavigation),
);

router.get(
    "/faculty/projects/:applicationId",
    renderPage("faculty/project-progress", facultyNavigation),
);
router.get("/faculty/projects", renderPage("faculty/projects", facultyNavigation));

// Reviewer
router.get(
    "/reviewer/dashboard",
    renderPage("reviewer/dashboard", reviewerNavigation),
);

router.get(
    "/reviewer/applications",
    renderPage("reviewer/applications", reviewerNavigation),
);

router.get(
    "/reviewer/applications/:applicationId",
    renderPage("reviewer/review", reviewerNavigation),
);

// Admin
router.get(
    "/admin/dashboard",
    renderPage("admin/dashboard", adminNavigation),
);

router.get(
    "/admin/applications",
    renderPage("admin/applications", adminNavigation),
);

router.get(
    "/admin/applications/:applicationId",
    renderPage("admin/application-detail", adminNavigation),
);

router.get(
    "/admin/reviewers",
    renderPage("admin/reviewers", adminNavigation),
);
router.get("/admin/projects", renderPage("admin/projects", adminNavigation));

// Shared
router.get("/notifications", renderPage("notifications", facultyNavigation));
router.get("/profile", renderPage("profile", facultyNavigation));
router.get("/states", renderPage("states/all"));

export default router;
