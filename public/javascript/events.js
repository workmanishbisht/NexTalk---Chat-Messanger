// events.js — NexTalk Events Feature
// Paste this in: ../javascript/events.js
// Also add <script type="module" src="../javascript/events.js"></script> in HTML

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, query, orderBy, serverTimestamp, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Firebase (reuse existing app if already initialized) ───────────────────
const fbConfig = {
  apiKey: "AIzaSyCJea9IVCNXyeUKCpO_Jhbg-s-PeGoWyDc",
  authDomain: "nextalk-34dad.firebaseapp.com",
  projectId: "nextalk-34dad",
  storageBucket: "nextalk-34dad.appspot.com",
  messagingSenderId: "730298460453",
  appId: "1:730298460453:web:c69d16bd96e14876a4d2cc",
};

const fbApp  = getApps().length ? getApps()[0] : initializeApp(fbConfig);
const auth   = getAuth(fbApp);
const db     = getFirestore(fbApp);

// ─── DOM Refs ────────────────────────────────────────────────────────────────
const eventsNavItem        = document.getElementById("eventsNavItem");
const eventsPanel          = document.getElementById("eventsPanel");
const eventsPanelOverlay   = document.getElementById("eventsPanelOverlay");
const eventsPanelClose     = document.getElementById("eventsPanelClose");
const eventsEmpty          = document.getElementById("eventsEmpty");
const eventsContent        = document.getElementById("eventsContent");
const createEventBtnHeader = document.getElementById("createEventBtnHeader");
const createEventBtnEmpty  = document.getElementById("createEventBtnEmpty");

// Create/Edit Modal
const createEventModal      = document.getElementById("createEventModal");
const createEventModalClose = document.getElementById("createEventModalClose");
const createEventCancel     = document.getElementById("createEventCancel");
const createEventSave       = document.getElementById("createEventSave");
const createEventModalTitle = document.getElementById("createEventModalTitle");
const createEventSaveLabel  = document.getElementById("createEventSaveLabel");
const eventTitleInput       = document.getElementById("eventTitleInput");
const eventDateInput        = document.getElementById("eventDateInput");
const eventTimeInput        = document.getElementById("eventTimeInput");
const eventLocationInput    = document.getElementById("eventLocationInput");
const eventDescInput        = document.getElementById("eventDescInput");
const eventInviteInput      = document.getElementById("eventInviteInput");
const eventInviteResults    = document.getElementById("eventInviteResults");
const eventInvitedChips     = document.getElementById("eventInvitedChips");

// Detail Modal
const eventDetailModal   = document.getElementById("eventDetailModal");
const eventDetailClose   = document.getElementById("eventDetailClose");
const eventDetailContent = document.getElementById("eventDetailContent");
const eventDetailFooter  = document.getElementById("eventDetailFooter");

// ─── State ───────────────────────────────────────────────────────────────────
let ME_EVENTS       = null;   // set once auth resolves
let allEvents       = [];
let eventsUnsub     = null;
let editingEventId  = null;   // null = create mode, string = edit mode
let invitedMembers  = new Map(); // uid → {uid, name, avatar}
let presenceCache   = new Map(); // uid → {name, avatar, online}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colorFor(str) {
  const COLORS = ["#008080","#0e9f6e","#0ea5e9","#7c3aed","#db2777","#ea580c","#0891b2"];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function showToast(msg, type = "success") {
  // Reuse the global showToast from chatdashboard if available
  if (window._ntShowToast) { window._ntShowToast(msg, type); return; }
  const icons = { success: "ri-checkbox-circle-line", error: "ri-error-warning-line", warning: "ri-alert-line" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="${icons[type] || icons.success}"></i><span>${msg}</span>`;
  document.getElementById("toastContainer")?.appendChild(t);
  setTimeout(() => {
    t.classList.add("hide");
    t.addEventListener("animationend", () => t.remove());
  }, 3200);
}

function formatEventDateTime(dateStr, timeStr) {
  if (!dateStr) return "";
  try {
    const dt = new Date(`${dateStr}T${timeStr || "00:00"}`);
    const dateFormatted = dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
    const timeFormatted = timeStr ? dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
    return timeFormatted ? `${dateFormatted} • ${timeFormatted}` : dateFormatted;
  } catch { return dateStr; }
}

function isEventPast(dateStr, timeStr) {
  if (!dateStr) return false;
  try {
    const dt = new Date(`${dateStr}T${timeStr || "23:59"}`);
    return dt < new Date();
  } catch { return false; }
}

function getEventEmoji(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("meet") || t.includes("meeting")) return "🤝";
  if (t.includes("party") || t.includes("celebrat")) return "🎉";
  if (t.includes("sport") || t.includes("game") || t.includes("match")) return "⚽";
  if (t.includes("food") || t.includes("lunch") || t.includes("dinner") || t.includes("outing")) return "🍽️";
  if (t.includes("tech") || t.includes("code") || t.includes("dev")) return "💻";
  if (t.includes("music") || t.includes("concert")) return "🎵";
  if (t.includes("trip") || t.includes("travel") || t.includes("tour")) return "✈️";
  if (t.includes("birthday")) return "🎂";
  if (t.includes("wedding")) return "💍";
  return "📅";
}

// ─── Panel open/close ─────────────────────────────────────────────────────────
function openEventsPanel() {
  eventsPanel?.classList.add("open");
  eventsPanelOverlay?.classList.add("active");
  renderEventsList();
}

function closeEventsPanel() {
  eventsPanel?.classList.remove("open");
  eventsPanelOverlay?.classList.remove("active");
}

eventsNavItem?.addEventListener("click", (e) => {
  e.preventDefault();
  eventsPanel?.classList.contains("open") ? closeEventsPanel() : openEventsPanel();
});
eventsPanelClose?.addEventListener("click", closeEventsPanel);
eventsPanelOverlay?.addEventListener("click", closeEventsPanel);

// ─── Firestore listener ───────────────────────────────────────────────────────
function listenEvents(uid) {
  eventsUnsub?.();
  // Listen to events where current user is creator OR invited
  const q = query(collection(db, "events"), orderBy("createdAt", "desc"));
  eventsUnsub = onSnapshot(q, (snap) => {
    allEvents = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(ev => ev.createdBy === uid || (ev.invitees || []).includes(uid));
    renderEventsList();
    updateEventsBadge();
  }, (err) => console.warn("events listener:", err));
}

function updateEventsBadge() {
  const badge = document.getElementById("eventsNavBadge");
  if (!badge) return;
  const upcoming = allEvents.filter(ev => !isEventPast(ev.date, ev.time)).length;
  if (upcoming > 0) {
    badge.textContent = upcoming > 9 ? "9+" : String(upcoming);
    badge.style.display = "flex";
  } else {
    badge.style.display = "none";
  }
}

// ─── Render events list ───────────────────────────────────────────────────────
function renderEventsList() {
  if (!eventsContent) return;

  if (!allEvents.length) {
    eventsEmpty?.classList.remove("hidden");
    eventsContent.innerHTML = "";
    return;
  }
  eventsEmpty?.classList.add("hidden");

  const now = new Date();
  const upcoming = allEvents.filter(ev => !isEventPast(ev.date, ev.time));
  const past     = allEvents.filter(ev => isEventPast(ev.date, ev.time));

  let html = "";

  if (upcoming.length) {
    html += `<div class="events-section-label">Upcoming</div>`;
    html += upcoming.map(ev => buildEventCard(ev, false)).join("");
  }

  if (past.length) {
    html += `<div class="events-section-label" style="margin-top:8px;">Past Events</div>`;
    html += past.map(ev => buildEventCard(ev, true)).join("");
  }

  eventsContent.innerHTML = html;

  // Bind card clicks
  eventsContent.querySelectorAll(".event-card").forEach(card => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".event-card-menu")) return;
      const ev = allEvents.find(x => x.id === card.dataset.id);
      if (ev) openEventDetail(ev);
    });
  });

  // Bind menu clicks
  eventsContent.querySelectorAll(".event-menu-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleEventMenu(btn.dataset.id);
    });
  });

  eventsContent.querySelectorAll(".event-menu-edit").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllEventMenus();
      const ev = allEvents.find(x => x.id === btn.dataset.id);
      if (ev) openCreateEventModal(ev);
    });
  });

  eventsContent.querySelectorAll(".event-menu-delete").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeAllEventMenus();
      const ev = allEvents.find(x => x.id === btn.dataset.id);
      if (ev && confirm(`Delete "${ev.title}"?`)) deleteEvent(ev.id);
    });
  });

  // RSVP buttons
  eventsContent.querySelectorAll(".rsvp-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleRsvp(btn.dataset.id, btn.dataset.status);
    });
  });
}

function buildEventCard(ev, isPast) {
  const emoji    = getEventEmoji(ev.title);
  const dateTime = formatEventDateTime(ev.date, ev.time);
  const isOwner  = ev.createdBy === ME_EVENTS?.uid;
  const rsvp     = (ev.rsvpStatus || {})[ME_EVENTS?.uid];
  const isPastStr = isPast ? "past" : "";

  let statusBadge = "";
  if (isPast) {
    statusBadge = `<span class="event-badge ended">Ended</span>`;
  } else if (rsvp === "going") {
    statusBadge = `<span class="event-badge going">You're going</span>`;
  } else if (rsvp === "maybe") {
    statusBadge = `<span class="event-badge maybe">Maybe</span>`;
  } else if (rsvp === "no") {
    statusBadge = `<span class="event-badge no">Not going</span>`;
  }

  const menuHtml = isOwner ? `
    <div class="event-card-menu">
      <button class="event-menu-btn icon-btn" data-id="${ev.id}" title="Options">
        <i class="ri-more-2-fill"></i>
      </button>
      <div class="event-menu-dropdown hidden" id="event-menu-${ev.id}">
        <button class="event-menu-item event-menu-edit" data-id="${ev.id}"><i class="ri-edit-line"></i> Edit</button>
        <button class="event-menu-item event-menu-delete" data-id="${ev.id}" style="color:var(--error)"><i class="ri-delete-bin-line"></i> Delete</button>
      </div>
    </div>` : `<button class="event-menu-btn icon-btn" data-id="${ev.id}" title="Options" style="opacity:0;pointer-events:none;"><i class="ri-more-2-fill"></i></button>`;

  const rsvpRow = !isPast && (ev.invitees || []).includes(ME_EVENTS?.uid) && ev.createdBy !== ME_EVENTS?.uid ? `
    <div class="event-rsvp-row">
      <button class="rsvp-btn ${rsvp === "going" ? "active" : ""}" data-id="${ev.id}" data-status="going">✓ Going</button>
      <button class="rsvp-btn ${rsvp === "maybe" ? "active" : ""}" data-id="${ev.id}" data-status="maybe">~ Maybe</button>
      <button class="rsvp-btn ${rsvp === "no" ? "active" : ""}" data-id="${ev.id}" data-status="no">✗ Can't go</button>
    </div>` : "";

  return `
    <div class="event-card ${isPastStr}" data-id="${ev.id}">
      <div class="event-card-emoji">${emoji}</div>
      <div class="event-card-body">
        <div class="event-card-top">
          <div class="event-card-title">${escHtml(ev.title)}</div>
          ${menuHtml}
        </div>
        <div class="event-card-meta">
          <span><i class="ri-time-line"></i> ${escHtml(dateTime)}</span>
          ${ev.location ? `<span><i class="ri-map-pin-line"></i> ${escHtml(ev.location)}</span>` : ""}
        </div>
        ${ev.description ? `<div class="event-card-desc">${escHtml(ev.description)}</div>` : ""}
        <div class="event-card-footer">
          ${statusBadge}
          ${rsvpRow}
        </div>
      </div>
    </div>`;
}

function toggleEventMenu(id) {
  closeAllEventMenus();
  const menu = document.getElementById(`event-menu-${id}`);
  menu?.classList.toggle("hidden");
}

function closeAllEventMenus() {
  document.querySelectorAll(".event-menu-dropdown").forEach(m => m.classList.add("hidden"));
}

document.addEventListener("click", closeAllEventMenus);

// ─── RSVP ────────────────────────────────────────────────────────────────────
async function handleRsvp(eventId, status) {
  if (!ME_EVENTS) return;
  try {
    const fieldPath = `rsvpStatus.${ME_EVENTS.uid}`;
    await updateDoc(doc(db, "events", eventId), { [fieldPath]: status });
    showToast(status === "going" ? "Marked as Going 🎉" : status === "maybe" ? "Marked as Maybe" : "Marked as Not Going");
  } catch (err) { showToast("Failed to update RSVP", "error"); }
}

// ─── Event Detail Modal ───────────────────────────────────────────────────────
function openEventDetail(ev) {
  const isOwner  = ev.createdBy === ME_EVENTS?.uid;
  const emoji    = getEventEmoji(ev.title);
  const dateTime = formatEventDateTime(ev.date, ev.time);
  const isPast   = isEventPast(ev.date, ev.time);
  const rsvp     = (ev.rsvpStatus || {})[ME_EVENTS?.uid];

  // Count RSVPs
  const goingList = Object.entries(ev.rsvpStatus || {}).filter(([, v]) => v === "going").map(([uid]) => uid);
  const invitees  = ev.invitees || [];

  eventDetailContent.innerHTML = `
    <div style="text-align:center;padding-bottom:16px;border-bottom:1px solid var(--border);">
      <div style="font-size:48px;margin-bottom:10px;">${emoji}</div>
      <div style="font-size:18px;font-weight:700;color:var(--text);margin-bottom:6px;">${escHtml(ev.title)}</div>
      ${isPast ? `<span class="event-badge ended" style="display:inline-flex;">Ended</span>` : `<span class="event-badge going" style="display:inline-flex;">Upcoming</span>`}
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;padding-top:14px;">
      <div class="event-detail-row">
        <div class="event-detail-icon"><i class="ri-time-line"></i></div>
        <div>
          <div class="event-detail-label">Date & Time</div>
          <div class="event-detail-value">${escHtml(dateTime)}</div>
        </div>
      </div>
      ${ev.location ? `
      <div class="event-detail-row">
        <div class="event-detail-icon"><i class="ri-map-pin-line"></i></div>
        <div>
          <div class="event-detail-label">Location</div>
          <div class="event-detail-value">${escHtml(ev.location)}</div>
        </div>
      </div>` : ""}
      ${ev.description ? `
      <div class="event-detail-row">
        <div class="event-detail-icon"><i class="ri-file-text-line"></i></div>
        <div>
          <div class="event-detail-label">Description</div>
          <div class="event-detail-value">${escHtml(ev.description)}</div>
        </div>
      </div>` : ""}
      ${invitees.length ? `
      <div class="event-detail-row" style="align-items:flex-start;">
        <div class="event-detail-icon" style="margin-top:2px;"><i class="ri-group-line"></i></div>
        <div style="flex:1;">
          <div class="event-detail-label">Invited (${invitees.length})</div>
          <div class="event-detail-value">${buildInviteeAvatars(invitees, ev.rsvpStatus || {})}</div>
        </div>
      </div>` : ""}
      ${goingList.length ? `
      <div style="font-size:12px;color:var(--text-grey);padding:4px 0;">
        <i class="ri-checkbox-circle-line" style="color:#22c55e;"></i> ${goingList.length} going
      </div>` : ""}
    </div>`;

  // Footer buttons
  let footerHtml = "";
  if (isOwner) {
    footerHtml = `
      <button class="btn-secondary" id="evDetailEdit"><i class="ri-edit-line"></i> Edit</button>
      <button class="btn-primary" id="evDetailClose2">Close</button>`;
  } else if (!isPast) {
    const btns = ["going","maybe","no"].map(s =>
      `<button class="rsvp-btn ${rsvp === s ? "active" : ""}" data-status="${s}" id="evDetailRsvp_${s}">${s === "going" ? "✓ Going" : s === "maybe" ? "~ Maybe" : "✗ Can't go"}</button>`
    ).join("");
    footerHtml = `<div style="display:flex;gap:6px;flex:1;">${btns}</div><button class="btn-secondary" id="evDetailClose2">Close</button>`;
  } else {
    footerHtml = `<button class="btn-primary" id="evDetailClose2">Close</button>`;
  }
  eventDetailFooter.innerHTML = footerHtml;

  // Bind footer buttons
  document.getElementById("evDetailClose2")?.addEventListener("click", () => eventDetailModal?.classList.add("hidden"));
  document.getElementById("evDetailEdit")?.addEventListener("click", () => {
    eventDetailModal?.classList.add("hidden");
    openCreateEventModal(ev);
  });
  ["going","maybe","no"].forEach(s => {
    document.getElementById(`evDetailRsvp_${s}`)?.addEventListener("click", async () => {
      await handleRsvp(ev.id, s);
      eventDetailModal?.classList.add("hidden");
    });
  });

  eventDetailModal?.classList.remove("hidden");
}

function buildInviteeAvatars(invitees, rsvpStatus) {
  return invitees.map(uid => {
    const u      = presenceCache.get(uid) || { name: uid, avatar: "" };
    const color  = colorFor(u.name);
    const status = rsvpStatus[uid];
    const av     = u.avatar
      ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : u.name.charAt(0).toUpperCase();
    const dot    = status === "going" ? "background:#22c55e" : status === "maybe" ? "background:#f59e0b" : "background:var(--text-grey)";
    return `<span title="${escHtml(u.name)}" style="position:relative;display:inline-block;margin-right:4px;">
      <span style="width:28px;height:28px;border-radius:50%;background:${color};display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:white;overflow:hidden;">${av}</span>
      ${status ? `<span style="width:8px;height:8px;border-radius:50%;${dot};border:2px solid var(--modal-bg);position:absolute;bottom:0;right:0;display:block;"></span>` : ""}
    </span>`;
  }).join("");
}

eventDetailClose?.addEventListener("click", () => eventDetailModal?.classList.add("hidden"));
eventDetailModal?.addEventListener("click", (e) => { if (e.target === eventDetailModal) eventDetailModal.classList.add("hidden"); });

// ─── Create / Edit Modal ──────────────────────────────────────────────────────
function openCreateEventModal(existingEvent = null) {
  editingEventId = existingEvent?.id || null;
  invitedMembers.clear();

  if (createEventModalTitle)  createEventModalTitle.textContent  = existingEvent ? "Edit Event" : "Create Event";
  if (createEventSaveLabel)   createEventSaveLabel.textContent   = existingEvent ? "Save Changes" : "Create Event";

  // Pre-fill
  if (eventTitleInput)    eventTitleInput.value    = existingEvent?.title    || "";
  if (eventDateInput)     eventDateInput.value     = existingEvent?.date     || "";
  if (eventTimeInput)     eventTimeInput.value     = existingEvent?.time     || "";
  if (eventLocationInput) eventLocationInput.value = existingEvent?.location || "";
  if (eventDescInput)     eventDescInput.value     = existingEvent?.description || "";
  if (eventInviteInput)   eventInviteInput.value   = "";
  eventInviteResults?.classList.add("hidden");

  // Pre-fill invited
  if (existingEvent?.invitees?.length) {
    existingEvent.invitees.forEach(uid => {
      const u = presenceCache.get(uid) || { uid, name: uid, avatar: "" };
      invitedMembers.set(uid, u);
    });
  }
  renderInviteChips();

  createEventModal?.classList.remove("hidden");
  eventTitleInput?.focus();
}

function closeCreateEventModal() {
  createEventModal?.classList.add("hidden");
  editingEventId = null;
  invitedMembers.clear();
}

createEventModalClose?.addEventListener("click", closeCreateEventModal);
createEventCancel?.addEventListener("click", closeCreateEventModal);
createEventModal?.addEventListener("click", (e) => { if (e.target === createEventModal) closeCreateEventModal(); });
createEventBtnHeader?.addEventListener("click", () => openCreateEventModal());
createEventBtnEmpty?.addEventListener("click",  () => openCreateEventModal());

// Save event
createEventSave?.addEventListener("click", async () => {
  const title = eventTitleInput?.value.trim();
  const date  = eventDateInput?.value;
  const time  = eventTimeInput?.value;

  if (!title) { showToast("Please enter an event title", "warning"); return; }
  if (!date)  { showToast("Please select a date", "warning"); return; }

  createEventSave.disabled = true;

  const payload = {
    title,
    date,
    time:        time     || "",
    location:    eventLocationInput?.value.trim()  || "",
    description: eventDescInput?.value.trim()      || "",
    invitees:    [...invitedMembers.keys()],
    createdBy:   ME_EVENTS.uid,
    createdByName: ME_EVENTS.name,
    updatedAt:   serverTimestamp(),
  };

  try {
    if (editingEventId) {
      await updateDoc(doc(db, "events", editingEventId), payload);
      showToast("Event updated ✓");
    } else {
      payload.createdAt  = serverTimestamp();
      payload.rsvpStatus = {};
      await addDoc(collection(db, "events"), payload);
      showToast("Event created! 🎉");
    }
    closeCreateEventModal();
  } catch (err) {
    showToast("Failed to save event: " + err.message, "error");
  } finally {
    if (createEventSave) createEventSave.disabled = false;
  }
});

// Delete event
async function deleteEvent(id) {
  try {
    await deleteDoc(doc(db, "events", id));
    showToast("Event deleted");
  } catch (err) { showToast("Failed to delete: " + err.message, "error"); }
}

// ─── Invite search ────────────────────────────────────────────────────────────
let _inviteTimer = null;
eventInviteInput?.addEventListener("input", () => {
  clearTimeout(_inviteTimer);
  const q = eventInviteInput.value.trim().toLowerCase();
  if (!q) { eventInviteResults?.classList.add("hidden"); return; }
  _inviteTimer = setTimeout(() => renderInviteSearch(q), 200);
});

function renderInviteSearch(q) {
  if (!eventInviteResults) return;
  const results = [...presenceCache.values()]
    .filter(u => u.uid !== ME_EVENTS?.uid && !invitedMembers.has(u.uid) && u.name.toLowerCase().includes(q));

  if (!results.length) {
    eventInviteResults.innerHTML = `<div class="invite-result-empty">No users found</div>`;
    eventInviteResults.classList.remove("hidden");
    return;
  }

  eventInviteResults.innerHTML = results.slice(0, 6).map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : u.name.charAt(0).toUpperCase();
    return `<div class="invite-result-item" data-uid="${u.uid}">
      <div class="invite-av" style="background:${color};">${av}</div>
      <span>${escHtml(u.name)}</span>
      <span class="invite-dot ${u.online ? "online" : "offline"}"></span>
    </div>`;
  }).join("");
  eventInviteResults.classList.remove("hidden");

  eventInviteResults.querySelectorAll(".invite-result-item").forEach(el => {
    el.addEventListener("click", () => {
      const user = presenceCache.get(el.dataset.uid);
      if (!user) return;
      invitedMembers.set(el.dataset.uid, user);
      eventInviteInput.value = "";
      eventInviteResults.classList.add("hidden");
      renderInviteChips();
    });
  });
}

document.addEventListener("click", (e) => {
  if (!eventInviteInput?.contains(e.target) && !eventInviteResults?.contains(e.target))
    eventInviteResults?.classList.add("hidden");
});

function renderInviteChips() {
  if (!eventInvitedChips) return;
  eventInvitedChips.innerHTML = [...invitedMembers.values()].map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" />` : u.name.charAt(0).toUpperCase();
    return `<div class="member-chip" data-uid="${u.uid}">
      <div class="chip-av" style="background:${color};">${av}</div>
      <span>${escHtml(u.name)}</span>
      <span class="chip-remove" title="Remove">✕</span>
    </div>`;
  }).join("");

  eventInvitedChips.querySelectorAll(".member-chip").forEach(el => {
    el.querySelector(".chip-remove")?.addEventListener("click", () => {
      invitedMembers.delete(el.dataset.uid);
      renderInviteChips();
    });
  });
}

// ─── Watch presence for invite search ─────────────────────────────────────────
function listenPresenceForEvents() {
  onSnapshot(
    collection(db, "presence"),
    (snap) => {
      snap.docChanges().forEach(change => {
        const uid  = change.doc.id;
        const data = change.doc.data();
        if (change.type === "removed") { presenceCache.delete(uid); return; }
        presenceCache.set(uid, {
          uid,
          name:   data.name   || uid,
          avatar: data.avatar || "",
          online: data.online ?? false,
        });
      });
    },
    (err) => console.warn("events presence:", err)
  );
}

// ─── Auth gate ────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  if (!user) return;
  const raw = localStorage.getItem(`nextalk_profile_${user.uid}`);
  const profile = raw ? JSON.parse(raw) : null;
  ME_EVENTS = { uid: user.uid, name: profile?.name || user.displayName || user.email, avatar: profile?.avatar || "" };

  listenEvents(user.uid);
  listenPresenceForEvents();

  // Expose showToast globally so events.js can reuse it if chatdashboard already defined it
  // (chatdashboard.js exposes window._vpShowToast, we mirror that)
  if (!window._ntShowToast && window._vpShowToast) window._ntShowToast = window._vpShowToast;
});
