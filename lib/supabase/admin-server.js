import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const adminResponse = (body, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function authorizeAdmin(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !publishableKey || !secretKey) {
    return { error: adminResponse({ error: "Admin management needs Supabase server credentials." }, 503) };
  }

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: adminResponse({ error: "Sign in to continue." }, 401) };
  const authClient = createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: adminResponse({ error: "Your session is invalid or expired." }, 401) };
  const user = data.user;
  if (!user.email_confirmed_at && !user.phone_confirmed_at) {
    return { error: adminResponse({ error: "Verify your email or phone before using the admin panel." }, 403) };
  }
  const database = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const { data: profile, error: profileError } = await database.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profileError) return { error: adminResponse({ error: "Could not verify this account’s Supabase role. Apply the profile role migration first." }, 503) };
  if (profile?.role !== "admin") return { error: adminResponse({ error: "This account does not have the admin role." }, 403) };
  return {
    database,
    user,
    role: profile.role,
    adminEmail: user.email || user.phone || user.id,
  };
}
