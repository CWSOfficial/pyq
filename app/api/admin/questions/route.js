import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 8 * 1024 * 1024;
const MAX_BULK_QUESTIONS = 500;
const UUID_NAMESPACE = Buffer.from("9a7d3b18e42d4c89a9c1730f5c4b28d1", "hex");

function response(body, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function getConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const emailAllowlist = (process.env.PYQ_ADMIN_EMAILS || "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const phoneAllowlist = (process.env.PYQ_ADMIN_PHONES || "").split(",").map(normalizePhone).filter(Boolean);
  if (!url || !publishableKey || !secretKey || (!emailAllowlist.length && !phoneAllowlist.length)) return null;
  return { url, publishableKey, secretKey, emailAllowlist, phoneAllowlist };
}

function normalizePhone(value = "") {
  const digits = String(value).replace(/\D/g, "");
  return digits.length === 10 ? `91${digits}` : digits;
}

async function authorize(request) {
  const config = getConfiguration();
  if (!config) return { error: response({ error: "Admin access is not configured on this deployment." }, 503) };
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return { error: response({ error: "Sign in to continue." }, 401) };

  const authClient = createClient(config.url, config.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return { error: response({ error: "Your session is invalid or expired. Sign in again." }, 401) };
  const verifiedEmailAdmin = Boolean(data.user.email && data.user.email_confirmed_at && config.emailAllowlist.includes(data.user.email.toLowerCase()));
  const verifiedPhoneAdmin = Boolean(data.user.phone && data.user.phone_confirmed_at && config.phoneAllowlist.includes(normalizePhone(data.user.phone)));
  if (!verifiedEmailAdmin && !verifiedPhoneAdmin) {
    return { error: response({ error: "This account is not authorized to use the admin panel." }, 403) };
  }

  const database = createClient(config.url, config.secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return { database, adminEmail: data.user.email || data.user.phone };
}

function deterministicUuid(sourceId) {
  const digest = createHash("sha1").update(UUID_NAMESPACE).update(sourceId).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const hex = digest.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function cleanString(value, maximum = 12000) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maximum);
}

function plainText(html) {
  return cleanString(html)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/p\s*>/gi, "\n\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

function questionFromSource(item, sectionName, index) {
  const english = item?.content?.en;
  const subject = cleanString(item?.pyq?.subject?.title || item?.subject, 120);
  const topic = cleanString(item?.pyq?.topic?.title || item?.topic || sectionName || "General Studies", 200);
  const year = Number(item?.pyq?.year || item?.year);
  const options = Array.isArray(english?.options) ? english.options.map((option) => cleanString(option, 1500)) : item?.options;
  const answers = Array.isArray(item?.correctOptionIndexes) ? item.correctOptionIndexes : [item?.answer ?? item?.correct_option];
  const correctOption = Number(answers?.[0]);
  const prompt = cleanString(english?.text || item?.prompt, 6000);
  if (!subject || !topic || !Number.isInteger(year) || year < 1900 || year > 2100 || !prompt || !Array.isArray(options) || options.length !== 4 || options.some((option) => !option) || !Number.isInteger(correctOption) || correctOption < 0 || correctOption > 3) {
    throw new Error(`Question ${index + 1} is missing a valid subject, year, topic, four options, prompt, or correct answer.`);
  }

  const questionNumber = Number(item?.pyq?.number ?? item?.question_number);
  const sourceId = cleanString(item?.id, 200);
  return {
    id: sourceId ? deterministicUuid(sourceId) : undefined,
    subject,
    year,
    exam: cleanString(item?.exam, 120) || "UPSC CSE Prelims",
    topic,
    prompt,
    options,
    correct_option: correctOption,
    explanation: plainText(english?.explanation || item?.explanation || ""),
    question_number: Number.isInteger(questionNumber) && questionNumber > 0 && questionNumber <= 32767 ? questionNumber : null,
  };
}


async function readBoundedJson(request) {
  const reader = request.body?.getReader();
  if (!reader) return {};
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new Error("UPLOAD_TOO_LARGE");
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text || "{}");
}

function parseInput(body) {
  if (body?.type === "single") {
    const row = questionFromSource(body.question, "", 0);
    row.id = undefined;
    return [row];
  }
  const sections = Array.isArray(body?.source?.sections) ? body.source.sections : Array.isArray(body?.sections) ? body.sections : null;
  const sourceQuestions = sections
    ? sections.flatMap((section) => (Array.isArray(section?.questions) ? section.questions.map((question) => ({ question, sectionName: section.name })) : []))
    : Array.isArray(body?.questions) ? body.questions.map((question) => ({ question, sectionName: "" })) : null;
  if (!sourceQuestions?.length) throw new Error("The JSON file does not contain any question sections.");
  if (sourceQuestions.length > MAX_BULK_QUESTIONS) throw new Error(`A single import can include at most ${MAX_BULK_QUESTIONS} questions.`);
  return sourceQuestions.map(({ question, sectionName }, index) => questionFromSource(question, sectionName, index));
}

export async function GET(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const { searchParams } = new URL(request.url);
  const page = Math.max(0, Math.min(10000, Number.parseInt(searchParams.get("page") || "0", 10) || 0));
  const start = page * 25;
  let query = auth.database.from("questions")
    .select("id, subject, year, exam, topic, prompt, options, correct_option, explanation, question_number, created_at", { count: "exact" });
  const year = searchParams.get("year");
  const subject = searchParams.get("subject")?.trim();
  const search = searchParams.get("q")?.trim();
  if (year && /^\d{4}$/.test(year)) query = query.eq("year", Number(year));
  if (subject) query = query.ilike("subject", `%${subject.replace(/[%_,]/g, " ")}%`);
  if (search) {
    const safeSearch = search.replace(/[^\p{L}\p{N}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
    query = query.or(`prompt.ilike.%${safeSearch}%,topic.ilike.%${safeSearch}%,exam.ilike.%${safeSearch}%`);
  }
  const { data, error, count } = await query
    .order("year", { ascending: false }).order("question_number", { ascending: true, nullsFirst: false })
    .range(start, start + 24);
  if (error) return response({ error: "Could not load the question bank. Check the database setup." }, 500);
  return response({ count: count ?? 0, page, questions: data ?? [] });
}

export async function PATCH(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return response({ error: "Choose a valid question." }, 400);
  let body;
  try { body = await readBoundedJson(request); }
  catch { return response({ error: "The request body must be valid JSON." }, 400); }
  let row;
  try { row = questionFromSource(body?.question, "", 0); }
  catch (error) { return response({ error: error.message }, 400); }
  row.id = id;
  const { error } = await auth.database.from("questions").update(row).eq("id", id);
  if (error) return response({ error: "Could not update this question. Confirm the database schema is configured." }, 500);
  console.info("Admin question update completed", { adminEmail: auth.adminEmail, questionId: id });
  return response({ updated: true });
}

export async function POST(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const bodySize = Number(request.headers.get("content-length") || 0);
  if (bodySize > MAX_BODY_BYTES) return response({ error: "The upload is too large. Keep JSON imports under 8 MB." }, 413);

  let body;
  try { body = await readBoundedJson(request); }
  catch (error) {
    if (error.message === "UPLOAD_TOO_LARGE") return response({ error: "The upload is too large. Keep JSON imports under 8 MB." }, 413);
    return response({ error: "The request body must be valid JSON." }, 400);
  }
  let rows;
  try { rows = parseInput(body); } catch (error) { return response({ error: error.message }, 400); }

  const { data, error } = await auth.database.from("questions").upsert(rows, { onConflict: "id" }).select("id");
  if (error) return response({ error: "Could not save questions. Confirm the database schema and server secret are configured." }, 500);
  console.info("Admin question write completed", { adminEmail: auth.adminEmail, count: data?.length ?? rows.length });
  return response({ saved: data?.length ?? rows.length });
}

export async function DELETE(request) {
  const auth = await authorize(request);
  if (auth.error) return auth.error;
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return response({ error: "Choose a valid question." }, 400);

  const [bookmarks, attempts] = await Promise.all([
    auth.database.from("bookmarks").select("id", { count: "exact", head: true }).eq("question_id", id),
    auth.database.from("question_attempts").select("id", { count: "exact", head: true }).eq("question_id", id),
  ]);
  if (bookmarks.error || attempts.error) return response({ error: "Could not check whether students have saved this question." }, 500);
  if ((bookmarks.count || 0) > 0 || (attempts.count || 0) > 0) return response({ error: "This question is linked to student bookmarks or attempts, so it cannot be removed." }, 409);

  const { error } = await auth.database.from("questions").delete().eq("id", id);
  if (error) return response({ error: "Could not remove the question." }, 500);
  console.info("Admin question removal completed", { adminEmail: auth.adminEmail, questionId: id });
  return response({ removed: true });
}
