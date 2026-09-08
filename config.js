/* ---------------------------------------------------------------
 * WorkOrder app - configuration
 *
 * Paste your Supabase project credentials below.
 * Find them in Supabase Studio -> Project Settings -> Data API:
 *   SUPABASE_URL      = "Project URL"
 *   SUPABASE_ANON_KEY = "anon public" key  (safe to ship in the browser,
 *                        Row Level Security in schema.sql is what protects
 *                        the data)
 *
 * Leave them as-is and the app runs in DEMO MODE: data lives in this
 * browser's localStorage only, with a fake login. Good for trying the
 * UI out; nothing is shared between people until you fill these in.
 * ------------------------------------------------------------- */

window.APP_CONFIG = {
  SUPABASE_URL: "https://nbrggelvhozofzdpcwai.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_JTj_mpVBCdxaYJtR_0cIxg_qnP-dn7F",

  // Shown in the header and the browser tab.
  APP_NAME: "WorkOrders",

  // Default job categories offered in the create form.
  CATEGORIES: [
    "Plumbing",
    "Electrical",
    "Air conditioning",
    "Appliance",
    "Carpentry",
    "Painting",
    "Cleaning",
    "Inspection",
    "Other",
  ],

  // Quick-pick start times in the scheduler (24h).
  TIME_SLOTS: ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00"],
};
