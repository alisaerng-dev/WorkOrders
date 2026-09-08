/* ---------------------------------------------------------------
 * WorkOrders - UI
 * Plain JS, no build step. Renders with template strings and uses
 * event delegation, so re-rendering a view is always safe.
 * ------------------------------------------------------------- */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* =============================================================
   * Constants
   * ========================================================== */
  const STATUS = {
    open:        "Open",
    scheduled:   "Scheduled",
    in_progress: "In progress",
    on_hold:     "On hold",
    completed:   "Completed",
    cancelled:   "Cancelled",
  };
  const STATUS_KEYS = Object.keys(STATUS);
  const ACTIVE_STATUSES = ["open", "scheduled", "in_progress", "on_hold"];

  const PRIORITY = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };
  const PRIORITY_KEYS = ["low", "normal", "high", "urgent"];

  const DURATIONS = [
    [0.5, "30 min"], [1, "1 hour"], [1.5, "1.5 hours"], [2, "2 hours"],
    [3, "3 hours"], [4, "Half day"], [8, "Full day"],
  ];

  const AVATAR_COLORS = [
    "#6366f1", "#f97316", "#10b981", "#ec4899", "#0ea5e9",
    "#f59e0b", "#8b5cf6", "#14b8a6", "#ef4444", "#84cc16",
  ];

  // Traditional Thai day-of-week colors (สีประจำวัน), used as a border
  // accent only — no background tint — so a week is easy to read at a glance.
  const DAY_COLORS = [
    "#eab308", // Mon - yellow
    "#ec4899", // Tue - pink
    "#16a34a", // Wed - green
    "#f97316", // Thu - orange
    "#0ea5e9", // Fri - blue
    "#9333ea", // Sat - purple
    "#dc2626", // Sun - red
  ];
  const dayIdx = (d) => (new Date(d).getDay() + 6) % 7; // 0 = Monday
  const dayColor = (iso) => (iso ? DAY_COLORS[dayIdx(iso)] : null);

  const ICONS = {
    list:     '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    users:    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    badge:    '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    search:   '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    user:     '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    phone:    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    pin:      '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    clock:    '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    tag:      '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/>',
    x:        '<path d="M18 6L6 18M6 6l12 12"/>',
    back:     '<path d="M19 12H5M12 19l-7-7 7-7"/>',
    chevL:    '<path d="M15 18l-6-6 6-6"/>',
    chevR:    '<path d="M9 18l6-6-6-6"/>',
    plus:     '<path d="M12 5v14M5 12h14"/>',
    trash:    '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    edit:     '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>',
  };

  const icon = (name, size) =>
    `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ""}</svg>`;

  /* =============================================================
   * Small helpers
   * ========================================================== */
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );

  const pad2 = (n) => String(n).padStart(2, "0");

  const localDateStr = (d) => {
    const x = d instanceof Date ? d : new Date(d);
    return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`;
  };
  const localTimeStr = (d) => {
    const x = d instanceof Date ? d : new Date(d);
    return `${pad2(x.getHours())}:${pad2(x.getMinutes())}`;
  };
  const composeISO = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const [y, m, d] = dateStr.split("-").map(Number);
    const [hh, mm] = (timeStr || "09:00").split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
  };
  const addHours = (iso, hours) =>
    iso ? new Date(new Date(iso).getTime() + hours * 3600e3).toISOString() : null;

  const startOfDay = (d) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const mondayOf = (d) => {
    const x = startOfDay(d);
    const dow = (x.getDay() + 6) % 7; // 0 = Monday
    return addDays(x, -dow);
  };
  const sameDay = (a, b) => localDateStr(a) === localDateStr(b);

  const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function fmtWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const today = startOfDay(new Date());
    const day = startOfDay(d);
    const diff = Math.round((day - today) / 86400e3);
    const time = localTimeStr(d);
    if (diff === 0) return `Today ${time}`;
    if (diff === 1) return `Tomorrow ${time}`;
    if (diff === -1) return `Yesterday ${time}`;
    const label = `${DOW[(d.getDay() + 6) % 7]} ${d.getDate()} ${MON[d.getMonth()]}`;
    return `${label}, ${time}`;
  }

  function fmtRelative(iso) {
    const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (secs < 60) return "just now";
    if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
    if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
    if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
    const d = new Date(iso);
    return `${d.getDate()} ${MON[d.getMonth()]}`;
  }

  function initials(name) {
    const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function colorFor(profile) {
    if (profile && profile.color) return profile.color;
    const key = String((profile && (profile.id || profile.email)) || "");
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  const avatarHTML = (profile, cls) =>
    `<span class="avatar ${cls || ""}" style="background:${colorFor(profile)}"
       title="${esc(profile ? profile.full_name || profile.email : "Unassigned")}"
     >${esc(initials(profile ? profile.full_name || profile.email : "?"))}</span>`;

  const siteLine = (o) =>
    [o.site_unit_number && `Unit ${o.site_unit_number}`, o.site_building, o.site_address]
      .filter(Boolean)
      .join(" · ");

  const customerLine = (c) =>
    !c ? "" : [c.unit_number && `Unit ${c.unit_number}`, c.building, c.address].filter(Boolean).join(" · ");

  /* =============================================================
   * Toasts
   * ========================================================== */
  function toast(msg, isError) {
    const root = $("#toast-root");
    const el = document.createElement("div");
    el.className = "toast" + (isError ? " err" : "");
    el.textContent = msg;
    root.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .25s";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 260);
    }, isError ? 4200 : 2400);
  }

  /* =============================================================
   * Modal stack
   * ========================================================== */
  const modals = []; // { kind, el, onRefresh }

  function openModal({ kind, title, body, footer, wide, onMount, onRefresh, back }) {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
        <div class="grabber"></div>
        <div class="modal-head">
          <button class="btn btn-ghost btn-icon" data-close aria-label="Close">
            ${icon(back ? "back" : "x", 19)}
          </button>
          <h3>${title}</h3>
        </div>
        <div class="modal-body">${body}</div>
        ${footer ? `<div class="modal-foot">${footer}</div>` : ""}
      </div>`;

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal();
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target.closest("[data-close]")) closeModal();
    });

    $("#modal-root").appendChild(backdrop);
    const entry = { kind, el: backdrop, onRefresh };
    modals.push(entry);
    document.body.style.overflow = "hidden";
    // `entry` is handed over too: callers need it during mount, before the
    // openModal() call itself has returned.
    if (onMount) onMount(backdrop, entry);
    return entry;
  }

  function closeModal() {
    const entry = modals.pop();
    if (entry) entry.el.remove();
    if (!modals.length) document.body.style.overflow = "";
  }

  function closeAllModals() {
    while (modals.length) modals.pop().el.remove();
    document.body.style.overflow = "";
  }

  const topModal = () => modals[modals.length - 1] || null;

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modals.length) closeModal();
  });

  function setModalBody(entry, html) {
    $(".modal-body", entry.el).innerHTML = html;
  }

  /* =============================================================
   * Confirm dialog
   * ========================================================== */
  function confirmDialog(title, message, confirmLabel) {
    return new Promise((resolve) => {
      const entry = openModal({
        kind: "confirm",
        title: esc(title),
        body: `<p style="font-size:14.5px;color:var(--muted)">${esc(message)}</p>`,
        footer: `
          <button class="btn" data-no>Cancel</button>
          <button class="btn btn-primary" data-yes style="background:var(--danger);border-color:var(--danger)">
            ${esc(confirmLabel || "Confirm")}
          </button>`,
        onMount(root) {
          $("[data-no]", root).onclick = () => { closeModal(); resolve(false); };
          $("[data-yes]", root).onclick = () => { closeModal(); resolve(true); };
        },
      });
      entry.el.addEventListener("click", (e) => {
        if (e.target === entry.el) resolve(false);
      });
    });
  }

  /* =============================================================
   * App state
   * ========================================================== */
  const state = {
    session: null,
    me: null,
    profiles: [],
    customers: [],
    orders: [],
    view: "orders",
    filters: { status: "active", q: "", assignee: "", sort: "created" },
    weekStart: mondayOf(new Date()),
    pendingEmail: "",
    viewAsStaffId: null, // admin-only: preview the app as a chosen staff member
  };

  const profileById = (id) => state.profiles.find((p) => p.id === id) || null;
  const orderById   = (id) => state.orders.find((o) => o.id === id) || null;
  const workers     = () => state.profiles.filter((p) => p.is_worker && p.is_active);

  // "Real" admin-ness, tied to the actual signed-in account.
  const isRealAdmin = () => !!(state.me && state.me.role === "admin");
  const viewingAsStaff = () => isRealAdmin() && !!state.viewAsStaffId;
  // The person whose permissions currently apply — either the signed-in
  // admin, or the staff member they're previewing the app as.
  const effectiveUser = () => (viewingAsStaff() ? profileById(state.viewAsStaffId) : state.me);
  // "Effective" admin-ness: false while an admin is previewing a staff view.
  const isAdmin = () => isRealAdmin() && !viewingAsStaff();
  const isAssignedToMe = (o) => {
    const u = effectiveUser();
    return !!(u && (o.assignee_ids || []).includes(u.id));
  };

  /* =============================================================
   * Auth screen
   * ========================================================== */
  function initAuthScreen() {
    $("#auth-appname").textContent = CFG.APP_NAME || "WorkOrders";
    $("#brand-name").textContent = CFG.APP_NAME || "WorkOrders";
    document.title = CFG.APP_NAME || "WorkOrders";
    $("#demo-banner").hidden = DB.mode !== "demo";

    const emailForm = $("#email-form");
    const codeForm  = $("#code-form");

    emailForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#email-input").value.trim().toLowerCase();
      const err = $("#email-error");
      const btn = $("#email-submit");
      err.hidden = true;
      if (!email) return;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const res = await DB.auth.sendCode(email);
        state.pendingEmail = email;
        $("#code-email").textContent = email;
        emailForm.hidden = true;
        codeForm.hidden = false;
        $("#code-input").focus();
        if (res && res.hint) toast(res.hint);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = "Send code";
      }
    });

    codeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = $("#code-input").value.trim();
      const err = $("#code-error");
      const btn = $("#code-submit");
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "Signing in…";
      try {
        const session = await DB.auth.verifyCode(state.pendingEmail, code);
        await onSignedIn(session);
      } catch (ex) {
        err.textContent = ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = "Sign in";
      }
    });

    $("#code-back").addEventListener("click", () => {
      codeForm.hidden = true;
      emailForm.hidden = false;
      $("#code-input").value = "";
      $("#code-error").hidden = true;
    });
  }

  function showAuth() {
    $("#auth-screen").hidden = false;
    $("#main-screen").hidden = true;
    $("#email-form").hidden = false;
    $("#code-form").hidden = true;
  }

  async function onSignedIn(session) {
    state.session = session;
    $("#auth-screen").hidden = true;
    $("#main-screen").hidden = false;
    await loadAll();
    renderShell();
    renderView();
    subscribeRealtime();
  }

  async function signOut() {
    await DB.auth.signOut();
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    state.session = null;
    state.me = null;
    closeAllModals();
    showAuth();
  }

  /* =============================================================
   * Data loading
   * ========================================================== */
  async function loadAll() {
    const [profiles, customers, orders] = await Promise.all([
      DB.profiles.list(),
      DB.customers.list(),
      DB.orders.list(),
    ]);
    state.profiles = profiles;
    state.customers = customers;
    state.orders = orders;
    state.me =
      profileById(state.session.user.id) || {
        id: state.session.user.id,
        email: state.session.user.email,
        full_name: state.session.user.email,
      };
  }

  let unsubscribe = null;
  let refreshTimer = null;

  function subscribeRealtime() {
    if (unsubscribe) unsubscribe();
    unsubscribe = DB.realtime.subscribe(() => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshQuietly, 250);
    });
  }

  async function refreshQuietly() {
    try {
      await loadAll();
    } catch (e) {
      return; // offline or signed out; the next event will retry
    }
    const top = topModal();
    // Never blow away a form the user is typing into.
    if (!top) {
      renderView();
    } else if (top.onRefresh) {
      renderView();
      top.onRefresh();
    }
  }

  /* =============================================================
   * Shell: nav + user menu
   * ========================================================== */
  const NAV = [
    { key: "orders",    label: "Jobs",      icon: "list" },
    { key: "schedule",  label: "Schedule",  icon: "calendar" },
    { key: "customers", label: "Customers", icon: "users" },
    { key: "team",      label: "Team",      icon: "badge" },
  ];

  function renderShell() {
    $("#brand-name").textContent = CFG.APP_NAME || "WorkOrders";

    $("#sidenav").innerHTML =
      NAV.map(
        (n) => `<button data-nav="${n.key}" class="${state.view === n.key ? "on" : ""}">
                  ${icon(n.icon, 18)} <span>${n.label}</span>
                </button>`
      ).join("") +
      `<div class="grow"></div>
       <button data-nav-new>${icon("plus", 18)} <span>New job</span></button>`;

    $("#tabbar").innerHTML = NAV.map(
      (n) => `<button data-nav="${n.key}" class="${state.view === n.key ? "on" : ""}">
                ${icon(n.icon, 21)} <span>${n.label}</span>
              </button>`
    ).join("");

    $("#user-btn").innerHTML = avatarHTML(state.me);
    $("#top-new").style.display = "";

    const viewasSlot = $("#viewas-slot");
    if (viewasSlot) {
      if (isRealAdmin()) {
        const staff = state.profiles.filter((p) => p.role !== "admin");
        viewasSlot.innerHTML = `
          <select id="viewas-select" class="select" style="max-width:200px">
            <option value="">Admin view</option>
            ${staff.map((p) =>
              `<option value="${p.id}" ${state.viewAsStaffId === p.id ? "selected" : ""}>View as ${esc(p.full_name || p.email)}</option>`
            ).join("")}
          </select>`;
      } else {
        viewasSlot.innerHTML = "";
      }
    }
    $(".topbar").classList.toggle("viewing-as", viewingAsStaff());
  }

  function bindShell() {
    document.addEventListener("change", (e) => {
      if (e.target.id === "viewas-select") {
        state.viewAsStaffId = e.target.value || null;
        state.filters = { status: "active", q: "", assignee: "", sort: "created" };
        state.view = "orders";
        renderShell();
        renderView();
        toast(state.viewAsStaffId
          ? `Previewing as ${(profileById(state.viewAsStaffId) || {}).full_name || "staff"}`
          : "Back to admin view");
      }
    });
    document.addEventListener("click", (e) => {
      const nav = e.target.closest("[data-nav]");
      if (nav) {
        state.view = nav.dataset.nav;
        renderShell();
        renderView();
        window.scrollTo(0, 0);
        return;
      }
      if (e.target.closest("[data-nav-new]") || e.target.closest("#fab") || e.target.closest("#top-new")) {
        openOrderForm(null);
        return;
      }
      const ub = e.target.closest("#user-btn");
      const pop = $("#user-pop");
      if (ub) {
        pop.hidden = !pop.hidden;
        if (!pop.hidden) renderUserMenu();
        return;
      }
      if (!e.target.closest("#user-pop")) pop.hidden = true;
    });
  }

  function renderUserMenu() {
    const me = state.me || {};
    $("#user-pop").innerHTML = `
      <div class="who">
        <strong>${esc(me.full_name || "—")}</strong>
        <span>${esc(me.email || "")}</span>
      </div>
      <button class="menu-item" data-act="profile">${icon("user", 16)} Edit my profile</button>
      ${DB.mode === "demo"
        ? `<button class="menu-item" data-act="reset">${icon("trash", 16)} Reset demo data</button>`
        : ""}
      <button class="menu-item" data-act="signout">${icon("back", 16)} Sign out</button>`;

    $("#user-pop").onclick = async (e) => {
      const act = e.target.closest("[data-act]");
      if (!act) return;
      $("#user-pop").hidden = true;
      if (act.dataset.act === "signout") return signOut();
      if (act.dataset.act === "profile") return openProfileForm();
      if (act.dataset.act === "reset") {
        if (await confirmDialog("Reset demo data", "This wipes the sample data in this browser and starts over.", "Reset")) {
          DB.resetDemo();
          await refreshQuietly();
          toast("Demo data reset");
        }
      }
    };
  }

  /* =============================================================
   * View dispatch
   * ========================================================== */
  function renderView() {
    const root = $("#view-root");
    if (state.view === "orders")    root.innerHTML = ordersView();
    if (state.view === "schedule")  root.innerHTML = scheduleView();
    if (state.view === "customers") root.innerHTML = customersView();
    if (state.view === "team")      root.innerHTML = teamView();
    if (state.view === "schedule")  bindScheduleDnD();
  }

  /* =============================================================
   * Jobs view
   * ========================================================== */
  const PRIORITY_RANK = { urgent: 3, high: 2, normal: 1, low: 0 };

  function visibleOrders() {
    const { status, q, assignee, sort } = state.filters;
    const eff = effectiveUser();
    const needle = q.trim().toLowerCase();
    const list = state.orders.filter((o) => {
      // Staff — real account or an admin previewing as staff — only ever
      // see work orders assigned to them. Admins see everything.
      if (!isAdmin() && !(eff && (o.assignee_ids || []).includes(eff.id))) return false;
      if (status === "active" && !ACTIVE_STATUSES.includes(o.status)) return false;
      if (status !== "active" && status !== "all" && o.status !== status) return false;
      if (isAdmin() && assignee && !(o.assignee_ids || []).includes(assignee)) return false;
      if (needle) {
        const hay = [
          o.title, o.description, o.category, String(o.order_no),
          o.customer && o.customer.name, o.customer && o.customer.phone,
          siteLine(o),
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    if (sort === "priority") {
      list.sort((a, b) => (PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]) ||
        (new Date(a.scheduled_start || 0) - new Date(b.scheduled_start || 0)));
    } else if (sort === "scheduled") {
      list.sort((a, b) => {
        if (!a.scheduled_start && !b.scheduled_start) return 0;
        if (!a.scheduled_start) return 1;
        if (!b.scheduled_start) return -1;
        return new Date(a.scheduled_start) - new Date(b.scheduled_start);
      });
    }
    // "created" (default) keeps the newest-first order already returned by DB.orders.list()
    return list;
  }

  function orderCard(o) {
    const assignees = (o.assignee_ids || []).map(profileById).filter(Boolean);
    const overdue =
      o.scheduled_start &&
      new Date(o.scheduled_start) < new Date() &&
      ACTIVE_STATUSES.includes(o.status);
    const dc = dayColor(o.scheduled_start);
    const staffLabel = assignees.length
      ? assignees.length === 1
        ? (assignees[0].full_name || assignees[0].email)
        : `${assignees[0].full_name || assignees[0].email} +${assignees.length - 1}`
      : null;

    return `
      <article class="wo-card ${dc ? "has-day" : ""}"
               data-order="${o.id}"
               ${dc ? `style="--day-line:${dc}"` : ""}>
        <div class="wo-top">
          <span class="wo-no">WO-${o.order_no}</span>
          <span class="pill st-${o.status}">${STATUS[o.status]}</span>
          ${o.priority === "urgent" || o.priority === "high"
            ? `<span class="prio prio-${o.priority}">${PRIORITY[o.priority]}</span>` : ""}
          ${dc ? `<span class="day-chip" style="background:${dc}">${DOW[dayIdx(o.scheduled_start)]}</span>` : ""}
          ${staffLabel
            ? `<span class="pill staff-pill" style="--staff-c:${colorFor(assignees[0])}">${esc(staffLabel)}</span>`
            : ""}
        </div>
        <div class="wo-title">${esc(o.title)}</div>
        <div class="wo-meta">
          ${o.customer ? `<span class="bit">${icon("user", 14)}<span>${esc(o.customer.name)}</span></span>` : ""}
          ${siteLine(o) ? `<span class="bit">${icon("pin", 14)}<span>${esc(siteLine(o))}</span></span>` : ""}
          ${o.category ? `<span class="bit">${icon("tag", 14)}<span>${esc(o.category)}</span></span>` : ""}
        </div>
        <div class="wo-foot">
          <span class="wo-when ${overdue ? "overdue" : o.scheduled_start ? "" : "none"}">
            ${o.scheduled_start ? esc(fmtWhen(o.scheduled_start)) : "Not scheduled"}
          </span>
          <span class="spacer"></span>
          ${assignees.length
            ? `<span class="avatar-stack">${assignees.slice(0, 3).map((p) => avatarHTML(p)).join("")}${
                assignees.length > 3
                  ? `<span class="avatar" style="background:var(--muted-2)">+${assignees.length - 3}</span>`
                  : ""
              }</span>`
            : `<span class="hint">Unassigned</span>`}
        </div>
      </article>`;
  }

  function ordersView() {
    const list = visibleOrders();
    const f = state.filters;
    const chips = [
      ["active", "Active"],
      ["all", "All"],
      ...STATUS_KEYS.map((k) => [k, STATUS[k]]),
    ];

    return `
      <div class="page-head">
        <h2>Jobs</h2>
        <span class="count">${list.length} of ${state.orders.length}</span>
      </div>

      <div class="filterbar">
        <div class="search-wrap">
          ${icon("search", 17)}
          <input class="input" id="q" type="search" placeholder="Search title, customer, phone, unit…"
                 value="${esc(f.q)}" />
        </div>
        <div class="row stack-sm" style="margin-bottom:9px">
          ${isAdmin() ? `
          <div class="field" style="margin-bottom:0">
            <label>Staff member</label>
            <select class="select" id="assignee-filter">
              <option value="">Everyone</option>
              ${workers().map((p) =>
                `<option value="${p.id}" ${f.assignee === p.id ? "selected" : ""}>${esc(p.full_name || p.email)}</option>`
              ).join("")}
            </select>
          </div>` : ""}
          <div class="field" style="margin-bottom:0">
            <label>Sort by</label>
            <select class="select" id="sort-filter">
              <option value="created" ${f.sort === "created" ? "selected" : ""}>Newest first</option>
              <option value="priority" ${f.sort === "priority" ? "selected" : ""}>Priority</option>
              <option value="scheduled" ${f.sort === "scheduled" ? "selected" : ""}>Date &amp; time</option>
            </select>
          </div>
        </div>
        <div class="filter-scroll">
          ${chips.map(([k, label]) =>
            `<button class="chip ${f.status === k ? "on" : ""}" data-status="${k}">${label}</button>`
          ).join("")}
        </div>
      </div>

      ${list.length
        ? `<div class="cards">${list.map(orderCard).join("")}</div>`
        : `<div class="empty">
             <h3>No jobs here</h3>
             <p>${f.q || f.assignee || f.status !== "active"
                  ? "Try clearing the filters."
                  : "Tap + to create the first work order."}</p>
           </div>`}`;
  }

  /* =============================================================
   * Schedule view
   * ========================================================== */
  function scheduleView() {
    const start = state.weekStart;
    const end = addDays(start, 6);
    const unscheduled = state.orders.filter(
      (o) => !o.scheduled_start && ACTIVE_STATUSES.includes(o.status)
    );

    const label =
      start.getMonth() === end.getMonth()
        ? `${start.getDate()}–${end.getDate()} ${MON[start.getMonth()]} ${start.getFullYear()}`
        : `${start.getDate()} ${MON[start.getMonth()]} – ${end.getDate()} ${MON[end.getMonth()]} ${end.getFullYear()}`;

    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const today = new Date();

    const dayHTML = (d) => {
      const jobs = state.orders
        .filter((o) => o.scheduled_start && sameDay(o.scheduled_start, d) && o.status !== "cancelled")
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start));
      const dc = DAY_COLORS[dayIdx(d)];

      return `
        <div class="day-block ${sameDay(d, today) ? "today" : ""}" data-day="${localDateStr(d)}"
             style="--day-line:${dc}">
          <div class="day-head">
            <span class="day-dot" style="background:${dc}"></span>
            <span class="dow">${DOW[(d.getDay() + 6) % 7]}</span>
            <span class="dnum">${d.getDate()} ${MON[d.getMonth()]}</span>
            <span class="spacer"></span>
            <span class="n">${jobs.length ? jobs.length + " job" + (jobs.length > 1 ? "s" : "") : ""}</span>
          </div>
          <div class="day-body">
            ${jobs.length ? "" : `<p class="day-empty">Nothing planned</p>`}
            ${jobs.map((o) => {
              const who = (o.assignee_ids || []).map(profileById).filter(Boolean);
              return `<div class="slot p-${o.priority}" data-order="${o.id}">
                        <span class="time">${localTimeStr(o.scheduled_start)}</span>
                        <span class="grow">
                          <span class="t">${esc(o.title)}</span>
                          <span class="s">${esc(who.length ? who.map((p) => p.full_name || p.email).join(", ") : "Unassigned")}</span>
                        </span>
                      </div>`;
            }).join("")}
          </div>
        </div>`;
    };

    return `
      <div class="page-head">
        <h2>Schedule</h2>
        <span class="spacer"></span>
        <button class="btn btn-sm" data-week="today">This week</button>
      </div>

      <div class="week-nav">
        <button class="btn btn-icon" data-week="-1" aria-label="Previous week">${icon("chevL", 18)}</button>
        <span class="label">${esc(label)}</span>
        <button class="btn btn-icon" data-week="1" aria-label="Next week">${icon("chevR", 18)}</button>
      </div>

      ${unscheduled.length
        ? `<div class="unscheduled-strip">
             <h4>Waiting to be planned · ${unscheduled.length}</h4>
             <div class="items">
               ${unscheduled.map((o) => `
                 <div class="us-item" draggable="true" data-unscheduled="${o.id}" data-order="${o.id}">
                   <strong>${esc(o.title)}</strong>
                   <span>${esc(o.customer ? o.customer.name : "No customer")}</span>
                 </div>`).join("")}
             </div>
           </div>`
        : ""}

      <div class="week-grid">${days.map(dayHTML).join("")}</div>`;
  }

  function bindScheduleDnD() {
    let draggingId = null;

    $$("[data-unscheduled]").forEach((el) => {
      el.addEventListener("dragstart", (e) => {
        draggingId = el.dataset.unscheduled;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", draggingId);
      });
    });

    $$(".day-block").forEach((block) => {
      block.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        block.classList.add("drag-over");
      });
      block.addEventListener("dragleave", () => block.classList.remove("drag-over"));
      block.addEventListener("drop", async (e) => {
        e.preventDefault();
        block.classList.remove("drag-over");
        const id = e.dataTransfer.getData("text/plain") || draggingId;
        const order = orderById(id);
        if (!order) return;
        const startISO = composeISO(block.dataset.day, (CFG.TIME_SLOTS || ["09:00"])[0]);
        await saveOrderPatch(order, {
          scheduled_start: startISO,
          scheduled_end: addHours(startISO, 2),
          status: order.status === "open" ? "scheduled" : order.status,
        });
        toast(`Planned for ${fmtWhen(startISO)}`);
      });
    });
  }

  /* =============================================================
   * Customers view
   * ========================================================== */
  function customersView() {
    const q = state.filters.q.trim().toLowerCase();
    const list = state.customers.filter((c) => {
      if (!q) return true;
      return [c.name, c.phone, c.email, c.unit_number, c.building, c.address]
        .filter(Boolean).join(" ").toLowerCase().includes(q);
    });

    return `
      <div class="page-head">
        <h2>Customers</h2>
        <span class="count">${list.length}</span>
        <span class="spacer"></span>
        <button class="btn btn-primary btn-sm" data-new-customer>${icon("plus", 15)} Add</button>
      </div>

      <div class="filterbar">
        <div class="search-wrap">
          ${icon("search", 17)}
          <input class="input" id="q" type="search" placeholder="Search name, phone, unit, building…"
                 value="${esc(state.filters.q)}" />
        </div>
      </div>

      ${list.length
        ? list.map((c) => {
            const jobs = state.orders.filter((o) => o.customer_id === c.id).length;
            return `<div class="list-card" data-customer="${c.id}">
              ${avatarHTML({ id: c.id, full_name: c.name }, "avatar-lg")}
              <span class="grow">
                <strong>${esc(c.name)}</strong>
                <span class="sub">${esc([c.phone, customerLine(c)].filter(Boolean).join(" · ") || "No contact details")}</span>
              </span>
              <span class="n">${jobs} job${jobs === 1 ? "" : "s"}</span>
            </div>`;
          }).join("")
        : `<div class="empty">
             <h3>No customers yet</h3>
             <p>Saved customers are reused, so nobody retypes an address twice.</p>
           </div>`}`;
  }

  /* =============================================================
   * Team view
   * ========================================================== */
  function teamView() {
    return `
      <div class="page-head">
        <h2>Team</h2>
        <span class="count">${state.profiles.length}</span>
        <span class="spacer"></span>
        ${isRealAdmin() ? `<button class="btn btn-primary btn-sm" data-add-team>${icon("plus", 15)} Add team member</button>` : ""}
      </div>
      <p class="hint" style="margin-bottom:14px">
        Anyone who signs in with an email address shows up here.
        Turn off “Available for jobs” to hide someone from the assignment list.
      </p>
      ${state.profiles.map((p) => {
        const open = state.orders.filter(
          (o) => (o.assignee_ids || []).includes(p.id) && ACTIVE_STATUSES.includes(o.status)
        ).length;
        return `<div class="list-card" data-profile="${p.id}">
          ${avatarHTML(p, "avatar-lg")}
          <span class="grow">
            <strong>${esc(p.full_name || p.email)} ${p.id === state.me.id ? "<span class='hint'>(you)</span>" : ""}</strong>
            <span class="sub">${esc(p.email || "")}</span>
          </span>
          ${isRealAdmin()
            ? `<button class="chip ${p.role === "admin" ? "on" : ""}" data-toggle-role="${p.id}" style="flex:none">
                 ${p.role === "admin" ? "Admin" : "Staff"}
               </button>`
            : `<span class="chip on" style="flex:none;cursor:default">${p.role === "admin" ? "Admin" : "Staff"}</span>`}
          ${isRealAdmin() && p.id !== state.me.id
            ? `<button class="btn btn-ghost btn-icon" data-edit-profile="${p.id}" aria-label="Edit details" style="flex:none">${icon("edit", 15)}</button>`
            : ""}
          <span class="n">${p.is_worker ? `${open} active` : "not assignable"}</span>
        </div>`;
      }).join("")}`;
  }

  /* =============================================================
   * Order form (create / edit)
   * ========================================================== */
  function openOrderForm(existing, presetCustomer) {
    // draft holds everything the form is editing
    const draft = existing
      ? {
          title: existing.title,
          description: existing.description || "",
          category: existing.category || "",
          priority: existing.priority,
          status: existing.status,
          customer_id: existing.customer_id,
          customer: existing.customer,
          site_unit_number: existing.site_unit_number || "",
          site_building: existing.site_building || "",
          site_address: existing.site_address || "",
          date: existing.scheduled_start ? localDateStr(existing.scheduled_start) : "",
          time: existing.scheduled_start ? localTimeStr(existing.scheduled_start) : "",
          duration:
            existing.scheduled_start && existing.scheduled_end
              ? (new Date(existing.scheduled_end) - new Date(existing.scheduled_start)) / 3600e3
              : 2,
          assignees: (existing.assignee_ids || []).slice(),
        }
      : {
          title: "", description: "", category: "", priority: "normal", status: "open",
          customer_id: presetCustomer ? presetCustomer.id : null,
          customer: presetCustomer || null,
          site_unit_number: (presetCustomer && presetCustomer.unit_number) || "",
          site_building: (presetCustomer && presetCustomer.building) || "",
          site_address: (presetCustomer && presetCustomer.address) || "",
          date: "", time: "", duration: 2, assignees: [],
        };

    let customerSearch = "";
    let showCustomerForm = false;
    let newCustomer = { name: "", phone: "", email: "", unit_number: "", building: "", address: "", notes: "" };

    let entry = null;
    entry = openModal({
      kind: "order-form",
      wide: true,
      title: existing ? `Edit WO-${existing.order_no}` : "New work order",
      body: "",
      footer: `
        <button class="btn" data-close>Cancel</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-save>${existing ? "Save changes" : "Create job"}</button>`,
      onMount(root, self) {
        entry = self;
        render();
        $("[data-save]", root).addEventListener("click", save);
      },
    });

    function customerSection() {
      if (draft.customer_id && draft.customer) {
        const c = draft.customer;
        return `
          <div class="selected-customer">
            ${avatarHTML({ id: c.id, full_name: c.name })}
            <span class="grow">
              <strong>${esc(c.name)}</strong>
              <span class="lines">${esc([c.phone, c.email].filter(Boolean).join(" · ") || "No contact")}</span>
              <span class="lines">${esc(customerLine(c) || "No address on file")}</span>
            </span>
            <button type="button" class="btn btn-sm" data-clear-customer>Change</button>
          </div>`;
      }

      if (showCustomerForm) {
        return `
          <div class="info-card">
            <div class="field"><label>Name *</label>
              <input class="input" data-nc="name" value="${esc(newCustomer.name)}" placeholder="Ms. Pim Charoen" /></div>
            <div class="row stack-sm">
              <div class="field"><label>Phone</label>
                <input class="input" data-nc="phone" type="tel" inputmode="tel" value="${esc(newCustomer.phone)}" placeholder="081-234-5678" /></div>
              <div class="field"><label>Email</label>
                <input class="input" data-nc="email" type="email" value="${esc(newCustomer.email)}" placeholder="optional" /></div>
            </div>
            <div class="row stack-sm">
              <div class="field"><label>Unit number</label>
                <input class="input" data-nc="unit_number" value="${esc(newCustomer.unit_number)}" placeholder="12/04" /></div>
              <div class="field"><label>Building</label>
                <input class="input" data-nc="building" value="${esc(newCustomer.building)}" placeholder="Sukhumvit Tower A" /></div>
            </div>
            <div class="field"><label>Address</label>
              <textarea class="textarea" data-nc="address" style="min-height:64px" placeholder="Street, district, city, postcode">${esc(newCustomer.address)}</textarea></div>
            <div class="field" style="margin-bottom:0"><label>Notes for the crew</label>
              <input class="input" data-nc="notes" value="${esc(newCustomer.notes)}" placeholder="Dog on site, call before arriving…" /></div>
            <div style="display:flex;gap:8px;margin-top:12px">
              <button type="button" class="btn btn-sm" data-cancel-new-customer>Cancel</button>
              <button type="button" class="btn btn-primary btn-sm" data-save-new-customer>Save customer</button>
            </div>
          </div>`;
      }

      const q = customerSearch.trim().toLowerCase();
      const matches = state.customers
        .filter((c) =>
          !q ||
          [c.name, c.phone, c.unit_number, c.building, c.address]
            .filter(Boolean).join(" ").toLowerCase().includes(q)
        )
        .slice(0, 30);

      return `
        <div class="search-wrap" style="margin-bottom:9px">
          ${icon("search", 17)}
          <input class="input" data-customer-search value="${esc(customerSearch)}"
                 placeholder="Search saved customers by name, phone or unit…" />
        </div>
        ${matches.length
          ? `<div class="picker-list">${matches.map((c) => `
              <button type="button" class="picker-item" data-pick-customer="${c.id}">
                <strong>${esc(c.name)}</strong>
                <span>${esc([c.phone, customerLine(c)].filter(Boolean).join(" · ") || "No details saved")}</span>
              </button>`).join("")}</div>`
          : `<p class="hint" style="padding:6px 2px">No saved customer matches “${esc(customerSearch)}”.</p>`}
        <button type="button" class="btn btn-sm" style="margin-top:9px" data-new-customer-inline>
          ${icon("plus", 15)} New customer
        </button>`;
    }

    function scheduleSection() {
      const today = new Date();
      const quick = [
        ["", "Unplanned"],
        [localDateStr(today), "Today"],
        [localDateStr(addDays(today, 1)), "Tomorrow"],
        [localDateStr(addDays(today, 2)), DOW[(addDays(today, 2).getDay() + 6) % 7]],
        [localDateStr(addDays(today, 3)), DOW[(addDays(today, 3).getDay() + 6) % 7]],
      ];

      return `
        <div class="chips" style="margin-bottom:10px">
          ${quick.map(([v, label]) =>
            `<button type="button" class="chip ${draft.date === v ? "on" : ""}" data-quick-date="${v}">${label}</button>`
          ).join("")}
        </div>
        <div class="row stack-sm">
          <div class="field">
            <label>Date</label>
            <input class="input" type="date" data-date value="${esc(draft.date)}" />
          </div>
          <div class="field">
            <label>Start time</label>
            <input class="input" type="time" data-time value="${esc(draft.time)}" />
          </div>
        </div>
        ${draft.date ? `
          <div class="chips" style="margin-bottom:14px">
            ${(CFG.TIME_SLOTS || []).map((t) =>
              `<button type="button" class="chip ${draft.time === t ? "on" : ""}" data-quick-time="${t}">${t}</button>`
            ).join("")}
          </div>
          <div class="field" style="margin-bottom:0">
            <label>Expected duration</label>
            <select class="select" data-duration>
              ${DURATIONS.map(([h, label]) =>
                `<option value="${h}" ${Number(draft.duration) === h ? "selected" : ""}>${label}</option>`
              ).join("")}
            </select>
          </div>` : `<p class="hint">Pick a date to set a time. Jobs with no date land in “Waiting to be planned”.</p>`}`;
    }

    function render() {
      setModalBody(entry, `
        <div class="field">
          <label>What needs doing? *</label>
          <input class="input" data-f="title" value="${esc(draft.title)}"
                 placeholder="e.g. Leaking kitchen tap" />
        </div>

        <div class="row stack-sm">
          <div class="field">
            <label>Category</label>
            <select class="select" data-f="category">
              <option value="">—</option>
              ${(CFG.CATEGORIES || []).map((c) =>
                `<option ${draft.category === c ? "selected" : ""}>${esc(c)}</option>`
              ).join("")}
            </select>
          </div>
          ${existing ? `
          <div class="field">
            <label>Status</label>
            <select class="select" data-f="status">
              ${STATUS_KEYS.map((k) =>
                `<option value="${k}" ${draft.status === k ? "selected" : ""}>${STATUS[k]}</option>`
              ).join("")}
            </select>
          </div>` : ""}
        </div>

        <div class="field">
          <label>Priority</label>
          <div class="chips">
            ${PRIORITY_KEYS.map((k) =>
              `<button type="button" class="chip ${draft.priority === k ? "on" : ""}" data-priority="${k}">${PRIORITY[k]}</button>`
            ).join("")}
          </div>
        </div>

        <div class="field">
          <label>Details</label>
          <textarea class="textarea" data-f="description"
            placeholder="Anything the crew should know before they arrive">${esc(draft.description)}</textarea>
        </div>

        <div class="detail-section">
          <h4>Customer</h4>
          ${customerSection()}
        </div>

        <div class="detail-section">
          <h4>Where is the job?</h4>
          <div class="row stack-sm">
            <div class="field"><label>Unit number</label>
              <input class="input" data-f="site_unit_number" value="${esc(draft.site_unit_number)}" placeholder="12/04" /></div>
            <div class="field"><label>Building</label>
              <input class="input" data-f="site_building" value="${esc(draft.site_building)}" placeholder="Sukhumvit Tower A" /></div>
          </div>
          <div class="field" style="margin-bottom:0"><label>Address</label>
            <textarea class="textarea" data-f="site_address" style="min-height:60px"
              placeholder="Street, district, city, postcode">${esc(draft.site_address)}</textarea></div>
          <p class="hint" style="margin-top:7px">Prefilled from the customer. Edit it if this job is somewhere else.</p>
        </div>

        ${isAdmin() ? `
        <div class="detail-section">
          <h4>Assign to</h4>
          <div class="chips">
            ${workers().map((p) =>
              `<button type="button" class="chip ${draft.assignees.includes(p.id) ? "on" : ""}" data-assign="${p.id}">
                 ${avatarHTML(p)} ${esc(p.full_name || p.email)}
               </button>`
            ).join("") || `<p class="hint">No assignable team members yet.</p>`}
          </div>
        </div>` : ""}

        <div class="detail-section" style="margin-bottom:0">
          <h4>When</h4>
          ${scheduleSection()}
        </div>
      `);
      bindBody();
    }

    function bindBody() {
      const body = $(".modal-body", entry.el);

      // plain text/select fields write straight into the draft
      $$("[data-f]", body).forEach((el) => {
        el.addEventListener("input", () => { draft[el.dataset.f] = el.value; });
        el.addEventListener("change", () => { draft[el.dataset.f] = el.value; });
      });

      // assignment, not addEventListener: bindBody() runs after every render
      // and the .modal-body element itself is reused, so listeners would stack up
      body.onclick = async (e) => {
        const prio = e.target.closest("[data-priority]");
        if (prio) { draft.priority = prio.dataset.priority; return render(); }

        const assign = e.target.closest("[data-assign]");
        if (assign) {
          const id = assign.dataset.assign;
          draft.assignees = draft.assignees.includes(id)
            ? draft.assignees.filter((x) => x !== id)
            : draft.assignees.concat(id);
          return render();
        }

        const qd = e.target.closest("[data-quick-date]");
        if (qd) {
          draft.date = qd.dataset.quickDate;
          if (draft.date && !draft.time) draft.time = (CFG.TIME_SLOTS || ["09:00"])[0];
          if (!draft.date) draft.time = "";
          return render();
        }

        const qt = e.target.closest("[data-quick-time]");
        if (qt) { draft.time = qt.dataset.quickTime; return render(); }

        if (e.target.closest("[data-clear-customer]")) {
          draft.customer_id = null;
          draft.customer = null;
          return render();
        }

        const pick = e.target.closest("[data-pick-customer]");
        if (pick) {
          const c = state.customers.find((x) => x.id === pick.dataset.pickCustomer);
          draft.customer_id = c.id;
          draft.customer = c;
          // autofill the site, but never clobber something already typed
          if (!draft.site_unit_number) draft.site_unit_number = c.unit_number || "";
          if (!draft.site_building)    draft.site_building = c.building || "";
          if (!draft.site_address)     draft.site_address = c.address || "";
          return render();
        }

        if (e.target.closest("[data-new-customer-inline]")) {
          showCustomerForm = true;
          newCustomer.name = customerSearch;
          return render();
        }
        if (e.target.closest("[data-cancel-new-customer]")) {
          showCustomerForm = false;
          return render();
        }
        if (e.target.closest("[data-save-new-customer]")) {
          if (!newCustomer.name.trim()) return toast("Customer name is required", true);
          try {
            const created = await DB.customers.create({
              ...newCustomer,
              name: newCustomer.name.trim(),
              created_by: state.me.id,
            });
            state.customers.push(created);
            state.customers.sort((a, b) => a.name.localeCompare(b.name));
            draft.customer_id = created.id;
            draft.customer = created;
            if (!draft.site_unit_number) draft.site_unit_number = created.unit_number || "";
            if (!draft.site_building)    draft.site_building = created.building || "";
            if (!draft.site_address)     draft.site_address = created.address || "";
            showCustomerForm = false;
            newCustomer = { name: "", phone: "", email: "", unit_number: "", building: "", address: "", notes: "" };
            toast("Customer saved");
            return render();
          } catch (ex) {
            return toast(ex.message, true);
          }
        }
      };

      const search = $("[data-customer-search]", body);
      if (search) {
        search.addEventListener("input", () => {
          customerSearch = search.value;
          const pos = search.selectionStart;
          render();
          const again = $("[data-customer-search]", $(".modal-body", entry.el));
          again.focus();
          again.setSelectionRange(pos, pos);
        });
      }

      $$("[data-nc]", body).forEach((el) => {
        el.addEventListener("input", () => { newCustomer[el.dataset.nc] = el.value; });
      });

      const dateEl = $("[data-date]", body);
      if (dateEl) dateEl.addEventListener("change", () => {
        draft.date = dateEl.value;
        if (draft.date && !draft.time) draft.time = (CFG.TIME_SLOTS || ["09:00"])[0];
        render();
      });

      const timeEl = $("[data-time]", body);
      if (timeEl) timeEl.addEventListener("change", () => { draft.time = timeEl.value; render(); });

      const durEl = $("[data-duration]", body);
      if (durEl) durEl.addEventListener("change", () => { draft.duration = Number(durEl.value); });
    }

    async function save() {
      if (!draft.title.trim()) return toast("Give the job a title", true);

      const startISO = draft.date ? composeISO(draft.date, draft.time || "09:00") : null;
      const payload = {
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        category: draft.category || null,
        priority: draft.priority,
        customer_id: draft.customer_id,
        site_unit_number: draft.site_unit_number.trim() || null,
        site_building: draft.site_building.trim() || null,
        site_address: draft.site_address.trim() || null,
        scheduled_start: startISO,
        scheduled_end: startISO ? addHours(startISO, Number(draft.duration) || 2) : null,
      };

      const btn = $("[data-save]", entry.el);
      btn.disabled = true;
      btn.textContent = "Saving…";

      try {
        if (existing) {
          payload.status = draft.status;
          await DB.orders.update(existing.id, payload, draft.assignees);
          toast("Changes saved");
        } else {
          // a brand-new job that already has a date starts life as "scheduled"
          payload.status = startISO ? "scheduled" : "open";
          payload.created_by = state.me.id;
          await DB.orders.create(payload, draft.assignees);
          toast("Work order created");
        }
        await loadAll();
        closeModal();
        renderView();
        // keep the detail sheet in sync if it is sitting underneath
        const top = topModal();
        if (top && top.onRefresh) top.onRefresh();
      } catch (ex) {
        toast(ex.message, true);
        btn.disabled = false;
        btn.textContent = existing ? "Save changes" : "Create job";
      }
    }
  }

  /* =============================================================
   * Order detail
   * ========================================================== */
  async function saveOrderPatch(order, patch, assignees) {
    try {
      await DB.orders.update(order.id, patch, assignees);
      await loadAll();
      renderView();
      const top = topModal();
      if (top && top.onRefresh) top.onRefresh();
    } catch (ex) {
      toast(ex.message, true);
    }
  }

  function openOrderDetail(orderId) {
    let notes = [];

    let entry = null;
    entry = openModal({
      kind: "order-detail",
      title: "",
      body: "",
      footer: isAdmin() ? `
        <button class="btn btn-danger btn-icon" data-delete aria-label="Delete">${icon("trash", 17)}</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-edit>${icon("edit", 15)} Edit</button>` : "",
      onRefresh: render,
      onMount(root, self) {
        entry = self;
        render();
        loadNotes();
        const editBtn = $("[data-edit]", root);
        if (editBtn) editBtn.addEventListener("click", () => {
          const o = orderById(orderId);
          if (o) openOrderForm(o);
        });
        const delBtn = $("[data-delete]", root);
        if (delBtn) delBtn.addEventListener("click", async () => {
          const o = orderById(orderId);
          if (!o) return;
          const ok = await confirmDialog(
            `Delete WO-${o.order_no}?`,
            "This removes the job and its notes for everyone. It cannot be undone.",
            "Delete"
          );
          if (!ok) return;
          try {
            await DB.orders.remove(o.id);
            await loadAll();
            closeModal();
            renderView();
            toast("Work order deleted");
          } catch (ex) {
            toast(ex.message, true);
          }
        });
      },
    });

    async function loadNotes() {
      try {
        notes = await DB.notes.list(orderId);
        render();
      } catch (ex) {
        /* notes are non-critical */
      }
    }

    function render() {
      const o = orderById(orderId);
      if (!o) { closeModal(); return; }

      $(".modal-head h3", entry.el).textContent = `WO-${o.order_no}`;
      const assignees = (o.assignee_ids || []).map(profileById).filter(Boolean);
      const c = o.customer;

      setModalBody(entry, `
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <span class="pill st-${o.status}">${STATUS[o.status]}</span>
          <span class="prio prio-${o.priority}">${PRIORITY[o.priority]} priority</span>
          ${o.category ? `<span class="hint">· ${esc(o.category)}</span>` : ""}
        </div>
        <h2 style="font-size:19px;margin-bottom:6px">${esc(o.title)}</h2>
        ${o.description
          ? `<p style="color:var(--muted);font-size:14.5px;white-space:pre-wrap;margin-bottom:18px">${esc(o.description)}</p>`
          : `<div style="height:12px"></div>`}

        <div class="detail-section">
          <h4>Status</h4>
          ${isAdmin()
            ? `<div class="status-grid">
                 ${STATUS_KEYS.map((k) =>
                   `<button class="status-btn ${o.status === k ? "on" : ""}" data-set-status="${k}">${STATUS[k]}</button>`
                 ).join("")}
               </div>`
            : isAssignedToMe(o)
              ? `<div class="status-grid">
                   <button class="status-btn ${o.status === "in_progress" ? "on" : ""}" data-set-status="in_progress">Start (in progress)</button>
                   <button class="status-btn ${o.status === "completed" ? "on" : ""}" data-set-status="completed">Mark done</button>
                 </div>
                 <p class="hint" style="margin-top:7px">Only admins can change other statuses.</p>`
              : `<p class="hint">This job isn't assigned to you, so status is read-only.</p>`}
        </div>

        <div class="detail-section">
          <h4>When</h4>
          <div class="info-card">
            ${o.scheduled_start
              ? `<dl class="kv"><dt>Start</dt><dd>${esc(fmtWhen(o.scheduled_start))}</dd></dl>
                 ${o.scheduled_end
                   ? `<dl class="kv"><dt>Until</dt><dd>${esc(localTimeStr(o.scheduled_end))} (${
                       ((new Date(o.scheduled_end) - new Date(o.scheduled_start)) / 3600e3)
                         .toFixed(1).replace(/\.0$/, "")}h)</dd></dl>`
                   : ""}`
              : `<p class="hint">Not planned yet.</p>`}
            ${isAdmin()
              ? `<button class="btn btn-sm" style="margin-top:9px" data-reschedule>
                   ${icon("calendar", 15)} ${o.scheduled_start ? "Reschedule" : "Plan this job"}
                 </button>`
              : ""}
          </div>
        </div>

        <div class="detail-section">
          <h4>Customer &amp; site</h4>
          <div class="info-card">
            ${c ? `
              <dl class="kv"><dt>Name</dt><dd>${esc(c.name)}</dd></dl>
              ${c.phone ? `<dl class="kv"><dt>Phone</dt><dd><a href="tel:${esc(c.phone.replace(/\s/g, ""))}">${esc(c.phone)}</a></dd></dl>` : ""}
              ${c.email ? `<dl class="kv"><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></dl>` : ""}
              ${c.notes ? `<dl class="kv"><dt>Notes</dt><dd>${esc(c.notes)}</dd></dl>` : ""}
            ` : `<p class="hint">No customer linked.</p>`}
            ${o.site_unit_number ? `<dl class="kv"><dt>Unit</dt><dd>${esc(o.site_unit_number)}</dd></dl>` : ""}
            ${o.site_building ? `<dl class="kv"><dt>Building</dt><dd>${esc(o.site_building)}</dd></dl>` : ""}
            ${o.site_address ? `<dl class="kv"><dt>Address</dt><dd>${esc(o.site_address)}</dd></dl>` : ""}
            ${o.site_address
              ? `<a class="btn btn-sm" style="margin-top:9px"
                    href="https://maps.google.com/?q=${encodeURIComponent(
                      [o.site_building, o.site_address].filter(Boolean).join(" ")
                    )}" target="_blank" rel="noopener">${icon("pin", 15)} Open in Maps</a>`
              : ""}
          </div>
        </div>

        <div class="detail-section">
          <h4>Assigned to</h4>
          ${isAdmin()
            ? `<div class="chips">
                 ${workers().map((p) =>
                   `<button class="chip ${(o.assignee_ids || []).includes(p.id) ? "on" : ""}" data-toggle-assign="${p.id}">
                      ${avatarHTML(p)} ${esc(p.full_name || p.email)}
                    </button>`
                 ).join("") || `<p class="hint">No assignable team members yet.</p>`}
               </div>
               ${assignees.length ? "" : `<p class="hint" style="margin-top:7px">Nobody assigned — tap a name to assign.</p>`}`
            : assignees.length
              ? `<div class="chips">${assignees.map((p) =>
                  `<span class="chip on" style="cursor:default">${avatarHTML(p)} ${esc(p.full_name || p.email)}</span>`
                ).join("")}</div>`
              : `<p class="hint">Nobody assigned yet — an admin will assign this job.</p>`}
        </div>

        <div class="detail-section" style="margin-bottom:0">
          <h4>Notes</h4>
          <div>${
            notes.length
              ? notes.map((n) => {
                  const a = profileById(n.author_id);
                  return `<div class="note">
                    ${avatarHTML(a)}
                    <span class="grow">
                      <span class="who">${esc(a ? a.full_name || a.email : "Someone")}
                        <span class="when">· ${esc(fmtRelative(n.created_at))}</span></span>
                      <span class="body">${esc(n.body)}</span>
                    </span>
                  </div>`;
                }).join("")
              : `<p class="hint">No notes yet.</p>`
          }</div>
          <div style="display:flex;gap:8px;margin-top:10px">
            <input class="input" data-note placeholder="Add a note…" style="flex:1" />
            <button class="btn" data-add-note>Post</button>
          </div>
        </div>

        <p class="hint" style="margin-top:18px">
          Created ${esc(fmtRelative(o.created_at))}${
            o.created_by && profileById(o.created_by)
              ? ` by ${esc(profileById(o.created_by).full_name || profileById(o.created_by).email)}`
              : ""
          }${o.completed_at ? ` · completed ${esc(fmtRelative(o.completed_at))}` : ""}
        </p>
      `);

      bindDetail();
    }

    function bindDetail() {
      const body = $(".modal-body", entry.el);

      // assignment, not addEventListener: render() reuses the same .modal-body
      body.onclick = async (e) => {
        const o = orderById(orderId);
        if (!o) return;

        const st = e.target.closest("[data-set-status]");
        if (st) {
          const next = st.dataset.setStatus;
          if (next === o.status) return;
          if (!isAdmin() && !isAssignedToMe(o)) return toast("This job isn't assigned to you.", true);
          if (!isAdmin() && next !== "in_progress" && next !== "completed") return;
          await saveOrderPatch(o, { status: next });
          try {
            await DB.notes.create(orderId, state.me.id, `Status changed to ${STATUS[next]}`, "system");
            notes = await DB.notes.list(orderId);
            render();
          } catch (ex) { /* the status change already landed */ }
          toast(`Marked ${STATUS[next].toLowerCase()}`);
          return;
        }

        const asg = e.target.closest("[data-toggle-assign]");
        if (asg) {
          if (!isAdmin()) return toast("Only admins can reassign work orders.", true);
          const id = asg.dataset.toggleAssign;
          const current = (o.assignee_ids || []).slice();
          const next = current.includes(id) ? current.filter((x) => x !== id) : current.concat(id);
          await saveOrderPatch(o, {}, next);
          return;
        }

        if (e.target.closest("[data-reschedule]")) {
          if (!isAdmin()) return;
          openScheduleSheet(o);
          return;
        }

        if (e.target.closest("[data-add-note]")) {
          const input = $("[data-note]", body);
          const text = input.value.trim();
          if (!text) return;
          try {
            await DB.notes.create(orderId, state.me.id, text, "comment");
            input.value = "";
            notes = await DB.notes.list(orderId);
            render();
          } catch (ex) {
            toast(ex.message, true);
          }
        }
      };

      const noteInput = $("[data-note]", body);
      if (noteInput) {
        noteInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") { e.preventDefault(); $("[data-add-note]", body).click(); }
        });
      }
    }
  }

  /* =============================================================
   * Quick scheduling sheet
   * ========================================================== */
  function openScheduleSheet(order) {
    let date = order.scheduled_start ? localDateStr(order.scheduled_start) : localDateStr(new Date());
    let time = order.scheduled_start ? localTimeStr(order.scheduled_start) : (CFG.TIME_SLOTS || ["09:00"])[0];
    let duration =
      order.scheduled_start && order.scheduled_end
        ? (new Date(order.scheduled_end) - new Date(order.scheduled_start)) / 3600e3
        : 2;

    let entry = null;
    entry = openModal({
      kind: "schedule-sheet",
      back: true,
      title: `Plan WO-${order.order_no}`,
      body: "",
      footer: `
        ${order.scheduled_start ? `<button class="btn btn-danger" data-unplan>Clear date</button>` : ""}
        <span class="spacer"></span>
        <button class="btn btn-primary" data-apply>Save</button>`,
      onMount(root, self) {
        entry = self;
        render();
        $("[data-apply]", root).addEventListener("click", apply);
        const unplan = $("[data-unplan]", root);
        if (unplan) unplan.addEventListener("click", async () => {
          await saveOrderPatch(order, {
            scheduled_start: null,
            scheduled_end: null,
            status: order.status === "scheduled" ? "open" : order.status,
          });
          closeModal();
          toast("Moved back to unplanned");
        });
      },
    });

    function render() {
      const today = new Date();
      const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

      setModalBody(entry, `
        <p class="hint" style="margin-bottom:12px">${esc(order.title)}</p>

        <div class="field">
          <label>Day</label>
          <div class="chips">
            ${days.map((d, i) => {
              const v = localDateStr(d);
              const label = i === 0 ? "Today" : i === 1 ? "Tomorrow"
                : `${DOW[(d.getDay() + 6) % 7]} ${d.getDate()}`;
              return `<button type="button" class="chip ${date === v ? "on" : ""}" data-d="${v}">${label}</button>`;
            }).join("")}
          </div>
        </div>

        <div class="field">
          <label>Or pick a date</label>
          <input class="input" type="date" data-date value="${esc(date)}" />
        </div>

        <div class="field">
          <label>Start time</label>
          <div class="chips" style="margin-bottom:9px">
            ${(CFG.TIME_SLOTS || []).map((t) =>
              `<button type="button" class="chip ${time === t ? "on" : ""}" data-t="${t}">${t}</button>`
            ).join("")}
          </div>
          <input class="input" type="time" data-time value="${esc(time)}" />
        </div>

        <div class="field" style="margin-bottom:0">
          <label>Duration</label>
          <select class="select" data-duration>
            ${DURATIONS.map(([h, label]) =>
              `<option value="${h}" ${Number(duration) === h ? "selected" : ""}>${label}</option>`
            ).join("")}
          </select>
        </div>

        <p class="hint" style="margin-top:14px">
          ${date ? `Ends around ${esc(localTimeStr(addHours(composeISO(date, time), Number(duration))))}` : ""}
        </p>
      `);

      const body = $(".modal-body", entry.el);
      // assignment, not addEventListener: render() reuses the same .modal-body
      body.onclick = (e) => {
        const d = e.target.closest("[data-d]");
        if (d) { date = d.dataset.d; return render(); }
        const t = e.target.closest("[data-t]");
        if (t) { time = t.dataset.t; return render(); }
      };
      $("[data-date]", body).addEventListener("change", (e) => { date = e.target.value; render(); });
      $("[data-time]", body).addEventListener("change", (e) => { time = e.target.value; render(); });
      $("[data-duration]", body).addEventListener("change", (e) => { duration = Number(e.target.value); render(); });
    }

    async function apply() {
      if (!date) return toast("Pick a day", true);
      const startISO = composeISO(date, time || "09:00");
      await saveOrderPatch(order, {
        scheduled_start: startISO,
        scheduled_end: addHours(startISO, Number(duration) || 2),
        status: order.status === "open" ? "scheduled" : order.status,
      });
      closeModal();
      toast(`Planned for ${fmtWhen(startISO)}`);
    }
  }

  /* =============================================================
   * Customer form
   * ========================================================== */
  function openCustomerForm(existing) {
    const draft = existing
      ? { ...existing }
      : { name: "", phone: "", email: "", unit_number: "", building: "", address: "", notes: "" };

    const entry = openModal({
      kind: "customer-form",
      title: existing ? "Edit customer" : "New customer",
      body: `
        <div class="field"><label>Name *</label>
          <input class="input" data-f="name" value="${esc(draft.name)}" placeholder="Ms. Pim Charoen" /></div>
        <div class="row stack-sm">
          <div class="field"><label>Phone</label>
            <input class="input" type="tel" inputmode="tel" data-f="phone" value="${esc(draft.phone || "")}" placeholder="081-234-5678" /></div>
          <div class="field"><label>Email</label>
            <input class="input" type="email" data-f="email" value="${esc(draft.email || "")}" placeholder="optional" /></div>
        </div>
        <div class="row stack-sm">
          <div class="field"><label>Unit number</label>
            <input class="input" data-f="unit_number" value="${esc(draft.unit_number || "")}" placeholder="12/04" /></div>
          <div class="field"><label>Building</label>
            <input class="input" data-f="building" value="${esc(draft.building || "")}" placeholder="Sukhumvit Tower A" /></div>
        </div>
        <div class="field"><label>Address</label>
          <textarea class="textarea" data-f="address" style="min-height:70px"
            placeholder="Street, district, city, postcode">${esc(draft.address || "")}</textarea></div>
        <div class="field" style="margin-bottom:0"><label>Notes for the crew</label>
          <textarea class="textarea" data-f="notes" style="min-height:60px"
            placeholder="Dog on site, prefers mornings, gate code…">${esc(draft.notes || "")}</textarea></div>
        ${existing && isRealAdmin() ? `<button class="btn btn-danger btn-block" style="margin-top:16px" data-delete>Delete customer</button>` : ""}`,
      footer: `
        <button class="btn" data-close>Cancel</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-save>Save</button>`,
      onMount(root) {
        $$("[data-f]", root).forEach((el) =>
          el.addEventListener("input", () => { draft[el.dataset.f] = el.value; })
        );

        $("[data-save]", root).addEventListener("click", async () => {
          if (!draft.name.trim()) return toast("Name is required", true);
          const payload = {
            name: draft.name.trim(),
            phone: draft.phone || null,
            email: draft.email || null,
            unit_number: draft.unit_number || null,
            building: draft.building || null,
            address: draft.address || null,
            notes: draft.notes || null,
          };
          try {
            if (existing) await DB.customers.update(existing.id, payload);
            else await DB.customers.create({ ...payload, created_by: state.me.id });
            await loadAll();
            closeModal();
            renderView();
            toast("Customer saved");
          } catch (ex) {
            toast(ex.message, true);
          }
        });

        const del = $("[data-delete]", root);
        if (del) del.addEventListener("click", async () => {
          const used = state.orders.filter((o) => o.customer_id === existing.id).length;
          const ok = await confirmDialog(
            `Delete ${existing.name}?`,
            used
              ? `${used} work order${used === 1 ? "" : "s"} reference this customer. They stay, but lose the link.`
              : "This cannot be undone.",
            "Delete"
          );
          if (!ok) return;
          try {
            await DB.customers.remove(existing.id);
            await loadAll();
            closeModal();
            renderView();
            toast("Customer deleted");
          } catch (ex) {
            toast(ex.message, true);
          }
        });
      },
    });
    return entry;
  }

  function openCustomerDetail(customerId) {
    const c = state.customers.find((x) => x.id === customerId);
    if (!c) return;
    const jobs = state.orders.filter((o) => o.customer_id === c.id);

    openModal({
      kind: "customer-detail",
      title: esc(c.name),
      body: `
        <div class="info-card" style="margin-bottom:18px">
          ${c.phone ? `<dl class="kv"><dt>Phone</dt><dd><a href="tel:${esc(c.phone.replace(/\s/g, ""))}">${esc(c.phone)}</a></dd></dl>` : ""}
          ${c.email ? `<dl class="kv"><dt>Email</dt><dd><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></dd></dl>` : ""}
          ${c.unit_number ? `<dl class="kv"><dt>Unit</dt><dd>${esc(c.unit_number)}</dd></dl>` : ""}
          ${c.building ? `<dl class="kv"><dt>Building</dt><dd>${esc(c.building)}</dd></dl>` : ""}
          ${c.address ? `<dl class="kv"><dt>Address</dt><dd>${esc(c.address)}</dd></dl>` : ""}
          ${c.notes ? `<dl class="kv"><dt>Notes</dt><dd>${esc(c.notes)}</dd></dl>` : ""}
        </div>

        <div class="detail-section" style="margin-bottom:0">
          <h4>Job history · ${jobs.length}</h4>
          ${jobs.length
            ? `<div class="cards">${jobs.map(orderCard).join("")}</div>`
            : `<p class="hint">No jobs for this customer yet.</p>`}
        </div>`,
      footer: `
        <button class="btn" data-edit-customer>${icon("edit", 15)} Edit</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-job-for-customer>${icon("plus", 15)} New job</button>`,
      onMount(root) {
        $("[data-edit-customer]", root).addEventListener("click", () => {
          closeModal();
          openCustomerForm(c);
        });
        $("[data-job-for-customer]", root).addEventListener("click", () => {
          closeModal();
          openOrderForm(null, c);
        });
      },
    });
  }

  /* =============================================================
   * Profile form
   * ========================================================== */
  function openProfileForm(target) {
    const me = target || state.me;
    const isSelf = me.id === state.me.id;
    const isAdminEditingOther = isRealAdmin() && !isSelf;
    const draft = {
      full_name: me.full_name || "",
      phone: me.phone || "",
      email: me.email || "",
      is_worker: !!me.is_worker,
    };

    openModal({
      kind: "profile",
      title: isSelf ? "My profile" : `Edit ${esc(me.full_name || me.email)}`,
      body: `
        <div class="field"><label>Full name</label>
          <input class="input" data-f="full_name" value="${esc(draft.full_name)}" /></div>
        ${isAdminEditingOther ? `
        <div class="field"><label>Email</label>
          <input class="input" type="email" data-f="email" value="${esc(draft.email)}" /></div>
        <p class="hint" style="margin-top:-8px;margin-bottom:14px">
          Updates their display email only. It won't change the address they actually sign in with —
          that's tied to their own Supabase account.
        </p>` : ""}
        <div class="field"><label>Phone</label>
          <input class="input" type="tel" inputmode="tel" data-f="phone" value="${esc(draft.phone)}" /></div>
        <div class="field" style="margin-bottom:0">
          <label>Availability</label>
          <button class="chip ${draft.is_worker ? "on" : ""}" data-toggle-worker>
            ${draft.is_worker ? "Available for jobs" : "Not taking jobs"}
          </button>
        </div>
        ${isSelf ? `<p class="hint" style="margin-top:10px">Signed in as ${esc(me.email || "")}</p>` : ""}
        ${isAdminEditingOther ? `<button class="btn btn-danger btn-block" style="margin-top:16px" data-delete-profile>Remove from team</button>` : ""}`,
      footer: `
        <button class="btn" data-close>Cancel</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-save>Save</button>`,
      onMount(root) {
        $$("[data-f]", root).forEach((el) =>
          el.addEventListener("input", () => { draft[el.dataset.f] = el.value; })
        );
        const toggle = $("[data-toggle-worker]", root);
        toggle.addEventListener("click", () => {
          draft.is_worker = !draft.is_worker;
          toggle.classList.toggle("on", draft.is_worker);
          toggle.textContent = draft.is_worker ? "Available for jobs" : "Not taking jobs";
        });
        $("[data-save]", root).addEventListener("click", async () => {
          try {
            const patch = {
              full_name: draft.full_name.trim() || me.email,
              phone: draft.phone || null,
              is_worker: draft.is_worker,
            };
            if (isAdminEditingOther) patch.email = draft.email.trim() || me.email;
            await DB.profiles.update(me.id, patch);
            await loadAll();
            closeModal();
            renderShell();
            renderView();
            toast("Profile saved");
          } catch (ex) {
            toast(ex.message, true);
          }
        });

        const delBtn = $("[data-delete-profile]", root);
        if (delBtn) delBtn.addEventListener("click", async () => {
          const openJobs = state.orders.filter(
            (o) => (o.assignee_ids || []).includes(me.id) && ACTIVE_STATUSES.includes(o.status)
          ).length;
          const ok = await confirmDialog(
            `Remove ${me.full_name || me.email} from the team?`,
            openJobs
              ? `They're currently assigned to ${openJobs} active job${openJobs === 1 ? "" : "s"} — those will become unassigned. This cannot be undone.`
              : "They'll lose access next time they sign in. This cannot be undone.",
            "Remove"
          );
          if (!ok) return;
          try {
            await DB.profiles.remove(me.id);
            await loadAll();
            closeModal();
            renderView();
            toast("Removed from team");
          } catch (ex) {
            toast(ex.message, true);
          }
        });
      },
    });
  }

  /* =============================================================
   * Add team member (admin only)
   * ========================================================== */
  function openAddTeamForm() {
    const draft = { email: "", full_name: "", role: "member" };

    const entry = openModal({
      kind: "add-team",
      title: "Add team member",
      body: `
        <div class="field"><label>Email *</label>
          <input class="input" type="email" data-f="email" placeholder="name@company.com" /></div>
        <div class="field"><label>Full name</label>
          <input class="input" data-f="full_name" placeholder="Optional — filled in when they sign in" /></div>
        <div class="field" style="margin-bottom:0">
          <label>Role</label>
          <div class="chips">
            <button type="button" class="chip on" data-role="member">Staff</button>
            <button type="button" class="chip" data-role="admin">Admin</button>
          </div>
        </div>
        <p class="hint" style="margin-top:12px">
          They'll get a sign-in code by email the first time they open the app —
          there's no password to set up. Once they appear here you can change their role anytime.
        </p>`,
      footer: `
        <button class="btn" data-close>Cancel</button>
        <span class="spacer"></span>
        <button class="btn btn-primary" data-save>Send invite</button>`,
      onMount(root) {
        $$("[data-f]", root).forEach((el) =>
          el.addEventListener("input", () => { draft[el.dataset.f] = el.value; })
        );
        $$("[data-role]", root).forEach((btn) => {
          btn.addEventListener("click", () => {
            draft.role = btn.dataset.role;
            $$("[data-role]", root).forEach((b) => b.classList.toggle("on", b === btn));
          });
        });
        $("[data-save]", root).addEventListener("click", async () => {
          const email = draft.email.trim().toLowerCase();
          if (!email) return toast("Enter an email address", true);
          const btn = $("[data-save]", root);
          btn.disabled = true;
          btn.textContent = "Sending…";
          try {
            await DB.auth.sendCode(email);
            // The invite creates their profile via a signup trigger. Give it
            // a moment, then look it up so we can set name/role right away.
            let created = null;
            for (let i = 0; i < 4 && !created; i++) {
              await new Promise((r) => setTimeout(r, 500));
              const profiles = await DB.profiles.list();
              created = profiles.find((p) => (p.email || "").toLowerCase() === email);
            }
            if (created) {
              const patch = {};
              if (draft.full_name.trim()) patch.full_name = draft.full_name.trim();
              if (draft.role !== created.role) patch.role = draft.role;
              if (Object.keys(patch).length) await DB.profiles.update(created.id, patch);
            }
            await loadAll();
            closeModal();
            renderView();
            toast(created ? "Invite sent — they now appear in Team" : "Invite sent");
          } catch (ex) {
            toast(ex.message, true);
            btn.disabled = false;
            btn.textContent = "Send invite";
          }
        });
      },
    });
    return entry;
  }

  /* =============================================================
   * Global delegation for view-level clicks
   * ========================================================== */
  function bindViews() {
    const root = $("#view-root");

    root.addEventListener("click", (e) => {
      const st = e.target.closest("[data-status]");
      if (st) {
        state.filters.status = st.dataset.status;
        return renderView();
      }
      if (e.target.closest("[data-new-customer]")) return openCustomerForm(null);
      const wk = e.target.closest("[data-week]");
      if (wk) {
        const v = wk.dataset.week;
        state.weekStart = v === "today" ? mondayOf(new Date()) : addDays(state.weekStart, Number(v) * 7);
        return renderView();
      }

      const cust = e.target.closest("[data-customer]");
      if (cust) return openCustomerDetail(cust.dataset.customer);

      if (e.target.closest("[data-add-team]")) return openAddTeamForm();

      const roleBtn = e.target.closest("[data-toggle-role]");
      if (roleBtn) {
        if (!isRealAdmin()) return;
        const p = profileById(roleBtn.dataset.toggleRole);
        if (!p) return;
        const nextRole = p.role === "admin" ? "member" : "admin";
        (async () => {
          try {
            await DB.profiles.update(p.id, { role: nextRole });
            await loadAll();
            renderView();
            toast(`${p.full_name || p.email} is now ${nextRole === "admin" ? "an admin" : "staff"}`);
          } catch (ex) {
            toast(ex.message, true);
          }
        })();
        return;
      }

      const editBtn = e.target.closest("[data-edit-profile]");
      if (editBtn) {
        if (!isRealAdmin()) return;
        const p = profileById(editBtn.dataset.editProfile);
        if (p) openProfileForm(p);
        return;
      }

      const prof = e.target.closest("[data-profile]");
      if (prof) {
        if (prof.dataset.profile === state.me.id) return openProfileForm();
        const p = profileById(prof.dataset.profile);
        state.view = "orders";
        state.filters = { status: "active", q: "", assignee: p.id, sort: "priority" };
        renderShell();
        renderView();
        toast(`Showing ${p.full_name || p.email}'s active jobs, sorted by priority`);
        return;
      }

      const ord = e.target.closest("[data-order]");
      if (ord) return openOrderDetail(ord.dataset.order);
    });

    // search boxes are re-created on every render, so listen on the container
    root.addEventListener("input", (e) => {
      if (e.target.id !== "q") return;
      state.filters.q = e.target.value;
      const pos = e.target.selectionStart;
      renderView();
      const again = $("#q");
      if (again) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (_) {} }
    });

    root.addEventListener("change", (e) => {
      if (e.target.id === "assignee-filter") {
        state.filters.assignee = e.target.value;
        return renderView();
      }
      if (e.target.id === "sort-filter") {
        state.filters.sort = e.target.value;
        return renderView();
      }
    });

    // detail sheets opened from inside a modal (e.g. customer job history)
    $("#modal-root").addEventListener("click", (e) => {
      const card = e.target.closest(".wo-card[data-order]");
      if (card) openOrderDetail(card.dataset.order);
    });
  }

  /* =============================================================
   * Boot
   * ========================================================== */
  async function boot() {
    initAuthScreen();
    bindShell();
    bindViews();

    DB.auth.onChange((session) => {
      if (!session && state.session) {
        state.session = null;
        showAuth();
      }
    });

    let session = null;
    try {
      session = await DB.auth.getSession();
    } catch (e) { /* treat as signed out */ }

    if (session) {
      try {
        await onSignedIn(session);
        return;
      } catch (e) {
        toast(e.message, true);
      }
    }
    showAuth();
  }

  boot();
})();
