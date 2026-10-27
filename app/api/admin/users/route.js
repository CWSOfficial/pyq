import { adminResponse, authorizeAdmin } from "../../../../lib/supabase/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const normalizePhone = (value = "") => { const digits = String(value).replace(/\D/g, ""); return digits.length === 10 ? `91${digits}` : digits; };
const cleanName = (value) => typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";

export async function GET(request) {
  const auth = await authorizeAdmin(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") || "1", 10) || 1);
  const perPage = Math.max(1, Math.min(100, Number.parseInt(searchParams.get("perPage") || "25", 10) || 25));
  try {
    const { data, error } = await auth.database.auth.admin.listUsers({ page, perPage });
    if (error) return adminResponse({ error: "Could not load registered accounts." }, 500);
    const users = data?.users || [];
    const ids = users.map((user) => user.id);
    const { data: profiles, error: profilesError } = ids.length
      ? await auth.database.from("profiles").select("id, full_name").in("id", ids)
      : { data: [], error: null };
    if (profilesError) return adminResponse({ error: "Could not load profile details." }, 500);
    const names = new Map((profiles || []).map((profile) => [profile.id, profile.full_name]));
    const search = (searchParams.get("q") || "").trim().toLowerCase();
    const rows = users.map((user) => ({
      id: user.id,
      email: user.email || "",
      phone: user.phone || "",
      fullName: names.get(user.id) || user.user_metadata?.full_name || user.user_metadata?.name || "",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at || null,
      confirmed: Boolean(user.email_confirmed_at || user.phone_confirmed_at),
      isAdmin: Boolean((user.email && auth.emailAllowlist.includes(user.email.toLowerCase())) || (user.phone && auth.phoneAllowlist.includes(normalizePhone(user.phone)))),
    })).filter((user) => !search || `${user.fullName} ${user.email} ${user.phone}`.toLowerCase().includes(search));
    return adminResponse({ users: rows, page, perPage, total: data?.total || null, hasMore: users.length === perPage });
  } catch { return adminResponse({ error: "Could not load registered accounts." }, 500); }
}

export async function PATCH(request) {
  const auth = await authorizeAdmin(request);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!uuidPattern.test(id)) return adminResponse({ error: "Choose a valid user profile." }, 400);
  let body;
  try { body = await request.json(); } catch { return adminResponse({ error: "Provide valid JSON." }, 400); }
  const fullName = cleanName(body?.full_name);
  if (!fullName) return adminResponse({ error: "A user's name cannot be empty." }, 400);
  const { data: found, error: findError } = await auth.database.auth.admin.getUserById(id);
  if (findError || !found?.user) return adminResponse({ error: "This user account was not found." }, 404);
  const { data, error } = await auth.database.auth.admin.updateUserById(id, {
    user_metadata: { ...(found.user.user_metadata || {}), full_name: fullName },
  });
  if (error) return adminResponse({ error: "Could not update this account profile." }, 500);
  const { error: profileError } = await auth.database.from("profiles").upsert({ id, email: data.user.email || null, full_name: fullName, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (profileError) return adminResponse({ error: "The account name changed, but profile sync failed." }, 500);
  return adminResponse({ updated: true, user: { id, fullName } });
}

export async function DELETE(request) {
  const auth = await authorizeAdmin(request);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!uuidPattern.test(id)) return adminResponse({ error: "Choose a valid user profile." }, 400);
  if (id === auth.user.id) return adminResponse({ error: "You cannot delete the admin account currently signed in." }, 400);
  const { data: found, error: findError } = await auth.database.auth.admin.getUserById(id);
  if (findError || !found?.user) return adminResponse({ error: "This user account was not found." }, 404);
  const target = found.user;
  const targetIsAdmin = Boolean((target.email && auth.emailAllowlist.includes(target.email.toLowerCase())) || (target.phone && auth.phoneAllowlist.includes(normalizePhone(target.phone))));
  if (targetIsAdmin) return adminResponse({ error: "Admin accounts are protected from deletion in this panel." }, 403);
  const { error } = await auth.database.auth.admin.deleteUser(id);
  if (error) return adminResponse({ error: "Could not delete this user account." }, 500);
  console.info("Admin deleted a user account", { admin: auth.user.email || auth.user.phone, userId: id });
  return adminResponse({ deleted: true });
}
