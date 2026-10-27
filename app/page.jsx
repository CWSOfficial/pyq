"use client";

import { createElement, Fragment, useEffect, useRef, useState } from "react";
import { createClient } from "../lib/supabase/client";
import { Lottie } from "lottie-react";

const explanationTags = new Set(["p", "strong", "b", "em", "i", "ul", "ol", "li", "br"]);
const voidExplanationTags = new Set(["br"]);

function decodeExplanationEntities(value) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (entity, code) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
    if (code[0] !== "#") return named[code.toLowerCase()] ?? entity;
    const number = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    try { return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity; } catch { return entity; }
  });
}

function parseExplanationMarkup(markup) {
  const root = { tag: null, children: [] };
  const stack = [root];
  const safeMarkup = markup.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  for (const token of safeMarkup.split(/(<\/?[a-z][^>]*>)/gi)) {
    if (!token) continue;
    const tagMatch = token.match(/^<\s*(\/?)\s*([a-z][\w-]*)\b[^>]*>$/i);
    if (!tagMatch) {
      stack[stack.length - 1].children.push(decodeExplanationEntities(token));
      continue;
    }
    const tag = tagMatch[2].toLowerCase();
    if (!explanationTags.has(tag)) continue;
    if (tagMatch[1]) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        if (stack[index].tag === tag) { stack.length = index; break; }
      }
    } else {
      const node = { tag, children: [] };
      stack[stack.length - 1].children.push(node);
      if (!voidExplanationTags.has(tag) && !/\/>$/.test(token)) stack.push(node);
    }
  }
  return root;
}

function renderExplanationNode(node, key) {
  if (typeof node === "string") return node;
  return createElement(node.tag, { key }, ...node.children.map((child, index) => renderExplanationNode(child, index)));
}

function RichExplanation({ content }) {
  if (typeof content !== "string" || !content.trim()) return null;
  if (!/<\s*\/?\s*[a-z][^>]*>/i.test(content)) return <p>{content}</p>;
  const parsed = parseExplanationMarkup(content);
  return <div className="rich-explanation">{parsed.children.map((child, index) => renderExplanationNode(child, index))}</div>;
}

const navItems = ["Home", "Tests", "Bookmarks"];
const practiceSubjectCatalog = ["Polity", "Economy", "Geography", "History", "Art and Culture", "International relations", "Science and Technology", "Environment", "Current Affairs", "Miscellaneous"];
const subjectAliases = { "polity & governance": "Polity", "economy & social development": "Economy", "history & culture": "History", "environment & ecology": "Environment", "current affairs & ir": "Current Affairs", "science & technology": "Science and Technology" };
const canonicalSubject = (name) => subjectAliases[String(name || "").trim().toLowerCase()] || String(name || "").trim();
const subjectTopicCatalog = { Polity: ["Fundamental Rights (FR)", "Directive Principles of State Policy (DPSP)", "Fundamental Duties (FD)", "Union and its Territory", "Citizenship"] };
const topicAliases = { "Fundamental Rights": "Fundamental Rights (FR)", "Directive Principles of State Policy": "Directive Principles of State Policy (DPSP)", "Fundamental Duties": "Fundamental Duties (FD)" };
const displayTopic = (topic) => topicAliases[topic] || topic;
const designYears = Array.from({ length: 16 }, (_, index) => String(2026 - index));
const formatIndianPhone = (value) => {
  const digits = value.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
  return digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : value;
};
const menuItems = ["Practice by Subject", "Practice by Year", "Random Practice", "Mistake Book", "Notes", "Study Timer", "Meditation", "My Habits", "Analytics & Streak", "CSR Activity", "My Profile"];
const subjectIcons = [
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-dec74.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-3fc8b.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-d3320.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-2db2c.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-42499.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-667c0.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-2ca6d.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-31327.svg",
  "/figma-assets/feb633d4-461c-4b36-bdbc-5ddbe4f78500-3fda5.svg",
];
const icon = { Home: "⌂", Tests: "▤", Bookmarks: "♧", "Practice by Subject": "▤", "Practice by Year": "▦", "Random Practice": "⤨", "Mistake Book": "⊗", Notes: "▧", "Study Timer": "◷", Meditation: "◉", "My Habits": "☷", "Analytics & Streak": "◌", "CSR Activity": "♡", "My Profile": "♙" };

function readSaved(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const value = window.localStorage.getItem(key); return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function qualifiesForStreak(attempts, dayKey) {
  const questions = new Set(attempts.filter((item) => {
    const timestamp = item.attempted_at ? new Date(item.attempted_at) : null;
    return timestamp && !Number.isNaN(timestamp.getTime()) && localDateKey(timestamp) === dayKey && (item.question_id || item.id);
  }).map((item) => String(item.question_id || item.id)));
  return questions.size >= 15;
}

function summarizeAttempts(attempts) {
  const correctCount = attempts.filter((item) => item.is_correct).length;
  const today = localDateKey();
  const perDay = new Map();
  for (const item of attempts) {
    const timestamp = item.attempted_at ? new Date(item.attempted_at) : null;
    const questionId = item.question_id || item.id;
    if (!timestamp || Number.isNaN(timestamp.getTime()) || !questionId) continue;
    const day = localDateKey(timestamp);
    if (!perDay.has(day)) perDay.set(day, new Set());
    perDay.get(day).add(String(questionId));
  }
  // The product's streak rule is 15 answered questions per calendar day.
  const days = [...perDay.entries()].filter(([, questionIds]) => questionIds.size >= 15).map(([day]) => day).sort().reverse();
  const cursor = new Date();
  if (!days.includes(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.includes(localDateKey(cursor))) { streak += 1; cursor.setDate(cursor.getDate() - 1); }
  let bestStreak = 0, currentRun = 0, previousDay = null;
  for (const day of [...days].sort()) {
    const date = new Date(`${day}T12:00:00`);
    const previous = previousDay ? new Date(`${previousDay}T12:00:00`) : null;
    currentRun = previous && (date - previous) / 86400000 === 1 ? currentRun + 1 : 1;
    bestStreak = Math.max(bestStreak, currentRun);
    previousDay = day;
  }
  return { attempted: attempts.length, correctCount, correct: attempts.length ? Math.round((correctCount / attempts.length) * 100) : 0, today: perDay.get(today)?.size || 0, streak, bestStreak };
}

const supabase = createClient();
// Explicit opt-in supports the requested temporary static sign-in on the live app.
// Admin authorization stays server-side and does not accept demo sessions.
const AUTH_DEMO_MODE = process.env.NEXT_PUBLIC_AUTH_DEMO_MODE === "true";
const DEMO_USER_KEY = "pyq-demo-user";
const DEMO_ADMIN_PHONES = new Set((process.env.NEXT_PUBLIC_DEMO_ADMIN_PHONES || "").split(",").map((value) => value.replace(/\D/g, "")).map((digits) => digits.length === 10 ? `91${digits}` : digits).filter(Boolean));
function isDemoAdminUser(user) {
  const digits = String(user?.phone || "").replace(/\D/g, "");
  const normalizedPhone = digits.length === 10 ? `91${digits}` : digits;
  return Boolean(user?.is_demo && (user.email === "pyqcloud@gmail.com" || DEMO_ADMIN_PHONES.has(normalizedPhone)));
}
const builtInMusicTracks = [
  { label: "Cloud Focus", url: "/audio/cloud-soft-focus.wav" },
  { label: "Evening Piano", url: "/audio/cloud-evening-piano.wav" },
  { label: "Classic Focus", url: "/audio/pyq-focus.wav" },
];

const figmaAsset = {
  avatar: "/figma-assets/s2-89e09.png", profile: "/figma-assets/s2-cf8b2.svg", mascot: "/figma-assets-oct-2026/cloudy-cloud.png",
  signal: "/figma-assets/s2-f3c9f.svg", menu: "/figma-assets/s2-0a1ea.svg",
  bell: "/figma-assets/s2-f870f.svg", close: "/figma-assets/s2-15fa7.svg",
  subject: "/figma-assets/s2-0c4b1.svg", year: "/figma-assets/s2-a7a9c.svg",
  random: "/figma-assets/s2-898dc.svg", mistake: "/figma-assets/s2-9883b.svg",
  arrow: "/figma-assets/s2-77f44.svg", resume: "/figma-assets/s2-73f23.svg",
  goal: "/figma-assets/s2-6c2ac.svg", streak: "/figma-assets/s2-cb579.svg",
  solved: "/figma-assets/s2-ac842.svg", accuracy: "/figma-assets/s2-82a0e.svg",
  home: "/figma-assets/s2-21fee.svg", tests: "/figma-assets/s2-e5443.svg",
  bookmarks: "/figma-assets/s2-83656.svg", notes: "/figma-assets/s2-88470.svg",
  timer: "/figma-assets/s2-cf9c1.svg", meditation: "/figma-assets/s2-64f8e.svg",
  habits: "/figma-assets/s2-a7a9c.svg", social: "/figma-assets/s2-4a01d.svg",
};

export default function Page() {
  const [screen, setScreen] = useState("Welcome");
  const [selectedYear, setSelectedYear] = useState("");
  const [testYear, setTestYear] = useState("");
  const [testSubject, setTestSubject] = useState("");
  const [testQuestionCount, setTestQuestionCount] = useState(100);
  const [showTestRules, setShowTestRules] = useState(false);
  const [testInProgress, setTestInProgress] = useState(false);
  const [testQuestions, setTestQuestions] = useState([]);
  const [testAnswers, setTestAnswers] = useState({});
  const [testReviewFlags, setTestReviewFlags] = useState([]);
  const [testHistory, setTestHistory] = useState([]);
  const [showQuestionPalette, setShowQuestionPalette] = useState(false);
  const [showSubmitTest, setShowSubmitTest] = useState(false);
  const [submittedTest, setSubmittedTest] = useState(null);
  const [testReviewIndex, setTestReviewIndex] = useState(0);
  const [selectedTopics, setSelectedTopics] = useState([]);
  const [topicQuestionCount, setTopicQuestionCount] = useState(25);
  const [bookmarkSearch, setBookmarkSearch] = useState("");
  const [bookmarkTopic, setBookmarkTopic] = useState("All topics");
  const [randomCount, setRandomCount] = useState(25);
  const [includeAttempted, setIncludeAttempted] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [isInstalledApp, setIsInstalledApp] = useState(false);
  const [musicSettings, setMusicSettings] = useState({ enabled: false, trackUrl: "", volume: 0.35 });
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [showMusicPicker, setShowMusicPicker] = useState(false);
  const [authEmail, setAuthEmail] = useState(AUTH_DEMO_MODE ? "pyqcloud@gmail.com" : "");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneOtpError, setPhoneOtpError] = useState(false);
  const [phoneOtpErrorMessage, setPhoneOtpErrorMessage] = useState("Incorrect code. Check the code and try again.");
  const [phoneResendCountdown, setPhoneResendCountdown] = useState(30);
  const [aboutExamCount, setAboutExamCount] = useState("0");
  const [aboutTargetYear, setAboutTargetYear] = useState("");
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPhone, setAccountPhone] = useState("");
  const [accountEditing, setAccountEditing] = useState(false);
  const [membershipChoice, setMembershipChoice] = useState("Monthly");
  const [profileName, setProfileName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarInputRef = useRef(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [user, setUser] = useState(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [questions, setQuestions] = useState([]);
  const [practiceCatalog, setPracticeCatalog] = useState(null);
  const [attemptHistory, setAttemptHistory] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [reviewQuestionPrompt, setReviewQuestionPrompt] = useState("");
  const [practiceFinished, setPracticeFinished] = useState(false);
  const [selected, setSelected] = useState(null);
  const [eliminated, setEliminated] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [mistakes, setMistakes] = useState([]);
  const [mistakeSearch, setMistakeSearch] = useState("");
  const [mistakeSort, setMistakeSort] = useState("Newest");
  const [mistakeSubjectFilter, setMistakeSubjectFilter] = useState("All subjects");
  const [mistakeSubjectSelection, setMistakeSubjectSelection] = useState("");
  const [showMistakeSubjectPicker, setShowMistakeSubjectPicker] = useState(false);
  const [notes, setNotes] = useState([]);
  const [noteDraft, setNoteDraft] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [habits, setHabits] = useState([]);
  const [habitLogs, setHabitLogs] = useState([]);
  const [habitBusy, setHabitBusy] = useState(false);
  const [habitDate, setHabitDate] = useState(() => new Date());
  const [habitDraft, setHabitDraft] = useState("");
  const [habitTargetDraft, setHabitTargetDraft] = useState("1");
  const [habitUnitDraft, setHabitUnitDraft] = useState("time");
  const [editingHabit, setEditingHabit] = useState(null);
  const [habitMenuId, setHabitMenuId] = useState(null);
  const [showHabitForm, setShowHabitForm] = useState(false);
  const [consistencyHabit, setConsistencyHabit] = useState(null);
  const [habitHistory, setHabitHistory] = useState({});
  const [habitHistoryLoading, setHabitHistoryLoading] = useState(false);
  const [seconds, setSeconds] = useState(25 * 60);
  const [focusMinutes, setFocusMinutes] = useState(25);
  const [timerMinutes, setTimerMinutes] = useState(25);
  const [timerRunning, setTimerRunning] = useState(false);
  const [meditationMinutes, setMeditationMinutes] = useState(10);
  const [meditationSeconds, setMeditationSeconds] = useState(10 * 60);
  const [meditationRunning, setMeditationRunning] = useState(false);
  const [meditationSound, setMeditationSound] = useState(true);
  const [mode, setMode] = useState("Pomodoro");
  const [subject, setSubject] = useState("Polity");
  const [toast, setToast] = useState("");
  const [analytics, setAnalytics] = useState({ attempted: 0, correctCount: 0, streak: 0, bestStreak: 0, today: 0 });
  const [showStreakDetails, setShowStreakDetails] = useState(false);
  const availableSubjects = [...new Set(questions.map((item) => item.subject).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const availableYears = practiceCatalog?.years || [...new Set([...designYears, ...questions.map((item) => String(item.year)).filter(Boolean)])].sort((a, b) => Number(b) - Number(a));
  const habitDateKey = localDateKey(habitDate);
  const isHabitDateToday = habitDateKey === localDateKey();
  const habitMonthKey = `${habitDate.getFullYear()}-${String(habitDate.getMonth() + 1).padStart(2, "0")}`;
  const daysInHabitMonth = new Date(habitDate.getFullYear(), habitDate.getMonth() + 1, 0).getDate();
  const firstHabitWeekday = new Date(habitDate.getFullYear(), habitDate.getMonth(), 1).getDay();
  const attemptedIds = new Set(attemptHistory.map((item) => item.question_id).filter(Boolean));
  const matchingQuestions = questions.filter((item) => subject === "Mixed Practice" || subject === "Timed Test" || canonicalSubject(item.subject).toLowerCase() === canonicalSubject(subject).toLowerCase() || String(item.year) === subject);
  const randomPool = includeAttempted ? matchingQuestions : matchingQuestions.filter((item) => !attemptedIds.has(item.id));
  const topicQuestions = selectedTopics.length ? matchingQuestions.filter((item) => selectedTopics.includes(displayTopic(item.topic || item.tag))) : matchingQuestions;
  const reviewQuestion = reviewQuestionPrompt ? questions.find((item) => item.prompt === reviewQuestionPrompt) : null;
  const questionList = testInProgress && testQuestions.length ? testQuestions : reviewQuestion ? [reviewQuestion] : subject === "Mixed Practice" ? randomPool.slice(0, randomCount) : topicQuestions.slice(0, topicQuestionCount);
  const question = questionList[questionIndex % Math.max(questionList.length, 1)] ?? questions[0];
  const displaySelected = testInProgress ? (testAnswers[questionIndex] ?? null) : selected;
  const practiceScope = selectedTopics.length === 1 ? selectedTopics[0] : /^\d{4}$/.test(subject) ? `${subject} paper` : subject;
  const savedQuestions = bookmarks.map((prompt) => questions.find((item) => item.prompt === prompt)).filter(Boolean);
  const subjectPickerOptions = practiceCatalog?.subjects || [...new Set([...practiceSubjectCatalog, ...availableSubjects.map(canonicalSubject)])];
  const subjectTopics = [...new Set([...(subjectTopicCatalog[subject] || []), ...questions.filter((item) => canonicalSubject(item.subject) === canonicalSubject(subject)).map((item) => displayTopic(item.topic || item.tag)).filter(Boolean)])].filter((topic) => questions.some((item) => canonicalSubject(item.subject) === canonicalSubject(subject) && displayTopic(item.topic || item.tag) === topic));
  const bookmarkSubjects = [...new Set(["Polity", "Geography", "Economy", "Environment", "Science & Tech", "History", ...availableSubjects])];
  const filteredSavedQuestions = savedQuestions.filter((item) => item.subject === subject && (bookmarkTopic === "All topics" || item.topic === bookmarkTopic || item.tag === bookmarkTopic) && item.prompt.toLowerCase().includes(bookmarkSearch.toLowerCase()));
  const bookmarkTopics = [...new Set(savedQuestions.filter((item) => item.subject === subject).map((item) => item.topic || item.tag).filter(Boolean))];
  const completedQuestionIds = new Set(attemptHistory.map((item) => item.question_id).filter(Boolean));
  const completedQuestionCount = completedQuestionIds.size;
  const subjectPerformance = practiceSubjectCatalog.map((name) => {
    const subjectQuestions = questions.filter((item) => canonicalSubject(item.subject) === name);
    const bankCount = subjectQuestions.length;
    const subjectAttempts = attemptHistory.filter((item) => canonicalSubject(item.subject || item.questions?.subject) === name);
    const correctCount = subjectAttempts.filter((item) => item.is_correct).length;
    const completedInSubject = new Set(subjectAttempts.map((item) => item.question_id).filter(Boolean)).size;
    return { name, bankCount, attempted: subjectAttempts.length, completed: completedInSubject, correctCount, accuracy: subjectAttempts.length ? Math.round(correctCount / subjectAttempts.length * 100) : 0, completion: bankCount ? Math.min(100, Math.round(completedInSubject / bankCount * 100)) : 0 };
  }).filter((item) => item.bankCount || item.attempted);
  const strongestSubjects = [...subjectPerformance].filter((item) => item.attempted).sort((a,b) => b.accuracy-a.accuracy).slice(0,3);
  const practicedSubjects = subjectPerformance.filter((item) => item.attempted);
  const attentionSubjects = practicedSubjects.length > 1 ? [...practicedSubjects].sort((a,b) => a.accuracy-b.accuracy).slice(0,3) : [];
  const completedPercent = questions.length ? Math.min(100, Math.round(completedQuestionCount / questions.length * 100)) : 0;
  const mistakeSubjectOptions = [...new Set(mistakes.map((prompt) => questions.find((item) => item.prompt === prompt)?.subject).filter(Boolean))];
  const filteredMistakeItems = mistakes.filter((prompt) => {
    const item = questions.find((question) => question.prompt === prompt);
    return prompt.toLowerCase().includes(mistakeSearch.toLowerCase()) && (mistakeSubjectFilter === "All subjects" || item?.subject === mistakeSubjectFilter);
  });
  if (mistakeSort === "Oldest") filteredMistakeItems.reverse();

  const loadUserData = async (activeUser) => {
    if (!activeUser || activeUser.is_demo) {
      setBookmarks(readSaved("pyq-bookmarks", []));
      setNotes(readSaved("pyq-notes", []));
      setMistakes(readSaved("pyq-mistakes", []));
      const savedAttempts = readSaved("pyq-attempts", []);
      setAttemptHistory(savedAttempts);
      setAnalytics(summarizeAttempts(savedAttempts));
      return;
    }
    const [{ data: saved }, { data: savedNotes }, { data: attempts }, { data: habitRows }, { data: habitLogs }] = await Promise.all([
      supabase.from("bookmarks").select("question_id, questions(prompt, subject)").eq("user_id", activeUser.id),
      supabase.from("notes").select("id, content, created_at").eq("user_id", activeUser.id).order("created_at", { ascending: false }),
      supabase.from("question_attempts").select("question_id, is_correct, attempted_at, questions(prompt, subject)").eq("user_id", activeUser.id),
      supabase.from("habits").select("id, name, target_amount, unit").eq("user_id", activeUser.id).eq("active", true).order("created_at"),
      supabase.from("habit_logs").select("habit_id, completed").eq("user_id", activeUser.id).eq("log_date", habitDateKey),
    ]);
    if (saved) setBookmarks(saved.map((item) => item.questions?.prompt).filter(Boolean));
    if (habitRows) { const done = new Set((habitLogs ?? []).filter((item) => item.completed).map((item) => item.habit_id)); setHabits(habitRows.map((item) => ({ ...item, done: done.has(item.id) }))); }
    if (savedNotes) setNotes(savedNotes.map((item) => ({ id: item.id, text: item.content, date: new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })));
    if (attempts) {
      setAttemptHistory(attempts);
      setAnalytics(summarizeAttempts(attempts));
      setMistakes([...new Set(attempts.filter((item) => !item.is_correct).map((item) => item.questions?.prompt).filter(Boolean))]);
    }
  };

  const loadAvatar = async (activeUser) => {
    const path = activeUser?.user_metadata?.avatar_path;
    if (!path) { setAvatarUrl(""); return; }
    const { data, error } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
    if (!error) setAvatarUrl(data.signedUrl);
  };

  useEffect(() => {
    const requestedScreen = new URLSearchParams(window.location.search).get("screen");
    setBookmarks(readSaved("pyq-bookmarks", []));
    setMistakes(readSaved("pyq-mistakes", []));
    setNotes(readSaved("pyq-notes", []));
    const storedHabits = readSaved("pyq-habits", []);
    const cleanHabits = storedHabits.filter((habit) => (habit.name || "").trim().toLowerCase() !== "my daily habit");
    setHabits(cleanHabits);
    setHabitLogs(readSaved("pyq-habit-logs", []));
    setTestHistory(readSaved("pyq-test-history", []));
    const savedAttempts = readSaved("pyq-attempts", []);
    setAttemptHistory(savedAttempts);
    setAnalytics(summarizeAttempts(savedAttempts));
    setHydrated(true);
    let localCatalog = null;
    if (AUTH_DEMO_MODE) {
      try {
        const saved = JSON.parse(localStorage.getItem("pyq-demo-catalog") || "null");
        if (saved) localCatalog = { subjects: (saved.subjects || []).filter((item) => item.active !== false).map((item) => item.value), years: (saved.years || []).filter((item) => item.active !== false).map((item) => String(item.value)).sort((a, b) => Number(b) - Number(a)) };
      } catch {}
    }
    if (localCatalog) setPracticeCatalog(localCatalog);
    else fetch("/api/settings/catalog", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => {
      if (value && Array.isArray(value.subjects) && Array.isArray(value.years)) setPracticeCatalog(value);
    }).catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    setIsInstalledApp(standalone);
    let hasSavedDemoUser = false;
    if (AUTH_DEMO_MODE) {
      try {
        const savedDemoUser = JSON.parse(localStorage.getItem(DEMO_USER_KEY) || "null");
        if (savedDemoUser?.is_demo) {
          hasSavedDemoUser = true;
          setUser(savedDemoUser);
          setProfileName(savedDemoUser.user_metadata?.full_name || "");
          setAccountEmail(savedDemoUser.email || "");
          setAccountPhone(savedDemoUser.phone || "");
          setAvatarUrl(readSaved(`pyq-demo-avatar:${savedDemoUser.id}`, ""));
          setScreen(savedDemoUser.user_metadata?.full_name ? "Home" : "About You");
          setAuthReady(true);
          loadUserData(savedDemoUser);
        }
      } catch { localStorage.removeItem(DEMO_USER_KEY); }
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (hasSavedDemoUser) return;
      const sessionUser = data.session?.user ?? null;
      setUser(sessionUser);
      setProfileName(sessionUser?.user_metadata?.full_name ?? "");
      setAccountEmail(sessionUser?.email ?? "");
      setAccountPhone(sessionUser?.phone ?? "");
      if (sessionUser && new URLSearchParams(window.location.search).get("next") === "/admin") window.location.replace("/admin");
      else if (sessionUser) setScreen(requestedScreen === "Reset Password" ? "Reset Password" : sessionUser.user_metadata?.full_name ? "Home" : "About You");
      else setScreen(requestedScreen === "Auth" || requestedScreen === "Reset Password" ? requestedScreen : "Welcome");
      setAuthReady(true);
      loadAvatar(sessionUser);
      loadUserData(sessionUser);
    }).catch(() => {
      if (!active || hasSavedDemoUser) return;
      setUser(null);
      setScreen(requestedScreen === "Auth" || requestedScreen === "Reset Password" ? requestedScreen : "Welcome");
      setAuthReady(true);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (AUTH_DEMO_MODE && localStorage.getItem(DEMO_USER_KEY)) return;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      loadAvatar(nextUser);
      if (nextUser) { setAuthEmail(nextUser.email ?? ""); setProfileName(nextUser.user_metadata?.full_name ?? ""); }
      setAccountEmail(nextUser?.email ?? "");
      if (nextUser?.phone) setAccountPhone(nextUser.phone);
      if (_event === "PASSWORD_RECOVERY") setScreen("Reset Password");
      else if (_event === "SIGNED_IN") setScreen(nextUser?.user_metadata?.full_name ? "Home" : "About You");
      else if (_event === "SIGNED_OUT") setScreen("Welcome");
      if (_event === "SIGNED_IN" || _event === "SIGNED_OUT") setAuthReady(true);
      window.setTimeout(() => loadUserData(nextUser), 0);
    });
    const databaseQuestions = (async () => {
      const rows = [];
      const pageSize = 1000;
      for (let offset = 0; offset < 5000; offset += pageSize) {
        const { data, error } = await supabase.from("questions")
          .select("id, subject, year, topic, prompt, options, correct_option, explanation, question_number")
          .order("year", { ascending: false }).order("question_number", { ascending: true, nullsFirst: false })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if ((data || []).length < pageSize) break;
      }
      return { data: rows, error: null };
    })();
    const onLocalQuestionBankChange = (event) => {
      if (event.key === "pyq-demo-music") {
        try { const settings = JSON.parse(event.newValue || "null"); if (settings) setMusicSettings(settings); } catch {}
        return;
      }
      if (event.key === "pyq-demo-catalog") {
        try {
          const saved = JSON.parse(event.newValue || "null");
          if (saved) setPracticeCatalog({ subjects: (saved.subjects || []).filter((item) => item.active !== false).map((item) => item.value), years: (saved.years || []).filter((item) => item.active !== false).map((item) => String(item.value)).sort((a, b) => Number(b) - Number(a)) });
        } catch {}
        return;
      }
      if (event.key === "pyq-demo-questions") {
        try {
          const rows = JSON.parse(event.newValue || "[]");
          if (Array.isArray(rows)) setQuestions(rows.map((item) => ({ ...item, year: String(item.year), tag: item.topic, answer: Number(item.correct_option) })));
        } catch {}
      }
    };
    window.addEventListener("storage", onLocalQuestionBankChange);
    databaseQuestions.then((databaseResult) => {
      if (!active) return;
      const supabaseRows = databaseResult.data || [];
      const demoRows = AUTH_DEMO_MODE ? readSaved("pyq-demo-questions", []) : [];
      const sourceRows = demoRows.length ? demoRows : supabaseRows;
      setQuestions(sourceRows.map((item) => ({ ...item, year: String(item.year), tag: item.topic, answer: item.correct_option })));
    }).catch((error) => {
      if (!active) return;
      setQuestions([]);
      console.error("Could not load questions from Supabase", error);
      setToast("Could not load questions from the question bank. Please try again.");
    });
    const onInstall = (event) => { event.preventDefault(); setInstallPrompt(event); };
    const onInstalled = () => { setInstallPrompt(null); setIsInstalledApp(true); setToast("PYQ Cloud was added to your home screen."); };
    const localMusic = AUTH_DEMO_MODE ? readSaved("pyq-demo-music", null) : null;
    if (localMusic) setMusicSettings(localMusic);
    else fetch("/api/settings/music", { cache: "no-store" }).then((result) => result.ok ? result.json() : null).then((settings) => { if (settings) setMusicSettings(settings); }).catch(() => {});
    const onDisplayModeChange = (event) => setIsInstalledApp(event.matches || window.navigator.standalone === true);
    const displayMode = window.matchMedia("(display-mode: standalone)");
    displayMode.addEventListener?.("change", onDisplayModeChange);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("storage", onLocalQuestionBankChange);
      displayMode.removeEventListener?.("change", onDisplayModeChange);
    };
  }, []);
  useEffect(() => { if (hydrated && (!user || user.is_demo)) localStorage.setItem("pyq-bookmarks", JSON.stringify(bookmarks)); }, [bookmarks, hydrated, user]);
  useEffect(() => { if (hydrated) localStorage.setItem("pyq-mistakes", JSON.stringify(mistakes)); }, [mistakes, hydrated]);
  useEffect(() => { if (hydrated && (!user || user.is_demo)) localStorage.setItem("pyq-notes", JSON.stringify(notes)); }, [notes, hydrated, user]);
  useEffect(() => { if (hydrated && (!user || user.is_demo)) localStorage.setItem("pyq-habits", JSON.stringify(habits)); }, [habits, hydrated, user]);
  useEffect(() => { if (hydrated && (!user || user.is_demo)) localStorage.setItem("pyq-habit-logs", JSON.stringify(habitLogs)); }, [habitLogs, hydrated, user]);
  useEffect(() => {
    if (!hydrated) return undefined;
    if (!user || user.is_demo) {
      const dayLogs = habitLogs.filter((log) => log.log_date === habitDateKey && log.completed);
      const done = new Set(dayLogs.map((log) => log.habit_id));
      setHabits((items) => items.map((habit) => ({ ...habit, done: done.has(habit.id) })));
      return undefined;
    }
    let active = true;
    supabase.from("habit_logs").select("habit_id, completed").eq("user_id", user.id).eq("log_date", habitDateKey).then(({ data }) => {
      if (!active || !data) return;
      const done = new Set(data.filter((item) => item.completed).map((item) => item.habit_id));
      setHabits((items) => items.map((habit) => ({ ...habit, done: done.has(habit.id) })));
    });
    return () => { active = false; };
  }, [user, habitDateKey, hydrated, habitLogs]);
  useEffect(() => {
    if (!consistencyHabit) return undefined;
    let active = true;
    setHabitHistoryLoading(true);
    const applyHistory = (rows) => {
      if (!active) return;
      setHabitHistory(Object.fromEntries(rows.map((row) => [String(row.log_date).slice(0, 10), Boolean(row.completed)])));
      setHabitHistoryLoading(false);
    };
    if (!user || user.is_demo) {
      applyHistory(habitLogs.filter((log) => log.habit_id === consistencyHabit.id && String(log.log_date).startsWith(habitMonthKey)));
    } else {
      const monthStart = `${habitMonthKey}-01`;
      const monthEnd = `${habitMonthKey}-${String(daysInHabitMonth).padStart(2, "0")}`;
      supabase.from("habit_logs").select("log_date, completed").eq("user_id", user.id).eq("habit_id", consistencyHabit.id).gte("log_date", monthStart).lte("log_date", monthEnd).then(({ data, error }) => {
        if (!active) return;
        if (error) { setHabitHistory({}); setToast("Could not load habit history"); }
        else applyHistory(data ?? []);
        setHabitHistoryLoading(false);
      });
    }
    return () => { active = false; };
  }, [consistencyHabit, habitMonthKey, daysInHabitMonth, user, habitLogs]);
  useEffect(() => { if (hydrated && (!user || user.is_demo)) localStorage.setItem("pyq-attempts", JSON.stringify(attemptHistory)); }, [attemptHistory, hydrated, user]);
  useEffect(() => { if (hydrated) localStorage.setItem("pyq-test-history", JSON.stringify(testHistory.slice(0, 5))); }, [testHistory, hydrated]);
  useEffect(() => { setAnalytics(summarizeAttempts(attemptHistory)); }, [attemptHistory]);
  useEffect(() => {
    if (!timerRunning) return undefined;
    const id = window.setInterval(() => setSeconds((value) => {
      if (mode === "Stopwatch") return value + 1;
      if (value <= 1) { setTimerRunning(false); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning, mode]);
  useEffect(() => {
    const savedFocusMinutes = Number(readSaved("pyq-focus-duration-minutes", 25));
    if (Number.isInteger(savedFocusMinutes) && savedFocusMinutes >= 1 && savedFocusMinutes <= 999) { setFocusMinutes(savedFocusMinutes); setTimerMinutes(savedFocusMinutes); setSeconds(savedFocusMinutes * 60); }
  }, []);
  useEffect(() => {
    if (!meditationRunning) return undefined;
    const id = window.setInterval(() => setMeditationSeconds((value) => {
      if (value <= 1) { setMeditationRunning(false); setToast("Meditation complete. Take this calm with you."); return 0; }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(id);
  }, [meditationRunning]);
  useEffect(() => {
    if (screen !== "Verify Phone" || phoneResendCountdown <= 0) return undefined;
    const id = window.setInterval(() => setPhoneResendCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [screen, phoneResendCountdown > 0]);
  useEffect(() => {
    if (!toast) return undefined;
    const id = window.setTimeout(() => setToast(""), 2600);
    return () => window.clearTimeout(id);
  }, [toast]);

  const go = (next) => { setScreen(next); setDrawer(false); setSelected(null); setEliminated([]); if (next === "Practice") setPracticeFinished(false); };
  const toggleMusic = async () => {
    const audio = document.getElementById("pyq-background-music");
    if (!audio || !musicSettings.enabled) return setToast("Background music is currently turned off.");
    if (musicPlaying) { audio.pause(); setMusicPlaying(false); return; }
    try { audio.volume = Math.max(0, Math.min(1, Number(musicSettings.volume) || 0.35)); await audio.play(); setMusicPlaying(true); }
    catch { setToast("Tap again to allow background music to play."); }
  };
  const chooseMusicTrack = (track) => {
    const audio = document.getElementById("pyq-background-music");
    if (audio) { audio.pause(); audio.src = track.url; audio.load(); }
    setMusicSettings((settings) => ({ ...settings, trackUrl: track.url, enabled: true }));
    setMusicPlaying(false); setShowMusicPicker(false); setToast(`${track.label} selected. Tap Focus music to play.`);
  };
  const chooseAnswer = (index) => {
    if (testInProgress) { setTestAnswers((answers) => ({ ...answers, [questionIndex]: index })); return; }
    if (selected !== null) return;
    setSelected(index);
    if (!user || user.is_demo) {
      setAttemptHistory((value) => [...value, { question_id: question.id, subject: question.subject, is_correct: index === question.answer, attempted_at: new Date().toISOString() }]);
    }
    if (index !== question.answer) setMistakes((value) => value.includes(question.prompt) ? value : [...value, question.prompt]);
    if (user && !user.is_demo && question.id) {
      supabase.from("question_attempts").insert({ user_id: user.id, question_id: question.id, selected_option: index, is_correct: index === question.answer }).select("question_id,is_correct,attempted_at,questions(prompt,subject)").single().then(({ data, error }) => {
        if (error) { setToast("Could not save this answer. Your stats were not updated."); return; }
        if (data) setAttemptHistory((history) => [...history, data]);
      });
    }
  };
  const startConfiguredTest = (scope, count, duration) => {
    const pool = questions.filter((item) => canonicalSubject(item.subject).toLowerCase() === canonicalSubject(scope).toLowerCase() || String(item.year) === scope);
    if (!pool.length) { setToast(`No questions are available for ${scope} yet`); return; }
    const selectedQuestions = pool.slice(0, count);
    setSubject(scope); setTestQuestions(selectedQuestions); setTestAnswers({}); setTestReviewFlags([]);
    setSubmittedTest(null); setQuestionIndex(0); setSelected(null); setEliminated([]);
    setPracticeFinished(false); setTestInProgress(true); setShowQuestionPalette(false); setShowSubmitTest(false);
    setMode("Countdown"); setSeconds(duration); setTimerRunning(true); go("Practice");
  };
  const submitTest = () => {
    if (!testQuestions.length) return;
    const answered = Object.keys(testAnswers).length;
    const correct = testQuestions.reduce((total, item, index) => total + (testAnswers[index] === item.answer ? 1 : 0), 0);
    const incorrect = answered - correct;
    const result = { subject, questions: testQuestions, answers: testAnswers, reviewFlags: testReviewFlags, answered, correct, incorrect, unanswered: testQuestions.length - answered, accuracy: answered ? Math.round(correct / answered * 100) : 0, score: Number((correct * 2 - incorrect * (2 / 3)).toFixed(2)), completedAt: new Date().toISOString() };
    setSubmittedTest(result); setTestHistory((history) => [result, ...history].slice(0, 5));
    setShowSubmitTest(false); setShowQuestionPalette(false); setTimerRunning(false); setTestInProgress(false); setScreen("Test Results");
  };
  useEffect(() => { if (testInProgress && seconds === 0) submitTest(); }, [testInProgress, seconds]);
  const nextQuestion = () => {
    if (testInProgress) {
      if (questionIndex + 1 >= questionList.length) { setShowSubmitTest(true); return; }
      setQuestionIndex((value) => value + 1); setEliminated([]); return;
    }
    if (questionIndex + 1 >= questionList.length) { setPracticeFinished(true); setTimerRunning(false); setTestInProgress(false); setSelected(null); setEliminated([]); return; }
    setQuestionIndex((value) => value + 1); setSelected(null); setEliminated([]);
  };
  const openHabitForm = (habit = null) => {
    setEditingHabit(habit);
    setHabitDraft(habit?.name ?? "");
    setHabitTargetDraft(String(habit?.target_amount ?? 1));
    setHabitUnitDraft(habit?.unit ?? "time");
    setHabitMenuId(null);
    setShowHabitForm(true);
  };
  const closeHabitForm = () => { setShowHabitForm(false); setEditingHabit(null); setHabitDraft(""); };
  const saveHabit = async () => {
    const name = habitDraft.trim();
    const target = Math.max(1, Math.min(999, Number.parseInt(habitTargetDraft, 10) || 1));
    const unit = habitUnitDraft.trim() || "time";
    if (!name) return;
    if (habits.some((item) => item.id !== editingHabit?.id && item.name.trim().toLowerCase() === name.toLowerCase())) return setToast("That habit already exists");
    setHabitBusy(true);
    if (editingHabit && user && !user.is_demo) {
      const { data, error } = await supabase.from("habits").update({ name, target_amount: target, unit }).eq("id", editingHabit.id).eq("user_id", user.id).select("id, name, target_amount, unit").single();
      if (error) { setHabitBusy(false); return setToast("Could not update habit"); }
      setHabits((items) => items.map((item) => item.id === editingHabit.id ? { ...item, ...data } : item));
    } else if (editingHabit) {
      setHabits((items) => items.map((item) => item.id === editingHabit.id ? { ...item, name, target_amount: target, unit } : item));
    } else if (user && !user.is_demo) {
      const { data, error } = await supabase.from("habits").insert({ user_id: user.id, name, target_amount: target, unit }).select("id, name, target_amount, unit").single();
      if (error) { setHabitBusy(false); return setToast(error.code === "23505" ? "That habit already exists" : "Could not save habit"); }
      setHabits((items) => [...items, { ...data, done: false }]);
    } else {
      setHabits((items) => [...items, { id: crypto.randomUUID(), name, target_amount: target, unit, done: false }]);
    }
    setHabitBusy(false);
    closeHabitForm();
    setToast(editingHabit ? "Habit updated" : "Habit added");
  };
  const deleteHabit = async (habit) => {
    setHabitMenuId(null);
    setHabitBusy(true);
    if (user && !user.is_demo) {
      const { error } = await supabase.from("habits").update({ active: false }).eq("id", habit.id).eq("user_id", user.id);
      if (error) { setHabitBusy(false); return setToast("Could not remove habit"); }
    }
    setHabits((items) => items.filter((item) => item.id !== habit.id));
    if (!user || user.is_demo) setHabitLogs((items) => items.filter((log) => log.habit_id !== habit.id));
    if (consistencyHabit?.id === habit.id) setConsistencyHabit(null);
    setHabitBusy(false);
    setToast("Habit removed");
  };
  const setHabitCompletion = async (habit, completed) => {
    if (habit.done === completed || habitBusy) return;
    const previous = habit.done;
    setHabits((items) => items.map((item) => item.id === habit.id ? { ...item, done: completed } : item));
    const log = { habit_id: habit.id, log_date: habitDateKey, completed };
    if (!user || user.is_demo) {
      setHabitLogs((items) => [...items.filter((item) => !(item.habit_id === habit.id && item.log_date === habitDateKey)), log]);
      return;
    }
    setHabitBusy(true);
    const result = await supabase.from("habit_logs").upsert({ user_id: user.id, habit_id: habit.id, log_date: habitDateKey, completed, amount: completed ? 1 : 0 }, { onConflict: "user_id,habit_id,log_date" });
    setHabitBusy(false);
    if (result.error) { setHabits((items) => items.map((item) => item.id === habit.id ? { ...item, done: previous } : item)); setToast("Could not sync habit update"); }
  };
  const saveNote = () => {
    if (!noteDraft.trim()) return;
    if (user && !user.is_demo) {
      supabase.from("notes").insert({ user_id: user.id, content: noteDraft.trim() }).select("id, content, created_at").single().then(({ data, error }) => {
        if (error) return setToast("Could not save note. Please try again.");
        setNotes((value) => [{ id: data.id, text: data.content, date: new Date(data.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }, ...value]);
        setNoteDraft("");
        setEditingNote(false);
        setToast("Note synced to your account");
      });
      return;
    }
    setNotes((value) => [{ id: Date.now(), text: noteDraft.trim(), date: new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short" }) }, ...value]);
    setNoteDraft(""); setEditingNote(false); setToast("Note saved");
  };
  const startPractice = (name) => { setReviewQuestionPrompt(""); setQuestionIndex(0); setSubject(name); setPracticeFinished(false); setSelected(null); setEliminated([]); go("Practice"); };
  const toggleBookmark = async () => {
    const saved = bookmarks.includes(question.prompt);
    setBookmarks((value) => saved ? value.filter((item) => item !== question.prompt) : [question.prompt, ...value]);
    if (!user || user.is_demo || !question.id) return;
    const result = saved
      ? await supabase.from("bookmarks").delete().eq("user_id", user.id).eq("question_id", question.id)
      : await supabase.from("bookmarks").insert({ user_id: user.id, question_id: question.id });
    if (result.error) setToast("Bookmark sync failed");
  };
  const submitAuth = async (event) => {
    event.preventDefault();
    setAuthError("");
    setAuthNotice("");
    setAuthBusy(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    if (AUTH_DEMO_MODE) {
      if (!email || password.length < 8) { setAuthBusy(false); return setAuthError("Enter a valid email and a password with at least 8 characters."); }
      if (authMode === "signup" && password !== String(formData.get("confirmPassword") ?? "")) {
        setAuthBusy(false);
        return setAuthError("The passwords don’t match. Check both fields and try again.");
      }
      const demoUser = { id: `demo-email:${email}`, email, created_at: new Date().toISOString(), is_demo: true, user_metadata: { full_name: email.split("@")[0] } };
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoUser));
      setUser(demoUser); setProfileName(demoUser.user_metadata.full_name); setAccountEmail(email); setAuthBusy(false);
      setToast(authMode === "signup" ? "Demo account created on this device" : "Signed in on this device");
      if (new URLSearchParams(window.location.search).get("next") === "/admin" && demoUser.email === "pyqcloud@gmail.com") { window.location.replace("/admin"); return; }
      go(authMode === "signup" ? "About You" : "Home");
      return;
    }
    if (authMode === "signup" && password !== String(formData.get("confirmPassword") ?? "")) {
      setAuthBusy(false);
      return setAuthError("The passwords don’t match. Check both fields and try again.");
    }
    let result;
    try {
      result = authMode === "signup"
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/` } })
        : await supabase.auth.signInWithPassword({ email, password });
    } catch {
      setAuthBusy(false);
      return setAuthError("Could not reach the sign-in service. Check your connection and try again.");
    }
    setAuthBusy(false);
    if (result.error) return setAuthError(result.error.message);
    if (authMode === "signup" && !result.data.session) {
      setAuthNotice(`We sent a confirmation link to ${email}. Open it to activate your account, then come back here to sign in.`);
      setScreen("Auth Confirmation");
      return;
    }
    setAuthEmail(email);
    setToast(authMode === "signup" ? "Account created" : "You’re signed in");
    if (new URLSearchParams(window.location.search).get("next") === "/admin") { window.location.replace("/admin"); return; }
    go(authMode === "signup" ? "About You" : "Home");
  };
  const resendSignupConfirmation = async () => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: authEmail.trim().toLowerCase() });
      if (error) throw error;
      setAuthNotice(`A new confirmation link was sent to ${authEmail.trim().toLowerCase()}.`);
    } catch (error) { setAuthError(error.message || "Could not resend the confirmation email. Try again shortly."); }
    finally { setAuthBusy(false); }
  };
  const sendPasswordReset = async (event) => {
    event.preventDefault();
    setAuthBusy(true);
    setAuthError("");
    setAuthNotice("");
    const email = authEmail.trim().toLowerCase();
    try {
      const redirectUrl = new URL("/", window.location.origin);
      redirectUrl.searchParams.set("screen", "Reset Password");
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl.toString() });
      if (error) throw error;
      setAuthEmail(email);
      setAuthNotice(`If an account exists for ${email}, we sent a password reset link.`);
      setScreen("Reset Email Sent");
    } catch (error) { setAuthError(error.message || "Could not send a reset link. Check your connection and try again."); }
    finally { setAuthBusy(false); }
  };
  const updatePassword = async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const password = String(formData.get("newPassword") ?? "");
    if (password !== String(formData.get("confirmPassword") ?? "")) return setAuthError("The passwords don’t match. Check both fields and try again.");
    setAuthBusy(true);
    setAuthError("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setAuthBusy(false);
      setAuthError("");
      setToast("Password updated. You’re signed in.");
      go(user?.user_metadata?.full_name ? "Home" : "About You");
    } catch (error) { setAuthError(error.message || "Could not update your password. Request a fresh reset link and try again."); setAuthBusy(false); }
  };
  const signInWithGoogle = async () => {
    if (AUTH_DEMO_MODE) {
      const demoUser = { id: "demo-google:pyqcloud@gmail.com", email: "pyqcloud@gmail.com", created_at: new Date().toISOString(), is_demo: true, user_metadata: { full_name: "PYQ Cloud" } };
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoUser));
      setUser(demoUser); setProfileName("PYQ Cloud"); setAccountEmail(demoUser.email);
      if (new URLSearchParams(window.location.search).get("next") === "/admin") { window.location.replace("/admin"); return; }
      setToast("Demo Google sign-in: pyqcloud@gmail.com"); go("Home");
      return;
    }
    try {
      const next = new URLSearchParams(window.location.search).get("next");
      const redirectTo = new URL("/", window.location.origin);
      if (next === "/admin") redirectTo.searchParams.set("next", "/admin");
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo.toString() } });
      if (error) setToast(error.message);
    } catch { setToast("Google sign-in is not configured for this Supabase project yet."); }
  };
  const sendPhoneCode = async (event) => {
    event?.preventDefault?.();
    const phone = phoneNumber.trim().replace(/[\s()-]/g, "");
    if (!/^\+91\d{10}$/.test(phone)) return setToast("Enter a valid 10-digit Indian mobile number.");
    setPhoneBusy(true);
    try {
      if (AUTH_DEMO_MODE) {
        setPhoneNumber(phone); setPhoneCode(""); setPhoneOtpError(false); setPhoneResendCountdown(30);
        setToast("Demo mode: use OTP 123456"); go("Verify Phone");
        return;
      }
      const { error } = await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: true } });
      if (error) throw error;
      setPhoneNumber(phone);
      setPhoneCode("");
      setPhoneOtpError(false);
      setPhoneOtpErrorMessage("Incorrect code. Check the code and try again.");
      setPhoneResendCountdown(30);
      go("Verify Phone");
    } catch (error) { setToast(error.message || "Could not send a code. Check the phone provider setup."); }
    finally { setPhoneBusy(false); }
  };
  const verifyPhoneCode = async (event) => {
    event.preventDefault();
    if (!/^\d{6}$/.test(phoneCode.trim())) {
      setPhoneOtpErrorMessage("Enter the 6-digit code to continue.");
      return setPhoneOtpError(true);
    }
    setPhoneBusy(true);
    setPhoneOtpError(false);
    try {
      if (AUTH_DEMO_MODE) {
        if (phoneCode.trim() !== "123456") throw Object.assign(new Error("Incorrect code"), { status: 400 });
        const demoUser = { id: `demo-phone:${phoneNumber}`, phone: phoneNumber, created_at: new Date().toISOString(), is_demo: true, user_metadata: { full_name: "" } };
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(demoUser));
        setUser(demoUser); setAccountEmail(""); setAccountPhone(phoneNumber); setPhoneOtpErrorMessage("Incorrect code. Check the code and try again.");
        if (new URLSearchParams(window.location.search).get("next") === "/admin") { window.location.replace("/admin"); return; }
        go("Phone Verified");
        return;
      }
      const { data, error } = await supabase.auth.verifyOtp({ phone: phoneNumber, token: phoneCode.trim(), type: "sms" });
      if (error) throw error;
      setUser(data.user ?? null);
      setAccountPhone(data.user?.phone ?? phoneNumber);
      setPhoneOtpErrorMessage("Incorrect code. Check the code and try again.");
      go("Phone Verified");
    } catch (error) {
      const transientFailure = !error?.status || Number(error.status) >= 500 || error.name === "TypeError";
      setPhoneOtpErrorMessage(transientFailure ? "We couldn’t verify the code right now. Check your connection and try again." : "Incorrect code. Check the code and try again.");
      setPhoneOtpError(true);
    }
    finally { setPhoneBusy(false); }
  };
  const resendPhoneCode = async () => {
    if (phoneResendCountdown > 0 || phoneBusy) return;
    setPhoneBusy(true);
    setPhoneOtpError(false);
    try {
      if (AUTH_DEMO_MODE) { setPhoneResendCountdown(30); setToast("Demo OTP is always 123456"); return; }
      const { error } = await supabase.auth.resend({ type: "sms", phone: phoneNumber });
      if (error) throw error;
      setPhoneResendCountdown(30);
      setToast("A new verification code was sent");
    } catch (error) { setToast(error.message || "Could not resend the code. Try again."); }
    finally { setPhoneBusy(false); }
  };
  const saveAboutYou = async (event) => {
    event.preventDefault();
    const fullName = profileName.trim();
    if (!fullName) return setToast("Enter your name to continue.");
    const answers = { full_name: fullName, exam_attempts: aboutExamCount, target_year: aboutTargetYear };
    if (user && !user.is_demo) {
      const { error } = await supabase.auth.updateUser({ data: answers });
      if (error) return setToast(error.message);
      setUser((current) => current ? { ...current, user_metadata: { ...current.user_metadata, ...answers } } : current);
    } else if (user?.is_demo) {
      const updatedDemo = { ...user, user_metadata: { ...user.user_metadata, ...answers } };
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(updatedDemo)); setUser(updatedDemo);
    }
    localStorage.setItem("pyq-onboarding", JSON.stringify(answers));
    setToast("Your profile is ready");
    go("Home");
  };
  const saveAccountSettings = async (event) => {
    event.preventDefault();
    if (!user) return setToast("Sign in to update your account settings.");
    const fullName = profileName.trim();
    try {
      if (user.is_demo) {
        const updatedDemo = { ...user, email: accountEmail.trim() || user.email || undefined, phone: accountPhone.trim() || user.phone, user_metadata: { ...user.user_metadata, full_name: fullName || user.user_metadata?.full_name || "" } };
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(updatedDemo)); setUser(updatedDemo); setAccountEditing(false); setToast("Demo profile updated on this device"); return;
      }
      const changes = { data: { ...user.user_metadata, ...(fullName ? { full_name: fullName } : {}) } };
      if (accountEmail.trim() && accountEmail.trim() !== user.email) changes.email = accountEmail.trim();
      if (accountPhone.trim() && accountPhone.trim() !== user.phone) changes.phone = accountPhone.trim();
      const { error } = await supabase.auth.updateUser(changes);
      if (error) throw error;
      setAccountEditing(false);
      setToast(accountEmail.trim() !== user.email ? "Check your email to confirm the new address." : accountPhone.trim() !== user.phone ? "A code was sent to verify your new phone number." : "Account settings updated.");
    } catch (error) { setToast(error.message || "Could not update account settings."); }
  };
  const copyReferralCode = async () => {
    try { await navigator.clipboard.writeText(referralCode); setToast("Referral code copied"); }
    catch { setToast(`Your referral code is ${referralCode}`); }
  };
  const shareReferral = async () => {
    const url = `${window.location.origin}/?ref=${encodeURIComponent(referralCode)}`;
    const shareData = { title: "Join me on PYQ Cloud", text: `Practice UPSC PYQs with me. Use my code ${referralCode}.`, url };
    if (navigator.share) { try { await navigator.share(shareData); } catch (error) { if (error.name !== "AbortError") setToast("Could not open sharing options"); } }
    else { try { await navigator.clipboard.writeText(`${shareData.text} ${url}`); setToast("Invite link copied"); } catch { setToast(url); } }
  };
  const installApp = async () => {
    if (isInstalledApp) return setToast("PYQ Cloud is already installed.");
    if (!installPrompt) {
      const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
      return setToast(isIOS ? "Tap Share, then choose Add to Home Screen." : "Open your browser menu and choose Install app or Add to Home screen.");
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === "accepted") setToast("PYQ Cloud is being installed.");
      setInstallPrompt(null);
    } catch { setToast("Use your browser menu to install PYQ Cloud."); }
  };
  const saveProfile = async (event) => {
    event.preventDefault();
    if (!user) return go("Auth");
    const fullName = profileName.trim();
    if (!fullName) return setToast("Enter your name to save your profile");
    if (user.is_demo) {
      const updatedDemo = { ...user, user_metadata: { ...user.user_metadata, full_name: fullName } };
      localStorage.setItem(DEMO_USER_KEY, JSON.stringify(updatedDemo)); setUser(updatedDemo); setEditingProfile(false); setToast("Demo profile updated on this device"); return;
    }
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: fullName } });
    if (authError) return setToast(authError.message);
    const { error: profileError } = await supabase.from("profiles").update({ full_name: fullName, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (profileError) return setToast("Name updated, but profile sync failed. Please try again.");
    setEditingProfile(false);
    setToast("Profile updated");
  };
  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!user) return setToast("Sign in to upload a profile photo.");
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) return setToast("Choose a JPG, PNG, WebP or GIF image");
    const maxSize = user.is_demo ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) return setToast(`Choose an image smaller than ${user.is_demo ? "2" : "5"} MB`);
    if (user.is_demo) {
      setAvatarBusy(true);
      try {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not read this image"));
          reader.onerror = () => reject(new Error("Could not read this image"));
          reader.readAsDataURL(file);
        });
        localStorage.setItem(`pyq-demo-avatar:${user.id}`, dataUrl);
        setAvatarUrl(dataUrl);
        setToast("Profile photo saved on this device");
      } catch {
        setToast("Could not save this photo. Choose a smaller image and try again.");
      } finally {
        setAvatarBusy(false);
      }
      return;
    }
    setAvatarBusy(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
      const path = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { error: profileError } = await supabase.auth.updateUser({ data: { avatar_path: path } });
      if (profileError) throw profileError;
      const { data: signedPhoto, error: urlError } = await supabase.storage.from("avatars").createSignedUrl(path, 60 * 60);
      if (urlError) throw urlError;
      setAvatarUrl(signedPhoto.signedUrl);
      setToast("Profile photo updated");
    } catch (error) {
      console.error("Profile photo upload failed:", error);
      setToast(error.message?.includes("Bucket not found") ? 'Avatar storage is not set up yet. Apply the avatars storage migration first.' : "Could not update your photo. Check storage permissions and try again.");
    } finally {
      setAvatarBusy(false);
    }
  };
  const formatTime = (value) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  const setTimerDuration = (value) => {
    const next = Math.min(999, Math.max(1, Math.round(Number(value) || 1)));
    setTimerMinutes(next); setSeconds(next * 60);
    if (mode === "Pomodoro") { setFocusMinutes(next); window.localStorage.setItem("pyq-focus-duration-minutes", JSON.stringify(next)); }
  };
  const timerProgress = mode === "Stopwatch" ? 100 : Math.min(100, Math.max(0, (seconds / Math.max(1, timerMinutes * 60)) * 100));
  const meditationProgress = Math.min(100, Math.max(0, (meditationSeconds / Math.max(1, meditationMinutes * 60)) * 100));
  const referralCode = user?.user_metadata?.referral_code || (user?.id ? `PYQ${user.id.replace(/-/g, "").slice(0, 6).toUpperCase()}` : "PYQCLOUD");

  if (!authReady) return <main className="app-shell"><div className="phone-screen auth-loading" role="status" aria-live="polite"><span className="auth-spinner" aria-hidden="true" />Restoring your session…</div></main>;

  return <main className="app-shell">
    <audio id="pyq-background-music" src={musicSettings.trackUrl || "/audio/pyq-focus.wav"} loop preload="none" onEnded={() => setMusicPlaying(false)} />
    {musicSettings.enabled && <div className="music-player-controls"><button className="music-track-button" aria-label="Choose a music track" aria-expanded={showMusicPicker} onClick={() => setShowMusicPicker((visible) => !visible)}>♫</button><button className={`music-toggle ${musicPlaying ? "playing" : ""}`} aria-label={musicPlaying ? "Pause background music" : "Play background music"} onClick={toggleMusic}><span>{musicPlaying ? "Ⅱ" : "♫"}</span><small>{musicPlaying ? "Music on" : "Focus music"}</small></button>{showMusicPicker && <div className="music-track-menu" role="menu" aria-label="Music tracks">{builtInMusicTracks.map((track) => <button role="menuitem" className={musicSettings.trackUrl === track.url ? "selected" : ""} key={track.url} onClick={() => chooseMusicTrack(track)}><span>♫</span>{track.label}<small>{musicSettings.trackUrl === track.url ? "Selected" : "Play this track"}</small></button>)}</div>}</div>}
    <div className="phone-screen">
      <aside className="desktop-sidebar" aria-label="Main menu">
        <div className="desktop-brand"><span className="desktop-brand-mark"><img src="/brand/cloud-ai-logo.png" alt="" /></span><span><b>Cloud.ai</b><small>Keep learning. Keep growing.</small></span></div>
        <nav className="desktop-side-nav">
          {[
            ["LEARN", [["Home", figmaAsset.home], ["Practice by Subject", figmaAsset.subject], ["Practice by Year", figmaAsset.year], ["Random Practice", figmaAsset.random], ["Mistake Book", figmaAsset.mistake], ["Tests", figmaAsset.tests], ["Bookmarks", figmaAsset.bookmarks]]],
            ["YOUR SPACE", [["Notes", figmaAsset.notes], ["Study Timer", figmaAsset.timer], ["Meditation", figmaAsset.meditation]]],
            ["YOUR GROWTH", [["My Habits", figmaAsset.habits], ["Analytics & Streak", figmaAsset.goal], ["CSR Activity", figmaAsset.social], ["My Profile", figmaAsset.profile]]],
          ].map(([group, items]) => <div className="desktop-nav-group" key={group}><small>{group}</small>{items.map(([item, asset]) => <button key={item} className={`desktop-nav-item ${screen === item || (screen === "Practice" && item === "Home") || (screen === "Mistake List" && item === "Mistake Book") ? "active" : ""}`} onClick={() => go(item)}><img src={asset} alt="" /><span>{item}</span></button>)}</div>)}
        </nav>
        <div className="desktop-sidebar-bottom"><span className="desktop-plan-icon">✦</span><span><b>Free plan</b><small>Start with your next question</small></span><i>›</i></div>
      </aside>
      <header className="desktop-header">
        <div className="desktop-breadcrumb"><span>PYQ CLOUD</span><b>{screen === "Home" ? "Overview" : screen}</b></div>
        <div className="desktop-header-actions"><span className="desktop-today">Good evening, {profileName || user?.user_metadata?.full_name || "Vimanyu"}</span><button className="desktop-notice" aria-label="Notifications" onClick={() => setToast("You’re all caught up") }><img src={figmaAsset.bell} alt="" /></button><button className="desktop-user" onClick={() => go("My Profile")}><img src={avatarUrl || figmaAsset.avatar} alt="" /><span>{profileName || user?.user_metadata?.full_name || "Vimanyu"}</span><i>⌄</i></button></div>
      </header>
      <div className="status-bar"><span>9:41</span><img src={figmaAsset.signal} alt="" /></div>
      {screen === "Welcome" && <section className="welcome-flow">
        <div className="welcome-brand"><img className="welcome-mascot" src="/figma-assets-oct-2026/cloud-logo-transparent.png" alt="" /><div className="welcome-logotype">PYQ <span>Cloud</span></div></div>
        <div className="welcome-copy"><h1>Your UPSC<br /><em>mini-ecosystem.</em></h1><strong>Master UPSC Previous Year Questions.</strong><p>Build better habits, save notes, and find your focus with meditation.</p></div>
        <div className="welcome-feature-row">{[[figmaAsset.subject, "PYQs"], [figmaAsset.habits, "Habits"], [figmaAsset.notes, "Notes"], [figmaAsset.meditation, "Meditation"]].map(([asset, label], index) => <Fragment key={label}>{index === 1 && <i aria-hidden="true">+</i>}<span className={index === 0 ? "featured" : ""}><img src={asset} alt="" />{label}</span></Fragment>)}</div>
        <div className="welcome-actions"><strong>Get started</strong><button className="google-auth-button" onClick={signInWithGoogle}><span className="google-g" aria-hidden="true"><svg viewBox="0 0 48 48"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11c-.5 2.6-2 4.9-4.3 6.4v5.3h7c4.1-3.8 6.5-9.3 6.5-15.4z"/><path fill="#34A853" d="M24 44c5.9 0 10.8-2 14.4-5.4l-7-5.3c-1.9 1.3-4.4 2-7.4 2-5.7 0-10.5-3.8-12.2-9H4.6v5.5C8.2 39.3 15.5 44 24 44z"/><path fill="#FBBC05" d="M11.8 26.3c-.4-1.3-.7-2.7-.7-4.3s.2-3 .7-4.3v-5.5H4.6C3.1 15.2 2.2 18.4 2.2 22s.9 6.8 2.4 9.8l7.2-5.5z"/><path fill="#EA4335" d="M24 10.7c3.2 0 6 1.1 8.2 3.2l6.1-6.1C34.8 4.4 29.9 2 24 2 15.5 2 8.2 6.7 4.6 13.8l7.2 5.5c1.7-5.2 6.5-8.6 12.2-8.6z"/></svg></span>Continue with Google</button><button className="phone-auth-button" onClick={() => go("Phone Auth")}><span aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1.1-.3 1.2.4 2.5.6 3.8.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10 21 3 14 3 5c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.6.6 3.8.1.4 0 .8-.3 1.1z"/></svg></span>Continue with Phone</button><button className="welcome-email-link" onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); go("Auth"); }}>Sign in or create an account with email</button><small>By continuing, you agree to our <button onClick={() => setToast("Terms and privacy details will be added by the client.")}>Terms &amp; Privacy Policy.</button></small></div>
      </section>}
      {screen === "Phone Auth" && <Content className="phone-auth-page" title="Continue with phone" subtitle="We’ll text you a one-time verification code." back={() => go("Welcome")} character="happy"><form className="phone-auth-form" onSubmit={sendPhoneCode}><label htmlFor="phone-number">Phone number</label><div className={`phone-number-field ${phoneNumber.replace(/^\+91/, "").length === 10 ? "valid" : ""}`}><span>+91</span><input id="phone-number" type="tel" inputMode="numeric" autoComplete="tel-national" value={phoneNumber.replace(/^\+91/, "").replace(/^(\d{5})(\d{5})$/, "$1 $2")} onChange={(event) => { let digits = event.target.value.replace(/\D/g, ""); if (digits.startsWith("0091") && digits.length > 10) digits = digits.slice(4); else if (digits.startsWith("91") && digits.length > 10) digits = digits.slice(2); else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1); setPhoneNumber(`+91${digits.slice(0, 10)}`); }} placeholder="Enter 10-digit phone number" required /></div><small>{AUTH_DEMO_MODE ? "Local demo: enter any valid number. Use OTP 123456." : "Standard SMS charges may apply."}</small><button className="primary-button full-button" type="submit" disabled={phoneBusy || phoneNumber.replace(/^\+91/, "").length !== 10}>{phoneBusy ? "Sending code…" : "Send verification code"}</button><small className="phone-security-note"><span aria-hidden="true">♢</span> Your number is used to secure your account.</small></form></Content>}
      {screen === "Verify Phone" && <Content className="phone-auth-page verify-phone-page" title={phoneBusy ? "Verifying your number" : "Verify your number"} subtitle={phoneBusy ? "Securely checking your one-time code." : `Enter the 6-digit code sent to ${formatIndianPhone(phoneNumber)}.`} back={() => go("Phone Auth")}><form className="phone-auth-form verify-phone-form" onSubmit={verifyPhoneCode}><label htmlFor="phone-code">Verification code</label><div className={`otp-code-boxes ${phoneOtpError ? "error" : ""}`} onClick={() => document.getElementById("phone-code")?.focus()}><input id="phone-code" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneCode} onChange={(event) => { setPhoneCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setPhoneOtpError(false); }} aria-label="Six-digit verification code" disabled={phoneBusy} /><div aria-hidden="true">{Array.from({length:6},(_,index)=><span key={index} className={index === phoneCode.length && !phoneOtpError ? "active" : ""}>{phoneCode[index] || ""}</span>)}</div></div>{phoneOtpError && <small className="otp-error" role="alert">{phoneOtpErrorMessage}</small>}<button className="primary-button full-button" type="submit" disabled={phoneBusy || phoneCode.length !== 6}>{phoneBusy && <span className="auth-spinner" aria-hidden="true" />}{phoneBusy ? "Verifying…" : "Verify & Continue"}</button></form><button className="wrong-number-link" onClick={() => { setPhoneCode(""); setPhoneOtpError(false); setPhoneOtpErrorMessage("Incorrect code. Check the code and try again."); go("Phone Auth"); }}>Wrong number? <span>Change phone number</span></button><button className="resend-code-link" onClick={resendPhoneCode} disabled={phoneResendCountdown > 0 || phoneBusy}>{phoneResendCountdown > 0 ? `Resend code in ${formatTime(phoneResendCountdown)}` : "Didn’t get the code? Resend OTP"}</button></Content>}
      {screen === "Phone Verified" && <section className="phone-verified-page"><div className="phone-verified-content"><div className="phone-verified-mascot" aria-hidden="true"><Lottie src="/mascot-lottie/cloudy-happy-jump.json" autoplay loop /></div><h1>Phone verified!</h1><p>Your phone number has been verified successfully.</p></div><button className="primary-button full-button" onClick={() => go(user?.user_metadata?.full_name ? "Home" : "About You")}>Continue</button></section>}
      {screen === "Home" && <header className="topbar">
        <button className="icon-button" aria-label="Open menu" onClick={() => setDrawer(true)}><img src={figmaAsset.menu} alt="" /></button>
        <div className="brand-word"><img src="/brand/cloud-ai-logo.png" alt="" /><span>Cloud.ai</span></div>
      <button className="icon-button notification" aria-label="Notifications" onClick={async () => { if (!("Notification" in window)) return setToast("Notifications aren’t supported in this browser"); const permission = await Notification.requestPermission(); setToast(permission === "granted" ? "Permission granted. Push delivery still needs setup." : "You can enable notifications in browser settings"); }}><img src={figmaAsset.bell} alt="" /></button>
      </header>}

      {screen === "Home" && <section className="home-page">
        <div className="greeting-row"><div><p className="eyebrow">Good evening, <b>{profileName || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Vimanyu"} 👋</b></p><h1>PYQs (2013-2026) are<br />ready for you.</h1></div><div className="cloud-mascot" role="img" aria-label="PYQ Cloud animated mascot"><Lottie className="home-mascot-animation" src="/mascot-lottie/cloudy-idle.json?v=figma-home-20261028" autoplay loop /><img className="mascot-star" src="/figma-assets/s2-b34d8.png" alt="" /></div></div>
        <div className="practice-grid">
          <ActionCard title="Practice by Subject" body="Choose a subject and practice PYQs" asset={figmaAsset.subject} tone="violet" onClick={() => go("Practice by Subject")} />
          <ActionCard title="Practice by Year" body="Select a year and practice PYQs" asset={figmaAsset.year} tone="teal" onClick={() => go("Practice by Year")} />
          <ActionCard title="Random Practice" body="Mixed PYQs from all subjects" asset={figmaAsset.random} tone="orange" onClick={() => go("Random Practice")} />
          <ActionCard title="Mistake Book" body="Practice PYQs you got wrong" asset={figmaAsset.mistake} tone="pink" onClick={() => go("Mistake Book")} />
        </div>
        <button className="resume-card" onClick={() => startPractice(availableSubjects[0] || "Polity")}><span className="resume-icon"><img src={figmaAsset.resume} alt="" /></span><span><strong>Pick up where you left</strong><small>Continue your last practice session.</small></span><span className="round-arrow">→</span></button>
        <button className="goal-card" onClick={() => go("Analytics & Streak")}>
          <div className="goal-title"><span className="goal-icon"><img src={figmaAsset.goal} alt="" /></span><span>Daily Goal</span><b>{Math.min(analytics.today, 20)}/20 <small>Questions</small></b><span className="progress-ring"><strong>{Math.min(100, Math.round(analytics.today / 20 * 100))}%</strong></span></div>
          <div className="goal-stats"><span><b className="hot"><img src={figmaAsset.streak} alt="" /> {analytics.streak}</b><small>Day Streak</small></span><span><b className="mint"><img src={figmaAsset.solved} alt="" /> {completedQuestionCount.toLocaleString()}</b><small>Questions Solved</small></span><span><b className="rose"><img src={figmaAsset.accuracy} alt="" /> {analytics.correct}%</b><small>Accuracy</small></span></div>
        </button>
      </section>}

      {screen === "Practice by Subject" && <Content title="Practice by Subject" subtitle="Master one subject at a time." back={() => go("Home")} character="reading"><div className="choice-list">{subjectPickerOptions.map((item, i) => <button key={item} className="choice-row subject-topic-row" onClick={() => { setSubject(item); setSelectedTopics([]); setTopicQuestionCount(25); go("Subject Topics"); }}><span className={`subject-glyph hue-${i % subjectIcons.length}`}><img src={subjectIcons[i % subjectIcons.length]} alt="" /></span><span><b>{item}</b><small>{questions.filter((question) => canonicalSubject(question.subject) === canonicalSubject(item)).length} Questions</small></span><span className="chevron">›</span></button>)}</div></Content>}

      {screen === "Subject Topics" && <Content title={subject} subtitle="Choose the topics you want to focus on." back={() => go("Practice by Subject")} character="reading"><label className="topic-option topic-select-all"><input type="checkbox" checked={subjectTopics.length > 0 && selectedTopics.length === subjectTopics.length} onChange={(event) => setSelectedTopics(event.target.checked ? subjectTopics : [])} /><span>Select all</span></label><div className="topic-list">{subjectTopics.map((topic) => { const topicQuestions = questions.filter((item) => canonicalSubject(item.subject) === canonicalSubject(subject) && displayTopic(item.topic || item.tag) === topic); const attempted = topicQuestions.filter((item) => attemptedIds.has(item.id)).length; return <label className="topic-option" key={topic}><input type="checkbox" checked={selectedTopics.includes(topic)} onChange={() => setSelectedTopics((items) => items.includes(topic) ? items.filter((item) => item !== topic) : [...items, topic])} /><span><b>{topic}</b><small>{attempted} of {topicQuestions.length} attempted</small></span></label>; })}{!subjectTopics.length && <Empty icon="▤" title="No topics available" text="Topics will appear after questions are added for this subject." />}</div><div className="topic-test-options"><label>Number of questions <span className="random-count-control"><button type="button" aria-label="Decrease question count" onClick={() => setTopicQuestionCount((count) => Math.max(5, count - 5))}>−</button><input type="number" min="5" max="100" value={topicQuestionCount} onChange={(event) => setTopicQuestionCount(Math.max(5, Math.min(100, Number(event.target.value) || 5)))} /><button type="button" aria-label="Increase question count" onClick={() => setTopicQuestionCount((count) => Math.min(100, count + 5))}>＋</button></span></label><label className="topic-attempted">Include questions that I have already attempted.<input type="checkbox" checked={includeAttempted} onChange={(event) => setIncludeAttempted(event.target.checked)} /></label></div><button className="primary-button topic-continue" disabled={!selectedTopics.length} onClick={() => { setQuestionIndex(0); setSubject(subject); go("Practice"); }}>Continue <span>→</span></button></Content>}

      {screen === "Practice by Year" && <Content title="Practice by Year" subtitle="Practice a complete year’s paper." back={() => go("Home")} character="reading"><div className="year-section-label">Select by year</div><div className="year-grid">{availableYears.map((year) => <button className={`year-chip ${selectedYear === year ? "selected" : ""}`} key={year} onClick={() => setSelectedYear(year)}>{year}</button>)}</div><button className="primary-button full-button year-start-button" disabled={!selectedYear} onClick={() => { setSubject(selectedYear); go("Practice"); }}>Start Practice <span>→</span></button></Content>}

      {screen === "Random Practice" && <Content className="random-practice-page" title="Random Practice" subtitle="Challenge yourself with PYQs from all UPSC subjects." back={() => go("Home")} character="reading"><div className="random-intro">Use this mode if you are super confident about PYQs!</div><label className="random-field-label" htmlFor="random-count">Number of questions</label><div className="random-count-control"><button aria-label="Decrease question count" onClick={() => setRandomCount((value) => Math.max(5, value - 5))}>−</button><input id="random-count" type="number" min="5" max="100" value={randomCount} onChange={(event) => setRandomCount(Math.min(100, Math.max(5, Number(event.target.value) || 5)))} /><button aria-label="Increase question count" onClick={() => setRandomCount((value) => Math.min(100, value + 5))}>＋</button></div><label className="attempted-toggle"><input type="checkbox" checked={includeAttempted} onChange={(event) => setIncludeAttempted(event.target.checked)} /><span>Include questions that I have already attempted.</span></label><button className="primary-button full-button" onClick={() => startPractice("Mixed Practice")}>Start Practice <span>→</span></button></Content>}

      {screen === "Practice" && !questionList.length && <Content title={`${subject} Practice`} subtitle="Questions are being added" back={() => go("Home")}><Empty icon="▤" title="No questions in this set yet" text="Try another subject or year. The PYQ Cloud question bank will appear here as the client content is loaded." /></Content>}
      {screen === "Practice" && practiceFinished && <Content title="Practice set complete" subtitle="You have reached the end of this set." back={() => go("Home")}><div className="question-card practice-complete-card"><h2>Practice complete</h2><p>{questionList.length} {questionList.length === 1 ? "question was" : "questions were"} in this set. {question.isDemo ? "This was a demo question; the complete question bank has not been loaded here yet." : "Choose another set to continue practicing."}</p></div><button className="primary-button full-button" onClick={() => go("Practice by Subject")}>Choose another practice set <span>→</span></button></Content>}
      {screen === "Practice" && !practiceFinished && questionList.length > 0 && <Content title={testInProgress ? "Test Mode" : subject === "Mixed Practice" ? "Random Practice" : `${subject} Practice`} subtitle={`Question ${questionIndex + 1} of ${questionList.length} in ${practiceScope} · Exam year ${question.year}${testInProgress ? ` · ${formatTime(seconds)} left` : ""}`} back={() => { setTimerRunning(false); setTestInProgress(false); go("Home"); }}><div className="question-toolbar"><span className="question-tag">{question.subject} · {question.tag}</span><div>{testInProgress && <button className="mini-icon" aria-label="Open question palette" onClick={() => setShowQuestionPalette(true)}>▦</button>}<button className={`mini-icon ${bookmarks.includes(question.prompt) ? "active" : ""}`} aria-label="Bookmark" onClick={toggleBookmark}>♧</button><button className="mini-icon" aria-label="Copy question" onClick={async () => { await navigator.clipboard?.writeText(question.prompt); setToast("Question copied"); }}>▢</button></div></div>{question.isDemo && <div className="question-bank-notice" role="status">Demo question: the complete question bank has not been loaded for this set yet.</div>}{!question.isDemo && questionList.length === 1 && <div className="question-bank-notice" role="status">Only one question is currently available in this set.</div>}<div className="question-card"><div className="question-meta">UPSC CSE PRELIMS <span>● 1 mark</span></div><h2>{question.prompt}</h2></div><div className="answers">{question.options.map((option, i) => <div key={option} className={`answer-wrap ${eliminated.includes(i) ? "eliminated" : ""}`}><button className={`answer-option ${!testInProgress && displaySelected === i ? i === question.answer ? "correct" : "incorrect" : !testInProgress && displaySelected !== null && i === question.answer ? "correct" : testInProgress && displaySelected === i ? "test-selected" : ""}`} onClick={() => chooseAnswer(i)}><span className="answer-letter">{String.fromCharCode(65 + i)}</span><span>{option}</span>{!testInProgress && displaySelected !== null && i === question.answer && <b className="answer-mark">✓</b>}</button><button className="eliminate-button" onClick={() => setEliminated((value) => value.includes(i) ? value.filter((item) => item !== i) : [...value, i])}>×</button></div>)}</div>{!testInProgress && displaySelected !== null && <div className={`explanation ${displaySelected === question.answer ? "good" : "bad"}`}><b>{displaySelected === question.answer ? "Correct answer" : "Keep going — learn from this"}</b><RichExplanation content={question.explanation} /></div>}<div className="practice-footer">{testInProgress ? <><button className={`ghost-button ${testReviewFlags.includes(questionIndex) ? "marked-review" : ""}`} onClick={() => setTestReviewFlags((flags) => flags.includes(questionIndex) ? flags.filter((index) => index !== questionIndex) : [...flags, questionIndex])}>{testReviewFlags.includes(questionIndex) ? "✓ Marked" : "⚑ Review"}</button><button className="ghost-button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((value) => Math.max(0, value - 1))}>Previous</button><button className="primary-button" onClick={nextQuestion}>{questionIndex + 1 >= questionList.length ? "Submit Test" : "Next question"} <span>→</span></button></> : <><button className="ghost-button" onClick={() => { setSelected(null); setEliminated([]); }}>Skip</button><button className="primary-button" onClick={nextQuestion}>{questionIndex + 1 >= questionList.length ? "Finish set" : "Next question"} <span>→</span></button></>}</div></Content>}

      {screen === "Test Results" && submittedTest && <Content className="test-results-page" title="Test Results" subtitle="Your performance from this test." back={() => go("Tests")}><section className="test-score-card"><small>{subject} · {submittedTest.questions.length} questions</small><strong>{submittedTest.score}</strong><span>Score out of {submittedTest.questions.length * 2}</span></section><div className="test-result-stats"><div><b>{submittedTest.accuracy}%</b><small>Accuracy</small></div><div><b>{submittedTest.correct}</b><small>Correct</small></div><div><b>{submittedTest.incorrect}</b><small>Incorrect</small></div><div><b>{submittedTest.unanswered}</b><small>Unanswered</small></div></div><div className="test-review-heading"><h2>Review Questions</h2><span>{submittedTest.questions.length} total</span></div><div className="test-results-list">{submittedTest.questions.map((item, index) => <button key={item.id || index} className="test-result-question" onClick={() => { setTestReviewIndex(index); go("Test Review"); }}><span className={`test-result-status ${submittedTest.answers[index] === undefined ? "unanswered" : submittedTest.answers[index] === item.answer ? "right" : "wrong"}`}>{index + 1}</span><span><b>{item.prompt}</b><small>{submittedTest.answers[index] === undefined ? "Not answered" : submittedTest.answers[index] === item.answer ? "Correct" : "Incorrect"}{submittedTest.reviewFlags.includes(index) ? " · Marked for review" : ""}</small></span><i>›</i></button>)}</div><button className="primary-button full-button" onClick={() => go("Tests")}>Back to Tests <span>→</span></button></Content>}
      {screen === "Test Review" && submittedTest && submittedTest.questions[testReviewIndex] && <Content className="test-review-page" title="Review Question" subtitle={`Question ${testReviewIndex + 1} of ${submittedTest.questions.length}`} back={() => go("Test Results")}><div className="question-toolbar"><span className="question-tag">{submittedTest.questions[testReviewIndex].subject} · {submittedTest.questions[testReviewIndex].tag}</span><span className="question-tag">{submittedTest.answers[testReviewIndex] === undefined ? "Unanswered" : submittedTest.answers[testReviewIndex] === submittedTest.questions[testReviewIndex].answer ? "Correct" : "Incorrect"}</span></div><div className="question-card"><div className="question-meta">UPSC CSE PRELIMS <span>● 1 mark</span></div><h2>{submittedTest.questions[testReviewIndex].prompt}</h2></div><div className="answers">{submittedTest.questions[testReviewIndex].options.map((option, index) => <div key={option} className="answer-wrap"><div className={`answer-option ${index === submittedTest.questions[testReviewIndex].answer ? "correct" : submittedTest.answers[testReviewIndex] === index ? "incorrect" : ""}`}><span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span>{index === submittedTest.questions[testReviewIndex].answer && <b className="answer-mark">✓</b>}</div></div>)}</div><div className="explanation"><b>{submittedTest.answers[testReviewIndex] === submittedTest.questions[testReviewIndex].answer ? "Correct answer" : "Review the correct answer"}</b><RichExplanation content={submittedTest.questions[testReviewIndex].explanation} /></div><div className="practice-footer"><button className="ghost-button" disabled={testReviewIndex === 0} onClick={() => setTestReviewIndex((index) => Math.max(0, index - 1))}>Previous</button><button className="primary-button" disabled={testReviewIndex + 1 >= submittedTest.questions.length} onClick={() => setTestReviewIndex((index) => Math.min(submittedTest.questions.length - 1, index + 1))}>Next <span>→</span></button></div></Content>}

      {showQuestionPalette && testInProgress && <div className="test-overlay" role="presentation" onClick={() => setShowQuestionPalette(false)}><section className="test-dialog question-palette" role="dialog" aria-modal="true" aria-labelledby="question-palette-title" onClick={(event) => event.stopPropagation()}><header><div><h2 id="question-palette-title">Question Palette</h2><p>Jump to any question in this test.</p></div><button aria-label="Close question palette" onClick={() => setShowQuestionPalette(false)}>×</button></header><div className="palette-grid">{testQuestions.map((_, index) => <button key={index} className={`${index === questionIndex ? "current" : ""} ${testAnswers[index] !== undefined ? "answered" : ""} ${testReviewFlags.includes(index) ? "review" : ""}`} onClick={() => { setQuestionIndex(index); setShowQuestionPalette(false); }}>{index + 1}</button>)}</div><div className="palette-legend"><span><i className="current" />Current</span><span><i className="answered" />Answered</span><span><i className="review" />Review</span><span><i />Unanswered</span></div><div className="palette-totals"><span>Answered <b>{Object.keys(testAnswers).length}</b></span><span>For review <b>{testReviewFlags.length}</b></span><span>Unanswered <b>{testQuestions.length - Object.keys(testAnswers).length}</b></span></div><button className="primary-button full-button" onClick={() => setShowQuestionPalette(false)}>Return to Question <span>→</span></button></section></div>}
      {showSubmitTest && testInProgress && <div className="test-overlay" role="presentation" onClick={() => setShowSubmitTest(false)}><section className="test-dialog submit-test-dialog" role="dialog" aria-modal="true" aria-labelledby="submit-test-title" onClick={(event) => event.stopPropagation()}><div className="submit-test-icon">?</div><h2 id="submit-test-title">Submit Test?</h2><p>You’ve answered {Object.keys(testAnswers).length} of {testQuestions.length} questions.</p><p>{testQuestions.length - Object.keys(testAnswers).length} questions will be submitted as unanswered. You can still go back and review them.</p><div className="submit-test-actions"><button className="ghost-button" onClick={() => setShowSubmitTest(false)}>Continue Test</button><button className="primary-button" onClick={submitTest}>Submit &amp; View Results</button></div></section></div>}

      {screen === "Tests" && <Content className="tests-page" title="Test Mode" subtitle="Simulate real-life exam experience." back={() => go("Home")}><button className="test-rules-trigger" aria-label="Test rules" onClick={() => setShowTestRules(true)}>ⓘ</button><section className="test-config-card test-year-card"><div className="test-config-heading"><span className="test-config-icon">▣</span><div><b>Test by Year</b><small>Solve a complete UPSC paper from a selected year</small></div></div><div className="test-mode-tags"><span>◉ Full length test</span><span>{testYear ? `${questions.filter((item) => String(item.year) === testYear).length} loaded` : "100 Qs"}</span><span>2 hours</span></div><label className="test-select-label" htmlFor="test-year">Select Year</label><select id="test-year" className="test-select" value={testYear} onChange={(event) => setTestYear(event.target.value)}><option value="">Select Year</option>{availableYears.map((year) => <option key={year} value={year}>{year}</option>)}</select><button className="primary-button test-start" onClick={() => { if (!testYear) { setToast("Select a year to start a test"); return; } startConfiguredTest(testYear, 100, 7200); }}>Start Test <span>→</span></button></section><section className="test-config-card test-subject-card"><div className="test-config-heading"><span className="test-config-icon">♧</span><div><b>Test by Subject</b><small>Choose a subject and solve a set of PYQs</small></div></div><label className="test-select-label" htmlFor="test-subject">Select Subject</label><select id="test-subject" className="test-select" value={testSubject} onChange={(event) => setTestSubject(event.target.value)}><option value="">Select Subject</option>{subjectPickerOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><label className="test-select-label question-count-label">Number of Questions</label><div className="test-count-options">{[10,20,25,50,100].map((count) => <button key={count} className={testQuestionCount === count ? "selected" : ""} onClick={() => setTestQuestionCount(count)}>{count}</button>)}</div><p className="test-time-note">ⓘ {testSubject && questions.filter((item) => canonicalSubject(item.subject).toLowerCase() === canonicalSubject(testSubject).toLowerCase()).length < testQuestionCount ? `Only ${questions.filter((item) => canonicalSubject(item.subject).toLowerCase() === canonicalSubject(testSubject).toLowerCase()).length} questions are currently available for this subject.` : "You’ll get one minute per question."}</p><button className="primary-button test-start outline-test-start" onClick={() => { if (!testSubject) { setToast("Select a subject to start a test"); return; } startConfiguredTest(testSubject, testQuestionCount, testQuestionCount * 60); }}>Start Test <span>→</span></button></section><div className="test-history-heading"><h2>Test History</h2><button onClick={() => setToast("Your completed tests will appear here")}>View all ›</button></div>{testHistory.length ? <div className="test-history-list">{testHistory.map((item, index) => <button className="test-history-item" key={`${item.completedAt}-${index}`} onClick={() => { setSubmittedTest(item); setSubject(item.subject); go("Test Results"); }}><span><b>{item.subject} Test</b><small>{new Date(item.completedAt).toLocaleDateString()} · {item.questions.length} questions · {item.correct} correct</small></span><strong>{item.score} pts</strong><i>›</i></button>)}</div> : <div className="test-history-empty">Your completed tests will appear here.</div>}{showTestRules && <div className="test-rules-backdrop" role="presentation" onClick={() => setShowTestRules(false)}><section className="test-rules-modal" role="dialog" aria-modal="true" aria-labelledby="test-rules-title" onClick={(event) => event.stopPropagation()}><button className="test-rules-close" aria-label="Close test rules" onClick={() => setShowTestRules(false)}>×</button><h2 id="test-rules-title">Test Rules</h2><div className="test-rules-section"><b>ⓘ Information</b><span>Total Questions <strong>{testYear ? questions.filter((item) => String(item.year) === testYear).length : 100}</strong></span><span>Duration <strong>2 hours</strong></span></div><div className="test-rules-section"><b>▣ Marking Scheme (UPSC Pattern)</b><span>🟢 Correct Answer <strong>+2 marks</strong></span><span>🔴 Wrong Answer <strong>-0.67 marks</strong></span></div><p>Please note: Test will auto-submit when time is up. Make sure you have a stable internet connection.</p><button className="primary-button" onClick={() => { if (!testYear && !testSubject) { setToast("Choose a year or subject first"); return; } setShowTestRules(false); if (testYear) startConfiguredTest(testYear, 100, 7200); else startConfiguredTest(testSubject, testQuestionCount, testQuestionCount * 60); }}>Start Test <span>→</span></button></section></div>}</Content>}

      {screen === "Bookmarks" && <Content title="Bookmarks" subtitle="Your saved PYQs for quick revision." showBack={false} back={() => go("Home")} character="reading"><div className="bookmark-total"><span className="subject-glyph hue-0"><img src={figmaAsset.bookmarks} alt="" /></span><span><small>Total Bookmarks</small><strong>{bookmarks.length}</strong></span></div><div className="section-heading bookmark-heading"><h3>Browse by subject</h3></div><div className="choice-list bookmark-subject-list">{bookmarkSubjects.map((item, i) => { const count = savedQuestions.filter((question) => question.subject === item).length; return <button key={item} className="bookmark-subject" onClick={() => { setSubject(item); setBookmarkTopic("All topics"); setBookmarkSearch(""); go("Bookmark Subject"); }}><span className={`subject-glyph hue-${i % subjectIcons.length}`}><img src={subjectIcons[i % subjectIcons.length]} alt="" /></span><span><b>{item}</b></span><strong>{count}</strong><span className="bookmark-chevron">›</span></button>; })}</div></Content>}
      {screen === "Bookmark Subject" && <Content title={`${subject} Bookmarks`} subtitle={`${savedQuestions.filter((item) => item.subject === subject).length} saved PYQs.`} back={() => go("Bookmarks")} character="reading"><div className="bookmark-filters"><select aria-label="Filter bookmarks by topic" value={bookmarkTopic} onChange={(event) => setBookmarkTopic(event.target.value)}><option>All topics</option>{bookmarkTopics.map((topic) => <option key={topic}>{topic}</option>)}</select><span className="bookmark-sort">Newest <b>⌄</b></span></div><label className="bookmark-search"><span>⌕</span><input aria-label="Search saved PYQs" value={bookmarkSearch} onChange={(event) => setBookmarkSearch(event.target.value)} placeholder="Search saved PYQs" /></label>{filteredSavedQuestions.length ? filteredSavedQuestions.map((item, i) => <article className="bookmark-question" key={item.id || item.prompt}><div className="bookmark-question-mark">▮</div><div className="bookmark-question-copy"><small>Q{i + 1}</small><p>{item.prompt}</p><span>{item.topic || item.tag || item.subject}</span></div><button aria-label="Practice this saved question" onClick={() => { startPractice(subject); }}><img src={figmaAsset.arrow} alt="" /></button></article>) : <Empty icon="♧" title={bookmarkSearch ? "No matching bookmarks" : "No saved questions yet"} text={bookmarkSearch ? "Try another search or topic." : "Save a question while you practice and it will appear here."} />}</Content>}

      {screen === "Mistake Book" && <Content className="mistake-page" title="Mistake Book" subtitle="Practice PYQs you got wrong and improve your accuracy." back={() => go("Home")} character="reading"><div className="mistake-summary"><strong>{mistakes.length}</strong><span><b>Total Mistakes</b><small>across all subjects</small></span></div><button className="choice-row mistake-action" onClick={() => { setMistakeSubjectFilter("All subjects"); setMistakeSearch(""); go("Mistake List"); }}><span className="subject-glyph hue-1"><img src={figmaAsset.mistake} alt="" /></span><span><b>View all mistakes</b><small>Review all incorrect PYQs in one place.</small></span><span className="chevron">›</span></button><button className="choice-row mistake-action" onClick={() => setShowMistakeSubjectPicker((value) => !value)}><span className="subject-glyph hue-2"><img src={subjectIcons[0]} alt="" /></span><span><b>View by subject</b><small>Focus on mistakes subject-wise.</small></span><span className="chevron">{showMistakeSubjectPicker ? "⌃" : "›"}</span></button>{showMistakeSubjectPicker && <div className="mistake-subject-panel"><label htmlFor="mistake-subject-select">Select Subject</label><select id="mistake-subject-select" value={mistakeSubjectSelection} onChange={(event) => setMistakeSubjectSelection(event.target.value)}><option value="">Choose a subject</option>{mistakeSubjectOptions.map((item) => <option key={item}>{item}</option>)}</select><button className="primary-button" disabled={!mistakeSubjectSelection} onClick={() => { setMistakeSubjectFilter(mistakeSubjectSelection); setMistakeSearch(""); go("Mistake List"); }}>View Mistakes <span>→</span></button></div>}</Content>}
      {screen === "Mistake List" && <Content className="mistake-list-page" title={mistakeSubjectFilter === "All subjects" ? "All Mistakes" : `${mistakeSubjectFilter} Mistakes`} subtitle={`${filteredMistakeItems.length} ${filteredMistakeItems.length === 1 ? "mistake" : "mistakes"}${mistakeSubjectFilter === "All subjects" ? " across all subjects" : ` in ${mistakeSubjectFilter}`}.`} back={() => go("Mistake Book")} character="reading"><div className="mistake-list-toolbar"><label><span>⌕</span><input aria-label="Search mistakes" placeholder="Search question or topic" value={mistakeSearch} onChange={(event) => setMistakeSearch(event.target.value)} /></label><select aria-label="Sort mistakes" value={mistakeSort} onChange={(event) => setMistakeSort(event.target.value)}><option>Newest</option><option>Oldest</option></select></div>{filteredMistakeItems.length ? filteredMistakeItems.map((prompt,index)=>{const item=questions.find((question)=>question.prompt===prompt);return <article className="mistake-list-item" key={`${prompt}-${index}`}><span className="mistake-list-number">{index+1}</span><div><p>{prompt}</p><small>{item?.subject || "PYQ"}</small></div><button aria-label="Review mistake" onClick={() => { setReviewQuestionPrompt(prompt); setSubject(item?.subject || "Polity"); setQuestionIndex(0); setPracticeFinished(false); setSelected(null); setEliminated([]); go("Practice"); }}>›</button></article>;}) : <Empty icon="✓" title={mistakeSearch ? "No matching mistakes" : "No mistakes to review"} text={mistakeSearch ? "Try another question or topic." : "Questions you answer incorrectly will appear here."} />}</Content>}

      {screen === "Notes" && <Content className="notes-page" title="My Notes" subtitle="Jot down what matters." back={() => go("Home")} character="reading"><div className="notes-toolbar"><div><b>My Notes ({notes.length})</b><small>{notes.length ? "Drag to reorder your notes." : "Your saved notes"}</small></div>{notes.length > 1 && <button className="text-action" onClick={() => setToast("Notes are in their saved order")}>↻ Reset Order</button>}</div>{notes.length > 0 && <div className="notes-list">{notes.map((note) => { const words = note.text.trim().split(/\s+/).filter(Boolean).length; const title = note.text.split(/\n/)[0].slice(0, 42) || "Untitled note"; return <article className="note-card" key={note.id}><span className="note-drag-handle" aria-hidden="true">⠿</span><div className="note-card-copy"><b>{title}</b><small>{words} words</small></div><button aria-label={`Delete ${title}`} onClick={async () => { if (user && !user.is_demo) { const { error } = await supabase.from("notes").delete().eq("id", note.id).eq("user_id", user.id); if (error) return setToast("Could not delete note"); } setNotes((value) => value.filter((item) => item.id !== note.id)); }}>⋮</button></article>; })}</div>}{editingNote && <div className="note-editor"><textarea className="note-input" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder="Write a quick note…" rows={4} /><div><button className="ghost-button" onClick={() => { setEditingNote(false); setNoteDraft(""); }}>Cancel</button><button className="primary-button" onClick={saveNote}>Save note <span>＋</span></button></div></div>}{!editingNote && <div className="note-create-dock"><p>Start writing your ideas.</p><button className="primary-button" onClick={() => setEditingNote(true)}>Create new notes <span>＋</span></button></div>}</Content>}

      {screen === "Study Timer" && <Content className="timer-page" title="Study Timer" subtitle="" back={() => go("Home")}><button className="timer-more" aria-label="Timer options" onClick={() => setToast("Timer presets are ready below")}>•••</button><div className="timer-modes">{["Stopwatch", "Countdown", "Pomodoro"].map((item) => <button className={mode === item ? "selected" : ""} key={item} onClick={() => { setMode(item); setTimerRunning(false); const minutes = item === "Pomodoro" ? focusMinutes : item === "Countdown" ? 10 : 0; setTimerMinutes(minutes); setSeconds(minutes * 60); }}><span>{item === "Stopwatch" ? "◷" : item === "Countdown" ? "⌛" : "◉"}</span>{item}</button>)}</div>{mode !== "Stopwatch" && <div className="timer-duration-setting"><label htmlFor="timer-duration">Duration</label><div className="timer-duration-input"><button type="button" aria-label="Decrease duration by one minute" disabled={timerRunning || timerMinutes <= 1} onClick={() => setTimerDuration(timerMinutes - 1)}>−</button><input id="timer-duration" type="number" inputMode="numeric" min="1" max="999" value={timerMinutes} disabled={timerRunning} onChange={(event) => { if (event.target.value) setTimerDuration(event.target.value); }} /><span>min</span><button type="button" aria-label="Increase duration by one minute" disabled={timerRunning || timerMinutes >= 999} onClick={() => setTimerDuration(timerMinutes + 1)}>+</button></div></div>}<div className="timer-face"><div className="timer-progress" style={{ "--progress-angle": `${timerProgress * 3.6}deg` }}><span className="timer-plant" aria-hidden="true"><svg viewBox="0 0 36 36" fill="none"><circle cx="18" cy="18" r="17" stroke="currentColor" strokeOpacity=".45"/><path d="M18 25v-9m0 4c-5.4 0-8-2.6-8-7 5.4 0 8 2.6 8 7Zm0-2c0-5 2.5-7.5 7.5-7.5 0 5-2.5 7.5-7.5 7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg></span><span className="timer-caption">{mode === "Pomodoro" ? "Focus Time" : `${mode} session`}</span><strong>{formatTime(seconds)}</strong><small>Do it for your dream &lt;3</small></div></div><div className="timer-actions"><button className="timer-play" aria-label={timerRunning ? "Pause timer" : "Start timer"} onClick={() => setTimerRunning((value) => !value)}>{timerRunning ? "Ⅱ" : "▶"}</button><button className="timer-stop" aria-label="Reset timer" onClick={() => { setTimerRunning(false); setSeconds(mode === "Stopwatch" ? 0 : timerMinutes * 60); }}>■</button></div><div className="timer-presets"><h3>Session Presets</h3>{[["Focus Time", focusMinutes * 60, `${focusMinutes} min`, "violet"], ["Short Break", 300, "5 min", "teal"], ["Long Break", 900, "15 min", "blue"]].map(([label, value, duration, tone]) => <button className="timer-preset" key={label} onClick={() => { const minutes = label === "Focus Time" ? focusMinutes : value / 60; setMode("Pomodoro"); setTimerMinutes(minutes); setSeconds(minutes * 60); setTimerRunning(false); }}><span className={`timer-preset-icon ${tone}`}>{label === "Focus Time" ? "♧" : label === "Short Break" ? "◉" : "✦"}</span><b>{label}</b><small>{duration}</small><span className="chevron">›</span></button>)}</div></Content>}

      {screen === "Meditation" && <Content className="meditation-page" title="" subtitle="" back={() => { setMeditationRunning(false); go("Home"); }}><button className="meditation-sound" aria-label={meditationSound ? "Mute ambient sound" : "Enable ambient sound"} onClick={() => { setMeditationSound((value) => !value); setToast("Ambient sound controls updated"); }}>{meditationSound ? "♫" : "♪"}</button><div className="meditation-intro"><div><p>Take a deep breath, let’s <b>clear your mind.</b></p><small>Meditation helps you relax, reduce stress and improve focus.</small></div><MeditationMascot /></div><section className="meditation-card"><div className="meditation-time-label"><span />Meditation Time<span /></div><div className="meditation-ring" style={{ "--progress-angle": `${meditationProgress * 3.6}deg` }}><div className="meditation-scene"><strong>{formatTime(meditationSeconds)}</strong><small>♧ Meditation</small></div></div><div className="meditation-presets">{[5,10,15].map((minutes) => <button key={minutes} className={meditationMinutes === minutes ? "selected" : ""} onClick={() => { setMeditationMinutes(minutes); setMeditationSeconds(minutes * 60); setMeditationRunning(false); }}><b>{minutes}</b><small>min</small></button>)}</div></section><div className="meditation-tip"><span>♧</span><p>Tip: Close your eyes. Focus on a white dot with a black background in your mind.</p></div><button className="primary-button meditation-start" onClick={() => { if (meditationSeconds === 0) setMeditationSeconds(meditationMinutes * 60); setMeditationRunning((value) => !value); }}>{meditationRunning ? "Ⅱ  Pause Meditation" : "▶  Start Meditation"}</button></Content>}

      {screen === "My Habits" && <Content className="habits-page" title="My Habits" subtitle="Build habits. Stay consistent." back={() => go("Home")}>
        <button className="habit-add-top" aria-label="Add new habit" onClick={() => openHabitForm()}>＋</button>
        <div className="habits-date">
          <button aria-label="Previous day" onClick={() => setHabitDate((value) => new Date(value.getFullYear(), value.getMonth(), value.getDate() - 1))}>‹</button>
          <div><small>{isHabitDateToday ? "Today" : habitDate.toLocaleDateString("en-IN", { weekday: "long" })}</small><b>{habitDate.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</b><span>{habitDate.toLocaleDateString("en-IN", { weekday: "long" })}</span></div>
          <button aria-label="Next day" disabled={isHabitDateToday} onClick={() => setHabitDate((value) => new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1))}>›</button>
        </div>
        <div className="habit-summary"><div><small>{habits.length} {habits.length === 1 ? "habit" : "habits"}</small><h2>{habits.filter((habit) => habit.done).length} completed {isHabitDateToday ? "today" : "this day"}</h2></div><span className="habit-summary-icon">▥</span></div>
        <div className="section-heading"><h3>{isHabitDateToday ? "Today’s Habits" : "Habits for this day"}</h3><span>{habitBusy ? "Saving…" : ""}</span></div>
        {habits.length ? habits.map((habit) => <article className={`habit-row ${habit.done ? "done" : ""}`} key={habit.id}>
          <span className="habit-symbol">▥</span><span className="habit-copy"><b>{habit.name}</b><small>{habit.target_amount || 1} {habit.unit || "time"} · Daily goal</small></span>
          <button className="habit-consistency" onClick={() => { setHabitDate(new Date()); setConsistencyHabit(habit); }}>▦ Check consistency</button>
          <button className={`habit-status complete ${habit.done ? "is-done" : ""}`} onClick={() => setHabitCompletion(habit, true)} disabled={habitBusy}>{habit.done ? "✓ Completed" : "✓ Complete"}</button>
          <button className={`habit-status not-done ${!habit.done ? "selected" : ""}`} onClick={() => setHabitCompletion(habit, false)} disabled={habitBusy}>Not done</button>
          <div className="habit-actions"><button className="habit-more" aria-label={`More options for ${habit.name}`} aria-expanded={habitMenuId === habit.id} onClick={() => setHabitMenuId((id) => id === habit.id ? null : habit.id)}>⋮</button>
            {habitMenuId === habit.id && <div className="habit-action-menu"><button onClick={() => openHabitForm(habit)}>Edit habit</button><button className="danger" onClick={() => deleteHabit(habit)}>Remove habit</button></div>}
          </div>
        </article>) : <Empty icon="✓" title="No habits yet" text="Add a habit to start tracking your daily routine." />}
        <button className="primary-button habit-add-bottom" onClick={() => openHabitForm()}>＋ Add New Habit</button>
        {showHabitForm && <div className="habit-modal-backdrop" onClick={closeHabitForm}><form className="habit-modal" onSubmit={(event) => { event.preventDefault(); saveHabit(); }} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="habit-modal-close" aria-label="Close" onClick={closeHabitForm}>×</button><h2>{editingHabit ? "Edit Habit" : "Add New Habit"}</h2>
          <label htmlFor="habit-name">Habit name</label><input id="habit-name" autoFocus value={habitDraft} onChange={(event) => setHabitDraft(event.target.value)} placeholder="e.g. Read a chapter" maxLength={80} required />
          <div className="habit-form-fields"><div><label htmlFor="habit-target">Daily target</label><input id="habit-target" type="number" min="1" max="999" value={habitTargetDraft} onChange={(event) => setHabitTargetDraft(event.target.value)} required /></div><div><label htmlFor="habit-unit">Unit</label><input id="habit-unit" value={habitUnitDraft} onChange={(event) => setHabitUnitDraft(event.target.value)} placeholder="e.g. pages" maxLength={20} required /></div></div>
          <button className="primary-button" type="submit" disabled={habitBusy}>{habitBusy ? "Saving…" : editingHabit ? "Save Changes" : "Create Habit"} <span>→</span></button>
        </form></div>}
        {consistencyHabit && <div className="habit-modal-backdrop" onClick={() => setConsistencyHabit(null)}><section className="habit-calendar-modal" onClick={(event) => event.stopPropagation()}>
          <button className="habit-modal-close" aria-label="Close calendar" onClick={() => setConsistencyHabit(null)}>×</button><div className="habit-calendar-heading"><span>▥</span><h2>Habit Consistency</h2><small>{consistencyHabit.name}</small></div>
          <div className="habit-calendar-month"><button aria-label="Previous month" onClick={() => setHabitDate((value) => new Date(value.getFullYear(), value.getMonth() - 1, 1))}>‹</button><b>{habitDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</b><button aria-label="Next month" disabled={habitDate.getFullYear() === new Date().getFullYear() && habitDate.getMonth() >= new Date().getMonth()} onClick={() => setHabitDate((value) => new Date(value.getFullYear(), value.getMonth() + 1, 1))}>›</button></div>
          <div className="habit-calendar-grid">{["S","M","T","W","T","F","S"].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}{Array.from({ length:firstHabitWeekday },(_,i)=><i key={`blank-${i}`} />)}{Array.from({ length:daysInHabitMonth },(_,i)=>{ const dayDate = new Date(habitDate.getFullYear(), habitDate.getMonth(), i + 1); const key = localDateKey(dayDate); const future = key > localDateKey(); const classes = [habitHistory[key] === true ? "completed" : "", habitHistory[key] === false ? "missed" : "", key === habitDateKey ? "selected" : ""].filter(Boolean).join(" "); return <button key={key} className={classes} disabled={future} aria-label={`${key}${habitHistory[key] === true ? ", completed" : habitHistory[key] === false ? ", not completed" : ""}`} onClick={() => setHabitDate(dayDate)}>{i + 1}</button>;})}</div>
          <div className="habit-calendar-legend"><span>● Completed</span><span>● Not done</span></div>
          {(() => { const now = new Date(); const trackedDays = habitDate.getFullYear() < now.getFullYear() || (habitDate.getFullYear() === now.getFullYear() && habitDate.getMonth() < now.getMonth()) ? daysInHabitMonth : habitDate.getFullYear() === now.getFullYear() && habitDate.getMonth() === now.getMonth() ? now.getDate() : 0; const completedDays = Object.values(habitHistory).filter(Boolean).length; const percent = trackedDays ? Math.round(completedDays / trackedDays * 100) : 0; return <div className="habit-calendar-stats"><div><b>{habitHistoryLoading ? "…" : completedDays}</b><small>days completed</small></div><div><b>{habitHistoryLoading ? "…" : trackedDays}</b><small>days elapsed</small></div><div><b>{habitHistoryLoading ? "…" : `${percent}%`}</b><small>consistency</small></div></div>;})()}
          <div className="habit-calendar-tip">{habitHistoryLoading ? "Loading your saved activity…" : "Your calendar reflects saved daily check-ins for this habit."}</div>
        </section></div>}
      </Content>}

      {screen === "Analytics & Streak" && <Content className="analytics-page" title="Analytics" subtitle="Track your learning journey." back={() => go("Home")}><button className="analytics-help" aria-label="Streak details" onClick={() => go("Streaks with Cloudy")}>＋</button><div className="analytics-completed-card"><div><small>PYQs Completed</small><strong>{completedQuestionCount.toLocaleString()} <span>/ {questions.length.toLocaleString()}</span></strong></div><b>{completedPercent}%</b><div className="analytics-progress"><span style={{width:`${completedPercent}%`}} /></div></div><div className="analytics-summary-grid"><div className="analytics-stat-card"><span>▥</span><small>Incorrect Answers</small><b>{Math.max(0,analytics.attempted-analytics.correctCount).toLocaleString()}</b><em>Keep reviewing to improve!</em><i className="pink-progress" /></div><div className="analytics-stat-card"><span>◌</span><small>Overall Accuracy</small><b>{analytics.correct}%</b><em>{analytics.attempted ? "Good job! Keep it up!" : "Start a practice session"}</em><i className="green-progress" /></div></div><div className="analytics-strength-grid"><section><h3><span>♧</span> Strongest</h3>{strongestSubjects.length ? strongestSubjects.map((item) => <div key={item.name}><span>{item.name}</span><b>{item.accuracy}%</b></div>) : <p>Your strongest subjects will appear after practice.</p>}</section><section><h3><span>✦</span> Needs Attention</h3>{attentionSubjects.length ? attentionSubjects.map((item) => <div key={item.name}><span>{item.name}</span><b>{item.accuracy}%</b></div>) : <p>Practice another subject to compare your results.</p>}</section></div><section className="subject-performance"><div className="subject-performance-heading"><h3>Subject Performance</h3><button onClick={() => setToast("Showing all available subjects")}>View all ›</button></div><div className="subject-performance-columns"><span>SUBJECT</span><span>COMPLETION</span><span>ACCURACY</span></div>{subjectPerformance.length ? subjectPerformance.map((item) => <div className="subject-performance-row" key={item.name}><span><i>♧</i>{item.name}</span><div><small>{item.completion}%</small><b><i style={{width:`${item.completion}%`}} /></b></div><strong>{item.attempted ? `${item.accuracy}%` : "—"}</strong></div>) : <p className="subject-performance-empty">Questions and results will appear here after your first practice session.</p>}</section>{showStreakDetails && <div className="analytics-modal-backdrop" onClick={() => setShowStreakDetails(false)}><section className="streak-details-modal" onClick={(event) => event.stopPropagation()}><button className="analytics-close" aria-label="Close streak details" onClick={() => setShowStreakDetails(false)}>×</button><div className="streak-modal-heading"><span className="streak-cloud">☁</span><div><h2>Streaks with Cloudy</h2><p>Keep your streak alive!</p></div></div><div className="streak-current-card"><div><small>Current Streak</small><strong>{analytics.streak} <span>days</span></strong><p>Keep it going, Vimanyu! 👋</p></div><div><small>Best streak</small><b>{analytics.bestStreak} days</b></div><div className="streak-week">{Array.from({length:7},(_,index)=>{const date=new Date();date.setDate(date.getDate()-(6-index));const dayKey=date.toLocaleDateString("en-CA");const completed=qualifiesForStreak(attemptHistory, dayKey);return <span key={dayKey} className={completed?"done":""}><i>{completed?"✓":"○"}</i><small>{index===6?"Today":date.toLocaleDateString("en-US",{weekday:"short"})}</small></span>;})}</div></div><div className="streak-how-card"><b>♧ &nbsp; How streak works</b><p>Your streak counts days when you practice 15 questions or more every day.</p><small>• Complete 15 or more questions in a day to keep your streak alive.</small><small>• If you miss a day, your streak resets to 0.</small></div></section></div>}</Content>}

      {screen === "Streaks with Cloudy" && <Content className="streak-page" title="Streaks with Cloudy" subtitle="Keep your streak alive!" back={() => go("Analytics & Streak")} character="happy"><button className="streak-info-button" aria-label="How streaks work" onClick={() => setToast("Practice 15 or more questions each day to keep your streak")}>ⓘ</button><section className="streak-current-card"><div className="streak-card-top"><div><small>Current Streak</small><strong>{analytics.streak} <span>days</span></strong><p>Keep it going, Vimanyu! 👋</p></div><div><small>Best streak</small><b>{analytics.bestStreak} days</b></div></div><div className="streak-week">{Array.from({length:7},(_,index)=>{const date=new Date();date.setDate(date.getDate()-(6-index));const dayKey=date.toLocaleDateString("en-CA");const completed=qualifiesForStreak(attemptHistory, dayKey);return <span key={dayKey} className={completed?"done":""}><i>{completed?"✓":"○"}</i><small>{index===6?"Today":date.toLocaleDateString("en-US",{weekday:"short"})}</small></span>;})}</div></section><section className="streak-how-card"><b>♧ &nbsp; How streak works</b><p>Your streak is counted as days when you practice <strong>15 questions or more everyday.</strong></p><small>• Complete 15 or more questions in a day to keep your streak alive.</small><small>• If you miss a day, your streak resets to 0.</small></section></Content>}
      {screen === "CSR Activity" && <Content className="impact-page" title="" subtitle="" back={() => go("Home")}><div className="impact-title"><span>♡</span><h1>Social Impact</h1></div><div className="impact-info-card">{[["♧","How it works","A portion of app’s revenue goes towards funding the education of underprivileged children."],["♧","100% Transparent","We are committed to publish every transaction and donation receipt on our website."],["♧","Partner Organizations","We donate only to government-registered NGOs and Orphanages."]].map(([glyph,title,description])=><div className="impact-info-row" key={title}><span>{glyph}</span><div><b>{title}</b><p>{description}</p></div></div>)}</div><section className="impact-founder-card"><span className="impact-quote-mark">“</span><h2>Note from the Founder</h2><p>As UPSC aspirants, we all dream of serving the nation someday. But service doesn’t have to wait. For you, it’s simply subscribing to the app and practicing PYQs. Behind the scenes, a portion of our revenue helps fund the education of those who cannot afford it. Please visit our website for more information.</p><div><span>♡</span><small>With love and care,<b>Vimanyu Chaturvedi.</b></small></div></section><button className="impact-website-button" onClick={() => setToast("Website link will be added by the client")}>Visit our website <span>↗</span></button></Content>}

      {screen === "About You" && <Content className="about-you-page" title="A little about you" subtitle="We’ll tailor your UPSC preparation to your goals." back={() => go("Welcome")} character><form className="about-you-form" onSubmit={saveAboutYou}><label className="about-name-field" htmlFor="about-name">Your name<span className="about-input-wrap"><img src={figmaAsset.profile} alt="" /><input id="about-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder="Enter your name" maxLength={80} required /></span></label><fieldset><legend>How many attempts have you taken?</legend><div className="about-choice-row">{["0", "1", "2", "3+"].map((value) => <button type="button" key={value} className={aboutExamCount === value ? "selected" : ""} onClick={() => setAboutExamCount(value)}>{value}</button>)}</div></fieldset><label className="about-year-field">Target exam year<span className="about-input-wrap"><span aria-hidden="true">▣</span><select value={aboutTargetYear} onChange={(event) => setAboutTargetYear(event.target.value)}><option value="">Select your target year</option>{designYears.slice(0, 10).map((year) => <option key={year}>{year}</option>)}</select></span></label><div className="about-tip"><span>✦</span><p><b>Made for your preparation</b><small>Your selections help personalize your study recommendations and progress.</small></p></div><button className="primary-button full-button" type="submit">Start My Preparation</button></form></Content>}
      {screen === "Refer & Earn" && <Content className="referral-page" title="Refer & Earn" subtitle="Share the benefits. Earn more study time." back={() => go("My Profile")}><div className="referral-hero"><span className="referral-gift" aria-hidden="true">🎁</span><div className="referral-offers"><article><small>GIVE 20% OFF</small><b>Your friend<br /><em>20% off</em><br />their yearly plan</b></article><article><small>GET REWARDED</small><b>You receive<br /><em>1 month</em><br />per successful referral</b></article></div><p>Your reward applies after your friend subscribes.</p></div><div className="referral-code-card"><div><small>Your referral code</small><b>{referralCode}</b></div><button onClick={copyReferralCode}><span aria-hidden="true">▢</span> Copy</button></div><button className="primary-button full-button referral-share" onClick={shareReferral}><span aria-hidden="true">↗</span> Invite Friends Now</button><section className="referral-steps"><h2>How it works</h2>{[["↗", "Invite your friends", "Share your unique code via WhatsApp or any other platform."], ["♙", "Your friend subscribes", "They get 20% off on a yearly plan if eligible."], ["✦", "You get rewarded", "You receive 1 extra month for every successful referral."]].map(([symbol, title, body]) => <div key={title}><span>{symbol}</span><p><b>{title}</b><br />{body}</p></div>)}</section><div className="referral-results"><div><span>✧</span><small>Successful Referrals</small><b>0</b></div><i /><div><span>♛</span><small>Months Earned</small><b>0</b></div></div></Content>}
      {screen === "Account Settings" && <Content className="account-settings-page" title="Account Settings" subtitle="Your information and security" back={() => go("My Profile")} character><form onSubmit={saveAccountSettings}><h2 className="account-section-label">PERSONAL INFORMATION</h2><div className="account-info-card"><label><span>♙</span><small>Name<input disabled={!accountEditing} value={profileName} onChange={(event) => setProfileName(event.target.value)} /></small><button type="button" aria-label="Edit name" onClick={() => setAccountEditing(true)}>✎</button></label><label><span>✉</span><small>Email<input disabled={!accountEditing} type="email" value={accountEmail} onChange={(event) => setAccountEmail(event.target.value)} placeholder={user?.phone && !user?.email ? "Add an email address" : ""} /></small><button type="button" aria-label="Edit email" onClick={() => setAccountEditing(true)}>✎</button></label><label><span>♧</span><small>Phone<input disabled={!accountEditing} type="tel" value={accountPhone} onChange={(event) => setAccountPhone(event.target.value)} placeholder="Add a phone number" /></small><button type="button" aria-label="Edit phone number" onClick={() => setAccountEditing(true)}>✎</button></label></div>{accountEditing && <button className="primary-button full-button" type="submit">Save changes</button>}</form><h2 className="account-section-label">ACCOUNT ACTIONS</h2><div className="account-action-card"><button onClick={async () => { if (user?.is_demo) { localStorage.removeItem(DEMO_USER_KEY); setUser(null); go("Welcome"); return; } const { error } = await supabase.auth.signOut(); if (error) return setToast(error.message); go("Welcome"); }}><span>⇥</span><b>Sign out</b><i>›</i></button><button onClick={() => setToast("Privacy and security settings will be available here.")}><span>♢</span><b>Privacy and security</b><i>›</i></button></div><h2 className="account-section-label danger-label">DANGER ZONE</h2><button className="delete-account-card" onClick={() => setToast("Contact support to request account deletion.")}><span>♜</span><span><b>Delete account</b><small>Permanently remove your account and data</small></span><i>›</i></button></Content>}
      {screen === "My Profile" && <Content className="profile-page" title="My Profile" subtitle="Manage Profile" back={() => go("Home")}><div className="profile-card">{avatarUrl ? <img className="profile-photo" src={avatarUrl} alt={`${profileName || "Your"} profile photo`} /> : <span className="profile-photo profile-photo-placeholder" aria-hidden="true"><img src={figmaAsset.profile} alt="" /></span>}<h2>{profileName || "Vimanyu"}</h2><p>{user?.email || user?.phone || "Email not added"}</p>{user?.phone && !user?.email && <button type="button" className="profile-email-action" onClick={() => { setAccountEmail(""); setAccountPhone(user.phone); setAccountEditing(true); go("Account Settings"); }}>Add email address</button>}<small className="member-since">{user?.created_at ? `Member since ${new Date(user.created_at).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}` : ""}</small>{user ? <><button type="button" className="outline-button avatar-upload-button" onClick={() => avatarInputRef.current?.click()} disabled={avatarBusy}>{avatarBusy ? "Uploading photo…" : "Change profile photo"}</button><input ref={avatarInputRef} className="avatar-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadAvatar} disabled={avatarBusy} aria-label="Choose a profile photo" /><button className="outline-button" onClick={() => setEditingProfile((value) => !value)}>{editingProfile ? "Cancel" : "Edit profile"}</button></> : <button className="outline-button" onClick={() => go("Welcome")}>Sign in to change photo</button>}{editingProfile && <form className="auth-form" onSubmit={saveProfile}><label htmlFor="profile-name">Full name</label><input id="profile-name" value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={80} required /><button className="primary-button full-button" type="submit">Save profile <span>→</span></button></form>}</div><div className="profile-row"><span>✉</span><div><small>{user?.email ? "EMAIL" : user?.phone ? "PHONE" : "CONTACT"}</small><b>{user?.email || user?.phone || (user ? "Email not added" : "Not signed in")}</b></div>{user && <span>✓</span>}</div><div className="profile-row"><span>◷</span><div><small>MEMBERSHIP</small><b>Free account</b></div><button className="text-action" onClick={() => go("Subscription")}>View plans</button></div><div className="section-heading"><h3>Account Settings</h3></div>{[["♙", "Account Settings", "Manage your personal information"], ["♧", "Refer & Earn", "Invite your friends and earn rewards"], ["▣", "Terms & Policy", "Read our terms and privacy policy"], ["?", "Help & Support", "Get help and contact support"]].map(([glyph, item, subtitle]) => <button className="choice-row" key={item} onClick={() => item === "Account Settings" || item === "Refer & Earn" ? go(item) : setToast(`${item} will be available here.`)}><span className="profile-setting-icon">{glyph}</span><span><b>{item}</b><small>{subtitle}</small></span><span className="chevron">›</span></button>)}{user ? <button className="quiet-link" onClick={async () => { if (user.is_demo) { localStorage.removeItem(DEMO_USER_KEY); setUser(null); setProfileName(""); setAccountEmail(""); go("Welcome"); return; } const { error } = await supabase.auth.signOut(); if (error) return setToast(error.message); setToast("You’ve signed out"); }}>Sign out</button> : <button className="quiet-link" onClick={() => go("Welcome")}>Sign in or create account</button>}</Content>}

      {screen === "Auth" && <Content title={authMode === "signup" ? "Create your account" : "Welcome to PYQ Cloud"} subtitle={authMode === "signup" ? "Sign up to save your progress and study data." : "Sign in to keep your learning in sync."} back={() => go("Welcome")}><div className="auth-card"><div className="auth-symbol">☁</div><h2>{authMode === "signup" ? "Start your preparation." : "Make every session count."}</h2><p>{authMode === "signup" ? "Create an account to keep your learning in sync." : "Save your progress and pick up wherever you left off."}</p>{authError && <p className="auth-feedback error" role="alert">{authError}</p>}{authNotice && <p className="auth-feedback" role="status">{authNotice}</p>}<form className="auth-form" onSubmit={submitAuth}><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required /><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} minLength="8" placeholder="At least 8 characters" required />{authMode === "signup" && <><label htmlFor="confirm-password">Confirm password</label><input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength="8" placeholder="Enter your password again" required /></>}<button className="primary-button full-button" type="submit" disabled={authBusy}>{authBusy ? "Please wait…" : authMode === "signup" ? "Create account" : "Sign in"} <span>→</span></button></form>{authMode === "signin" && <button className="auth-inline-link" onClick={() => { setAuthError(""); setAuthNotice(""); go("Reset Password"); }}>Forgot password?</button>}<button className="quiet-link" onClick={() => { setAuthMode((value) => value === "signup" ? "signin" : "signup"); setAuthError(""); setAuthNotice(""); }}>{authMode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}</button><small className="auth-note">Your account and study data sync securely through Supabase.</small></div></Content>}
      {screen === "Auth Confirmation" && <Content title="Check your email" subtitle="One quick step to activate your account." back={() => go("Auth")}><div className="auth-card"><div className="auth-symbol">✉</div><h2>Confirm your email</h2><p className="auth-feedback" role="status">{authNotice || `We sent a confirmation link to ${authEmail}. Open it to activate your account, then come back here to sign in.`}</p>{authError && <p className="auth-feedback error" role="alert">{authError}</p>}<button className="primary-button full-button" onClick={() => { setAuthMode("signin"); setAuthError(""); setAuthNotice(""); go("Auth"); }}>Continue to sign in <span>→</span></button><button className="quiet-link" onClick={resendSignupConfirmation} disabled={authBusy}>{authBusy ? "Sending…" : "Resend confirmation email"}</button></div></Content>}
      {screen === "Reset Password" && <Content title="Reset your password" subtitle={user ? "Choose a new password for your account." : "Enter your account email and we’ll send a secure reset link."} back={() => go("Auth")}><div className="auth-card"><div className="auth-symbol">☁</div><h2>{user ? "Choose a new password." : "Get back into your account."}</h2>{authError && <p className="auth-feedback error" role="alert">{authError}</p>}{user ? <form className="auth-form" onSubmit={updatePassword}><label htmlFor="new-password">New password</label><input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength="8" placeholder="At least 8 characters" required /><label htmlFor="confirm-new-password">Confirm new password</label><input id="confirm-new-password" name="confirmPassword" type="password" autoComplete="new-password" minLength="8" placeholder="Enter it again" required /><button className="primary-button full-button" type="submit" disabled={authBusy}>{authBusy ? "Updating…" : "Update password"} <span>→</span></button></form> : <form className="auth-form" onSubmit={sendPasswordReset}><label htmlFor="reset-email">Email address</label><input id="reset-email" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="you@example.com" required /><button className="primary-button full-button" type="submit" disabled={authBusy}>{authBusy ? "Sending…" : "Send reset link"} <span>→</span></button></form>}</div></Content>}
      {screen === "Reset Email Sent" && <Content title="Check your email" subtitle="Use the secure link to set a new password." back={() => go("Auth")}><div className="auth-card"><div className="auth-symbol">✉</div><h2>Reset link sent</h2><p className="auth-feedback" role="status">{authNotice}</p><button className="primary-button full-button" onClick={() => go("Auth")}>Back to sign in <span>→</span></button><button className="quiet-link" onClick={() => go("Reset Password")}>Try another email</button></div></Content>}

      {screen === "Subscription" && <Content className="membership-page" title="Manage Membership" subtitle="" back={() => go("My Profile")}><div className="membership-active"><span aria-hidden="true">♛</span><div><small>You’re on</small><b>{user?.user_metadata?.membership_plan ? `${user.user_metadata.membership_plan} Plan` : "Free Plan"}</b>{user?.user_metadata?.membership_ends_at && <small>Your membership ends on {new Date(user.user_metadata.membership_ends_at).toLocaleDateString("en-GB", {day:"numeric",month:"short",year:"numeric"})}</small>}</div>{user?.user_metadata?.membership_plan && <i>Premium</i>}</div><h2 className="membership-section-label">Choose a Plan</h2><div className="membership-options">{[["Monthly", "₹79", "per month"], ["Quarterly", "₹199", "for 3 months"], ["Yearly", "₹699", "for 12 months"]].map(([name, price, period]) => <button type="button" key={name} className={`membership-option ${membershipChoice === name ? "selected" : ""}`} aria-pressed={membershipChoice === name} onClick={() => setMembershipChoice(name)}><span className="membership-radio" /><span className="membership-plan-copy"><b>{name} Plan</b><small>You get everything in the app<br />(PYQs, notes, tests, explanations, etc.)</small></span><strong>{price}<small>{period}</small></strong></button>)}</div><section className="payment-history"><div><h2>Payment History</h2><button onClick={() => setToast("No payments have been recorded yet.")}>View All</button></div><p>No payments yet</p></section><button className="membership-support" onClick={() => setToast("Subscription support contact will be available when the client provides the support number.")}><span aria-hidden="true">◉</span><span><b>Need help with your subscription?</b><small>Contact us on WhatsApp</small></span><i>›</i></button></Content>}

      {screen === "Admin" && <Content title="Admin overview" subtitle="Manage the PYQ Cloud experience" back={() => go("Home")}><Empty icon="⚙" title="Open the admin workspace" text="Question management is available in the secure web admin panel." /><button className="primary-button full-button" onClick={() => window.location.assign("/admin")}>Open admin panel <span>→</span></button></Content>}

      {(screen === "Home" || screen === "Bookmarks") && <nav className="bottom-nav" aria-label="Main navigation">{navItems.map((item) => <button className={screen === item || (screen === "Practice" && item === "Home") ? "active" : ""} key={item} onClick={() => go(item)}><span><img src={figmaAsset[item.toLowerCase()]} alt="" /></span><small>{item}</small></button>)}</nav>}
      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)}><aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <button className="drawer-close" aria-label="Close menu" onClick={() => setDrawer(false)}><img src={figmaAsset.close} alt="" /></button>
        <div className="drawer-user">{avatarUrl ? <img className="drawer-avatar" src={avatarUrl} alt={`${profileName || "Your"} profile photo`} /> : <span className="drawer-avatar drawer-avatar-placeholder" aria-hidden="true"><img src={figmaAsset.profile} alt="" /></span>}<div><b>{profileName || user?.user_metadata?.full_name || "Vimanyu"}👋</b><small>Keep learning. Keep growing.</small></div></div>
        <div className="drawer-scroll">{[
          ["My Profile", figmaAsset.profile, "View and manage your profile."],
          ["Notes", figmaAsset.notes, "Save your thoughts. Revisit anytime."],
          ["Study Timer", figmaAsset.timer, "Set a timer and start studying."],
          ["Meditation", figmaAsset.meditation, "Breathe in and let it go :)"],
          ["My Habits", figmaAsset.habits, "Stay consistent with your goals."],
          ["Social Impact", figmaAsset.social, "Your learning makes a difference."],
        ].map(([item, asset, subtitle]) => <button className={`drawer-menu-item ${screen === item || (item === "Social Impact" && screen === "CSR Activity") ? "active" : ""}`} key={item} onClick={() => item === "Social Impact" ? go("CSR Activity") : go(item)}><span className="drawer-menu-icon"><img src={asset} alt="" /></span><span className="drawer-menu-copy"><b>{item}</b><small>{subtitle}</small></span><i>›</i></button>)}{!isInstalledApp && <button className="drawer-menu-item" onClick={() => { setDrawer(false); installApp(); }}><span className="drawer-menu-icon" aria-hidden="true">↓</span><span className="drawer-menu-copy"><b>Install app</b><small>Add PYQ Cloud to your home screen.</small></span><i>›</i></button>}{user && isInstalledApp && (!user.is_demo || isDemoAdminUser(user)) && <button className="drawer-menu-item" onClick={() => window.location.assign("/admin")}><span className="drawer-menu-icon" aria-hidden="true">⚙</span><span className="drawer-menu-copy"><b>Admin panel</b><small>Manage the question bank.</small></span><i>›</i></button>}</div>
      </aside></div>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  </main>;
}

function MeditationMascot() {
  return <div className="meditation-mascot" aria-hidden="true"><Lottie src="/mascot-lottie/cloudy-meditating.json" autoplay loop /></div>;
}

function ActionCard({ title, body, asset, tone, onClick }) { const parts = { "Practice by Subject": ["Practice by", "Subject"], "Practice by Year": ["Practice by", "Year"], "Random Practice": ["Random", "Practice"], "Mistake Book": ["Mistake", "Book"] }[title] || [title, ""]; return <button className={`action-card ${tone}`} onClick={onClick}><span className={`card-glyph ${tone}`}><img src={asset} alt="" /></span><b><span>{parts[0]}</span><em>{parts[1]}</em></b><small>{body}</small><span className="round-arrow"><img src={figmaAsset.arrow} alt="" /></span></button>; }
function Content({ title, subtitle, back, children, mascot = false, character = false, showBack = true, className = "" }) {
  const animationFiles = {
    idle: "cloudy-idle.json",
    happy: "cloudy-happy-jump.json",
    meditating: "cloudy-meditating.json",
    reading: "cloudy-reading.json",
    sad: "cloudy-sad.json",
  };
  const characterName = character === true ? "idle" : character;
  const animationFile = animationFiles[characterName];
  // Keep the study mascot on the same seated reading animation everywhere;
  // the version query also refreshes older cached standing-pose assets.
  const animationSrc = animationFile
    ? `/mascot-lottie/${animationFile}${characterName === "reading" ? "?v=seated-reading-20261028" : ""}`
    : null;
  return <section className={`content-page${showBack ? "" : " no-back"}${className ? ` ${className}` : ""}`}>
    {showBack && <button className="back-button" aria-label="Go back" onClick={back}>‹</button>}
    <div className="content-body"><div className="page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>
      {animationSrc && <div className={`content-mascot character-mascot ${characterName}-mascot`} aria-hidden="true"><Lottie src={animationSrc} autoplay loop /></div>}
      {mascot && <div className="content-mascot" aria-hidden="true"><img src={figmaAsset.mascot} alt="" /><img src="/figma-assets/s2-b34d8.png" alt="" /></div>}
    </div>{children}</div>
  </section>;
}
function Empty({ icon: glyph, title, text }) { return <div className="empty-state"><span>{glyph}</span><b>{title}</b><p>{text}</p></div>; }
function Metric({ value, label, color }) { return <div className="metric-card"><small>{label}</small><strong className={color}>{value}</strong></div>; }
function MenuButton({ item, active, onClick }) { return <button className={`menu-item ${active ? "active" : ""}`} onClick={onClick}><span>{icon[item] || "⚙"}</span>{item}<b>›</b></button>; }
