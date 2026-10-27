import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const fallback = { enabled: true, trackUrl: "/audio/cloud-soft-focus.wav", volume: 0.28 };

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json(fallback, { headers: { "Cache-Control": "no-store" } });
  const database = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await database.from("app_settings").select("value").eq("key", "music").maybeSingle();
  if (error || !data?.value || typeof data.value !== "object") return NextResponse.json(fallback, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ ...fallback, ...data.value }, { headers: { "Cache-Control": "no-store" } });
}
