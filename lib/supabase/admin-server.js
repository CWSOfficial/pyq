import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const normalizePhone = (value = "") => {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
};

export const adminResponse = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function authorizeAdmin(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailAllowlist = (process.env.PYQ_ADMIN_EMAILS || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const phoneAllowlist = (process.env.PYQ_ADMIN_PHONES || "").split(",").map(normalizePhone).filter(Boolean);
  if (!url || !publishableKey || !secretKey || (!emailAllowlist.length && !phoneAllowlist.length)) {
    return { error: adminResponse({ error: "Admin management needs Supabase server credentials and an admin allowlist." }, 503) };
  }

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: adminResponse({ error: "Sign in to continue." }, 401) };
  const authClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: adminResponse({ error: "Your session is invalid or expired." }, 401) };
  const user = data.user;
  const verifiedEmail = Boolean(user.email && user.email_confirmed_at && emailAllowlist.includes(user.email.toLowerCase()));
  const verifiedPhone = Boolean(user.phone && user.phone_confirmed_at && phoneAllowlist.includes(normalizePhone(user.phone)));
  if (!verifiedEmail && !verifiedPhone) return { error: adminResponse({ error: "This account is not authorized to manage users or practice catalogues." }, 403) };
  return {
    database: createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }),
    user,
    emailAllowlist,
    phoneAllowlist,
  };
}
