// --- Firebase (waitlist Glitch) ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, doc, getDoc, setDoc,
  serverTimestamp, increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyBslXj-M3xshIauiZQWyAFncHXz5Q0ob8k",
  authDomain: "simple-games-net.firebaseapp.com",
  projectId: "simple-games-net",
  storageBucket: "simple-games-net.firebasestorage.app",
  messagingSenderId: "567583137211",
  appId: "1:567583137211:web:f097ddaf6cabe32473389e",
  measurementId: "G-JXKMKMFB2M",
};

// ====== CONFIG À PERSONNALISER ======
const DISCORD_URL = "https://discord.gg/WWAdCtxHwz"; // invite SimpleGames
const GOAL = 500;                                    // 1er palier communautaire (jauge)
// ====================================

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
let analytics = null;
try { analytics = getAnalytics(app); } catch (e) { /* bloqué/localhost : pas grave */ }
function track(name, params) { try { if (analytics) logEvent(analytics, name, params || {}); } catch (e) {} }

const STATS_DOC = doc(db, "public", "stats");

// --- Liens Discord (tous les [data-discord]) + tracking du clic ---
document.querySelectorAll("[data-discord]").forEach((a) => {
  a.setAttribute("href", DISCORD_URL);
  a.addEventListener("click", () => track("discord_click"));
});

// --- Source / parrainage (?ref=..., ?utm_source=...) ---
const params = new URLSearchParams(location.search);
const referredBy = params.get("ref") || null;
const source = params.get("utm_source") || (referredBy ? "referral" : "direct");

// --- Compteur + jauge d'objectif ---
const elCount = document.getElementById("count");
const elFill = document.getElementById("gauge-fill");

async function loadCount() {
  try {
    const snap = await getDoc(STATS_DOC);
    const count = snap.exists() ? (snap.data().waitlistCount || 0) : 0;
    renderGauge(count);
  } catch (e) {
    renderGauge(0);
  }
}

function renderGauge(count) {
  const pct = Math.max(2, Math.min(100, Math.round((count / GOAL) * 100)));
  if (elFill) elFill.style.width = pct + "%";
  animateCount(count);
}

function animateCount(target) {
  if (!elCount) return;
  const duration = 900;
  const start = performance.now();
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    elCount.textContent = Math.round(p * target).toLocaleString("fr-FR");
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// --- Formulaires (hero + CTA final partagent le même handler) ---
document.querySelectorAll(".js-waitlist").forEach((form) =>
  form.addEventListener("submit", (e) => handleSubmit(e, form))
);

async function handleSubmit(e, form) {
  e.preventDefault();
  const input = form.querySelector(".js-email");
  const btn = form.querySelector(".js-submit");
  const note = form.parentElement.querySelector(".js-note");
  const email = input.value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    setNote(note, "Hmm, cet email a l'air faux 🤔 vérifie ?", "error");
    track("form_error", { reason: "invalid_email" });
    return;
  }

  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = "…";
  try {
    // Position dans la file = compteur AVANT incrément
    let position = null;
    try {
      const snap = await getDoc(STATS_DOC);
      position = (snap.exists() ? (snap.data().waitlistCount || 0) : 0) + 1;
    } catch (_) {}

    const refCode = (self.crypto && crypto.randomUUID ? crypto.randomUUID() : String(Math.random()))
      .replace(/[^a-z0-9]/gi, "").slice(0, 8);

    await addDoc(collection(db, "waitlist"), {
      email,
      createdAt: serverTimestamp(),
      source,
      referredBy,
      refCode,
    });
    await setDoc(STATS_DOC, { waitlistCount: increment(1) }, { merge: true });

    track("sign_up", { source, referred: !!referredBy });
    showSuccess(position, refCode);
    loadCount();
  } catch (err) {
    console.error(err);
    setNote(note, "Oups, réessaie dans un instant.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = original;
  }
}

function setNote(note, msg, type) {
  if (!note) return;
  note.textContent = msg;
  note.classList.remove("success", "error");
  if (type) note.classList.add(type);
}

// --- Écran de succès : hub de partage + parrainage ---
function showSuccess(position, refCode) {
  // Cacher tous les formulaires + notes (hero ET cta final)
  document.querySelectorAll(".js-waitlist, .js-note").forEach((el) => { el.style.display = "none"; });

  const hub = document.getElementById("share-hub");
  const posEl = document.getElementById("share-pos-num");
  if (posEl) posEl.textContent = position ? "#" + position : "inscrit·e";
  if (hub) {
    hub.hidden = false;
    hub.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  const shareUrl = location.origin + "/?ref=" + refCode;
  const shareBtn = document.getElementById("share-btn");
  const copied = document.getElementById("share-copied");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      track("share_click");
      const data = {
        title: "Glitch — la peluche de SimpleGames",
        text: "Je viens de réserver Glitch 🐧 Rejoins la liste d'attente :",
        url: shareUrl,
      };
      if (navigator.share) {
        try { await navigator.share(data); } catch (_) {}
      } else {
        try {
          await navigator.clipboard.writeText(shareUrl);
          if (copied) copied.hidden = false;
        } catch (_) {}
      }
    });
  }
}

loadCount();
