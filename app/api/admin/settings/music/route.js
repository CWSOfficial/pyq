import { NextResponse } from "next/server";
import { authorizeAdmin } from "../../../../../lib/supabase/admin-server";

export const dynamic = "force-dynamic";
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function authorize(request) {
  const auth = await authorizeAdmin(request);
  if (auth.error) return auth;
  return { ...auth, email: auth.user.email || auth.user.phone };
}

export async function PUT(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  let body;
  try { body = await request.json(); } catch { return response({ error: "Provide valid JSON settings." }, 400); }
  const trackUrl = typeof body?.trackUrl === "string" ? body.trackUrl.trim() : "";
  if (!trackUrl || trackUrl.length > 1200 || !(/^(\/|https:\/\/)/i.test(trackUrl)) || /^(\/\/|javascript:)/i.test(trackUrl)) return response({ error: "Use a local /audio file path or a secure https audio URL." }, 400);
  const requestedVolume = Number(body.volume);
  const settings = { enabled: Boolean(body.enabled), trackUrl, volume: Math.max(0, Math.min(1, Number.isFinite(requestedVolume) ? requestedVolume : 0.28)) };
  const { error } = await auth.database.from("app_settings").upsert({ key: "music", value: settings, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) return response({ error: "Could not save music settings. Apply the app settings migration first." }, 500);
  console.info("Admin music settings updated", { adminEmail: auth.email });
  return response(settings);
}
