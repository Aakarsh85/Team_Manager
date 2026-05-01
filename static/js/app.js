const page = document.body.dataset.page;
const state = {
  access: localStorage.getItem("accessToken"),
  refresh: localStorage.getItem("refreshToken"),
  user: null,
  projects: [],
  tasks: [],
  users: [],
  dashboard: null,
  refreshPromise: null,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

function notify(text) {
  const message = $("#message");
  if (!message) return;
  message.textContent = text;
  message.classList.add("show");
  window.setTimeout(() => message.classList.remove("show"), 3600);
}

function initials(value) {
  return String(value || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

function formatDate(value) {
  if (!value) return "No due date";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function isOverdue(task) {
  if (!task.due_date || task.status === "DONE") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(`${task.due_date}T00:00:00`) < today;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getRoleLabel(role) {
  return role === "ADMIN" ? "Admin" : "Member";
}

async function refreshToken() {
  if (!state.refresh) return null;
  if (state.refreshPromise) return state.refreshPromise;
  state.refreshPromise = (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: state.refresh }),
      });
      if (!response.ok) {
        logout(false);
        throw new Error("Session expired. Please sign in again.");
      }
      const data = await response.json();
      state.access = data.access;
      localStorage.setItem("accessToken", state.access);
      return state.access;
    } finally {
      state.refreshPromise = null;
    }
  })();
  return state.refreshPromise;
}

async function api(path, options = {}) {
  const request = async (token) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(path, { ...options, headers });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    return { response, data };
  };

  let result = await request(state.access);
  if (result.response.status === 401 && state.refresh) {
    const token = await refreshToken();
    result = await request(token);
  }
  if (!result.response.ok) {
    const detail = result.data?.detail || result.data?.non_field_errors?.join(", ") || JSON.stringify(result.data) || result.response.statusText;
    throw new Error(detail);
  }
  return result.data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setTokens(tokens) {
  state.access = tokens.access;
  state.refresh = tokens.refresh;
  localStorage.setItem("accessToken", tokens.access);
  localStorage.setItem("refreshToken", tokens.refresh);
}

function logout(redirect = true) {
  state.access = null;
  state.refresh = null;
  state.user = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  if (redirect) window.location.href = "/login/";
}

async function loadMe() {
  state.user = await api("/api/auth/me/");
  renderUser();
  return state.user;
}

function renderUser() {
  if (!state.user) return;
  const name = $("#currentUserName");
  const meta = $("#currentUserMeta");
  const avatar = $("#currentUserAvatar");
  if (name) name.textContent = state.user.username || state.user.email;
  if (meta) meta.textContent = `${state.user.email} | ${getRoleLabel(state.user.role)}`;
  if (avatar) avatar.textContent = initials(state.user.username || state.user.email);
  $$(".admin-only").forEach((node) => node.classList.toggle("hidden", state.user.role !== "ADMIN"));
}

async function loadCoreData() {
  const [projects, tasks, dashboard, users] = await Promise.all([
    api("/api/projects/"),
    api("/api/tasks/"),
    api("/api/dashboard/"),
    api("/api/users/"),
  ]);
  state.projects = projects;
  state.tasks = tasks;
  state.dashboard = dashboard;
  state.users = users;
  populateProjectOptions();
}

function populateProjectOptions() {
  const projectOptions = ['<option value="">Select project</option>']
    .concat(state.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`))
    .join("");
  $$('select[name="project"]').forEach((select) => {
    select.innerHTML = projectOptions;
  });
  const projectFilter = $("#projectFilter");
  if (projectFilter) {
    projectFilter.innerHTML = '<option value="">All projects</option>' + state.projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)}</option>`).join("");
  }
  populateAssigneeFilter();
  populateTaskAssignees();
}

function projectById(id) {
  return state.projects.find((project) => String(project.id) === String(id));
}

function taskProject(task) {
  return task.project_detail || projectById(task.project) || {};
}

function populateTaskAssignees() {
  const projectSelect = $('#taskForm select[name="project"]');
  const assigneeSelect = $('#taskForm select[name="assigned_to"]');
  if (!projectSelect || !assigneeSelect) return;
  const project = projectById(projectSelect.value);
  const members = project?.members || [];
  assigneeSelect.innerHTML = members.length
    ? members.map((member) => `<option value="${member.user.id}">${escapeHtml(member.user.username)} (${escapeHtml(member.user.email)})</option>`).join("")
    : '<option value="">Select a project with members</option>';
}

function populateAssigneeFilter() {
  const filter = $("#assigneeFilter");
  if (!filter) return;
  const seen = new Map();
  state.tasks.forEach((task) => {
    if (task.assigned_to_detail) seen.set(task.assigned_to_detail.id, task.assigned_to_detail);
  });
  filter.innerHTML = '<option value="">All assignees</option><option value="me">Assigned to me</option>' + Array.from(seen.values())
    .map((user) => `<option value="${user.id}">${escapeHtml(user.username)}</option>`)
    .join("");
}

function renderStats(container, items) {
  if (!container) return;
  container.innerHTML = items
    .map(
      (item) => `
        <article class="stat-card ${item.danger ? "danger" : ""}">
          <div class="label"><span>${escapeHtml(item.label)}</span><span class="material-symbols-outlined">${item.icon}</span></div>
          <strong>${item.value}</strong>
          ${item.note ? `<p class="muted">${escapeHtml(item.note)}</p>` : ""}
        </article>
      `,
    )
    .join("");
}

function renderDashboard() {
  renderStats($("#dashboardStats"), [
    { label: "Total Tasks", value: state.dashboard.total_tasks, icon: "inventory_2" },
    { label: "Completed", value: state.dashboard.completed_tasks, icon: "check_circle" },
    { label: "Pending", value: state.dashboard.pending_tasks, icon: "schedule" },
    { label: "Overdue", value: state.dashboard.overdue_tasks, icon: "warning", danger: state.dashboard.overdue_tasks > 0 },
  ]);

  const table = $("#myTasksTable");
  const tasks = state.dashboard.assigned_tasks || [];
  table.innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `
            <tr>
              <td><strong>${escapeHtml(task.title)}</strong><p class="muted">${escapeHtml(task.description || "No description")}</p></td>
              <td>${escapeHtml(task.project_name || taskProject(task).name || "Project")}</td>
              <td><span class="badge ${task.priority}">${task.priority}</span></td>
              <td>${formatDate(task.due_date)}</td>
              <td><span class="badge ${task.status}">${task.status.replace("_", " ")}</span></td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="5" class="muted">No tasks are assigned to you yet.</td></tr>';

  const active = $("#activeProjects");
  const projects = state.dashboard.active_projects || [];
  active.innerHTML = projects.length
    ? projects
        .slice(0, 5)
        .map(
          (project) => `
            <div class="compact-row">
              <span class="project-initials">${initials(project.name)}</span>
              <div><strong>${escapeHtml(project.name)}</strong><p class="muted">${project.completion}% complete | ${project.task_count} task(s)</p></div>
              <div class="progress"><span style="width:${project.completion}%"></span></div>
            </div>
          `,
        )
        .join("")
    : '<p class="muted">No active projects yet.</p>';
}

function renderProjects() {
  const memberIds = new Set();
  state.projects.forEach((project) => project.members.forEach((member) => memberIds.add(member.user.id)));
  renderStats($("#projectStats"), [
    { label: "Active Projects", value: state.projects.filter((project) => project.status !== "COMPLETED").length, icon: "folder" },
    { label: "Completed", value: state.projects.filter((project) => project.status === "COMPLETED").length, icon: "check_circle" },
    { label: "Total Members", value: memberIds.size, icon: "group" },
    { label: "Overdue Tasks", value: state.projects.reduce((sum, project) => sum + project.overdue_task_count, 0), icon: "warning", danger: state.projects.some((project) => project.overdue_task_count > 0) },
  ]);

  const grid = $("#projectGrid");
  grid.innerHTML = state.projects.length
    ? state.projects
        .map((project) => {
          const statusLabel = project.status.replace("_", " ");
          const removable = state.user.role === "ADMIN";
          return `
            <article class="project-card status-${project.status} ${project.overdue_task_count ? "has-overdue" : ""}">
              <div class="card-head">
                <span class="badge ${project.status}">${statusLabel}</span>
                ${project.overdue_task_count ? `<span class="badge overdue">${project.overdue_task_count} overdue</span>` : ""}
              </div>
              <div>
                <h2>${escapeHtml(project.name)}</h2>
                <p class="muted">${escapeHtml(project.description || "No description")}</p>
              </div>
              <div>
                <p class="muted">Created by ${escapeHtml(project.created_by?.username || project.created_by?.email || "Unknown")}</p>
                <p class="muted">${project.task_count} task(s) | ${project.completion}% complete</p>
              </div>
              <div class="progress"><span style="width:${project.completion}%"></span></div>
              <div class="member-stack" title="${project.members.length} member(s)">
                ${project.members.slice(0, 5).map((member) => `<span class="member-avatar">${initials(member.user.username || member.user.email)}</span>`).join("")}
                ${project.members.length > 5 ? `<span class="member-avatar">+${project.members.length - 5}</span>` : ""}
              </div>
              <div class="card-actions">
                <button class="secondary-action admin-only" type="button" data-add-member="${project.id}"><span class="material-symbols-outlined">person_add</span>Add Member</button>
                ${removable ? project.members.filter((member) => member.user.id !== state.user.id).map((member) => `<button class="plain-link admin-only" type="button" data-remove-member="${member.user.id}" data-project="${project.id}">Remove ${escapeHtml(member.user.username)}</button>`).join("") : ""}
              </div>
            </article>
          `;
        })
        .join("")
    : emptyState("No projects yet", "Admins can create the first project to start assigning work.");
}

function filteredTasks() {
  const search = ($("#globalSearch")?.value || "").trim().toLowerCase();
  const status = $("#statusFilter")?.value || "";
  const priority = $("#priorityFilter")?.value || "";
  const project = $("#projectFilter")?.value || "";
  const assignee = $("#assigneeFilter")?.value || "";
  return state.tasks.filter((task) => {
    const haystack = `${task.title} ${task.description || ""} ${task.project_name || ""} ${task.assigned_to_detail?.username || ""}`.toLowerCase();
    if (search && !haystack.includes(search)) return false;
    if (status && task.status !== status) return false;
    if (priority && task.priority !== priority) return false;
    if (project && String(task.project) !== String(project)) return false;
    if (assignee === "me" && task.assigned_to !== state.user.id) return false;
    if (assignee && assignee !== "me" && String(task.assigned_to) !== String(assignee)) return false;
    return true;
  });
}

function renderTasks() {
  const board = $("#taskBoard");
  if (!board) return;
  const groups = [
    ["TODO", "To do"],
    ["IN_PROGRESS", "In progress"],
    ["DONE", "Done"],
  ];
  const tasks = filteredTasks();
  board.innerHTML = groups
    .map(([status, label]) => {
      const groupTasks = tasks.filter((task) => task.status === status);
      return `
        <section class="task-column">
          <div class="column-title"><span>${label}</span><span>${groupTasks.length}</span></div>
          ${groupTasks.length ? groupTasks.map(renderTaskCard).join("") : `<div class="panel empty-cta"><p class="muted">No ${label.toLowerCase()} tasks.</p></div>`}
        </section>
      `;
    })
    .join("");
}

function renderTaskCard(task) {
  const assigned = task.assigned_to_detail || {};
  const canUpdate = state.user.role === "ADMIN" || task.assigned_to === state.user.id;
  const canDelete = state.user.role === "ADMIN";
  return `
    <article class="task-card status-${task.status} ${task.status === "DONE" ? "done" : ""} ${isOverdue(task) ? "is-overdue" : ""}">
      <div class="card-head">
        <span class="badge ${task.priority}">${task.priority}</span>
        ${isOverdue(task) ? '<span class="badge overdue">Overdue</span>' : ""}
      </div>
      <div>
        <h3>${escapeHtml(task.title)}</h3>
        <p class="muted">${escapeHtml(task.description || "No description")}</p>
      </div>
      <div class="task-meta">
        <span>Project: ${escapeHtml(task.project_name || taskProject(task).name || "Project")}</span>
        <span>Assigned to: ${escapeHtml(assigned.username || assigned.email || "Unassigned")}</span>
        <span>Due: ${formatDate(task.due_date)}</span>
      </div>
      <div class="task-footer">
        ${canUpdate ? statusSelect(task) : `<span class="badge ${task.status}">${task.status.replace("_", " ")}</span>`}
        ${canDelete ? `<button class="plain-link" type="button" data-delete-task="${task.id}"><span class="material-symbols-outlined">delete</span>Delete</button>` : ""}
      </div>
    </article>
  `;
}

function statusSelect(task) {
  return `
    <select class="status-select" data-task-status="${task.id}">
      <option value="TODO" ${task.status === "TODO" ? "selected" : ""}>To do</option>
      <option value="IN_PROGRESS" ${task.status === "IN_PROGRESS" ? "selected" : ""}>In progress</option>
      <option value="DONE" ${task.status === "DONE" ? "selected" : ""}>Done</option>
    </select>
  `;
}

function emptyState(title, detail) {
  return `<div class="panel empty-cta"><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(detail)}</p></div>`;
}

function openModal(id) {
  const modal = $(id);
  if (modal?.showModal) modal.showModal();
}

function closeModals() {
  $$("dialog[open]").forEach((dialog) => dialog.close());
}

function populateMemberModal(projectId) {
  const project = projectById(projectId);
  if (!project) return;
  $('#memberForm input[name="project"]').value = project.id;
  $("#memberProjectName").textContent = `Project: ${project.name}`;
  const currentMembers = new Set(project.members.map((member) => member.user.id));
  const choices = state.users.filter((user) => !currentMembers.has(user.id));
  $('#memberForm select[name="user_id"]').innerHTML = choices.length
    ? choices.map((user) => `<option value="${user.id}">${escapeHtml(user.username)} (${escapeHtml(user.email)})</option>`).join("")
    : '<option value="">All known users are already members</option>';
}

async function refreshAll() {
  await loadCoreData();
  if (page === "dashboard") renderDashboard();
  if (page === "projects") renderProjects();
  if (page === "tasks") renderTasks();
}

async function initLogin() {
  if (state.access) {
    try {
      await loadMe();
      window.location.href = "/dashboard/";
      return;
    } catch {
      logout(false);
    }
  }
  $$("[data-auth-tab]").forEach((tab) => {
    tab.addEventListener("click", () => {
      $$("[data-auth-tab]").forEach((node) => node.classList.toggle("active", node === tab));
      $$("[data-auth-form]").forEach((form) => form.classList.toggle("hidden", form.dataset.authForm !== tab.dataset.authTab));
    });
  });
  $("#loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const tokens = await api("/api/auth/login", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
      setTokens(tokens);
      await loadMe();
      window.location.href = "/dashboard/";
    } catch (error) {
      notify(error.message);
    }
  });
  $("#signupForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formData(event.currentTarget);
      await api("/api/auth/signup", { method: "POST", body: JSON.stringify(data) });
      const tokens = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.email, password: data.password }) });
      setTokens(tokens);
      await loadMe();
      window.location.href = "/dashboard/";
    } catch (error) {
      notify(error.message);
    }
  });
}

async function initApp() {
  if (!state.access) {
    window.location.href = "/login/";
    return;
  }
  try {
    await loadMe();
    $$(".side-nav a").forEach((link) => link.classList.toggle("active", link.dataset.nav === page));
    await refreshAll();
  } catch (error) {
    notify(error.message);
    window.setTimeout(() => logout(), 900);
    return;
  }

  $("#logoutBtn")?.addEventListener("click", () => logout());
  $("#refreshBtn")?.addEventListener("click", async () => {
    await refreshAll();
    notify("Data refreshed.");
  });
  $("#globalSearch")?.addEventListener("input", () => {
    if (page === "tasks") renderTasks();
  });
  ["#statusFilter", "#priorityFilter", "#projectFilter", "#assigneeFilter"].forEach((selector) => {
    $(selector)?.addEventListener("change", renderTasks);
  });
  $$("[data-open-project]").forEach((button) => button.addEventListener("click", () => openModal("#projectModal")));
  $$("[data-open-task]").forEach((button) => button.addEventListener("click", () => openModal("#taskModal")));
  $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
  $('#taskForm select[name="project"]')?.addEventListener("change", populateTaskAssignees);

  $("#projectForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/api/projects/", { method: "POST", body: JSON.stringify(formData(form)) });
      form.reset();
      closeModals();
      await refreshAll();
      notify("Project created.");
    } catch (error) {
      notify(error.message);
    }
  });

  $("#memberForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const data = formData(event.currentTarget);
      await api(`/api/projects/${data.project}/add-member/`, {
        method: "POST",
        body: JSON.stringify({ user_id: Number(data.user_id), role: data.role }),
      });
      closeModals();
      await refreshAll();
      notify("Member added.");
    } catch (error) {
      notify(error.message);
    }
  });

  $("#taskForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      const data = formData(form);
      await api("/api/tasks/", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          project: Number(data.project),
          assigned_to: Number(data.assigned_to),
        }),
      });
      form.reset();
      populateTaskAssignees();
      closeModals();
      await refreshAll();
      notify("Task created.");
    } catch (error) {
      notify(error.message);
    }
  });

  document.addEventListener("click", async (event) => {
    const addMember = event.target.closest("[data-add-member]");
    const removeMember = event.target.closest("[data-remove-member]");
    const deleteTask = event.target.closest("[data-delete-task]");
    if (addMember) {
      populateMemberModal(addMember.dataset.addMember);
      openModal("#memberModal");
    }
    if (removeMember) {
      if (!confirm("Remove this member from the project?")) return;
      try {
        await api(`/api/projects/${removeMember.dataset.project}/remove-member/${removeMember.dataset.removeMember}/`, { method: "DELETE" });
        await refreshAll();
        notify("Member removed.");
      } catch (error) {
        notify(error.message);
      }
    }
    if (deleteTask) {
      if (!confirm("Delete this task? This cannot be undone.")) return;
      try {
        await api(`/api/tasks/${deleteTask.dataset.deleteTask}/`, { method: "DELETE" });
        await refreshAll();
        notify("Task deleted.");
      } catch (error) {
        notify(error.message);
      }
    }
  });

  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-task-status]");
    if (!select) return;
    try {
      await api(`/api/tasks/${select.dataset.taskStatus}/`, { method: "PATCH", body: JSON.stringify({ status: select.value }) });
      await refreshAll();
      notify("Task updated.");
    } catch (error) {
      notify(error.message);
      await refreshAll();
    }
  });
}

if (page === "login") {
  initLogin();
} else {
  initApp();
}