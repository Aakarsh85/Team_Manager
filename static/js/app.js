const state = {
  access: localStorage.getItem("accessToken"),
  refresh: localStorage.getItem("refreshToken"),
  user: null,
  projects: [],
  refreshPromise: null, // Track refresh requests
};

const qs = (selector) => document.querySelector(selector);
const authView = qs("#authView");
const appView = qs("#appView");
const message = qs("#message");

function notify(text) {
  message.textContent = text;
  message.classList.add("show");
  window.setTimeout(() => message.classList.remove("show"), 3500);
}

function decodeUser(token) {
  if (!token) return null;
  try {
    const payload = token.split(".")[1];
    // Fix base64url to base64
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

async function refreshToken() {
  if (!state.refresh) return null;
  
  // Prevent multiple concurrent refresh requests
  if (state.refreshPromise) return state.refreshPromise;
  
  state.refreshPromise = (async () => {
    try {
      const response = await fetch("/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: state.refresh }),
      });
      
      if (!response.ok) throw new Error("Refresh failed");
      
      const data = await response.json();
      state.access = data.access;
      localStorage.setItem("accessToken", state.access);
      state.user = decodeUser(state.access);
      return data.access;
    } catch (error) {
      // Refresh failed - log out
      logout();
      throw error;
    } finally {
      state.refreshPromise = null;
    }
  })();
  
  return state.refreshPromise;
}

async function api(path, options = {}) {
  const makeRequest = async (token) => {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (token) headers.Authorization = `Bearer ${token}`;
    
    const response = await fetch(path, { ...options, headers });
    
    // Handle empty responses gracefully
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch (e) {
      // Response isn't JSON
    }
    
    return { response, data };
  };
  
  let { response, data } = await makeRequest(state.access);
  
  // If token expired, try to refresh
  if (response.status === 401 && state.refresh) {
    try {
      const newToken = await refreshToken();
      const retry = await makeRequest(newToken);
      response = retry.response;
      data = retry.data;
    } catch (error) {
      // Already logged out
      throw new Error("Session expired. Please log in again.");
    }
  }
  
  if (!response.ok) {
    const detail = data?.detail || JSON.stringify(data) || response.statusText;
    throw new Error(detail);
  }
  
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function setAuth(tokens) {
  state.access = tokens.access;
  state.refresh = tokens.refresh;
  state.user = decodeUser(tokens.access);
  localStorage.setItem("accessToken", state.access);
  localStorage.setItem("refreshToken", state.refresh);
  renderShell();
}

function logout() {
  state.access = null;
  state.refresh = null;
  state.user = null;
  state.refreshPromise = null;
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  renderShell();
}

function renderShell() {
  const signedIn = Boolean(state.access);
  authView.classList.toggle("hidden", signedIn);
  appView.classList.toggle("hidden", !signedIn);
  qs("#logoutBtn").classList.toggle("hidden", !signedIn);
  qs("#userMeta").textContent = signedIn
    ? `Signed in as ${state.user?.username || `user #${state.user?.user_id}`}`
    : "Sign in to manage projects and tasks.";
  if (signedIn) loadAll();
}

function renderStats(data) {
  qs("#stats").innerHTML = [
    ["Total", data.total_tasks],
    ["Completed", data.completed_tasks],
    ["Pending", data.pending_tasks],
    ["Overdue", data.overdue_tasks],
  ]
    .map(([label, value]) => `<div class="stat"><span>${label}</span><strong>${value}</strong></div>`)
    .join("");
}

function renderProjects(projects) {
  state.projects = projects;
  qs("#projects").innerHTML = projects.length
    ? projects
        .map(
          (project) => `
            <article class="item">
              <strong>#${project.id} ${project.name}</strong>
              <p class="meta">${project.description || "No description"}</p>
              <p class="meta">${project.members.length} member(s)</p>
              <button class="ghost" type="button" data-project="${project.id}">View members</button>
            </article>
          `,
        )
        .join("")
    : '<p class="muted">No projects yet.</p>';
}

function renderMembers(projectId) {
  const project = state.projects.find((item) => item.id === Number(projectId));
  qs("#members").innerHTML = project
    ? project.members
        .map((member) => `
          <div class="item">
            <strong>#${member.user.id} ${member.user.username}</strong>
            <p class="meta">${member.user.email} · ${member.role}</p>
            <button class="ghost danger" type="button" data-remove-member="${member.user.id}" data-remove-project="${project.id}">Remove</button>
          </div>
        `)
        .join("")
    : '<p class="muted">Project not found.</p>';
}

function renderTasks(tasks) {
  qs("#tasks").innerHTML = tasks.length
    ? tasks
        .map(
          (task) => `
            <article class="task">
              <div>
                <h3>#${task.id} ${task.title}</h3>
                <p>${task.description || ""}</p>
                <p class="meta">Project #${task.project} · Assigned to ${task.assigned_to_detail?.username || task.assigned_to} · Due ${task.due_date}</p>
                <span class="badge ${task.priority}">${task.priority}</span>
              </div>
              <div>
                <span class="badge ${task.status}">${task.status.replace("_", " ")}</span>
                <select data-task-status="${task.id}">
                  <option value="TODO" ${task.status === "TODO" ? "selected" : ""}>To do</option>
                  <option value="IN_PROGRESS" ${task.status === "IN_PROGRESS" ? "selected" : ""}>In progress</option>
                  <option value="DONE" ${task.status === "DONE" ? "selected" : ""}>Done</option>
                </select>
                <button class="ghost danger" type="button" data-delete-task="${task.id}">Delete</button>
              </div>
            </article>
          `,
        )
        .join("")
    : '<p class="muted">No tasks match the current filters.</p>';
}

async function loadDashboard() {
  renderStats(await api("/api/dashboard/"));
}

async function loadProjects() {
  renderProjects(await api("/api/projects/"));
}

async function loadTasks() {
  const params = new URLSearchParams();
  const status = qs("#statusFilter").value;
  const priority = qs("#priorityFilter").value;
  const search = qs("#searchInput").value.trim();
  if (status) params.set("status", status);
  if (priority) params.set("priority", priority);
  if (search) params.set("search", search);
  const suffix = params.toString() ? `?${params}` : "";
  renderTasks(await api(`/api/tasks/${suffix}`));
}

async function loadAll() {
  try {
    await Promise.all([loadDashboard(), loadProjects(), loadTasks()]);
  } catch (error) {
    notify(error.message);
  }
}

// Event handlers
qs("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(event.currentTarget);
    setAuth(await api("/api/auth/login", { method: "POST", body: JSON.stringify(data) }));
    notify("Logged in.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(event.currentTarget);
    await api("/api/auth/signup", { method: "POST", body: JSON.stringify(data) });
    setAuth(await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: data.email, password: data.password }) }));
    notify("Account created.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#projectForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await api("/api/projects/", { method: "POST", body: JSON.stringify(formData(event.currentTarget)) });
    event.currentTarget.reset();
    await loadProjects();
    notify("Project created.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#memberForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(event.currentTarget);
    const project = data.project;
    delete data.project;
    data.user_id = Number(data.user_id);
    await api(`/api/projects/${project}/add-member/`, { method: "POST", body: JSON.stringify(data) });
    await loadProjects();
    renderMembers(project);
    notify("Member added.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = formData(event.currentTarget);
    data.project = Number(data.project);
    data.assigned_to = Number(data.assigned_to);
    await api("/api/tasks/", { method: "POST", body: JSON.stringify(data) });
    event.currentTarget.reset();
    await loadAll();
    notify("Task created.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#projects").addEventListener("click", (event) => {
  const projectId = event.target.dataset.project;
  if (projectId) renderMembers(projectId);
});

qs("#members").addEventListener("click", async (event) => {
  const userId = event.target.dataset.removeMember;
  const projectId = event.target.dataset.removeProject;
  if (!userId || !projectId) return;
  try {
    // Updated URL pattern with user_id in path
    await api(`/api/projects/${projectId}/remove-member/${userId}/`, { method: "DELETE" });
    await loadProjects();
    renderMembers(projectId);
    notify("Member removed.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#tasks").addEventListener("change", async (event) => {
  const taskId = event.target.dataset.taskStatus;
  if (!taskId) return;
  try {
    await api(`/api/tasks/${taskId}/`, { method: "PATCH", body: JSON.stringify({ status: event.target.value }) });
    await loadAll();
    notify("Task updated.");
  } catch (error) {
    notify(error.message);
  }
});

qs("#tasks").addEventListener("click", async (event) => {
  const taskId = event.target.dataset.deleteTask;
  if (!taskId) return;
  if (!confirm("Delete this task? This cannot be undone.")) return;
  try {
    await api(`/api/tasks/${taskId}/`, { method: "DELETE" });
    await loadAll();
    notify("Task deleted.");
  } catch (error) {
    notify(error.message);
  }
});

["#statusFilter", "#priorityFilter"].forEach((selector) => qs(selector).addEventListener("change", loadTasks));
qs("#searchInput").addEventListener("input", () => window.clearTimeout(window.searchTimer) || (window.searchTimer = window.setTimeout(loadTasks, 250)));
qs("#refreshBtn").addEventListener("click", loadAll);
qs("#logoutBtn").addEventListener("click", logout);

// Initialize
state.user = decodeUser(state.access);
renderShell();
