import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const defaultSubjects = ["Polity", "Economy", "Geography", "History", "Art and Culture", "International relations", "Science and Technology", "Environment", "Current Affairs", "Miscellaneous"];
const defaultYears = Array.from({ length: 16 }, (_, index) => String(2026 - index));
const response = (value) => NextResponse.json(value, { headers: { "Cache-Control": "no-store" } });

export async function GET() {
  const fallback = { subjects: defaultSubjects, years: defaultYears };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response(fallback);
  const database = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const [settingsResult, questionsResult] = await Promise.all([
    database.from("app_settings").select("value").eq("key", "catalog").maybeSingle(),
    database.from("questions").select("subject, year").range(0, 9999),
  ]);
  const saved = settingsResult.data?.value || {};
  const activeValues = (base, dynamic, overrides, kind) => {
    const values = new Map();
    [...base, ...dynamic].forEach((item) => { const value = String(item || "").trim(); if (value) values.set(value.toLowerCase(), value); });
    (Array.isArray(overrides) ? overrides : []).forEach((entry) => { const value = String(entry?.value || "").trim(); if (value) { const id = value.toLowerCase(); if (entry.active === false) values.delete(id); else values.set(id, values.get(id) || value); } });
    return [...values.values()].sort(kind === "year" ? (a, b) => Number(b) - Number(a) : (a, b) => a.localeCompare(b));
  };
  const questionRows = questionsResult.data || [];
  return response({
    subjects: activeValues(defaultSubjects, questionRows.map((item) => item.subject), saved.subjects, "subject"),
    years: activeValues(defaultYears, questionRows.map((item) => item.year), saved.years, "year"),
  });
}
