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
    if (window.location.pathname === "/faculty/projects") loadProjects();
    if (window.location.pathname === "/admin/projects") loadAdminProjects();
    loadNotifications();

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
