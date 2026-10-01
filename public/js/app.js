document.addEventListener("DOMContentLoaded", () => {
    const API_BASE = "/api/v1";

    const getToken = () => sessionStorage.getItem("accessToken");

    const setToken = (token) => {
        sessionStorage.setItem("accessToken", token);
    };

    const clearToken = () => {
        sessionStorage.removeItem("accessToken");
        sessionStorage.removeItem("loggedInUser");
    };

    const apiRequest = async (url, options = {}) => {
        const token = getToken();

        const headers = {
            ...(options.headers || {}),
        };

        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(url, {
            ...options,
            headers,
        });

        const data = await response.json().catch(() => ({
            success: false,
            message: "Unexpected server response",
        }));

        if (!response.ok) {
            if (response.status === 401) {
                clearToken();
                if (!window.location.pathname.startsWith("/login")) {
                    window.location.href = "/login";
                }
            }
            throw new Error(data.message || "Request failed");
        }

        return data;
    };

    const showToast = (message, type = "success") => {
        const stack = document.querySelector(".toast-stack");

        if (!stack) {
            alert(message);
            return;
        }

        const toast = document.createElement("div");
        toast.className = `toast ${type === "error" ? "toast-error" : ""}`;
        toast.textContent = message;

        stack.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 4000);
    };

    const redirectByRole = (role) => {
        const paths = {
            faculty: "/faculty/dashboard",
            reviewer: "/reviewer/dashboard",
            admin: "/admin/dashboard",
        };

        window.location.href = paths[role] || "/login";
    };

    if (window.location.pathname === "/dashboard") {
        const user = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
        const paths = {
            faculty: "/faculty/dashboard",
            reviewer: "/reviewer/dashboard",
            admin: "/admin/dashboard",
        };
        window.location.replace(paths[user?.role] || "/login");
        return;
    }

    // Sidebar and modal behaviour from the supplied UI.
    document.querySelectorAll("[data-sidebar-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelector("[data-sidebar]")?.classList.toggle("open");
        });
    });

    document.querySelectorAll("[data-modal-open]").forEach((button) => {
        button.addEventListener("click", () => {
            const modal = document.getElementById(button.dataset.modalOpen);
            modal?.classList.add("open");
        });
    });

    document.querySelectorAll("[data-modal-close]").forEach((button) => {
        button.addEventListener("click", () => {
            button.closest(".modal-backdrop")?.classList.remove("open");
            button.closest(".drawer-backdrop")?.classList.remove("open");
        });
    });

    document.querySelectorAll("[data-role]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-role]").forEach((roleButton) => {
                roleButton.classList.remove("selected");
                roleButton.setAttribute("aria-pressed", "false");
            });

            button.classList.add("selected");
            button.setAttribute("aria-pressed", "true");

            const roleInput = document.querySelector('input[name="role"]');

            if (roleInput) {
                roleInput.value = button.dataset.role;
            }
        });
    });

    // Login: password or OTP
    const loginForm = document.querySelector("#login-form");

    if (loginForm) {
        loginForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const identifier = document.querySelector("#identifier")?.value.trim();
            const password = document.querySelector("#password")?.value;
            const role = document.querySelector('input[name="role"]')?.value;
            const loginMethod = event.submitter?.dataset.loginMethod || "otp";

            if (!identifier || !role) {
                showToast("Enter your email or employee ID and select a role.", "error");
                return;
            }

            const payload = {
                role,
            };

            if (identifier.includes("@")) {
                payload.email = identifier;
            } else {
                payload.employeeId = identifier;
            }

            if (loginMethod === "password") {
                if (!password) {
                    showToast("Enter your password.", "error");
                    return;
                }

                payload.password = password;
            }

            try {
                const result = await apiRequest(`${API_BASE}/auth/${loginMethod === "password" ? "login-password" : "request-otp"}`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify(payload),
                });

                // Password login and the special backend bypass return a token immediately.
                if (result.data?.accessToken) {
                    setToken(result.data.accessToken);
                    sessionStorage.setItem(
                        "loggedInUser",
                        JSON.stringify(result.data.user),
                    );

                    showToast("Login successful.");
                    redirectByRole(result.data.user.role);
                    return;
                }

                sessionStorage.setItem("otpSessionId", result.data.otpSessionId);
                sessionStorage.setItem("loginRole", role);
                sessionStorage.setItem("loginIdentifier", identifier);

                window.location.href = "/verify-otp";
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    const registerForm = document.querySelector("#register-form");

    if (registerForm) {
        registerForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const payload = {
                fullName: document.querySelector("#full-name")?.value.trim(),
                email: document.querySelector("#register-email")?.value.trim(),
                employeeId: document.querySelector("#employee-id")?.value.trim(),
                phoneNo: document.querySelector("#phone-no")?.value.trim(),
                password: document.querySelector("#register-password")?.value,
                role: "faculty",
            };

            try {
                await apiRequest(`${API_BASE}/auth/register`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                showToast("Account created. You can now sign in.");
                window.location.href = "/login";
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    const forgotPasswordForm = document.querySelector("#forgot-password-form");
    if (forgotPasswordForm) {
        forgotPasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            try {
                await apiRequest(`${API_BASE}/auth/forgot-password`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        email: document.querySelector("#forgot-email")?.value.trim(),
                        role: document.querySelector("#forgot-role")?.value,
                    }),
                });
                showToast("If the account exists, a reset link has been sent.");
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    const resetPasswordForm = document.querySelector("#reset-password-form");
    if (resetPasswordForm) {
        const token = window.location.pathname.split("/").pop();
        const role = new URLSearchParams(window.location.search).get("role");

        resetPasswordForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const password = document.querySelector("#new-password")?.value;
            const confirmPassword = document.querySelector("#confirm-password")?.value;
            if (!role || password !== confirmPassword) {
                showToast(!role ? "Invalid reset link." : "Passwords do not match.", "error");
                return;
            }

            try {
                await apiRequest(`${API_BASE}/auth/reset-password/${encodeURIComponent(token)}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ role, password, confirmPassword }),
                });
                showToast("Password reset successfully. Please sign in.");
                window.location.href = "/login";
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    // OTP verification: POST /api/v1/auth/verify-otp
    const otpForm = document.querySelector("#otp-form");

    if (otpForm) {
        const displayIdentifier = document.querySelector("#otp-identifier");

        if (displayIdentifier) {
            displayIdentifier.textContent =
                sessionStorage.getItem("loginIdentifier") || "your registered email";
        }

        otpForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const otpSessionId = sessionStorage.getItem("otpSessionId");
            const otp = document.querySelector("#otp")?.value.trim();

            if (!otpSessionId) {
                showToast("Login session expired. Please sign in again.", "error");
                window.location.href = "/login";
                return;
            }

            if (!/^[0-9]{6}$/.test(otp)) {
                showToast("Enter a valid six-digit OTP.", "error");
                return;
            }

            try {
                const result = await apiRequest(`${API_BASE}/auth/verify-otp`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        otpSessionId,
                        otp,
                    }),
                });

                setToken(result.data.accessToken);
                sessionStorage.setItem(
                    "loggedInUser",
                    JSON.stringify(result.data.user),
                );

                sessionStorage.removeItem("otpSessionId");
                sessionStorage.removeItem("loginIdentifier");

                showToast("Login successful.");
                redirectByRole(result.data.user.role);
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    // Faculty: POST /api/v1/faculty/applications
    const applicationForm = document.querySelector("#application-form");

    if (applicationForm) {
        applicationForm.addEventListener("submit", async (event) => {
            event.preventDefault();

            const title = document.querySelector("#title")?.value.trim();
            const category = document.querySelector("#category")?.value.trim();
            const amountRequested = document.querySelector("#amount")?.value;
            const synopsis = document.querySelector("#synopsis")?.value.trim();
            const documents = document.querySelector("#documents")?.files;

            if (!title || !category || !amountRequested || !synopsis) {
                showToast("Complete all required application fields.", "error");
                return;
            }

            if (!documents || documents.length === 0) {
                showToast("Upload at least one supporting document.", "error");
                return;
            }

            const formData = new FormData();
            formData.append("title", title);
            formData.append("category", category.toLowerCase());
            formData.append("amountRequested", amountRequested);
            formData.append("synopsis", synopsis);

            Array.from(documents).forEach((file) => {
                formData.append("documents", file);
            });

            try {
                const result = await apiRequest(`${API_BASE}/faculty/applications`, {
                    method: "POST",
                    body: formData,
                });

                showToast("Application submitted successfully.");

                const applicationId = result.data?.applicationId;

                if (applicationId) {
                    window.location.href = `/faculty/applications/${applicationId}`;
                } else {
                    window.location.href = "/faculty/applications";
                }
            } catch (error) {
                showToast(error.message, "error");
            }
        });
    }

    const reviewForm = document.querySelector("#review-form");
    if (reviewForm) {
        const calcAverage = () => {
            const interview = parseFloat(document.querySelector("#interview")?.value);
            const presentation = parseFloat(document.querySelector("#presentation")?.value);
            const avgField = document.querySelector("#average");
            if (avgField) {
                if (!isNaN(interview) && !isNaN(presentation)) {
                    avgField.value = ((interview + presentation) / 2).toFixed(2);
                } else {
                    avgField.value = "Auto-calculated by backend";
                }
            }
        };
        document.querySelector("#interview")?.addEventListener("input", calcAverage);
        document.querySelector("#presentation")?.addEventListener("input", calcAverage);

        reviewForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const applicationId = window.location.pathname.split("/").pop();
            try {
                await apiRequest(`${API_BASE}/reviewer/applications/${encodeURIComponent(applicationId)}/review`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        interviewScore: document.querySelector("#interview")?.value,
                        presentationScore: document.querySelector("#presentation")?.value,
                        reviewerSignature: document.querySelector("#signature")?.value.trim(),
                        remark: document.querySelector("#remarks")?.value.trim(),
                    }),
                });
                showToast("Review submitted successfully.");
                window.location.href = "/reviewer/applications";
            } catch (error) { showToast(error.message, "error"); }
        });
    }

    const progressForm = document.querySelector("#progress-form");
    if (progressForm) {
        progressForm.addEventListener("submit", async (event) => {
            event.preventDefault();
            const applicationId = window.location.pathname.split("/").pop();
            const files = document.querySelector("#report-file")?.files;
            if (!files?.length) return showToast("Attach at least one report document.", "error");
            const formData = new FormData();
            formData.append("description", document.querySelector("#report-summary")?.value.trim());
            formData.append("amountSpent", document.querySelector("#amount-spent")?.value);
            Array.from(files).forEach((file) => formData.append("documents", file));
            try {
                await apiRequest(`${API_BASE}/progress/${encodeURIComponent(applicationId)}`, { method: "POST", body: formData });
                showToast("Progress report submitted successfully.");
                document.querySelector("#report-modal")?.classList.remove("open");
                progressForm.reset();
                if (typeof loadFacultyProjectProgress === "function") {
                    loadFacultyProjectProgress();
                }
            } catch (error) { showToast(error.message, "error"); }
        });
    }

    // File-preview UI
    document.querySelectorAll("[data-file-input]").forEach((input) => {
        input.addEventListener("change", (event) => {
            const container = document.getElementById(input.dataset.fileInput);

            if (!container) {
                return;
            }

            container.innerHTML = "";

            Array.from(event.target.files)
                .slice(0, 5)
                .forEach((file) => {
                    const row = document.createElement("div");
                    row.className = "file-item";
                    row.textContent = `${file.name} (${Math.ceil(file.size / 1024)} KB)`;
                    container.appendChild(row);
                });
        });
    });

    const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
    const formatMoney = (value) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(value || 0));
    const formatDate = (value) => value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)) : "—";
    const statusClass = (status) => ({ approved: "status-approved", rejected: "status-danger", underReview: "status-review", reviewCompleted: "status-success", initialScreening: "status-screening", submitted: "status-info", withdrawn: "status-draft" }[status] || "status-draft");
    const statusLabel = (status) => String(status || "draft").replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());
    const applicationRow = (app, role) => {
        const href = `/${role}/applications/${app._id}`;
        const faculty = app.submittedBy?.fullName || "—";
        const reviewer = (app.reviewers || []).length || app.reviewer ? "Assigned" : "Unassigned";
        const base = `<td><a href="${href}"><strong>${escapeHtml(app.title)}</strong></a><div class="muted small">${escapeHtml(app.applicationId || "Pending ID")}</div></td>`;
        const status = `<span class="status ${statusClass(app.status)}">${statusLabel(app.status)}</span>`;
        if (role === "admin") return `<tr>${base}<td>${escapeHtml(faculty)}</td><td>${escapeHtml(app.category)}</td><td>${formatMoney(app.amountRequested)}</td><td>${reviewer}</td><td>${status}</td><td>${formatDate(app.updatedAt)}</td></tr>`;
        if (role === "reviewer") return `<tr>${base}<td>${escapeHtml(faculty)}</td><td>${escapeHtml(app.category)}</td><td>${formatMoney(app.amountRequested)}</td><td>${formatDate(app.updatedAt)}</td><td>${status}</td></tr>`;
        return `<tr>${base}<td>${escapeHtml(app.category)}</td><td>${formatMoney(app.amountRequested)}</td><td>${formatDate(app.createdAt)}</td><td>${status}</td><td><a href="${href}">View</a></td></tr>`;
    };

    const hydrateIdentity = () => {
        const user = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
        if (!user) return;
        const initials = String(user.fullName || "User").split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
        document.querySelectorAll(".avatar").forEach((element) => {
            element.textContent = "";
            if (user.profileImage) {
                const image = document.createElement("img");
                image.src = user.profileImage;
                image.alt = "Profile picture";
                image.onerror = () => { element.textContent = initials; image.remove(); };
                element.appendChild(image);
            } else {
                element.textContent = initials;
            }
        });
        document.querySelectorAll(".user-mini strong").forEach((element) => { element.textContent = user.fullName; });
        document.querySelectorAll(".user-mini span").forEach((element) => { element.textContent = statusLabel(user.role); });
        const facultyGreeting = document.querySelector("#faculty-greeting");
        if (facultyGreeting && user.fullName) {
            facultyGreeting.textContent = `Welcome, ${user.fullName}`;
        }
        const profileName = document.querySelector("#name");
        const profileEmployee = document.querySelector("#employee");
        const profileEmail = document.querySelector("#email");
        if (profileName) profileName.value = user.fullName || "";
        if (profileEmployee) profileEmployee.value = user.employeeId || "";
        if (profileEmail) profileEmail.value = user.email || "";
        const profilePreview = document.querySelector("#profile-image-preview");
        if (profilePreview && user.profileImage) profilePreview.src = user.profileImage;

        const navigation = document.querySelector("#workspace-navigation");
        const itemsByRole = {
            faculty: [
                ["Dashboard", "layout-dashboard", "/faculty/dashboard"],
                ["Applications", "file-text", "/faculty/applications"],
                ["New application", "plus-circle", "/faculty/applications/new"],
                ["Projects", "folder-kanban", "/faculty/projects"],
            ],
            reviewer: [
                ["Dashboard", "layout-dashboard", "/reviewer/dashboard"],
                ["Assigned applications", "clipboard-check", "/reviewer/applications"],
            ],
            admin: [
                ["Dashboard", "layout-dashboard", "/admin/dashboard"],
                ["Applications", "file-text", "/admin/applications"],
                ["Reviewers", "users-round", "/admin/reviewers"],
                ["Projects", "folder-kanban", "/admin/projects"],
            ],
        };
        if (navigation && itemsByRole[user.role]) {
            navigation.innerHTML = itemsByRole[user.role].map(([label, icon, href]) =>
                `<a class="nav-link ${window.location.pathname === href ? "active" : ""}" href="${href}"><i data-lucide="${icon}"></i><span>${label}</span></a>`,
            ).join("");
            window.lucide?.createIcons();
        }

        const currentPath = window.location.pathname;
        const links = [...document.querySelectorAll(".sidebar .nav-link[href]")];
        const matches = links.filter((link) => {
            const href = link.getAttribute("href");
            return href === currentPath || (href !== "/dashboard" && currentPath.startsWith(`${href}/`));
        });
        const activeLink = matches.sort((a, b) => b.getAttribute("href").length - a.getAttribute("href").length)[0];
        links.forEach((link) => link.classList.toggle("active", link === activeLink));
    };

    const loadApplications = async (role, filters = {}) => {
        const tableBody = document.querySelector(".table tbody");
        if (!tableBody) return;
        tableBody.innerHTML = `<tr><td colspan="7" class="muted small">Loading applications…</td></tr>`;
        try {
            const query = new URLSearchParams();
            if (role === "admin") query.set("all", "true");
            else query.set("limit", "100");
            Object.entries(filters).forEach(([key, value]) => {
                if (value && value !== "all") query.set(key, value);
            });
            const endpoint = `/${role}/applications?${query.toString()}`;
            const result = await apiRequest(`${API_BASE}${endpoint}`);
            const applications = result.data?.applications || [];
            tableBody.innerHTML = applications.length ? applications.map((app) => applicationRow(app, role)).join("") : `<tr><td colspan="7" class="muted small">No applications found.</td></tr>`;
        } catch (error) { tableBody.innerHTML = `<tr><td colspan="7" class="muted small">${escapeHtml(error.message)}</td></tr>`; }
    };

    const readApplicationFilters = () => ({
        q: document.querySelector("#application-search")?.value.trim(),
        status: document.querySelector("#application-status")?.value,
        category: document.querySelector("#application-category")?.value,
        reviewerFilter: document.querySelector("#application-reviewer")?.value,
    });

    const loadNotifications = async () => {
        if (window.location.pathname !== "/notifications") return;
        const list = document.querySelector(".card-pad.list");
        if (!list) return;
        try {
            const result = await apiRequest(`${API_BASE}/notifications?limit=50`);
            const notifications = result.data?.notifications || [];
            list.innerHTML = notifications.length ? notifications.map((item) => `<button class="list-item notification-item" data-notification-id="${item._id}"><div><strong class="small">${escapeHtml(item.title)}</strong><div class="muted small">${escapeHtml(item.message)}</div><div class="muted small">${formatDate(item.createdAt)}</div></div><span class="status ${item.isRead ? "status-success" : "status-info"}">${item.isRead ? "Read" : "Unread"}</span></button>`).join("") : `<div class="empty"><h3>No notifications</h3><p>You are all caught up.</p></div>`;
        } catch (error) { showToast(error.message, "error"); }
    };

    const loadDashboard = async (role) => {
        if (!window.location.pathname.endsWith("/dashboard")) return;
        try {
            const endpoint = role === "admin" ? "/admin/applications?all=true" : `/${role}/applications?limit=100`;
            const result = await apiRequest(`${API_BASE}${endpoint}`);
            const apps = result.data?.applications || [];
            const values = role === "admin" ? [apps.length, apps.filter((a) => ["submitted", "initialScreening"].includes(a.status)).length, apps.filter((a) => a.status === "underReview").length, formatMoney(apps.filter((a) => a.status === "approved").reduce((sum, a) => sum + Number(a.grantedAmount || 0), 0))] : [apps.length, apps.filter((a) => ["underReview", "sentToReviewer"].includes(a.status)).length, apps.filter((a) => a.status === "approved").length, apps.filter((a) => a.status === "reviewCompleted").length];
            document.querySelectorAll(".stat-value").forEach((element, index) => { if (values[index] !== undefined) element.textContent = values[index]; });
            const body = document.querySelector(".table tbody");
            if (body) body.innerHTML = apps.slice(0, 5).map((app) => applicationRow(app, role)).join("");
        } catch (error) { showToast(error.message, "error"); }
    };

    const loadProjects = async () => {
        const body = document.querySelector("#projects-table-body");
        if (!body) return;
        try {
            const result = await apiRequest(`${API_BASE}/faculty/applications?limit=100&status=approved`);
            const projects = result.data?.applications || [];
            body.innerHTML = projects.length ? projects.map((project) => `<tr><td><strong>${escapeHtml(project.title)}</strong><div class="muted small">${escapeHtml(project.applicationId || "")}</div></td><td>${formatMoney(project.grantedAmount)}</td><td>${formatDate(project.projectValidityStartDate)} – ${formatDate(project.projectValidityEndDate)}</td><td><span class="status status-approved">${escapeHtml(statusLabel(project.projectStatus || "active"))}</span></td><td><a href="/faculty/projects/${project._id}">Open project</a></td></tr>`).join("") : `<tr><td colspan="5" class="muted small">No funded projects yet.</td></tr>`;
        } catch (error) { body.innerHTML = `<tr><td colspan="5" class="muted small">${escapeHtml(error.message)}</td></tr>`; }
    };

    const loadAdminProjects = async () => {
        const body = document.querySelector("#projects-table-body");
        if (!body) return;
        try {
            const result = await apiRequest(`${API_BASE}/admin/applications?all=true&status=approved`);
            const projects = result.data?.applications || [];
            body.innerHTML = projects.length ? projects.map((project) => `<tr><td><strong>${escapeHtml(project.title)}</strong><div class="muted small">${escapeHtml(project.applicationId || "")}</div></td><td>${escapeHtml(project.submittedBy?.fullName || "—")}</td><td>${formatMoney(project.grantedAmount)}</td><td><span class="status status-approved">${escapeHtml(statusLabel(project.projectStatus || "active"))}</span></td><td><a href="/admin/applications/${project._id}">Open application</a></td></tr>`).join("") : `<tr><td colspan="5" class="muted small">No funded projects yet.</td></tr>`;
        } catch (error) {
            body.innerHTML = `<tr><td colspan="5" class="muted small">${escapeHtml(error.message)}</td></tr>`;
        }
    };

    const loadFacultyApplicationDetail = async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/faculty/applications/") || path.endsWith("/new")) return;
        const applicationId = path.split("/").pop();
        if (!applicationId || applicationId === "applications") return;

        try {
            const result = await apiRequest(`${API_BASE}/faculty/applications/${encodeURIComponent(applicationId)}`);
            const app = result.data?.application;
            if (!app) return;

            const eyebrow = document.querySelector("#detail-eyebrow");
            if (eyebrow) eyebrow.textContent = `Application • ${app.applicationId || "Pending ID"}`;

            const title = document.querySelector("#detail-title");
            if (title) title.textContent = app.title || "Untitled Application";

            const meta = document.querySelector("#detail-meta");
            if (meta) meta.textContent = `Submitted ${formatDate(app.createdAt)} • Last updated ${formatDate(app.updatedAt)}`;

            const statusContainer = document.querySelector("#detail-status-container");
            if (statusContainer) {
                statusContainer.innerHTML = `<span class="status ${statusClass(app.status)}">${statusLabel(app.status)}</span>`;
            }

            const synopsis = document.querySelector("#detail-synopsis");
            if (synopsis) synopsis.textContent = app.synopsis || "No synopsis provided.";

            const amount = document.querySelector("#detail-amount");
            if (amount) amount.textContent = formatMoney(app.amountRequested);

            const category = document.querySelector("#detail-category");
            if (category) category.textContent = escapeHtml(app.category || "—");

            const docCount = document.querySelector("#detail-doc-count");
            if (docCount) docCount.textContent = `${(app.documentUrls || []).length} document(s)`;

            const reviewer = document.querySelector("#detail-reviewer");
            if (reviewer) {
                const isAssigned = (app.reviewers && app.reviewers.length > 0) || app.reviewer;
                reviewer.textContent = isAssigned ? "Assigned" : "Not assigned yet";
            }

            const docsList = document.querySelector("#detail-documents-list");
            if (docsList) {
                if (app.documentUrls && app.documentUrls.length) {
                    docsList.innerHTML = app.documentUrls.map((url, idx) => {
                        const fileName = url.split("/").pop() || `Document ${idx + 1}`;
                        return `<a class="list-item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><div><strong>${escapeHtml(fileName)}</strong></div><span class="muted small">View file</span></a>`;
                    }).join("");
                } else {
                    docsList.innerHTML = `<div class="muted small">No documents attached.</div>`;
                }
            }

            const timeline = document.querySelector("#detail-timeline");
            if (timeline) {
                const stages = [
                    { key: "submitted", label: "Application Submitted", date: app.createdAt },
                    { key: "initialScreening", label: "Initial Administrative Screening", active: ["initialScreening", "sentToReviewer", "underReview", "reviewCompleted", "approved", "rejected"].includes(app.status) },
                    { key: "underReview", label: "Under Expert Review", active: ["underReview", "sentToReviewer", "reviewCompleted", "approved", "rejected"].includes(app.status) },
                    { key: "approved", label: app.status === "rejected" ? "Application Rejected" : (app.status === "approved" ? "Grant Approved" : "Final Decision"), active: ["approved", "rejected"].includes(app.status) },
                ];
                timeline.innerHTML = stages.map((stage) => {
                    const isPassed = stage.active || (stage.key === "submitted" && app.createdAt);
                    const dotClass = isPassed ? (app.status === "rejected" && stage.key === "approved" ? "status-danger" : "status-success") : "status-draft";
                    return `<div class="timeline-item" style="display:flex;gap:12px;margin-bottom:12px;align-items:flex-start">
                        <span class="status ${dotClass}" style="border-radius:50%;width:10px;height:10px;padding:0;margin-top:5px;flex-shrink:0"></span>
                        <div><strong>${escapeHtml(stage.label)}</strong><div class="muted small">${stage.date ? formatDate(stage.date) : (isPassed ? "Completed" : "Pending")}</div></div>
                    </div>`;
                }).join("");
            }

            const actionsContainer = document.querySelector("#detail-actions");
            if (actionsContainer) {
                actionsContainer.innerHTML = "";
                if (["submitted", "initialScreening"].includes(app.status)) {
                    const withdrawBtn = document.createElement("button");
                    withdrawBtn.className = "btn btn-secondary";
                    withdrawBtn.textContent = "Withdraw application";
                    withdrawBtn.addEventListener("click", async () => {
                        if (!confirm("Are you sure you want to withdraw this application?")) return;
                        try {
                            await apiRequest(`${API_BASE}/faculty/applications/${encodeURIComponent(applicationId)}/withdraw`, { method: "PATCH" });
                            showToast("Application withdrawn successfully.");
                            loadFacultyApplicationDetail();
                        } catch (err) {
                            showToast(err.message, "error");
                        }
                    });
                    actionsContainer.appendChild(withdrawBtn);
                } else if (app.status === "withdrawn") {
                    const reopenBtn = document.createElement("button");
                    reopenBtn.className = "btn btn-primary";
                    reopenBtn.textContent = "Reopen application";
                    reopenBtn.addEventListener("click", async () => {
                        try {
                            await apiRequest(`${API_BASE}/faculty/applications/${encodeURIComponent(applicationId)}/reopen`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    title: app.title,
                                    amountRequested: app.amountRequested,
                                    synopsis: app.synopsis,
                                    category: app.category,
                                }),
                            });
                            showToast("Application reopened successfully.");
                            loadFacultyApplicationDetail();
                        } catch (err) {
                            showToast(err.message, "error");
                        }
                    });
                    actionsContainer.appendChild(reopenBtn);
                } else if (app.status === "approved") {
                    const projectLink = document.createElement("a");
                    projectLink.className = "btn btn-primary";
                    projectLink.href = `/faculty/projects/${app._id}`;
                    projectLink.textContent = "View project progress";
                    actionsContainer.appendChild(projectLink);
                }
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    };

    const loadAdminApplicationDetail = async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/admin/applications/")) return;
        const applicationId = path.split("/").pop();
        if (!applicationId || applicationId === "applications") return;

        try {
            const [appResult, reviewersResult] = await Promise.all([
                apiRequest(`${API_BASE}/admin/applications/${encodeURIComponent(applicationId)}`),
                apiRequest(`${API_BASE}/admin/reviewers`).catch(() => ({ data: { reviewers: [] } })),
            ]);

            const app = appResult.data?.application;
            if (!app) return;

            const eyebrow = document.querySelector("#admin-detail-eyebrow");
            if (eyebrow) eyebrow.textContent = `Application • ${app.applicationId || "Pending ID"}`;

            const title = document.querySelector("#admin-detail-title");
            if (title) title.textContent = app.title || "Untitled Application";

            const meta = document.querySelector("#admin-detail-meta");
            if (meta) {
                const faculty = app.submittedBy ? `${app.submittedBy.fullName} (${app.submittedBy.email || ""})` : "Unknown faculty";
                meta.textContent = `Submitted by ${faculty} • ${formatDate(app.createdAt)}`;
            }

            const statusContainer = document.querySelector("#admin-detail-status-container");
            if (statusContainer) {
                statusContainer.innerHTML = `<span class="status ${statusClass(app.status)}">${statusLabel(app.status)}</span>`;
            }

            const synopsis = document.querySelector("#admin-detail-synopsis");
            if (synopsis) synopsis.textContent = app.synopsis || "No synopsis provided.";

            const amount = document.querySelector("#admin-detail-amount");
            if (amount) amount.textContent = formatMoney(app.amountRequested);

            const avgScoreEl = document.querySelector("#admin-detail-avg-score");
            if (avgScoreEl) {
                const marks = app.marks || [];
                if (marks.length > 0) {
                    const avg = marks.reduce((sum, m) => sum + (Number(m.averageScore) || 0), 0) / marks.length;
                    avgScoreEl.textContent = `${avg.toFixed(1)} / 10`;
                } else if (app.averageScore != null) {
                    avgScoreEl.textContent = `${Number(app.averageScore).toFixed(1)} / 10`;
                } else {
                    avgScoreEl.textContent = "—";
                }
            }

            const grantInput = document.querySelector("#admin-grant-amount");
            if (grantInput && !grantInput.value) {
                grantInput.value = app.grantedAmount != null ? app.grantedAmount : (app.amountRequested || "");
            }

            const reviewers = reviewersResult.data?.reviewers || [];
            const reviewerSelect = document.querySelector("#admin-reviewer-select");
            if (reviewerSelect) {
                const currentReviewerId = app.reviewer?._id || app.reviewer || (app.reviewers?.[0]?._id || app.reviewers?.[0]);
                reviewerSelect.innerHTML = `<option value="">Select a reviewer...</option>` +
                    reviewers.map((r) => `<option value="${r._id}" ${String(r._id) === String(currentReviewerId) ? "selected" : ""}>${escapeHtml(r.fullName)} (${escapeHtml(r.email)})</option>`).join("");
            }

            const assessmentContainer = document.querySelector("#admin-detail-assessment");
            if (assessmentContainer) {
                const marks = app.marks || [];
                if (marks.length > 0) {
                    assessmentContainer.innerHTML = marks.map((m) => `
                        <div class="list-item" style="flex-direction:column;align-items:flex-start;gap:6px">
                            <div style="display:flex;justify-content:space-between;width:100%">
                                <strong>Score: ${m.averageScore != null ? Number(m.averageScore).toFixed(1) : "—"}/10</strong>
                                <span class="muted small">Interview: ${m.interviewScore ?? "—"} | Presentation: ${m.presentationScore ?? "—"}</span>
                            </div>
                            <div class="small">${escapeHtml(m.remark || "No remarks provided.")}</div>
                            <div class="muted small">Signed: ${escapeHtml(m.reviewerSignature || "—")} • ${formatDate(m.submittedAt || m.createdAt)}</div>
                        </div>
                    `).join("");
                } else {
                    assessmentContainer.innerHTML = `<div class="muted small">No assessment submitted yet.</div>`;
                }
            }

            const docsList = document.querySelector("#admin-detail-documents-list");
            if (docsList) {
                if (app.documentUrls && app.documentUrls.length) {
                    docsList.innerHTML = app.documentUrls.map((url, idx) => {
                        const fileName = url.split("/").pop() || `Document ${idx + 1}`;
                        return `<a class="list-item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><div><strong>${escapeHtml(fileName)}</strong></div><span class="muted small">View file</span></a>`;
                    }).join("");
                } else {
                    docsList.innerHTML = `<div class="muted small">No documents attached.</div>`;
                }
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    };

    const loadReviewerApplicationDetail = async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/reviewer/applications/")) return;
        const applicationId = path.split("/").pop();
        if (!applicationId || applicationId === "applications") return;

        try {
            const result = await apiRequest(`${API_BASE}/reviewer/applications/${encodeURIComponent(applicationId)}`);
            const app = result.data?.application;
            if (!app) return;

            const eyebrow = document.querySelector("#reviewer-eyebrow");
            if (eyebrow) eyebrow.textContent = `Application • ${app.applicationId || "Pending ID"}`;

            const title = document.querySelector("#reviewer-title");
            if (title) title.textContent = app.title || "Untitled Application";

            const meta = document.querySelector("#reviewer-meta");
            if (meta) {
                const faculty = app.submittedBy ? `${app.submittedBy.fullName} (${app.submittedBy.email || ""})` : "—";
                meta.textContent = `Submitted by ${faculty} • Requested ${formatMoney(app.amountRequested)} • Category: ${escapeHtml(app.category || "—")}`;
            }

            const statusContainer = document.querySelector("#reviewer-status-container");
            if (statusContainer) {
                statusContainer.innerHTML = `<span class="status ${statusClass(app.status)}">${statusLabel(app.status)}</span>`;
            }

            const synopsis = document.querySelector("#reviewer-synopsis");
            if (synopsis) synopsis.textContent = app.synopsis || "No synopsis provided.";

            const docsList = document.querySelector("#reviewer-documents-list");
            if (docsList) {
                if (app.documentUrls && app.documentUrls.length) {
                    docsList.innerHTML = app.documentUrls.map((url, idx) => {
                        const fileName = url.split("/").pop() || `Document ${idx + 1}`;
                        return `<a class="list-item" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><div><strong>${escapeHtml(fileName)}</strong></div><span class="muted small">View file</span></a>`;
                    }).join("");
                } else {
                    docsList.innerHTML = `<div class="muted small">No documents attached.</div>`;
                }
            }

            const user = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
            const existingMark = (app.marks || []).find((m) => String(m.reviewer || m.reviewerId) === String(user._id || user.id)) || app.marks?.[0];
            if (existingMark) {
                const interviewInput = document.querySelector("#interview");
                const presentationInput = document.querySelector("#presentation");
                const averageInput = document.querySelector("#average");
                const signatureInput = document.querySelector("#signature");
                const remarksInput = document.querySelector("#remarks");
                if (interviewInput) interviewInput.value = existingMark.interviewScore ?? "";
                if (presentationInput) presentationInput.value = existingMark.presentationScore ?? "";
                if (averageInput) averageInput.value = existingMark.averageScore != null ? Number(existingMark.averageScore).toFixed(2) : "";
                if (signatureInput) signatureInput.value = existingMark.reviewerSignature || "";
                if (remarksInput) remarksInput.value = existingMark.remark || "";
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    };

    const loadFacultyProjectProgress = async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/faculty/projects/")) return;
        const applicationId = path.split("/").pop();
        if (!applicationId || applicationId === "projects") return;

        try {
            const [appResult, progressResult] = await Promise.all([
                apiRequest(`${API_BASE}/faculty/applications/${encodeURIComponent(applicationId)}`),
                apiRequest(`${API_BASE}/progress/${encodeURIComponent(applicationId)}`).catch(() => ({ data: { reports: [] } })),
            ]);

            const app = appResult.data?.application;
            if (!app) return;

            const reports = progressResult.data?.reports || [];

            const eyebrow = document.querySelector("#progress-eyebrow");
            if (eyebrow) eyebrow.textContent = `Project • ${app.applicationId || "Funded Project"}`;

            const title = document.querySelector("#progress-title");
            if (title) title.textContent = app.title || "Untitled Project";

            const meta = document.querySelector("#progress-meta");
            if (meta) {
                meta.textContent = `Category: ${escapeHtml(app.category || "—")} • Validity: ${formatDate(app.projectValidityStartDate)} – ${formatDate(app.projectValidityEndDate)}`;
            }

            const statusContainer = document.querySelector("#progress-status-container");
            if (statusContainer) {
                statusContainer.innerHTML = `<span class="status status-approved">${escapeHtml(statusLabel(app.projectStatus || "active"))}</span>`;
            }

            const grantedAmount = Number(app.grantedAmount || 0);
            const spendReported = reports.reduce((sum, r) => sum + Number(r.amountSpent || 0), 0);
            const remainingBalance = Math.max(0, grantedAmount - spendReported);
            const percent = grantedAmount > 0 ? Math.min(100, Math.round((spendReported / grantedAmount) * 100)) : 0;

            const percentText = document.querySelector("#progress-percent-text");
            if (percentText) percentText.textContent = `${percent}%`;

            const barFill = document.querySelector("#progress-bar-fill");
            if (barFill) barFill.style.width = `${percent}%`;

            const spendEl = document.querySelector("#progress-spend-reported");
            if (spendEl) spendEl.textContent = formatMoney(spendReported);

            const grantedEl = document.querySelector("#progress-granted-amount");
            if (grantedEl) grantedEl.textContent = formatMoney(grantedAmount);

            const balanceEl = document.querySelector("#progress-remaining-balance");
            if (balanceEl) balanceEl.textContent = formatMoney(remainingBalance);

            const reportsList = document.querySelector("#progress-reports-list");
            if (reportsList) {
                if (reports.length > 0) {
                    reportsList.innerHTML = reports.map((r) => {
                        const docsHtml = (r.documentUrls || []).map((url, idx) => {
                            const name = url.split("/").pop() || `Attachment ${idx + 1}`;
                            return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="small muted" style="margin-right:8px;text-decoration:underline">${escapeHtml(name)}</a>`;
                        }).join("");
                        return `
                            <div class="list-item" style="flex-direction:column;align-items:flex-start;gap:6px">
                                <div style="display:flex;justify-content:space-between;width:100%">
                                    <strong>Spent: ${formatMoney(r.amountSpent)}</strong>
                                    <span class="muted small">${formatDate(r.createdAt)}</span>
                                </div>
                                <div class="small">${escapeHtml(r.description || "")}</div>
                                ${docsHtml ? `<div style="margin-top:4px">${docsHtml}</div>` : ""}
                            </div>
                        `;
                    }).join("");
                } else {
                    reportsList.innerHTML = `<div class="muted small">No progress reports submitted yet.</div>`;
                }
            }

            const markBtn = document.querySelector("#mark-completed-btn");
            if (markBtn) {
                if (app.researchCompleted) {
                    markBtn.disabled = true;
                    markBtn.textContent = "Research marked completed";
                } else {
                    markBtn.disabled = false;
                    markBtn.onclick = async () => {
                        if (!confirm("Are you sure you want to mark this research project as completed?")) return;
                        try {
                            await apiRequest(`${API_BASE}/faculty/applications/${encodeURIComponent(applicationId)}/mark-completed`, {
                                method: "PATCH",
                            });
                            showToast("Research marked as completed.");
                            loadFacultyProjectProgress();
                        } catch (err) {
                            showToast(err.message, "error");
                        }
                    };
                }
            }
        } catch (error) {
            showToast(error.message, "error");
        }
    };

    const loadAdminReviewers = async (filterText = "") => {
        const tableBody = document.querySelector("#reviewers-table-body");
        if (!tableBody) return;
        tableBody.innerHTML = `<tr><td colspan="5" class="muted small">Loading reviewers…</td></tr>`;
        try {
            const result = await apiRequest(`${API_BASE}/admin/reviewers`);
            let reviewers = result.data?.reviewers || [];
            if (filterText) {
                const lower = filterText.toLowerCase();
                reviewers = reviewers.filter((r) =>
                    (r.fullName && r.fullName.toLowerCase().includes(lower)) ||
                    (r.email && r.email.toLowerCase().includes(lower)) ||
                    (r.employeeId && r.employeeId.toLowerCase().includes(lower))
                );
            }
            tableBody.innerHTML = reviewers.length ? reviewers.map((r) => `
                <tr>
                    <td><strong>${escapeHtml(r.fullName)}</strong></td>
                    <td>${escapeHtml(r.email)}</td>
                    <td>${escapeHtml(r.employeeId || "—")}</td>
                    <td>${escapeHtml(r.phoneNo || "—")}</td>
                    <td><span class="status status-approved">Active</span></td>
                </tr>
            `).join("") : `<tr><td colspan="5" class="muted small">No reviewers found.</td></tr>`;
        } catch (error) {
            tableBody.innerHTML = `<tr><td colspan="5" class="muted small">${escapeHtml(error.message)}</td></tr>`;
        }
    };

    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const currentRole = pathParts[0];
    const loggedInUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "null");
    const protectedPrefixes = ["/faculty/", "/reviewer/", "/admin/"];
    const isProtectedPage = protectedPrefixes.some((prefix) => window.location.pathname.startsWith(prefix));

    if (isProtectedPage && (!getToken() || !loggedInUser || loggedInUser.role !== currentRole)) {
        clearToken();
        window.location.replace("/login");
        return;
    }

    hydrateIdentity();
    const loadPrivateProfileImage = async () => {
        if (!getToken() || !loggedInUser) return;
        try {
            const response = await fetch(`${API_BASE}/auth/profile/image`, {
                headers: { Authorization: `Bearer ${getToken()}` },
            });
            if (!response.ok) return;
            const imageUrl = URL.createObjectURL(await response.blob());
            const preview = document.querySelector("#profile-image-preview");
            if (preview) preview.src = imageUrl;
            document.querySelectorAll(".avatar").forEach((avatar) => {
                avatar.textContent = "";
                const image = document.createElement("img");
                image.src = imageUrl;
                image.alt = "Profile picture";
                avatar.appendChild(image);
            });
        } catch {
            // Initials remain as the safe fallback if no image is available.
        }
    };
    loadPrivateProfileImage();
    if (getToken() && loggedInUser) {
        apiRequest(`${API_BASE}/auth/profile`)
            .then((result) => {
                const previousUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
                sessionStorage.setItem("loggedInUser", JSON.stringify({ ...previousUser, ...result.data.user }));
                hydrateIdentity();
            })
            .catch((error) => showToast(error.message, "error"));
    }
    if (["faculty", "reviewer", "admin"].includes(currentRole)) {
        if (window.location.pathname.endsWith("/applications")) loadApplications(currentRole);
        loadDashboard(currentRole);
    }
    if (window.location.pathname.startsWith("/faculty/applications/") && !window.location.pathname.endsWith("/new")) {
        loadFacultyApplicationDetail();
    }
    if (window.location.pathname.startsWith("/admin/applications/")) {
        loadAdminApplicationDetail();
    }
    if (window.location.pathname.startsWith("/reviewer/applications/")) {
        loadReviewerApplicationDetail();
    }
    if (window.location.pathname.startsWith("/faculty/projects/")) {
        loadFacultyProjectProgress();
    }
    if (window.location.pathname === "/faculty/projects") loadProjects();
    if (window.location.pathname === "/admin/projects") loadAdminProjects();
    if (window.location.pathname === "/admin/reviewers") loadAdminReviewers();
    loadNotifications();

    document.querySelector("#admin-approve-grant-btn")?.addEventListener("click", async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/admin/applications/")) return;
        const applicationId = path.split("/").pop();
        const grantedAmount = Number(document.querySelector("#admin-grant-amount")?.value);
        if (!grantedAmount || grantedAmount < 0) {
            return showToast("Please enter a valid grant amount.", "error");
        }
        try {
            await apiRequest(`${API_BASE}/admin/applications/${encodeURIComponent(applicationId)}/grant`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ grantedAmount }),
            });
            showToast("Grant approved successfully.");
            loadAdminApplicationDetail();
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    document.querySelector("#admin-assign-reviewer-btn")?.addEventListener("click", async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/admin/applications/")) return;
        const applicationId = path.split("/").pop();
        const reviewerId = document.querySelector("#admin-reviewer-select")?.value;
        if (!reviewerId) {
            return showToast("Please select a reviewer first.", "error");
        }
        try {
            await apiRequest(`${API_BASE}/admin/applications/${encodeURIComponent(applicationId)}/approve`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reviewerId }),
            });
            showToast("Reviewer assigned successfully.");
            loadAdminApplicationDetail();
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    document.querySelector("#admin-confirm-reject-btn")?.addEventListener("click", async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/admin/applications/")) return;
        const applicationId = path.split("/").pop();
        const comments = document.querySelector("#admin-reject-reason")?.value.trim();
        if (!comments) {
            return showToast("Please provide a reason for rejection.", "error");
        }
        try {
            await apiRequest(`${API_BASE}/admin/applications/${encodeURIComponent(applicationId)}/reject`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ comments }),
            });
            document.querySelector("#reject-modal")?.classList.remove("open");
            showToast("Application rejected.");
            loadAdminApplicationDetail();
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    document.querySelector("#admin-confirm-revert-btn")?.addEventListener("click", async () => {
        const path = window.location.pathname;
        if (!path.startsWith("/admin/applications/")) return;
        const applicationId = path.split("/").pop();
        try {
            await apiRequest(`${API_BASE}/admin/applications/${encodeURIComponent(applicationId)}/revert-action`, {
                method: "PATCH",
            });
            document.querySelector("#revert-modal")?.classList.remove("open");
            showToast("Action reverted successfully.");
            loadAdminApplicationDetail();
        } catch (error) {
            showToast(error.message, "error");
        }
    });

    document.querySelector("#reviewer-search-btn")?.addEventListener("click", () => {
        const query = document.querySelector("#reviewer-search")?.value.trim();
        loadAdminReviewers(query);
    });

    document.querySelector("#reviewer-search")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadAdminReviewers(event.target.value.trim());
        }
    });

    document.querySelector("#apply-application-filters")?.addEventListener("click", () => {
        loadApplications(currentRole, readApplicationFilters());
    });
    document.querySelector("#application-search")?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            loadApplications(currentRole, readApplicationFilters());
        }
    });
    document.querySelector("#reset-application-filters")?.addEventListener("click", () => {
        const filterContainer = document.querySelector("#application-filters");
        filterContainer?.querySelectorAll("input, select").forEach((element) => {
            element.value = element.tagName === "SELECT" ? element.options[0].value : "";
        });
        loadApplications(currentRole);
    });

    document.querySelector("#mark-all-notifications")?.addEventListener("click", async () => {
        try {
            await apiRequest(`${API_BASE}/notifications/read-all`, { method: "PATCH" });
            await loadNotifications();
            showToast("All notifications marked as read.");
        } catch (error) { showToast(error.message, "error"); }
    });

    document.addEventListener("click", async (event) => {
        const item = event.target.closest("[data-notification-id]");
        if (!item) return;
        try {
            await apiRequest(`${API_BASE}/notifications/${item.dataset.notificationId}/read`, { method: "PATCH" });
            await loadNotifications();
        } catch (error) { showToast(error.message, "error"); }
    });

    document.querySelector("#logout-button")?.addEventListener("click", async () => {
        try {
            await apiRequest(`${API_BASE}/auth/logout`, { method: "POST" });
        } catch (error) {
            // Clear the local session even if the server session already expired.
        } finally {
            clearToken();
            window.location.href = "/login";
        }
    });

    const profileImageInput = document.querySelector("#profile-image");
    profileImageInput?.addEventListener("change", () => {
        const image = profileImageInput.files?.[0];
        if (!image) return;
        if (!/^image\/(jpeg|png)$/.test(image.type)) {
            profileImageInput.value = "";
            showToast("Choose a JPG, JPEG, or PNG image.", "error");
            return;
        }
        if (image.size > 10 * 1024 * 1024) {
            profileImageInput.value = "";
            showToast("Profile image must be 10 MB or smaller.", "error");
            return;
        }
        document.querySelector("#profile-image-preview").src = URL.createObjectURL(image);
    });

    document.querySelector("#profile-form")?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const formData = new FormData();
        formData.append("fullName", document.querySelector("#name")?.value.trim());
        formData.append("phoneNo", document.querySelector("#phone")?.value.trim());
        const image = document.querySelector("#profile-image")?.files?.[0];
        if (image) formData.append("profileImage", image);
        try {
            const result = await apiRequest(`${API_BASE}/auth/profile`, { method: "PATCH", body: formData });
            const previousUser = JSON.parse(sessionStorage.getItem("loggedInUser") || "{}");
            sessionStorage.setItem("loggedInUser", JSON.stringify({ ...previousUser, ...result.data.user }));
            hydrateIdentity();
            showToast("Profile updated successfully.");
        } catch (error) { showToast(error.message, "error"); }
    });

    document.querySelectorAll("[data-demo-action]").forEach((button) => {
        button.addEventListener("click", () => showToast("This action is not available until its matching server endpoint is added.", "error"));
    });

    window.grantApi = {
        apiRequest,
        getToken,
        clearToken,
        showToast,
    };
});
