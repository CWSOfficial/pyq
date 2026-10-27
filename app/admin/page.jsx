"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";

const AUTH_DEMO_MODE = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === "true";
const DEMO_USER_KEY = "pyq-demo-user";
const DEMO_QUESTIONS_KEY = "pyq-demo-questions";
const DEMO_MUSIC_KEY = "pyq-demo-music";
const DEMO_CATALOG_KEY = "pyq-demo-catalog";
const DEFAULT_SUBJECTS = ["Polity", "Economy", "Geography", "History", "Art and Culture", "International relations", "Science and Technology", "Environment", "Current Affairs", "Miscellaneous"];
const DEFAULT_YEARS = Array.from({ length: 16 }, (_, index) => String(2026 - index));
const BUILT_IN_MUSIC = [
  { label: "Cloud Focus", url: "/audio/cloud-soft-focus.wav" },
  { label: "Evening Piano", url: "/audio/cloud-evening-piano.wav" },
  { label: "Classic Focus", url: "/audio/pyq-focus.wav" },
];
const DEMO_ADMIN_PHONES = new Set((process.env.NEXT_PUBLIC_DEMO_ADMIN_PHONES || "").split(",").map((value) => value.replace(/\D/g, "")).map((digits) => digits.length === 10 ? `91${digits}` : digits).filter(Boolean));

function isDemoAdmin(user) {
  const digits = String(user?.phone || "").replace(/\D/g, "");
  const normalizedPhone = digits.length === 10 ? `91${digits}` : digits;
  return Boolean(user?.is_demo && (user.email === "pyqcloud@gmail.com" || DEMO_ADMIN_PHONES.has(normalizedPhone)));
}

function demoQuestion(item, index = 0) {
  const english = item?.content?.en;
  const options = english?.options || item?.options || [];
  const answers = item?.correctOptionIndexes || [item?.answer ?? item?.correct_option];
  const question = { id: item?.id && /^[0-9a-f-]{36}$/i.test(item.id) ? item.id : crypto.randomUUID(), subject: item?.pyq?.subject?.title || item?.subject || "", year: Number(item?.pyq?.year || item?.year), exam: item?.exam || "UPSC CSE Prelims", topic: item?.pyq?.topic?.title || item?.topic || "General Studies", prompt: english?.text || item?.prompt || "", options, correct_option: Number(answers?.[0]), explanation: english?.explanation || item?.explanation || "", question_number: Number(item?.pyq?.number || item?.question_number) || index + 1 };
  if (!question.subject.trim() || !Number.isInteger(question.year) || question.year < 1900 || question.year > 2100 || !question.prompt.trim() || !Array.isArray(options) || options.length !== 4 || options.some((option) => !String(option).trim()) || !Number.isInteger(question.correct_option) || question.correct_option < 0 || question.correct_option > 3) throw new Error(`Question ${index + 1} needs a subject, valid year, prompt, four options and a correct answer.`);
  return { ...question, options: options.map((option) => String(option).trim()) };
}

const emptyQuestion = { subject: "", year: new Date().getFullYear(), topic: "", prompt: "", options: ["", "", "", ""], correct_option: 0, explanation: "", question_number: "" };

function parseCsv(text) {
  const rows = []; let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"' && quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) { if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ""; }
    else cell += char;
  }
  row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
  if (rows.length < 2) throw new Error("CSV must include a header row and at least one question.");
  const headers = rows.shift().map((header) => header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""));
  const pick = (record, ...keys) => keys.map((key) => record[key]).find((value) => value !== undefined && value !== "") || "";
  return { questions: rows.map((values) => {
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
    const options = Array.isArray(record.options) ? record.options : [pick(record,"option_a","a"),pick(record,"option_b","b"),pick(record,"option_c","c"),pick(record,"option_d","d")];
    const answer = pick(record,"correct_option","answer","correct_answer").toUpperCase();
    return { subject: pick(record,"subject"), year: Number(pick(record,"year")), topic: pick(record,"topic"), exam: pick(record,"exam"), prompt: pick(record,"prompt","question","question_text"), options, correct_option: /^[A-D]$/.test(answer) ? answer.charCodeAt(0) - 65 : Number(answer), explanation: pick(record,"explanation"), question_number: Number(pick(record,"question_number","number")) || null };
  }) };
}

function getImportQuestions(payload) {
  if (Array.isArray(payload?.sections)) return payload.sections.flatMap((section) => Array.isArray(section.questions) ? section.questions : []);
  return Array.isArray(payload?.questions) ? payload.questions : [];
}

function titleOf(question) {
  return question?.content?.en?.text || question?.prompt || "Question text is missing";
}

export default function AdminPage() {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState("checking");
  const [authError, setAuthError] = useState("");
  const [session, setSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(emptyQuestion);
  const [sourceFile, setSourceFile] = useState(null);
  const [sourceData, setSourceData] = useState(null);
  const [sourceError, setSourceError] = useState("");
  const [editingId, setEditingId] = useState("");
  const [filters, setFilters] = useState({ q: "", subject: "", year: "" });
  const [appliedFilters, setAppliedFilters] = useState({ q: "", subject: "", year: "" });
  const [musicSettings, setMusicSettings] = useState({ enabled: true, trackUrl: "/audio/cloud-soft-focus.wav", volume: 0.28 });
  const [musicBusy, setMusicBusy] = useState(false);
  const [demoAdmin, setDemoAdmin] = useState(false);
  const [catalog, setCatalog] = useState({ subjects: [], years: [] });
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [catalogError, setCatalogError] = useState("");
  const [catalogDraft, setCatalogDraft] = useState({ subject: "", year: "" });
  const [users, setUsers] = useState([]);
  const [usersBusy, setUsersBusy] = useState(false);
  const [usersError, setUsersError] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [editingUserName, setEditingUserName] = useState("");

  const request = useCallback(async (url, options = {}) => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken && AUTH_DEMO_MODE) {
      const demoUser = JSON.parse(localStorage.getItem(DEMO_USER_KEY) || "null");
      if (!isDemoAdmin(demoUser)) throw new Error("Sign in with an authorized local demo admin account to manage the demo question bank.");
      const parsedUrl = new URL(url, window.location.origin);
      const storedRows = localStorage.getItem(DEMO_QUESTIONS_KEY);
      let rows = storedRows ? JSON.parse(storedRows) : [];
      if (!storedRows && parsedUrl.pathname === "/api/admin/questions") {
        rows = [];
        for (let offset = 0; offset < 5000; offset += 1000) {
          const { data, error } = await supabase.from("questions")
            .select("id, subject, year, exam, topic, prompt, options, correct_option, explanation, question_number")
            .order("year", { ascending: false }).order("question_number", { ascending: true, nullsFirst: false })
            .range(offset, offset + 999);
          if (error) throw new Error("Could not load the Supabase question bank for this demo.");
          rows.push(...(data || []));
          if ((data || []).length < 1000) break;
        }
        localStorage.setItem(DEMO_QUESTIONS_KEY, JSON.stringify(rows));
      }
      const body = JSON.parse(options.body || "{}");
      if (parsedUrl.pathname === "/api/admin/users") throw new Error("Registered user records are not available in local demo mode. Configure the Supabase server key to manage real accounts.");
      if (parsedUrl.pathname === "/api/admin/catalog") {
        const readDemoCatalog = () => {
          const saved = JSON.parse(localStorage.getItem(DEMO_CATALOG_KEY) || "null") || {};
          const merge = (defaults, dynamic, overrides, kind) => {
            const values = new Map();
            [...defaults, ...dynamic].forEach((value) => {
              const name = String(value || "").trim();
              if (!name) return;
              const key = name.toLowerCase();
              const count = rows.filter((question) => String(kind === "subject" ? question.subject : question.year).toLowerCase() === key).length;
              values.set(key, { value: name, active: true, questionCount: count });
            });
            (Array.isArray(overrides) ? overrides : []).forEach((item) => {
              const name = String(item?.value || "").trim();
              if (name) values.set(name.toLowerCase(), { ...values.get(name.toLowerCase()), value: name, active: item.active !== false, questionCount: values.get(name.toLowerCase())?.questionCount || 0 });
            });
            const list = [...values.values()];
            return kind === "year" ? list.sort((a, b) => Number(b.value) - Number(a.value)) : list.sort((a, b) => a.value.localeCompare(b.value));
          };
          return {
            subjects: merge(DEFAULT_SUBJECTS, rows.map((item) => item.subject), saved.subjects, "subject"),
            years: merge(DEFAULT_YEARS, rows.map((item) => String(item.year)), saved.years, "year"),
          };
        };
        let current = readDemoCatalog();
        if (!options.method || options.method === "GET") return current;
        const kind = body.kind || parsedUrl.searchParams.get("kind");
        const value = String(body.value || parsedUrl.searchParams.get("value") || "").trim();
        if (!["subject", "year"].includes(kind) || !value) throw new Error("Choose a valid subject or year.");
        const field = kind === "subject" ? "subjects" : "years";
        const entries = current[field].map((item) => ({ value: item.value, active: item.active }));
        const index = entries.findIndex((item) => item.value.toLowerCase() === value.toLowerCase());
        if (options.method === "POST") {
          if (index < 0) entries.push({ value, active: true }); else entries[index] = { ...entries[index], active: true };
        } else if (options.method === "DELETE") {
          if (index < 0) entries.push({ value, active: false }); else entries[index] = { ...entries[index], active: false };
        } else throw new Error("Unsupported catalogue action.");
        localStorage.setItem(DEMO_CATALOG_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(DEMO_CATALOG_KEY) || "{}"), [field]: entries }));
        current = readDemoCatalog();
        return current;
      }
      if (parsedUrl.pathname === "/api/admin/settings/music" && options.method === "PUT") {
        const trackUrl = typeof body.trackUrl === "string" ? body.trackUrl.trim() : "";
        if (!trackUrl || !(/^(\/|https:\/\/)/i.test(trackUrl)) || /^(\/\/|javascript:)/i.test(trackUrl)) throw new Error("Use a local /audio file path or a secure https audio URL.");
        const settings = { enabled: Boolean(body.enabled), trackUrl, volume: Math.max(0, Math.min(1, Number(body.volume) || 0.28)) };
        localStorage.setItem(DEMO_MUSIC_KEY, JSON.stringify(settings)); return settings;
      }
      if (!options.method || options.method === "GET") {
        const pageIndex = Number(parsedUrl.searchParams.get("page") || 0);
        const query = (parsedUrl.searchParams.get("q") || "").toLowerCase();
        const subject = (parsedUrl.searchParams.get("subject") || "").toLowerCase();
        const year = parsedUrl.searchParams.get("year") || "";
        const filtered = rows.filter((question) => (!year || String(question.year) === year) && (!subject || question.subject.toLowerCase().includes(subject)) && (!query || `${question.prompt} ${question.topic} ${question.exam}`.toLowerCase().includes(query)));
        return { questions: filtered.slice(pageIndex * 25, pageIndex * 25 + 25), count: filtered.length, page: pageIndex };
      }
      if (options.method === "POST") {
        const imported = body.type === "single" ? [demoQuestion(body.question)] : getImportQuestions(body.source || body).map(demoQuestion);
        if (imported.length > 500) throw new Error("A single import can include at most 500 questions.");
        const indexed = new Map(rows.map((item) => [item.id, item]));
        imported.forEach((item) => indexed.set(item.id, item)); rows = [...indexed.values()];
        localStorage.setItem(DEMO_QUESTIONS_KEY, JSON.stringify(rows)); return { saved: imported.length };
      }
      const id = parsedUrl.searchParams.get("id");
      if (options.method === "PATCH") {
        const index = rows.findIndex((item) => item.id === id);
        if (index < 0) throw new Error("Question not found in this local demo.");
        rows[index] = { ...demoQuestion(body.question), id }; localStorage.setItem(DEMO_QUESTIONS_KEY, JSON.stringify(rows)); return { updated: true };
      }
      if (options.method === "DELETE") { rows = rows.filter((item) => item.id !== id); localStorage.setItem(DEMO_QUESTIONS_KEY, JSON.stringify(rows)); return { removed: true }; }
      throw new Error("Unsupported local demo action.");
    }
    if (!accessToken) throw new Error("Sign in to continue.");
    const result = await fetch(url, {
      ...options,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...options.headers },
      cache: "no-store",
    });
    const payload = await result.json().catch(() => ({}));
    if (!result.ok) {
      const error = new Error(payload.error || "The request could not be completed.");
      error.status = result.status;
      throw error;
    }
    return payload;
  }, [supabase]);

  const loadQuestions = useCallback(async (requestedPage = 0, checkAccess = false, filterSet = appliedFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(requestedPage) });
      Object.entries(filterSet).forEach(([key, value]) => { if (value) params.set(key, value); });
      const result = await request(`/api/admin/questions?${params}`);
      setQuestions(result.questions || []);
      setQuestionCount(result.count || 0);
      setPage(result.page || 0);
      if (checkAccess) setStatus("authorized");
      setAuthError("");
    } catch (error) {
      if (checkAccess || error.status === 401 || error.status === 403 || error.status === 503) {
        setStatus("blocked");
        setAuthError(error.message);
      } else setNotice(error.message);
    } finally { setLoading(false); }
  }, [request, appliedFilters]);

  const loadCatalog = useCallback(async () => {
    setCatalogBusy(true);
    setCatalogError("");
    try { setCatalog(await request("/api/admin/catalog")); }
    catch (error) { setCatalogError(error.message); }
    finally { setCatalogBusy(false); }
  }, [request]);

  const loadUsers = useCallback(async (requestedPage = usersPage, query = userSearch) => {
    setUsersBusy(true);
    setUsersError("");
    try {
      const params = new URLSearchParams({ page: String(requestedPage), perPage: "25" });
      if (query.trim()) params.set("q", query.trim());
      const result = await request(`/api/admin/users?${params}`);
      setUsers(result.users || []);
      setUsersPage(result.page || requestedPage);
      setUsersHasMore(Boolean(result.hasMore));
    } catch (error) { setUsers([]); setUsersError(error.message); }
    finally { setUsersBusy(false); }
  }, [request, usersPage, userSearch]);

  const saveCatalogItem = async (kind, value) => {
    const cleanValue = String(value || "").trim();
    if (!cleanValue) return setCatalogError(kind === "subject" ? "Enter a subject name." : "Enter a year.");
    setCatalogBusy(true); setCatalogError("");
    try {
      const result = await request("/api/admin/catalog", { method: "POST", body: JSON.stringify({ kind, value: cleanValue }) });
      setCatalog(result);
      setCatalogDraft((current) => ({ ...current, [kind]: "" }));
      setNotice(`${kind === "subject" ? "Subject" : "Year"} added to practice selection.`);
    } catch (error) { setCatalogError(error.message); }
    finally { setCatalogBusy(false); }
  };

  const setCatalogItemActive = async (kind, value, active) => {
    setCatalogBusy(true); setCatalogError("");
    try {
      const result = active
        ? await request("/api/admin/catalog", { method: "POST", body: JSON.stringify({ kind, value }) })
        : await request(`/api/admin/catalog?kind=${encodeURIComponent(kind)}&value=${encodeURIComponent(value)}`, { method: "DELETE" });
      setCatalog(result);
      setNotice(active ? `${value} restored to practice selection.` : `${value} removed from practice selection. Existing questions are preserved.`);
    } catch (error) { setCatalogError(error.message); }
    finally { setCatalogBusy(false); }
  };

  const saveUserName = async (event) => {
    event.preventDefault();
    if (!editingUser) return;
    setUsersBusy(true); setUsersError("");
    try {
      await request(`/api/admin/users?id=${encodeURIComponent(editingUser.id)}`, { method: "PATCH", body: JSON.stringify({ full_name: editingUserName }) });
      setEditingUser(null);
      setNotice("User profile updated.");
      await loadUsers(usersPage, userSearch);
    } catch (error) { setUsersError(error.message); }
    finally { setUsersBusy(false); }
  };

  const removeUser = async (user) => {
    if (user.isAdmin) return setUsersError("Admin accounts are protected from deletion.");
    if (!window.confirm(`Permanently delete ${user.fullName || user.email || user.phone || "this user"} and their account data? This cannot be undone.`)) return;
    setUsersBusy(true); setUsersError("");
    try {
      await request(`/api/admin/users?id=${encodeURIComponent(user.id)}`, { method: "DELETE" });
      setNotice("User account deleted.");
      await loadUsers(usersPage, userSearch);
    } catch (error) { setUsersError(error.message); }
    finally { setUsersBusy(false); }
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (!data.session) {
        const demoUser = AUTH_DEMO_MODE ? JSON.parse(localStorage.getItem(DEMO_USER_KEY) || "null") : null;
        if (isDemoAdmin(demoUser)) {
          setDemoAdmin(true); setSession({ user: { email: demoUser.email, phone: demoUser.phone } }); loadQuestions(0, true); loadCatalog(); return;
        }
        setStatus("blocked");
        setAuthError("Sign in with an authorized admin account to manage questions.");
      } else { loadQuestions(0, true); loadCatalog(); }
    }).catch(() => {
      if (active) { setStatus("blocked"); setAuthError("Could not verify the current session. Please sign in again."); }
    });
    return () => { active = false; };
  }, [loadQuestions, loadCatalog, supabase]);

  useEffect(() => { fetch("/api/settings/music", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((settings) => { if (settings) setMusicSettings(settings); }).catch(() => {}); }, []);

  const updateOption = (index, value) => setForm((current) => ({ ...current, options: current.options.map((option, position) => position === index ? value : option) }));

  const saveQuestion = async (event) => {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      const question = { ...form, question_number: form.question_number ? Number(form.question_number) : null };
      const result = editingId
        ? await request(`/api/admin/questions?id=${encodeURIComponent(editingId)}`, { method: "PATCH", body: JSON.stringify({ question }) })
        : await request("/api/admin/questions", { method: "POST", body: JSON.stringify({ type: "single", question }) });
      setNotice(editingId ? "Question updated." : `Question saved. ${result.saved} record added.`);
      setEditingId("");
      setForm({ ...emptyQuestion, year: new Date().getFullYear() });
      await loadQuestions(0);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const readQuestionFile = async (file) => {
    setSourceError("");
    setSourceFile(file || null);
    setSourceData(null);
    if (!file) return;
    if (!/\.(json|csv)$/i.test(file.name) || file.size > 8 * 1024 * 1024) {
      setSourceError("Choose a JSON or CSV file smaller than 8 MB.");
      return;
    }
    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith(".csv") ? parseCsv(text) : JSON.parse(text);
      const count = getImportQuestions(parsed).length;
      if (!count) throw new Error("No question sections were found in the selected JSON file.");
      if (count > 500) throw new Error("This import supports up to 500 questions at a time.");
      setSourceData(parsed);
    } catch (error) { setSourceError(error.message || "The selected file is not valid JSON or CSV."); }
  };

  const loadProvidedFile = async () => {
    setSourceError("");
    setBusy(true);
    try {
      const response = await fetch("/data/pyq-2026.json", { cache: "no-store" });
      if (!response.ok) throw new Error("The provided 2026 question file is missing from this deployment.");
      const parsed = await response.json();
      setSourceData(parsed);
      setSourceFile(null);
    } catch (error) { setSourceError(error.message); }
    finally { setBusy(false); }
  };

  const importQuestions = async () => {
    if (!sourceData) return;
    const total = getImportQuestions(sourceData).length;
    setBusy(true);
    setNotice("");
    try {
      const result = await request("/api/admin/questions", { method: "POST", body: JSON.stringify({ type: "bulk", source: sourceData }) });
      setNotice(`${result.saved} questions imported or updated from ${total} source records.`);
      setSourceData(null);
      setSourceFile(null);
      await loadQuestions(0);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const saveMusicSettings = async () => {
    setMusicBusy(true);
    try {
      const result = await request("/api/admin/settings/music", { method: "PUT", body: JSON.stringify(musicSettings) });
      setMusicSettings(result); setNotice("Music settings saved for the app.");
    } catch (error) { setNotice(error.message); }
    finally { setMusicBusy(false); }
  };

  const removeQuestion = async (question) => {
    if (!window.confirm(`Remove this question? If students have bookmarked or attempted it, removal will be blocked to protect their records.\n\n${question.prompt.slice(0, 180)}`)) return;
    setBusy(true);
    setNotice("");
    try {
      await request(`/api/admin/questions?id=${encodeURIComponent(question.id)}`, { method: "DELETE" });
      setNotice("Question removed.");
      await loadQuestions(page);
    } catch (error) { setNotice(error.message); }
    finally { setBusy(false); }
  };

  const editQuestion = (question) => {
    setEditingId(question.id);
    setForm({ subject: question.subject, year: question.year, topic: question.topic, prompt: question.prompt, options: question.options || ["", "", "", ""], correct_option: question.correct_option, explanation: question.explanation || "", question_number: question.question_number || "" });
    document.getElementById("admin-question-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const restartAdminSignIn = async () => {
    if (session) {
      const { error } = await supabase.auth.signOut();
      if (error) { setAuthError("Could not sign out this account. Please sign out in the app and try again."); return; }
    }
    localStorage.removeItem(DEMO_USER_KEY);
    window.location.assign("/?screen=Welcome&next=%2Fadmin");
  };

  if (status === "checking") return <main className="admin-screen"><div className="admin-loading">Verifying admin access…</div></main>;
  if (status === "blocked") return <main className="admin-screen"><section className="admin-access-card"><a href="/" className="admin-brand">PYQ <span>CLOUD</span></a><div className="admin-lock">⚙</div><h1>Admin access required</h1><p>{authError}</p><p>Continue with an account on the server’s verified email or phone admin allowlist.</p><button className="admin-button primary" onClick={restartAdminSignIn}>{session ? "Switch account and sign in" : "Sign in as admin"}</button><small>After a successful admin sign-in, you’ll return to this panel.</small></section></main>;

  return <main className="admin-screen">
    <header className="admin-topbar"><a href="/" className="admin-brand">PYQ <span>CLOUD</span></a><div className="admin-topbar-actions"><span>{session?.user?.email || session?.user?.phone}</span><button className="admin-button secondary" onClick={() => window.location.assign("/")}>Back to app</button></div></header>
    <div className="admin-layout">
      <aside className="admin-sidebar"><small>WORKSPACE</small><a className="active" href="#questions">Question bank</a><a href="#catalog">Subjects &amp; years</a><a href="#users">User accounts</a><span>Signed in as admin</span></aside>
      <section className="admin-content">
        <div className="admin-heading"><div><span className="admin-eyebrow">ADMINISTRATION</span><h1>Question bank</h1><p>Add questions manually or import a validated JSON question set.</p></div><div className="admin-count"><strong>{questionCount.toLocaleString()}</strong><span>questions</span></div></div>
        {notice && <div className="admin-notice" role="status">{notice}<button aria-label="Dismiss message" onClick={() => setNotice("")}>×</button></div>}
        <div className="admin-work-grid">
          <section className="admin-card admin-import-card"><div className="admin-card-heading"><span className="admin-card-icon">⇧</span><div><h2>Import a question file</h2><p>Upload an app JSON export or use the supplied 2026 set.</p></div></div>
            <button className="admin-button secondary full" type="button" onClick={loadProvidedFile} disabled={busy}>Load the supplied 2026 questions</button>
            <label className="admin-file-picker">Or choose a JSON or CSV file<input type="file" accept="application/json,.json,text/csv,.csv" onChange={(event) => readQuestionFile(event.target.files?.[0])} /></label>
            {sourceFile && <p className="admin-file-name">Selected: {sourceFile.name}</p>}
            {sourceError && <p className="admin-field-error" role="alert">{sourceError}</p>}
            {sourceData && <div className="admin-import-preview"><b>{getImportQuestions(sourceData).length} questions ready</b><span>Questions are validated and saved with stable IDs, so importing the same file again updates those records instead of duplicating them.</span><ul>{getImportQuestions(sourceData).slice(0, 3).map((question, index) => <li key={question.id || index}>{titleOf(question)}</li>)}</ul><button className="admin-button primary full" onClick={importQuestions} disabled={busy}>{busy ? "Importing…" : `Import ${getImportQuestions(sourceData).length} questions`}</button></div>}
          </section>

          <section className="admin-card" id="admin-question-form"><div className="admin-card-heading"><span className="admin-card-icon">{editingId ? "✎" : "＋"}</span><div><h2>{editingId ? "Edit question" : "Add a question"}</h2><p>Enter one four-option multiple-choice question.</p></div>{editingId && <button type="button" className="admin-button secondary" onClick={() => { setEditingId(""); setForm(emptyQuestion); }}>Cancel edit</button>}</div>
            <form className="admin-question-form" onSubmit={saveQuestion}>
              <div className="admin-form-row"><label>Subject<input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} maxLength={120} required placeholder="e.g. Polity & Governance" /></label><label>Year<input type="number" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} min="1900" max="2100" required /></label></div>
              <div className="admin-form-row"><label>Topic<input value={form.topic} onChange={(event) => setForm({ ...form, topic: event.target.value })} maxLength={200} required placeholder="e.g. Fundamental Rights" /></label><label>Question number<input type="number" value={form.question_number} onChange={(event) => setForm({ ...form, question_number: event.target.value })} min="1" max="32767" placeholder="Optional" /></label></div>
              <label>Question<textarea value={form.prompt} onChange={(event) => setForm({ ...form, prompt: event.target.value })} maxLength={6000} required rows={3} placeholder="Enter the question" /></label>
              <fieldset className="admin-options"><legend>Answer options <span>Choose the correct answer</span></legend>{form.options.map((option, index) => <div className="admin-option-row" key={index}><input type="radio" name="correct-option" aria-label={`Mark option ${index + 1} correct`} checked={Number(form.correct_option) === index} onChange={() => setForm({ ...form, correct_option: index })} /><input aria-label={`Option ${index + 1}`} value={option} onChange={(event) => updateOption(index, event.target.value)} maxLength={1500} required placeholder={`Option ${String.fromCharCode(65 + index)}`} /></div>)}</fieldset>
              <label>Explanation<textarea value={form.explanation} onChange={(event) => setForm({ ...form, explanation: event.target.value })} maxLength={12000} rows={3} placeholder="Optional explanation" /></label>
              <button className="admin-button primary full" type="submit" disabled={busy}>{busy ? "Saving…" : editingId ? "Update question" : "Save question"}</button>
            </form>
          </section>
        </div>

        <section className="admin-card admin-music-card"><div className="admin-card-heading"><span className="admin-card-icon">♫</span><div><h2>Focus music</h2><p>Choose the audio played in the app and set its volume.</p></div></div><div className="admin-music-controls"><label className="admin-music-enabled"><input type="checkbox" checked={musicSettings.enabled} onChange={(event) => setMusicSettings({ ...musicSettings, enabled: event.target.checked })} />Enable background music</label><label>Built-in track<select value={BUILT_IN_MUSIC.some((track) => track.url === musicSettings.trackUrl) ? musicSettings.trackUrl : "custom"} onChange={(event) => { if (event.target.value !== "custom") setMusicSettings({ ...musicSettings, trackUrl: event.target.value }); }}><option value="/audio/cloud-soft-focus.wav">Cloud Focus</option><option value="/audio/cloud-evening-piano.wav">Evening Piano</option><option value="/audio/pyq-focus.wav">Classic Focus</option><option value="custom">Custom audio URL</option></select></label><label>Audio file URL<input value={musicSettings.trackUrl} onChange={(event) => setMusicSettings({ ...musicSettings, trackUrl: event.target.value })} placeholder="/audio/pyq-focus.wav or https://…" /></label><label>Volume <span>{Math.round(Number(musicSettings.volume) * 100)}%</span><input type="range" min="0" max="1" step="0.01" value={musicSettings.volume} onChange={(event) => setMusicSettings({ ...musicSettings, volume: Number(event.target.value) })} /></label><button className="admin-button primary" onClick={saveMusicSettings} disabled={musicBusy}>{musicBusy ? "Saving…" : "Save music settings"}</button></div></section>

        <section className="admin-card admin-question-list" id="questions"><div className="admin-list-heading"><div><h2>Question sets</h2><p>Search and manage questions by practice set, subject and year.</p></div><button className="admin-button secondary" onClick={() => loadQuestions(page)} disabled={loading}>{loading ? "Refreshing…" : "Refresh"}</button></div>
          <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setAppliedFilters(filters); loadQuestions(0, false, filters); }}><input aria-label="Search questions or topics" placeholder="Search question, topic or exam" value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} /><input aria-label="Filter by subject" placeholder="Subject" value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })} /><input aria-label="Filter by year" placeholder="Year" inputMode="numeric" maxLength={4} value={filters.year} onChange={(event) => setFilters({ ...filters, year: event.target.value.replace(/\D/g, "").slice(0, 4) })} /><button className="admin-button primary" type="submit" disabled={loading}>Apply filters</button><button className="admin-button secondary" type="button" onClick={() => { const empty = { q: "", subject: "", year: "" }; setFilters(empty); setAppliedFilters(empty); loadQuestions(0, false, empty); }}>Clear</button></form>
          {questions.length ? <div className="admin-table-wrap"><table><thead><tr><th>Question / practice set</th><th>Subject</th><th>Year</th><th>Actions</th></tr></thead><tbody>{questions.map((question) => <tr key={question.id}><td><b>{question.question_number ? `#${question.question_number} ` : ""}{question.prompt}</b><small>{question.exam} · {question.topic}</small></td><td>{question.subject}</td><td>{question.year}</td><td><div className="admin-row-actions"><button className="admin-edit-button" disabled={busy} onClick={() => editQuestion(question)}>Edit</button><button className="admin-remove-button" disabled={busy} onClick={() => removeQuestion(question)}>Remove</button></div></td></tr>)}</tbody></table></div> : <div className="admin-empty">{loading ? "Loading questions…" : "No questions match these filters."}</div>}
          <div className="admin-pagination"><span>Page {page + 1} · {questionCount.toLocaleString()} total</span><div><button className="admin-button secondary" disabled={page === 0 || loading} onClick={() => loadQuestions(page - 1)}>Previous</button><button className="admin-button secondary" disabled={(page + 1) * 25 >= questionCount || loading} onClick={() => loadQuestions(page + 1)}>Next</button></div></div>
        </section>

        <section className="admin-card" id="catalog"><div className="admin-list-heading"><div><h2>Practice subjects &amp; years</h2><p>Add or hide filters shown in Practice by Subject and Practice by Year. Removing an item preserves its questions.</p></div><button className="admin-button secondary" onClick={loadCatalog} disabled={catalogBusy}>{catalogBusy ? "Refreshing…" : "Refresh"}</button></div>
          {catalogError && <p className="admin-field-error" role="alert">{catalogError}</p>}
          <div className="admin-catalog-forms">
            <form onSubmit={(event) => { event.preventDefault(); saveCatalogItem("subject", catalogDraft.subject); }}><label>Add subject<input value={catalogDraft.subject} onChange={(event) => setCatalogDraft({ ...catalogDraft, subject: event.target.value })} maxLength={120} placeholder="e.g. Ethics" /></label><button className="admin-button primary" type="submit" disabled={catalogBusy}>Add subject</button></form>
            <form onSubmit={(event) => { event.preventDefault(); saveCatalogItem("year", catalogDraft.year); }}><label>Add year<input type="number" min="1900" max="2100" value={catalogDraft.year} onChange={(event) => setCatalogDraft({ ...catalogDraft, year: event.target.value })} placeholder="e.g. 2027" /></label><button className="admin-button primary" type="submit" disabled={catalogBusy}>Add year</button></form>
          </div>
          <div className="admin-catalog-grid">
            {[{ kind: "subject", title: "Subjects", rows: catalog.subjects || [] }, { kind: "year", title: "Years", rows: catalog.years || [] }].map((group) => <section className="admin-catalog-list" key={group.kind}><h3>{group.title} <span>{group.rows.filter((item) => item.active).length} active</span></h3>{group.rows.length ? group.rows.map((item) => <div className={`admin-catalog-row ${item.active ? "" : "inactive"}`} key={item.value}><span><b>{item.value}</b><small>{item.questionCount || 0} questions{item.active ? "" : " · hidden from practice"}</small></span><button className={item.active ? "admin-remove-button" : "admin-edit-button"} disabled={catalogBusy} onClick={() => setCatalogItemActive(group.kind, item.value, !item.active)}>{item.active ? "Remove" : "Restore"}</button></div>) : <div className="admin-empty">{catalogBusy ? "Loading catalogue…" : "No items found."}</div>}</section>)}
          </div>
        </section>

        <section className="admin-card" id="users"><div className="admin-list-heading"><div><h2>User accounts</h2><p>View registered profiles, update a name, or permanently remove an account.</p></div><button className="admin-button secondary" onClick={() => loadUsers(1)} disabled={usersBusy}>{usersBusy ? "Loading…" : "Load users"}</button></div>
          {usersError && !demoAdmin && <p className="admin-field-error" role="alert">{usersError}</p>}
          {demoAdmin && <div className="admin-demo-note">Client demo mode: questions start from Supabase, but edits are saved only in this browser. Real user accounts are not available in this demo.</div>}
          <form className="admin-user-search" onSubmit={(event) => { event.preventDefault(); loadUsers(1, userSearch); }}><input aria-label="Search users" placeholder="Search name, email or phone" value={userSearch} onChange={(event) => setUserSearch(event.target.value)} /><button className="admin-button primary" type="submit" disabled={usersBusy}>Search</button></form>
          {editingUser && <form className="admin-user-edit" onSubmit={saveUserName}><div><b>Edit profile</b><small>{editingUser.email || editingUser.phone}</small></div><label>Full name<input value={editingUserName} onChange={(event) => setEditingUserName(event.target.value)} maxLength={80} required /></label><button className="admin-button primary" type="submit" disabled={usersBusy}>{usersBusy ? "Saving…" : "Save profile"}</button><button className="admin-button secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</button></form>}
          {users.length ? <div className="admin-table-wrap"><table className="admin-users-table"><thead><tr><th>User</th><th>Contact</th><th>Joined</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td><b>{user.fullName || "Name not provided"}</b><small>{user.isAdmin ? "Admin account · protected" : user.confirmed ? "Verified account" : "Unverified account"}</small></td><td>{user.email || user.phone || "No contact details"}</td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td><td><div className="admin-row-actions"><button className="admin-edit-button" disabled={usersBusy} onClick={() => { setEditingUser(user); setEditingUserName(user.fullName || ""); }}>Edit name</button><button className="admin-remove-button" disabled={usersBusy || user.isAdmin} onClick={() => removeUser(user)}>Delete</button></div></td></tr>)}</tbody></table></div> : <div className="admin-empty">{usersBusy ? "Loading users…" : demoAdmin ? "Registered profiles will appear here after server access is configured." : usersError ? "User list unavailable." : "Load users to see registered profiles."}</div>}
          {(users.length > 0 || usersPage > 1) && <div className="admin-pagination"><span>Page {usersPage}</span><div><button className="admin-button secondary" disabled={usersPage <= 1 || usersBusy} onClick={() => loadUsers(usersPage - 1)}>Previous</button><button className="admin-button secondary" disabled={!usersHasMore || usersBusy} onClick={() => loadUsers(usersPage + 1)}>Next</button></div></div>}
        </section>
    <footer className="admin-footer">{demoAdmin ? "Client demo mode: admin edits stay in this browser and do not change Supabase." : "Question content is saved to the configured Supabase project. Admin actions require server-verified access."}</footer>
      </section>
    </div>
  </main>;
}
