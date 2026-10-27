import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
const response = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const normalizePhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

async function authorize(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailAllowlist = (process.env.PYQ_ADMIN_EMAILS || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const phoneAllowlist = (process.env.PYQ_ADMIN_PHONES || "").split(",").map(normalizePhone).filter(Boolean);
  if (!url || !publishableKey || !secretKey || (!emailAllowlist.length && !phoneAllowlist.length)) return { error: response({ error: "Admin access is not configured on this deployment." }, 503) };
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: response({ error: "Sign in to continue." }, 401) };
  const authClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: response({ error: "Your session is invalid or expired." }, 401) };
  const verifiedEmailAdmin = Boolean(data.user.email && data.user.email_confirmed_at && emailAllowlist.includes(data.user.email.toLowerCase()));
  const verifiedPhoneAdmin = Boolean(data.user.phone && data.user.phone_confirmed_at && phoneAllowlist.includes(normalizePhone(data.user.phone)));
  if (!verifiedEmailAdmin && !verifiedPhoneAdmin) return { error: response({ error: "This account is not authorized to manage music settings." }, 403) };
  return { database: createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } }), email: data.user.email || data.user.phone };
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
