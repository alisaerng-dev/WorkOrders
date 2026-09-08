/* ---------------------------------------------------------------
 * Data layer.
 *
 * Exposes a single `window.DB` object so the UI never touches Supabase
 * directly. Two interchangeable backends sit behind it:
 *
 *   SupabaseBackend - the real thing, used when config.js has credentials
 *   DemoBackend     - localStorage + a fake login, used when it doesn't
 *
 * Every method returns a Promise and throws an Error on failure.
 * ------------------------------------------------------------- */
(function () {
  "use strict";

  const CFG = window.APP_CONFIG || {};
  const HAS_SUPABASE = Boolean(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);

  const uuid = () =>
    (crypto.randomUUID && crypto.randomUUID()) ||
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });

  /* =============================================================
   * Supabase backend
   * ========================================================== */
  function SupabaseBackend() {
    const sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    const unwrap = ({ data, error }) => {
      if (error) throw new Error(error.message);
      return data;
    };

    const ORDER_SELECT =
      "*, customer:customers(*), work_order_assignees(profile_id)";

    const shapeOrder = (row) => {
      if (!row) return row;
      const { work_order_assignees, ...rest } = row;
      return {
        ...rest,
        assignee_ids: (work_order_assignees || []).map((a) => a.profile_id),
      };
    };

    async function setAssignees(orderId, ids) {
      unwrap(
        await sb.from("work_order_assignees").delete().eq("work_order_id", orderId)
      );
      if (ids && ids.length) {
        unwrap(
          await sb.from("work_order_assignees").insert(
            ids.map((profile_id) => ({ work_order_id: orderId, profile_id }))
          )
        );
      }
    }

    return {
      mode: "supabase",

      auth: {
        async getSession() {
          const { data } = await sb.auth.getSession();
          return data.session || null;
        },
        async signIn(email, password) {
          const data = unwrap(await sb.auth.signInWithPassword({ email, password }));
          return data.session;
        },
        async signUp(email, password) {
          const data = unwrap(await sb.auth.signUp({ email, password }));
          // null session here means Supabase is set to require email confirmation first
          return data.session || null;
        },
        async signOut() {
          await sb.auth.signOut();
        },
        onChange(cb) {
          sb.auth.onAuthStateChange((_evt, session) => cb(session || null));
        },
      },

      profiles: {
        async list() {
          return unwrap(
            await sb.from("profiles").select("*").order("full_name", { ascending: true })
          );
        },
        async me(userId) {
          const rows = unwrap(await sb.from("profiles").select("*").eq("id", userId).limit(1));
          return rows[0] || null;
        },
        async update(id, patch) {
          const rows = unwrap(
            await sb.from("profiles").update(patch).eq("id", id).select("*")
          );
          return rows[0];
        },
        async remove(id) {
          unwrap(await sb.from("profiles").delete().eq("id", id));
        },
      },

      customers: {
        async list() {
          return unwrap(
            await sb.from("customers").select("*").order("name", { ascending: true })
          );
        },
        async create(payload) {
          const rows = unwrap(await sb.from("customers").insert(payload).select("*"));
          return rows[0];
        },
        async update(id, patch) {
          const rows = unwrap(
            await sb.from("customers").update(patch).eq("id", id).select("*")
          );
          return rows[0];
        },
        async remove(id) {
          unwrap(await sb.from("customers").delete().eq("id", id));
        },
      },

      orders: {
        async list() {
          const rows = unwrap(
            await sb
              .from("work_orders")
              .select(ORDER_SELECT)
              .order("created_at", { ascending: false })
          );
          return rows.map(shapeOrder);
        },
        async create(payload, assigneeIds) {
          const rows = unwrap(await sb.from("work_orders").insert(payload).select("id"));
          const id = rows[0].id;
          await setAssignees(id, assigneeIds);
          const full = unwrap(
            await sb.from("work_orders").select(ORDER_SELECT).eq("id", id).limit(1)
          );
          return shapeOrder(full[0]);
        },
        async update(id, patch, assigneeIds) {
          unwrap(await sb.from("work_orders").update(patch).eq("id", id));
          if (assigneeIds) await setAssignees(id, assigneeIds);
          const full = unwrap(
            await sb.from("work_orders").select(ORDER_SELECT).eq("id", id).limit(1)
          );
          return shapeOrder(full[0]);
        },
        async remove(id) {
          unwrap(await sb.from("work_orders").delete().eq("id", id));
        },
      },

      notes: {
        async list(orderId) {
          return unwrap(
            await sb
              .from("work_order_notes")
              .select("*")
              .eq("work_order_id", orderId)
              .order("created_at", { ascending: true })
          );
        },
        async create(orderId, authorId, body, kind) {
          const rows = unwrap(
            await sb
              .from("work_order_notes")
              .insert({
                work_order_id: orderId,
                author_id: authorId,
                body,
                kind: kind || "comment",
              })
              .select("*")
          );
          return rows[0];
        },
      },

      realtime: {
        subscribe(cb) {
          const ch = sb.channel("workorder-live");
          ["work_orders", "work_order_assignees", "customers"].forEach((table) => {
            ch.on("postgres_changes", { event: "*", schema: "public", table }, cb);
          });
          ch.subscribe();
          return () => sb.removeChannel(ch);
        },
      },
    };
  }

  /* =============================================================
   * Demo backend - localStorage, no network, fake login
   * ========================================================== */
  function DemoBackend() {
    const KEY = "workorders.demo.v1";
    let listeners = [];

    const nowISO = () => new Date().toISOString();

    function seed() {
      const team = [
        { full_name: "Alisa Hongpong", email: "boonchuay.k@northeastern.edu", role: "admin", color: "#6366f1" },
        { full_name: "Somchai P.", email: "somchai@example.com", role: "member", color: "#f97316" },
        { full_name: "Nid W.", email: "nid@example.com", role: "member", color: "#10b981" },
        { full_name: "Krit T.", email: "krit@example.com", role: "member", color: "#ec4899" },
      ].map((p) => ({
        id: uuid(),
        phone: "",
        is_worker: true,
        is_active: true,
        _demoPassword: "demo1234",
        created_at: nowISO(),
        updated_at: nowISO(),
        ...p,
      }));

      const customers = [
        {
          name: "Ms. Pim Charoen",
          phone: "081-234-5678",
          email: "pim@example.com",
          unit_number: "12/04",
          building: "Sukhumvit Tower A",
          address: "199 Sukhumvit Rd, Khlong Toei, Bangkok 10110",
          notes: "Dog on site - call before arriving.",
        },
        {
          name: "Mr. John Baker",
          phone: "089-777-1122",
          email: "john.baker@example.com",
          unit_number: "8B",
          building: "Riverside Condo",
          address: "45 Charoen Nakhon Rd, Khlong San, Bangkok 10600",
          notes: "",
        },
        {
          name: "Khun Malee S.",
          phone: "086-555-9090",
          email: "",
          unit_number: "3/12",
          building: "Green Park Residence",
          address: "77 Phahonyothin Rd, Chatuchak, Bangkok 10900",
          notes: "Prefers morning appointments.",
        },
      ].map((c) => ({
        id: uuid(),
        created_by: team[0].id,
        created_at: nowISO(),
        updated_at: nowISO(),
        ...c,
      }));

      const day = (offset, hh, mm) => {
        const d = new Date();
        d.setDate(d.getDate() + offset);
        d.setHours(hh, mm || 0, 0, 0);
        return d.toISOString();
      };
      const plus = (iso, hours) =>
        new Date(new Date(iso).getTime() + hours * 3600e3).toISOString();

      const mk = (o) => ({
        id: uuid(),
        description: "",
        priority: "normal",
        status: "open",
        scheduled_start: null,
        scheduled_end: null,
        completed_at: null,
        created_by: team[0].id,
        created_at: nowISO(),
        updated_at: nowISO(),
        ...o,
      });

      const s1 = day(0, 9);
      const s2 = day(1, 13);
      const s3 = day(2, 10);

      const orders = [
        mk({
          order_no: 1001,
          title: "Leaking kitchen tap",
          description: "Water dripping under the sink, cabinet floor is soaked.",
          category: "Plumbing",
          priority: "high",
          status: "scheduled",
          customer_id: customers[0].id,
          site_unit_number: customers[0].unit_number,
          site_building: customers[0].building,
          site_address: customers[0].address,
          scheduled_start: s1,
          scheduled_end: plus(s1, 2),
        }),
        mk({
          order_no: 1002,
          title: "Aircon not cooling - bedroom",
          description: "Unit runs but blows warm air. Last service was 2 years ago.",
          category: "Air conditioning",
          priority: "normal",
          status: "in_progress",
          customer_id: customers[1].id,
          site_unit_number: customers[1].unit_number,
          site_building: customers[1].building,
          site_address: customers[1].address,
          scheduled_start: s2,
          scheduled_end: plus(s2, 3),
        }),
        mk({
          order_no: 1003,
          title: "Replace hallway light fittings",
          category: "Electrical",
          priority: "low",
          status: "open",
          customer_id: customers[2].id,
          site_unit_number: customers[2].unit_number,
          site_building: customers[2].building,
          site_address: customers[2].address,
        }),
        mk({
          order_no: 1004,
          title: "Bathroom door won't close",
          description: "Frame swollen after the leak was fixed.",
          category: "Carpentry",
          priority: "normal",
          status: "scheduled",
          customer_id: customers[0].id,
          site_unit_number: customers[0].unit_number,
          site_building: customers[0].building,
          site_address: customers[0].address,
          scheduled_start: s3,
          scheduled_end: plus(s3, 1.5),
        }),
        mk({
          order_no: 1005,
          title: "Quarterly aircon clean (3 units)",
          category: "Air conditioning",
          priority: "low",
          status: "completed",
          customer_id: customers[1].id,
          site_unit_number: customers[1].unit_number,
          site_building: customers[1].building,
          site_address: customers[1].address,
          scheduled_start: day(-4, 9),
          scheduled_end: day(-4, 16),
          completed_at: day(-4, 16),
        }),
      ];

      return {
        profiles: team,
        customers,
        orders,
        assignees: [
          { work_order_id: orders[0].id, profile_id: team[1].id },
          { work_order_id: orders[1].id, profile_id: team[1].id },
          { work_order_id: orders[1].id, profile_id: team[2].id },
          { work_order_id: orders[3].id, profile_id: team[3].id },
          { work_order_id: orders[4].id, profile_id: team[2].id },
        ],
        notes: [
          {
            id: uuid(),
            work_order_id: orders[1].id,
            author_id: team[1].id,
            body: "Compressor sounds fine, likely low refrigerant. Bringing gauges tomorrow.",
            kind: "comment",
            created_at: nowISO(),
          },
        ],
        nextOrderNo: 1006,
        session: null,
      };
    }

    function load() {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {
        /* fall through to a fresh seed */
      }
      const fresh = seed();
      save(fresh);
      return fresh;
    }

    function save(d) {
      localStorage.setItem(KEY, JSON.stringify(d));
    }

    let data = load();
    const persist = () => save(data);
    const fire = () => listeners.forEach((cb) => cb({ demo: true }));
    const clone = (v) => JSON.parse(JSON.stringify(v));

    const shapeOrder = (o) => ({
      ...clone(o),
      customer: data.customers.find((c) => c.id === o.customer_id) || null,
      assignee_ids: data.assignees
        .filter((a) => a.work_order_id === o.id)
        .map((a) => a.profile_id),
    });

    function setAssignees(orderId, ids) {
      data.assignees = data.assignees.filter((a) => a.work_order_id !== orderId);
      (ids || []).forEach((profile_id) =>
        data.assignees.push({ work_order_id: orderId, profile_id, assigned_at: nowISO() })
      );
    }

    return {
      mode: "demo",

      auth: {
        async getSession() {
          return data.session;
        },
        async signIn(email, password) {
          const profile = data.profiles.find((p) => p.email === email);
          if (!profile || (profile._demoPassword || "demo1234") !== password) {
            throw new Error("Incorrect email or password. In demo mode the default password is demo1234.");
          }
          data.session = { user: { id: profile.id, email } };
          persist();
          fire();
          return data.session;
        },
        async signUp(email, password) {
          if (data.profiles.some((p) => p.email === email)) {
            throw new Error("An account with that email already exists — try signing in instead.");
          }
          if (!password || password.length < 6) {
            throw new Error("Password must be at least 6 characters.");
          }
          const profile = {
            id: uuid(),
            email,
            full_name: email.split("@")[0],
            phone: "",
            role: "member",
            is_worker: true,
            is_active: true,
            color: "#0ea5e9",
            _demoPassword: password,
            created_at: nowISO(),
            updated_at: nowISO(),
          };
          data.profiles.push(profile);
          data.session = { user: { id: profile.id, email } };
          persist();
          fire();
          return data.session;
        },
        async signOut() {
          data.session = null;
          persist();
        },
        onChange() {
          /* demo sessions only change through this tab */
        },
      },

      profiles: {
        async list() {
          return clone(data.profiles).sort((a, b) =>
            (a.full_name || "").localeCompare(b.full_name || "")
          );
        },
        async me(userId) {
          return clone(data.profiles.find((p) => p.id === userId) || null);
        },
        async update(id, patch) {
          const p = data.profiles.find((x) => x.id === id);
          Object.assign(p, patch, { updated_at: nowISO() });
          persist();
          fire();
          return clone(p);
        },
        async remove(id) {
          data.profiles = data.profiles.filter((p) => p.id !== id);
          // Mirror the real schema: assignments cascade away, jobs they
          // created keep existing but lose the creator reference.
          data.assignees = data.assignees.filter((a) => a.profile_id !== id);
          data.orders.forEach((o) => {
            if (o.created_by === id) o.created_by = null;
          });
          persist();
          fire();
        },
      },

      customers: {
        async list() {
          return clone(data.customers).sort((a, b) => a.name.localeCompare(b.name));
        },
        async create(payload) {
          const row = {
            id: uuid(),
            created_at: nowISO(),
            updated_at: nowISO(),
            ...payload,
          };
          data.customers.push(row);
          persist();
          fire();
          return clone(row);
        },
        async update(id, patch) {
          const c = data.customers.find((x) => x.id === id);
          Object.assign(c, patch, { updated_at: nowISO() });
          persist();
          fire();
          return clone(c);
        },
        async remove(id) {
          data.customers = data.customers.filter((c) => c.id !== id);
          data.orders.forEach((o) => {
            if (o.customer_id === id) o.customer_id = null;
          });
          persist();
          fire();
        },
      },

      orders: {
        async list() {
          const meId = data.session && data.session.user.id;
          const me = data.profiles.find((p) => p.id === meId);
          const admin = me && me.role === "admin";
          let rows = clone(data.orders);
          if (!admin) {
            rows = rows.filter(
              (o) =>
                o.created_by === meId ||
                data.assignees.some((a) => a.work_order_id === o.id && a.profile_id === meId)
            );
          }
          return rows
            .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            .map(shapeOrder);
        },
        async create(payload, assigneeIds) {
          const row = {
            id: uuid(),
            order_no: data.nextOrderNo++,
            completed_at: null,
            created_at: nowISO(),
            updated_at: nowISO(),
            ...payload,
          };
          data.orders.push(row);
          setAssignees(row.id, assigneeIds);
          persist();
          fire();
          return shapeOrder(row);
        },
        async update(id, patch, assigneeIds) {
          const o = data.orders.find((x) => x.id === id);
          const wasCompleted = o.status === "completed";
          Object.assign(o, patch, { updated_at: nowISO() });
          if (o.status === "completed" && !wasCompleted) o.completed_at = nowISO();
          if (o.status !== "completed") o.completed_at = null;
          if (assigneeIds) setAssignees(id, assigneeIds);
          persist();
          fire();
          return shapeOrder(o);
        },
        async remove(id) {
          data.orders = data.orders.filter((o) => o.id !== id);
          data.assignees = data.assignees.filter((a) => a.work_order_id !== id);
          data.notes = data.notes.filter((n) => n.work_order_id !== id);
          persist();
          fire();
        },
      },

      notes: {
        async list(orderId) {
          return clone(data.notes)
            .filter((n) => n.work_order_id === orderId)
            .sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
        },
        async create(orderId, authorId, body, kind) {
          const row = {
            id: uuid(),
            work_order_id: orderId,
            author_id: authorId,
            body,
            kind: kind || "comment",
            created_at: nowISO(),
          };
          data.notes.push(row);
          persist();
          return clone(row);
        },
      },

      realtime: {
        subscribe(cb) {
          listeners.push(cb);
          return () => {
            listeners = listeners.filter((l) => l !== cb);
          };
        },
      },

      // demo-only escape hatch, wired to the "Reset demo data" button
      resetDemo() {
        data = seed();
        persist();
      },
    };
  }

  window.DB = HAS_SUPABASE ? SupabaseBackend() : DemoBackend();
  window.DB.uuid = uuid;
})();
