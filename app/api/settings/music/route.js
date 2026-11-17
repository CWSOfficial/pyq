import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const emptySettings = { enabled: false, trackUrl: "", volume: 0.28 };

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "Supabase is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  const database = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await database.from("app_settings").select("value").eq("key", "music").maybeSingle();
  if (error) return NextResponse.json({ error: "Could not load music settings from Supabase." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...emptySettings, ...(data?.value && typeof data.value === "object" ? data.value : {}) }, { headers: { "Cache-Control": "no-store" } });
}
