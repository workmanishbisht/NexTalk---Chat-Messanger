// chatdashboard.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, setDoc, updateDoc, deleteDoc,
  getDoc, onSnapshot, query, orderBy, serverTimestamp, where, getDocs, limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

// ─── Firebase ────────────────────────────────────────────────────────────────
const fbApp = initializeApp({
  apiKey: "AIzaSyCJea9IVCNXyeUKCpO_Jhbg-s-PeGoWyDc",
  authDomain: "nextalk-34dad.firebaseapp.com",
  projectId: "nextalk-34dad",
  storageBucket: "nextalk-34dad.appspot.com",
  messagingSenderId: "730298460453",
  appId: "1:730298460453:web:c69d16bd96e14876a4d2cc",
});
const auth    = getAuth(fbApp);
const db      = getFirestore(fbApp);
const storage = getStorage(fbApp);

// ─── Constants ───────────────────────────────────────────────────────────────
const ROOM_GENERAL           = "general";
const ONLINE_THRESHOLD_SEC   = 90;
const HEARTBEAT_INTERVAL_MS  = 30_000;
const COLORS = ["#008080","#0e9f6e","#0ea5e9","#7c3aed","#db2777","#ea580c","#0891b2"];

const EMOJIS = [
  "😀","😃","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😊","😇","🥰","😍",
  "🤩","😘","😗","😚","😙","🥲","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫",
  "🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤",
  "😴","😷","🤒","🤕","🤢","🤮","🤧","🥵","🥶","🥴","😵","🤯","🤠","🥳","🥸",
  "😎","🤓","🧐","😕","😟","🙁","☹️","😮","😯","😲","😳","🥺","😦","😧","😨",
  "😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠",
  "🤬","😈","👿","💀","☠️","💩","🤡","👹","👺","👻","👽","👾","🤖","😺","😸",
  "😹","😻","😼","😽","🙀","😿","😾","👋","🤚","🖐","✋","🖖","👌","🤌","🤏",
  "✌️","🤞","🤟","🤘","🤙","👈","👉","👆","👇","☝️","👍","👎","✊","👊","🤛",
  "🤜","👏","🙌","🫶","👐","🤲","🤝","🙏","💪","❤️","🧡","💛","💚","💙","💜",
  "🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","☮️","✝️",
  "☯️","🔥","⚡","🌈","⭐","🌟","💫","✨","🎉","🎊","🎈",
];

const STICKERS = [
  "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼","🐨","🐯","🦁","🐮","🐷","🐸","🐵",
  "🙈","🙉","🙊","🐔","🐧","🐦","🐤","🦆","🦅","🦉","🦇","🐺","🐗","🐴","🦄",
  "🐝","🐛","🦋","🐌","🐞","🐜","🦟","🦗","🕷","🦂","🐢","🐍","🦎","🦖","🦕",
  "🐙","🦑","🦐","🦞","🦀","🐡","🐠","🐟","🐬","🐳","🐋","🦈","🐊","🐅","🐆",
  "🦓","🦍","🦧","🦣","🌸","🌺","🌻","🌹","🌷","🌼","💐","🍀","🌿","🌱","🌲",
  "🌳","🌴","🍁","🍂","🍃","🍎","🍊","🍋","🍇","🍓","🫐","🍈","🍑","🍒","🥝",
  "🍅","🥥","🥦","🌽","🍕","🍔","🌮","🍜","🍣","🍩","🎂","🍦","☕","🧋","🍺",
  "🎮","⚽","🏀","🎸","🎵","🎨","🚀",
];

// ─── State ────────────────────────────────────────────────────────────────────
let ME = null;

/** Map<otherUid → roomData> — one DM room per peer */
let existingDmRooms = new Map();

/** Map<uid → presenceData> */
let presenceUsersMap = new Map();

let activeRoomId   = null;
let activeRoomMeta = { name: "", isPublic: false, isGroup: false, groupData: null };

// Unread tracking: Map<roomId → unreadCount>
let unreadCounts   = new Map();
// Timestamp of last message we've "seen" per room: Map<roomId → timestamp>
let lastSeenTs     = new Map();

let msgUnsub       = null;
let typingUnsub    = null;
let presenceUnsub  = null;
let groupsUnsub    = null;

let typingTimer    = null;
let lastTypingSent = 0;
let currentEmojiTab = "emoji";
let pinnedChats    = new Set();
let moreDropdownOpen = false;
let selectMode     = false;
let selectedMsgIds = new Set();
let favouriteChats = new Set();

// Group creation
let groupSelectedMembers = new Map();
let selectedGroupIcon    = "💬";

// In-chat search
let searchMatches    = [];
let searchCurrentIdx = -1;

// Context menu / edit
let ctxMsgId   = null;
let ctxMsgData = null;
let editingMsgId = null;

// View profile
let viewProfileUnsub      = null;
let viewProfileMediaUnsub = null;
let currentViewedUid      = null;

// Voice recording
let _isRecording   = false;
let _recInterval   = null;
let _recSeconds    = 0;
let _mediaRecorder = null;
let _audioChunks   = [];
let _recStream     = null;

// Presence heartbeat
let _presenceHeartbeatTimer = null;

// Block / unblock
let blockedUsers   = new Set();
let blockedByUsers = new Set();
let blockUnsub     = null;
let blockedByUnsub = null;

// All groups
let allGroups = [];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getRoomId(a, b) {
  return [a, b].sort().join("__");
}

function loadMyProfile(uid) {
  const raw = localStorage.getItem(`nextalk_profile_${uid}`);
  return raw ? JSON.parse(raw) : null;
}

function getGeneralChatName() {
  return localStorage.getItem("nt_general_name") || "General Chat";
}

function formatChatTime(date) {
  if (!date) return "";
  const now  = new Date();
  const diff = now - date;
  if (diff < 86_400_000 && now.getDate() === date.getDate())
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 2 * 86_400_000) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDob(dobStr) {
  if (!dobStr) return "—";
  try {
    return new Date(dobStr).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return dobStr; }
}

function genderIcon(gender) {
  if (gender === "Male")   return `<i class="ri-men-line" style="color:var(--primary)"></i>`;
  if (gender === "Female") return `<i class="ri-women-line" style="color:#db2777"></i>`;
  return `<i class="ri-question-line" style="color:var(--text-grey)"></i>`;
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024)           return bytes + " B";
  if (bytes < 1024 * 1024)    return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    pdf: "ri-file-pdf-line", doc: "ri-file-word-line", docx: "ri-file-word-line",
    xls: "ri-file-excel-line", xlsx: "ri-file-excel-line",
    ppt: "ri-file-ppt-line", pptx: "ri-file-ppt-line",
    txt: "ri-file-text-line", zip: "ri-file-zip-line", rar: "ri-file-zip-line",
    "7z": "ri-file-zip-line", mp4: "ri-video-line", mov: "ri-video-line",
    avi: "ri-video-line", mp3: "ri-music-line", wav: "ri-music-line", ogg: "ri-music-line",
  };
  return map[ext] || "ri-file-line";
}

function buildAvatarEl(el, name, avatarUrl) {
  el.style.background = colorFor(name || "?");
  el.innerHTML = avatarUrl
    ? `<img src="${avatarUrl}" alt="${escHtml(name)}" />`
    : (name || "?").charAt(0).toUpperCase();
}

function scrollBottom() {
  requestAnimationFrame(() => {
    if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight;
  });
}

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const sidebarAvatar      = $("sidebarAvatar");
const totalUnreadBadge   = $("totalUnread");
const onlineStrip        = $("onlineStrip");
const pinnedList         = $("pinnedList");
const allChatList        = $("allChatList");
const chatEmpty          = $("chatEmpty");
const chatView           = $("chatView");
const chAvatar           = $("chAvatar");
const chPresence         = $("chPresence");
const chName             = $("chName");
const chStatus           = $("chStatus");
const messagesArea       = $("messagesArea");
const typingRow          = $("typingRow");
const typingAv           = $("typingAv");
const msgInput           = $("msgInput");
const sendBtn            = $("sendBtn");

const ipAvatar           = $("ipAvatar");
const ipName             = $("ipName");
const ipUsername         = $("ipUsername");
const ipAbout            = $("ipAbout");
const ipEmail            = $("ipEmail");
const ipPhone            = $("ipPhone");
const ipJoined           = $("ipJoined");
const ipGroupMembersSection = $("ipGroupMembersSection");
const ipGroupMembersList = $("ipGroupMembersList");
const ipDob              = $("ipDob");
const ipGender           = $("ipGender");
const ipInterests        = $("ipInterests");
const ipExtraSection     = $("ipExtraSection");
const ipLocation         = $("ipLocation");
const ipAboutEditBtn     = $("ipAboutEditBtn");

const toastContainer     = $("toastContainer");
const themeToggleBtn     = $("themeToggleBtn");
const themeIcon          = $("themeIcon");
const themeLabelText     = $("themeLabelText");
const avatarWrap         = $("avatarWrap");
const pdLogout           = $("pdLogout");
const attachBtn          = $("attachBtn");
const attachMenu         = $("attachMenu");
const imgFileInput       = $("imgFileInput");
const docFileInput       = $("docFileInput");
const anyFileInput       = $("anyFileInput");
const emojiToggleBtn     = $("emojiToggleBtn");
const emojiPanel         = $("emojiPanel");
const emojiContent       = $("emojiContent");
const searchInput        = $("searchInput");
const searchClearBtn     = $("searchClearBtn");
const searchResultsList  = $("searchResultsList");
const normalChatLists    = $("normalChatLists");
const chatSearchBtn      = $("chatSearchBtn");
const chatSearchBar      = $("chatSearchBar");
const chatSearchInput    = $("chatSearchInput");
const chatSearchCount    = $("chatSearchCount");
const chatSearchPrev     = $("chatSearchPrev");
const chatSearchNext     = $("chatSearchNext");
const chatSearchClose    = $("chatSearchClose");
const newChatBtn         = $("newChatBtn");
const newChatModal       = $("newChatModal");
const newChatModalClose  = $("newChatModalClose");
const newChatSearch      = $("newChatSearch");
const newChatUserList    = $("newChatUserList");
const msgCtxMenu         = $("msgCtxMenu");
const ctxEdit            = $("ctxEdit");
const ctxDelete          = $("ctxDelete");
const editMsgModal       = $("editMsgModal");
const editMsgClose       = $("editMsgClose");
const editMsgCancel      = $("editMsgCancel");
const editMsgSave        = $("editMsgSave");
const editMsgInput       = $("editMsgInput");
const moreMenuBtn        = $("moreMenuBtn");
const moreDropdown       = $("moreDropdown");
const mdViewProfile      = $("mdViewProfile");
const mdSearch           = $("mdSearch");
const mdSelectMsg        = $("mdSelectMsg");
const mdPinChat          = $("mdPinChat");
const mdEditNick         = $("mdEditNick");
const mdRenameChat       = $("mdRenameChat");
const mdClearChat        = $("mdClearChat");
const mdDeleteChat       = $("mdDeleteChat");
const mdBlock            = $("mdBlock");
const mdAddFav           = $("mdAddFav");
const editNickModal      = $("editNickModal");
const editNickModalTitle = $("editNickModalTitle");
const editNickClose      = $("editNickClose");
const editNickCancel     = $("editNickCancel");
const editNickSave       = $("editNickSave");
const editNickInput      = $("editNickInput");
const selectBar          = $("selectBar");
const selectCancel       = $("selectCancel");
const selectCount        = $("selectCount");
const selectDelete       = $("selectDelete");
const selectForward      = $("selectForward");
const groupSettingsBtn   = $("groupSettingsBtn");
const groupSettingsModal = $("groupSettingsModal");
const groupSettingsModalClose = $("groupSettingsModalClose");
const groupSettingsCancel     = $("groupSettingsCancel");
const groupSettingsSave       = $("groupSettingsSave");
const gsGroupName        = $("gsGroupName");
const gsGroupMembersList = $("gsGroupMembersList");
const gsAddMemberSearch  = $("gsAddMemberSearch");
const gsAddMemberList    = $("gsAddMemberList");
const gsDeleteGroup      = $("gsDeleteGroup");

const sidebar            = $("sidebar");
const sidebarOverlay     = $("sidebarOverlay");
const sidebarCloseBtn    = $("sidebarCloseBtn");
const mobileMenuBtn      = $("mobileMenuBtn");
const mobileNewChatBtn   = $("mobileNewChatBtn");
const chatBackBtn        = $("chatBackBtn");
const infoPanel          = $("infoPanel");
const infoPanelOverlay   = $("infoPanelOverlay");
const infoPanelCloseBtn  = $("infoPanelCloseBtn");
const infoPanelToggleBtn = $("infoPanelToggleBtn");

const groupsNavItem      = $("groupsNavItem");
const groupsPanel        = $("groupsPanel");
const groupsPanelClose   = $("groupsPanelClose");
const groupsPanelOverlay = $("groupsPanelOverlay");
const groupsList         = $("groupsList");
const createGroupBtn     = $("createGroupBtn");
const createGroupModal   = $("createGroupModal");
const createGroupModalClose = $("createGroupModalClose");
const createGroupCancel  = $("createGroupCancel");
const createGroupSave    = $("createGroupSave");
const groupNameInput     = $("groupNameInput");
const groupDescInput     = $("groupDescInput");
const groupIconPicker    = $("groupIconPicker");
const groupMemberSearch  = $("groupMemberSearch");
const groupMemberList    = $("groupMemberList");
const selectedMembersWrap = $("selectedMembersWrap");

// View Profile panel
const viewProfilePanel   = $("viewProfilePanel");
const viewProfileOverlay = $("viewProfileOverlay");
const vpCloseBtn         = $("vpCloseBtn");
const vpAvatar           = $("vpAvatar");
const vpName             = $("vpName");
const vpUsername         = $("vpUsername");
const vpOnlineBadge      = $("vpOnlineBadge");
const vpOnlineLabel      = $("vpOnlineLabel");
const vpAbout            = $("vpAbout");
const vpEmail            = $("vpEmail");
const vpPhone            = $("vpPhone");
const vpJoined           = $("vpJoined");
const vpDob              = $("vpDob");
const vpGender           = $("vpGender");
const vpLocation         = $("vpLocation");
const vpInterests        = $("vpInterests");
const vpMediaGrid        = $("vpMediaGrid");
const vpMediaCount       = $("vpMediaCount");
const vpSkeleton         = $("vpSkeleton");
const vpContent          = $("vpContent");
const vpMsgBtn           = $("vpMsgBtn");

// Voice / mic
const micBtn       = $("micBtn");
const micIcon      = $("micIcon");
const waveformWrap = $("waveform");
const recTimerEl   = $("recTimer");
const recTimeEl    = $("recTime");

// ═══════════════════════════════════════════════════════════════════════════════
// UNREAD BADGE SYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Load per-room "last seen" timestamps from localStorage.
 * Key: `nt_seen_<uid>_<roomId>` → ISO string
 */
function loadLastSeenTs(uid) {
  lastSeenTs.clear();
  // We read lazily when needed; no bulk load required.
}

function saveLastSeenTs(roomId, ts) {
  if (!ME || !ts) return;
  lastSeenTs.set(roomId, ts);
  localStorage.setItem(`nt_seen_${ME.uid}_${roomId}`, ts instanceof Date ? ts.toISOString() : ts);
}

function getLastSeenTs(roomId) {
  if (lastSeenTs.has(roomId)) return lastSeenTs.get(roomId);
  const stored = localStorage.getItem(`nt_seen_${ME?.uid}_${roomId}`);
  const ts = stored ? new Date(stored) : null;
  if (ts) lastSeenTs.set(roomId, ts);
  return ts;
}

/**
 * Mark a room as fully read — saves current time as last-seen and clears badge.
 */
function markRoomRead(roomId) {
  saveLastSeenTs(roomId, new Date());
  unreadCounts.set(roomId, 0);
  updateTotalUnreadBadge();
}

/**
 * Increment unread count for a room that is NOT currently open.
 */
function incrementUnread(roomId) {
  const current = unreadCounts.get(roomId) || 0;
  unreadCounts.set(roomId, current + 1);
  updateTotalUnreadBadge();
}

/**
 * Re-render the sidebar total-unread badge.
 */
function updateTotalUnreadBadge() {
  if (!totalUnreadBadge) return;
  let total = 0;
  for (const [, count] of unreadCounts) total += count;
  if (total > 0) {
    totalUnreadBadge.textContent = total > 99 ? "99+" : String(total);
    totalUnreadBadge.classList.add("show");
  } else {
    totalUnreadBadge.textContent = "0";
    totalUnreadBadge.classList.remove("show");
  }
}

/**
 * Count unread messages in a room since last-seen timestamp.
 * Runs once when we first learn about a room so badges appear on app load.
 */
async function countUnreadForRoom(roomId) {
  if (!ME) return 0;
  const seen = getLastSeenTs(roomId);
  try {
    let q;
    if (seen) {
      q = query(
        collection(db, "rooms", roomId, "messages"),
        where("createdAt", ">", seen),
        orderBy("createdAt", "asc")
      );
    } else {
      q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
    }
    const snap = await getDocs(q);
    const count = snap.docs.filter(d => {
      const data = d.data();
      return data.uid !== ME.uid && data.uid !== "system" && !data.deleted;
    }).length;
    return count;
  } catch {
    return 0;
  }
}

// ─── Presence map helpers ─────────────────────────────────────────────────────
function upsertPresenceUser(uid, fields) {
  if (!uid) return;
  const existing = presenceUsersMap.get(uid);
  if (existing) {
    if (fields.name     !== undefined) existing.name     = fields.name;
    if (fields.avatar   !== undefined) existing.avatar   = fields.avatar;
    if (fields.status   !== undefined) existing.status   = fields.status;
    if (fields.online   !== undefined) existing.online   = fields.online;
    if (fields.lastSeen !== undefined) existing.lastSeen = fields.lastSeen;
  } else {
    presenceUsersMap.set(uid, {
      uid,
      name:     fields.name     ?? uid,
      avatar:   fields.avatar   ?? "",
      status:   fields.status   ?? "",
      online:   fields.online   ?? false,
      lastSeen: fields.lastSeen ?? null,
    });
  }
}

function removePresenceUser(uid) { presenceUsersMap.delete(uid); }

function getAllPresenceUsers() { return Array.from(presenceUsersMap.values()); }

// ─── DM rooms map helpers ─────────────────────────────────────────────────────
function getDmRoom(otherUid) { return existingDmRooms.get(otherUid) || null; }

function upsertDmRoom(otherUid, fields) {
  const existing = existingDmRooms.get(otherUid);
  if (existing) {
    if (fields.roomId   !== undefined) existing.roomId   = fields.roomId;
    if (fields.name     !== undefined) existing.name     = fields.name;
    if (fields.avatar   !== undefined) existing.avatar   = fields.avatar;
    if (fields.status   !== undefined) existing.status   = fields.status;
    if (fields.online   !== undefined) existing.online   = fields.online;
    if (fields.lastText !== undefined) existing.lastText = fields.lastText;
    if (fields.lastTs   !== undefined) existing.lastTs   = fields.lastTs;
  } else {
    existingDmRooms.set(otherUid, {
      uid:      otherUid,
      roomId:   fields.roomId   ?? getRoomId(ME?.uid, otherUid),
      name:     fields.name     ?? otherUid,
      avatar:   fields.avatar   ?? "",
      status:   fields.status   ?? "",
      online:   fields.online   ?? false,
      lastText: fields.lastText ?? "",
      lastTs:   fields.lastTs   ?? null,
    });
  }
}

function removeDmRoom(otherUid) { existingDmRooms.delete(otherUid); }

function allDmRooms() { return Array.from(existingDmRooms.values()); }

// ─── Info panel reset ─────────────────────────────────────────────────────────
function resetInfoPanelFields() {
  const clearText = (el) => { if (el) el.textContent = ""; };
  const clearHtml = (el) => { if (el) { el.innerHTML = ""; el.style.display = ""; } };

  clearText(ipName); clearText(ipUsername); clearText(ipAbout);
  clearText(ipJoined);

  if (ipAvatar) {
    ipAvatar.style.background = "";
    ipAvatar.innerHTML = "";
    ipAvatar.style.width = "72px";
    ipAvatar.style.height = "72px";
  }

  clearHtml(ipEmail); clearHtml(ipPhone); clearHtml(ipDob);
  clearHtml(ipGender); clearHtml(ipLocation);

  if (ipInterests) {
    ipInterests.innerHTML = "";
    ipInterests.style.cssText = "";
  }
  if (ipGroupMembersList) ipGroupMembersList.innerHTML = "";
  ipExtraSection?.classList.add("hidden");
  ipGroupMembersSection?.classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSIVE
// ═══════════════════════════════════════════════════════════════════════════════
function openSidebar()  { sidebar?.classList.add("open"); sidebarOverlay?.classList.add("active"); }
function closeSidebar() { sidebar?.classList.remove("open"); sidebarOverlay?.classList.remove("active"); }

mobileMenuBtn?.addEventListener("click", openSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
sidebarOverlay?.addEventListener("click", closeSidebar);
mobileNewChatBtn?.addEventListener("click", () => { closeSidebar(); openNewChatModal(); });

function mobileChatOpen() {
  if (window.innerWidth <= 768) {
    document.body.classList.add("chat-active");
    closeSidebar();
    closeGroupsPanel();
  }
}
function mobileChatClose() { document.body.classList.remove("chat-active"); }
chatBackBtn?.addEventListener("click", mobileChatClose);

function openInfoPanel() {
  infoPanel?.classList.add("open");
  if (window.innerWidth <= 1024) infoPanelOverlay?.classList.add("active");
}
function closeInfoPanel() {
  infoPanel?.classList.remove("open");
  infoPanelOverlay?.classList.remove("active");
}
infoPanelToggleBtn?.addEventListener("click", openInfoPanel);
infoPanelCloseBtn?.addEventListener("click", closeInfoPanel);
infoPanelOverlay?.addEventListener("click", closeInfoPanel);

let _lastWindowWidth = window.innerWidth;
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  if (w > 768  && _lastWindowWidth <= 768)  { closeSidebar(); mobileChatClose(); closeInfoPanel(); closeGroupsPanel(); closeViewProfile(); }
  if (w > 1024 && _lastWindowWidth <= 1024) { closeInfoPanel(); }
  _lastWindowWidth = w;
});

// ═══════════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════════
function showToast(msg, type = "success") {
  const icons = { success: "ri-checkbox-circle-line", error: "ri-error-warning-line", warning: "ri-alert-line" };
  const t = document.createElement("div");
  t.className = `toast ${type}`;
  t.innerHTML = `<i class="${icons[type] || icons.success}"></i><span>${msg}</span>`;
  toastContainer.appendChild(t);
  setTimeout(() => {
    t.classList.add("hide");
    t.addEventListener("animationend", () => t.remove());
  }, 3200);
}

window._vpShowToast = showToast;

// ═══════════════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeIcon)      themeIcon.className  = theme === "dark" ? "ri-sun-line" : "ri-moon-line";
  if (themeLabelText) themeLabelText.textContent = theme === "dark" ? "Light Mode" : "Dark Mode";
  localStorage.setItem("nt_theme", theme);
}
themeToggleBtn?.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
applyTheme(localStorage.getItem("nt_theme") || "light");

// ═══════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener("click", closeMoreDropdown);

pdLogout?.addEventListener("click", async () => {
  await setPresenceOffline();
  stopPresenceHeartbeat();
  blockUnsub?.();
  blockedByUnsub?.();
  await signOut(auth);
  window.location.href = "./authentication.html";
});

// ═══════════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "./authentication.html"; return; }

  const profile = loadMyProfile(user.uid);
  if (!profile?.setupDone) { window.location.href = "./profile-setup.html"; return; }

  ME = {
    uid:       user.uid,
    name:      profile.name,
    avatar:    profile.avatar  || "",
    status:    profile.status  || "Hey there! I'm using NexTalk",
    email:     profile.email   || user.email || "",
    phone:     profile.phone   || "",
    dob:       profile.dob     || "",
    gender:    profile.gender  || "",
    interests: profile.interests || [],
    location:  profile.location  || {},
  };

  pinnedChats = loadPinnedChats(user.uid);
  loadLastSeenTs(user.uid);
  init();
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE → FIRESTORE SYNC
// ═══════════════════════════════════════════════════════════════════════════════
async function syncProfileToFirestore() {
  if (!ME) return;
  const profile = loadMyProfile(ME.uid);
  try {
    await setDoc(doc(db, "users", ME.uid), {
      uid:       ME.uid,
      name:      ME.name,
      avatar:    ME.avatar,
      status:    ME.status,
      email:     ME.email,
      phone:     ME.phone      || "",
      dob:       ME.dob        || "",
      gender:    ME.gender     || "",
      interests: ME.interests  || [],
      location:  ME.location   || {},
      createdAt: profile?.createdAt ? new Date(profile.createdAt) : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn("syncProfileToFirestore:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════════
async function init() {
  buildAvatarEl(sidebarAvatar, ME.name, ME.avatar);
  renderOwnProfileInInfoPanel();
  await setPresenceOnline();
  syncProfileToFirestore().catch(console.warn);

  window.addEventListener("beforeunload", () => { setPresenceOffline(); stopPresenceHeartbeat(); });

  await cleanupDuplicateRooms();
  await loadExistingDmRooms();

  renderContactsList();
  listenPresence();
  listenGroups();
  listenBlockedUsers();

  openRoom(ROOM_GENERAL, getGeneralChatName(), null, true, null, false);
  startPresenceHeartbeat();
  initViewProfilePanel();
  initAboutEditButton();
  initMicButton();
  initIpBlockBtn();
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRESENCE
// ═══════════════════════════════════════════════════════════════════════════════
async function setPresenceOnline() {
  if (!ME) return;
  try {
    await setDoc(doc(db, "presence", ME.uid), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar, status: ME.status,
      online: true, updatedAt: serverTimestamp(), lastSeen: serverTimestamp(),
    }, { merge: true });
  } catch (err) { console.warn("setPresenceOnline:", err); }
}

async function setPresenceOffline() {
  if (!ME) return;
  try {
    await setDoc(doc(db, "presence", ME.uid), {
      online: false, updatedAt: serverTimestamp(), lastSeen: serverTimestamp(),
    }, { merge: true });
  } catch (err) { console.warn("setPresenceOffline:", err); }
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  _presenceHeartbeatTimer = setInterval(async () => {
    if (!ME) return;
    try {
      await setDoc(doc(db, "presence", ME.uid), {
        online: true, updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) { console.warn("heartbeat:", err); }
  }, HEARTBEAT_INTERVAL_MS);
}

function stopPresenceHeartbeat() {
  if (_presenceHeartbeatTimer) {
    clearInterval(_presenceHeartbeatTimer);
    _presenceHeartbeatTimer = null;
  }
}

function isTrulyOnline(data) {
  if (!data) return false;
  const ts = data.updatedAt || data.lastSeen;
  if (ts) {
    const last = ts.toDate ? ts.toDate() : new Date(ts);
    return (Date.now() - last.getTime()) / 1000 < ONLINE_THRESHOLD_SEC;
  }
  return data.online === true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BLOCK / UNBLOCK
// ═══════════════════════════════════════════════════════════════════════════════
function listenBlockedUsers() {
  if (!ME) return;

  blockUnsub?.();
  blockUnsub = onSnapshot(
    collection(db, "users", ME.uid, "blockedUsers"),
    (snap) => { blockedUsers.clear(); snap.docs.forEach(d => blockedUsers.add(d.id)); updateBlockedUI(); },
    (err) => console.warn("blockedUsers listener:", err)
  );

  blockedByUnsub?.();
  blockedByUnsub = onSnapshot(
    collection(db, "users", ME.uid, "blockedBy"),
    (snap) => { blockedByUsers.clear(); snap.docs.forEach(d => blockedByUsers.add(d.id)); updateBlockedUI(); },
    (err) => console.warn("blockedBy listener:", err)
  );
}

async function blockUser(otherUid, otherName) {
  if (!ME || !otherUid) return;
  try {
    await setDoc(doc(db, "users", ME.uid,    "blockedUsers", otherUid), { blockedAt: serverTimestamp(), name: otherName || otherUid });
    await setDoc(doc(db, "users", otherUid,  "blockedBy",    ME.uid),   { blockedAt: serverTimestamp() });
    showToast(`${escHtml(otherName || "User")} has been blocked 🚫`);
    updateBlockedUI();
    updateBlockMenuLabels();
  } catch (err) { showToast("Failed to block user: " + err.message, "error"); }
}

async function unblockUser(otherUid, otherName) {
  if (!ME || !otherUid) return;
  try {
    await deleteDoc(doc(db, "users", ME.uid,   "blockedUsers", otherUid));
    await deleteDoc(doc(db, "users", otherUid, "blockedBy",    ME.uid));
    showToast(`${escHtml(otherName || "User")} has been unblocked ✓`);
    updateBlockedUI();
    updateBlockMenuLabels();
  } catch (err) { showToast("Failed to unblock user: " + err.message, "error"); }
}

function getOtherUidFromActiveRoom() {
  if (!activeRoomId || activeRoomId === ROOM_GENERAL || activeRoomMeta.isGroup) return null;
  return activeRoomId.split("__").find(p => p !== ME?.uid) || null;
}

function isCurrentChatBlocked() {
  const uid = getOtherUidFromActiveRoom();
  return uid ? (blockedUsers.has(uid) || blockedByUsers.has(uid)) : false;
}

function didIBlockOther()    { const uid = getOtherUidFromActiveRoom(); return uid ? blockedUsers.has(uid)   : false; }
function amIBlockedByOther() { const uid = getOtherUidFromActiveRoom(); return uid ? blockedByUsers.has(uid) : false; }

function updateBlockedUI() {
  if (!activeRoomId || activeRoomId === ROOM_GENERAL || activeRoomMeta.isGroup) {
    showInputBarEnabled(true);
    updateBlockMenuLabels();
    return;
  }
  showInputBarEnabled(!isCurrentChatBlocked());
  updateBlockMenuLabels();
  updateIpBlockBtn(getOtherUidFromActiveRoom());
}

function showInputBarEnabled(enabled) {
  document.getElementById("blockedNoticeBar")?.remove();

  if (!enabled) {
    const inputBar  = document.querySelector(".input-bar");
    if (!inputBar) return;
    const otherUid  = getOtherUidFromActiveRoom();
    const otherName = presenceUsersMap.get(otherUid)?.name || getDmRoom(otherUid)?.name || "User";

    const bar = document.createElement("div");
    bar.id = "blockedNoticeBar";
    bar.style.cssText = "display:flex;align-items:center;justify-content:center;gap:10px;padding:12px 16px;background:#fff0f0;border-top:1px solid #fecaca;font-size:13px;font-weight:600;color:var(--error);flex-shrink:0;";

    if (didIBlockOther()) {
      bar.innerHTML = `
        <i class="ri-forbid-line" style="font-size:16px;flex-shrink:0;"></i>
        <span>You blocked <strong>${escHtml(otherName)}</strong></span>
        <button id="blockedNoticeUnblockBtn"
          style="margin-left:8px;padding:5px 16px;background:#fff;border:1.5px solid #f87171;border-radius:8px;color:var(--error);font-size:12px;font-weight:700;font-family:'Work Sans',sans-serif;cursor:pointer;"
        >Unblock</button>`;
      bar.querySelector("#blockedNoticeUnblockBtn")?.addEventListener("click", () => unblockUser(otherUid, otherName));
    } else {
      bar.innerHTML = `
        <i class="ri-forbid-line" style="font-size:16px;flex-shrink:0;"></i>
        <span><strong>${escHtml(otherName)}</strong> blocked you. Messaging is unavailable.</span>`;
    }

    inputBar.insertAdjacentElement("beforebegin", bar);

    if (msgInput)       { msgInput.disabled = true; msgInput.placeholder = "Messaging unavailable"; }
    if (sendBtn)          sendBtn.disabled = true;
    if (micBtn)           micBtn.disabled  = true;
    if (attachBtn)        attachBtn.disabled = true;
    if (emojiToggleBtn)   emojiToggleBtn.disabled = true;
  } else {
    if (msgInput)       { msgInput.disabled = false; msgInput.placeholder = "Type a message…"; }
    if (sendBtn)          sendBtn.disabled = false;
    if (micBtn)           micBtn.disabled  = false;
    if (attachBtn)        attachBtn.disabled = false;
    if (emojiToggleBtn)   emojiToggleBtn.disabled = false;
  }
}

function updateBlockMenuLabels() {
  const otherUid  = getOtherUidFromActiveRoom();
  const isBlocked = otherUid && blockedUsers.has(otherUid);
  if (!mdBlock) return;
  if (isBlocked) {
    mdBlock.innerHTML = `<i class="ri-user-received-line"></i> Unblock User`;
    mdBlock.classList.remove("more-item-danger");
    mdBlock.style.color = "var(--primary)";
  } else {
    mdBlock.innerHTML = `<i class="ri-forbid-line"></i> Block User`;
    mdBlock.classList.add("more-item-danger");
    mdBlock.style.color = "";
  }
}

function updateIpBlockBtn(otherUid) {
  const btn = document.getElementById("ipBlockUserBtn");
  if (!btn || !otherUid) return;
  const isBlocked = blockedUsers.has(otherUid);
  btn.innerHTML   = isBlocked ? `<i class="ri-user-received-line"></i> Unblock User` : `<i class="ri-forbid-line"></i> Block User`;
  btn.style.background   = isBlocked ? "#f0fff4"   : "";
  btn.style.color        = isBlocked ? "#16a34a"   : "";
  btn.style.borderColor  = isBlocked ? "#86efac"   : "";
}

function initIpBlockBtn() {
  document.getElementById("ipBlockUserBtn")?.addEventListener("click", async () => {
    const otherUid = getOtherUidFromActiveRoom();
    if (!otherUid) { showToast("Please open a direct chat first.", "warning"); return; }
    const otherName = presenceUsersMap.get(otherUid)?.name || getDmRoom(otherUid)?.name || "User";
    if (blockedUsers.has(otherUid)) {
      await unblockUser(otherUid, otherName);
    } else {
      if (!confirm(`Block "${otherName}"?\nThey won't be able to message you until unblocked.`)) return;
      await blockUser(otherUid, otherName);
    }
  });
}

mdBlock?.addEventListener("click", async () => {
  closeMoreDropdown();
  const otherUid = getOtherUidFromActiveRoom();
  if (!otherUid) { showToast("Only available in direct chats.", "warning"); return; }
  const otherName = presenceUsersMap.get(otherUid)?.name || getDmRoom(otherUid)?.name || "User";
  if (blockedUsers.has(otherUid)) {
    await unblockUser(otherUid, otherName);
  } else {
    if (!confirm(`Block "${otherName}"?\nThey won't be able to message you until unblocked.`)) return;
    await blockUser(otherUid, otherName);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CLEANUP DUPLICATE ROOMS
// ═══════════════════════════════════════════════════════════════════════════════
async function cleanupDuplicateRooms() {
  if (!ME) return;
  try {
    const ref  = doc(db, "userRooms", ME.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const raw     = snap.data().rooms || [];
    const cleaned = [];
    const seenUids = new Set();

    for (const roomId of raw) {
      const parts    = roomId.split("__");
      if (parts.length !== 2) { cleaned.push(roomId); continue; }
      const otherUid = parts.find(p => p !== ME.uid);
      if (!otherUid) continue;
      if (!seenUids.has(otherUid)) { seenUids.add(otherUid); cleaned.push(roomId); }
    }

    if (cleaned.length !== raw.length)
      await setDoc(ref, { rooms: cleaned }, { merge: true });
  } catch (err) { console.warn("cleanupDuplicateRooms:", err); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOAD EXISTING DM ROOMS
// ═══════════════════════════════════════════════════════════════════════════════
async function loadExistingDmRooms() {
  if (!ME) return;
  existingDmRooms.clear();

  try {
    const snap = await getDoc(doc(db, "userRooms", ME.uid));
    if (!snap.exists()) return;

    const roomIds = [...new Set(snap.data().rooms || [])];

    for (const roomId of roomIds) {
      const parts = roomId.split("__");
      if (parts.length !== 2) continue;
      const otherUid = parts.find(p => p !== ME.uid);
      if (!otherUid || otherUid === ME.uid) continue;
      if (existingDmRooms.has(otherUid)) continue;

      let lastText = "";
      let lastTs   = null;
      try {
        const msgSnap = await getDocs(query(
          collection(db, "rooms", roomId, "messages"),
          orderBy("createdAt", "desc"), limit(1)
        ));
        if (!msgSnap.empty) {
          const m = msgSnap.docs[0].data();
          if (m.uid !== "system" && !m.deleted) {
            lastText = m.type === "image"  ? "📷 Image"
                     : m.type === "file"   ? `📎 ${m.fileName || "File"}`
                     : m.type === "sticker"? m.text
                     : m.type === "voice"  ? "🎤 Voice message"
                     : (m.text || "");
          }
          lastTs = m.createdAt?.toDate ? m.createdAt.toDate() : null;
        }
      } catch (_) {}

      upsertDmRoom(otherUid, { roomId, name: otherUid, avatar: "", status: "", online: false, lastText, lastTs });

      // Count unread for this room
      countUnreadForRoom(roomId).then(count => {
        if (count > 0) {
          unreadCounts.set(roomId, count);
          updateTotalUnreadBadge();
          renderContactsList();
        }
      });
    }

    // Also count unread for general
    countUnreadForRoom(ROOM_GENERAL).then(count => {
      if (count > 0) {
        unreadCounts.set(ROOM_GENERAL, count);
        updateTotalUnreadBadge();
        renderContactsList();
      }
    });

  } catch (err) { console.warn("loadExistingDmRooms:", err); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGISTER DM ROOM
// ═══════════════════════════════════════════════════════════════════════════════
async function registerDmRoom(roomId) {
  if (!ME) return;
  const parts    = roomId.split("__");
  if (parts.length !== 2) return;
  const otherUid = parts.find(p => p !== ME.uid);
  if (!otherUid) return;

  try {
    const addToList = async (uid) => {
      const ref  = doc(db, "userRooms", uid);
      const snap = await getDoc(ref);
      const rooms = [...new Set(snap.exists() ? (snap.data().rooms || []) : [])];
      if (!rooms.includes(roomId))
        await setDoc(ref, { rooms: [...rooms, roomId] }, { merge: true });
    };
    await Promise.all([addToList(ME.uid), addToList(otherUid)]);
  } catch (err) { console.warn("registerDmRoom:", err); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABOUT / BIO EDIT
// ═══════════════════════════════════════════════════════════════════════════════
function initAboutEditButton() {
  ipAboutEditBtn?.addEventListener("click", (e) => { e.stopPropagation(); openAboutEditor(); });
}

function openAboutEditor() {
  if (!ipAbout) return;
  const currentText = ME?.status || "Hey there! I'm using NexTalk";
  const section = ipAbout.parentElement;
  if (!section || section.querySelector(".about-edit-wrap")) return;

  ipAbout.style.display = "none";
  if (ipAboutEditBtn) ipAboutEditBtn.style.display = "none";

  const wrap = document.createElement("div");
  wrap.className = "about-edit-wrap";
  wrap.style.cssText = "display:flex;align-items:center;gap:6px;margin-top:4px;";

  const input = document.createElement("input");
  input.type        = "text";
  input.value       = currentText;
  input.maxLength   = 120;
  input.placeholder = "Write something about yourself…";
  input.style.cssText = `flex:1;border:none;border-bottom:1.5px solid var(--primary);background:transparent;font-family:'Work Sans',sans-serif;font-size:13px;color:var(--text);outline:none;padding:2px 4px;min-width:0;`;

  const saveBtn   = makeIconBtn("ri-check-line", "Save",   "var(--primary)");
  const cancelBtn = makeIconBtn("ri-close-line", "Cancel", "");

  wrap.append(input, saveBtn, cancelBtn);
  ipAbout.insertAdjacentElement("afterend", wrap);
  input.focus();
  input.select();

  const doSave   = async () => {
    const newStatus = input.value.trim();
    if (!newStatus) { showToast("Status cannot be empty", "warning"); return; }
    await saveAboutStatus(newStatus);
    closeAboutEditor(wrap, newStatus);
  };
  const doCancel = () => closeAboutEditor(wrap, currentText);

  saveBtn.addEventListener("click", doSave);
  cancelBtn.addEventListener("click", doCancel);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  doSave();
    if (e.key === "Escape") doCancel();
  });
}

function closeAboutEditor(wrap, displayText) {
  wrap?.remove();
  if (ipAbout) { ipAbout.textContent = displayText || ME?.status || "Hey there! I'm using NexTalk"; ipAbout.style.display = ""; }
  if (ipAboutEditBtn) ipAboutEditBtn.style.display = "";
}

async function saveAboutStatus(newStatus) {
  if (!ME) return;
  ME.status = newStatus;
  const profile = loadMyProfile(ME.uid);
  if (profile) { profile.status = newStatus; localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(profile)); }
  try { await setDoc(doc(db, "users",    ME.uid), { status: newStatus, updatedAt: serverTimestamp() }, { merge: true }); } catch (err) { console.warn(err); }
  try { await setDoc(doc(db, "presence", ME.uid), { status: newStatus, updatedAt: serverTimestamp() }, { merge: true }); } catch (err) { console.warn(err); }
  showToast("Status updated ✓");
}

// small helper — reusable icon button
function makeIconBtn(iconClass, title, color) {
  const btn = document.createElement("button");
  btn.className = "icon-btn";
  btn.style.cssText = `width:22px;height:22px;font-size:13px;flex-shrink:0;${color ? `color:${color};` : ""}`;
  btn.innerHTML = `<i class="${iconClass}"></i>`;
  btn.title = title;
  return btn;
}

// ═══════════════════════════════════════════════════════════════════════════════
// OWN PROFILE — INFO PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function renderOwnProfileInInfoPanel() {
  if (!ME) return;
  resetInfoPanelFields();

  buildAvatarEl(ipAvatar, ME.name, ME.avatar);
  if (ipAvatar) { ipAvatar.style.width = "72px"; ipAvatar.style.height = "72px"; }

  if (ipName)     ipName.textContent     = ME.name;
  if (ipUsername) ipUsername.textContent = `@${ME.name.toLowerCase().replace(/\s+/g, "")}`;
  if (ipAbout)    ipAbout.textContent    = ME.status || "Hey there! I'm using NexTalk";

  const joinedDate = (() => {
    const p = loadMyProfile(ME.uid);
    return p?.createdAt
      ? new Date(p.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  })();
  if (ipJoined) ipJoined.textContent = joinedDate;

  // Editable fields
  if (ipEmail) renderEditableField(ipEmail, ME.email || "—", "email", async () => {
    showToast("Email cannot be changed here.", "warning");
  }, true);

  if (ipPhone) renderEditableField(ipPhone, ME.phone || "Add phone number", "phone", async (val) => {
    const p = loadMyProfile(ME.uid);
    if (p) { p.phone = val; localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(p)); ME.phone = val; }
    showToast("Phone number saved ✓");
    syncProfileToFirestore().catch(() => {});
  });

  if (ipDob) renderEditableField(ipDob, ME.dob ? formatDob(ME.dob) : "Add date of birth", "dob", async (val) => {
    const p = loadMyProfile(ME.uid);
    if (p) { p.dob = val; localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(p)); ME.dob = val; }
    showToast("Date of birth saved ✓");
    syncProfileToFirestore().catch(() => {});
  }, false, "date");

  if (ipGender)    renderGenderField(ipGender, ME.gender || "");
  if (ipInterests) renderInterestTags(ipInterests, ME.interests || []);
  if (ipLocation)  renderLocationField(ipLocation, ME.location || {});

  ipExtraSection?.classList.remove("hidden");
  ipGroupMembersSection?.classList.add("hidden");
}

function renderLocationField(el, location) {
  el.innerHTML = "";
  el.style.cssText = "display:flex;align-items:center;gap:6px;";

  const display = location?.display || "";
  const span    = document.createElement("span");
  span.style.cssText = "flex:1;color:var(--text);font-size:13px;word-break:break-all;";
  span.innerHTML = display
    ? `<span class="ip-location-chip"><i class="ri-map-pin-2-fill" style="color:var(--primary);margin-right:4px;"></i>${escHtml(display)}</span>`
    : `<span style="color:var(--text-grey)">Add location</span>`;
  el.appendChild(span);

  const editBtn = makeIconBtn("ri-edit-line", "Edit location", "");
  editBtn.style.opacity = "0.55";
  el.appendChild(editBtn);

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.innerHTML = "";
    el.style.flexWrap = "nowrap";

    const input    = document.createElement("input");
    input.type     = "text";
    input.value    = display || "";
    input.placeholder = "e.g. Dehradun, Uttarakhand";
    input.style.cssText = `flex:1;border:none;border-bottom:1.5px solid var(--primary);background:transparent;font-family:'Work Sans',sans-serif;font-size:13px;color:var(--text);outline:none;padding:2px 4px;min-width:0;`;

    const saveBtn   = makeIconBtn("ri-check-line", "Save",   "var(--primary)");
    const cancelBtn = makeIconBtn("ri-close-line", "Cancel", "");
    el.append(input, saveBtn, cancelBtn);
    input.focus();

    const doSave = async () => {
      const newVal = input.value.trim();
      const p = loadMyProfile(ME.uid);
      if (p) { if (!p.location) p.location = {}; p.location.display = newVal; localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(p)); ME.location = { ...ME.location, display: newVal }; }
      showToast("Location saved ✓");
      syncProfileToFirestore().catch(() => {});
      renderLocationField(el, ME.location);
    };

    saveBtn.addEventListener("click", doSave);
    cancelBtn.addEventListener("click", () => renderLocationField(el, location));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); if (e.key === "Escape") renderLocationField(el, location); });
  });
}

function renderGenderField(el, gender) {
  el.innerHTML = "";
  el.style.cssText = "display:flex;align-items:center;gap:6px;";
  el.innerHTML = (gender && gender !== "Not specified")
    ? `${genderIcon(gender)}<span style="font-size:13px;color:var(--text)">${escHtml(gender)}</span>`
    : `<span style="font-size:13px;color:var(--text-grey)">Not specified</span>`;
}

function renderInterestTags(el, interests) {
  el.innerHTML = "";
  if (!interests?.length) {
    el.innerHTML = `<span style="font-size:13px;color:var(--text-grey)">No interests added</span>`;
    return;
  }
  el.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
  interests.forEach(tag => {
    const chip = document.createElement("span");
    chip.style.cssText = "display:inline-flex;align-items:center;padding:3px 10px;background:rgba(0,128,128,0.1);color:var(--primary);border-radius:20px;font-size:12px;font-weight:600;";
    chip.textContent = tag;
    el.appendChild(chip);
  });
}

function renderEditableField(el, value, fieldName, onSave, readonly = false, inputType = "text") {
  el.innerHTML = "";
  el.style.cssText = "display:flex;align-items:center;gap:6px;";

  const span = document.createElement("span");
  span.textContent = value || "—";
  span.style.cssText = "flex:1;color:var(--text);font-size:13px;word-break:break-all;";
  el.appendChild(span);

  if (readonly) return;

  const editBtn = makeIconBtn("ri-edit-line", `Edit ${fieldName}`, "");
  editBtn.style.opacity = "0.55";
  el.appendChild(editBtn);

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.innerHTML = "";
    el.style.flexWrap = "nowrap";

    const input       = document.createElement("input");
    input.type        = inputType;
    input.value       = value.startsWith("Add ") ? "" : (value || "");
    input.placeholder = fieldName === "phone" ? "+91 98765 43210" : fieldName === "dob" ? "YYYY-MM-DD" : "";
    input.style.cssText = `flex:1;border:none;border-bottom:1.5px solid var(--primary);background:transparent;font-family:'Work Sans',sans-serif;font-size:13px;color:var(--text);outline:none;padding:2px 4px;min-width:0;`;

    const saveBtn   = makeIconBtn("ri-check-line", "Save",   "var(--primary)");
    const cancelBtn = makeIconBtn("ri-close-line", "Cancel", "");
    el.append(input, saveBtn, cancelBtn);
    input.focus();

    const doSave = async () => {
      const newVal     = input.value.trim();
      await onSave(newVal);
      const displayVal = fieldName === "dob" && newVal ? formatDob(newVal) : (newVal || value);
      renderEditableField(el, displayVal, fieldName, onSave, readonly, inputType);
    };
    saveBtn.addEventListener("click", doSave);
    cancelBtn.addEventListener("click", () => renderEditableField(el, value, fieldName, onSave, readonly, inputType));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSave(); if (e.key === "Escape") renderEditableField(el, value, fieldName, onSave, readonly, inputType); });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRESENCE LISTENER
// ═══════════════════════════════════════════════════════════════════════════════
function listenPresence() {
  presenceUnsub?.();

  presenceUnsub = onSnapshot(collection(db, "presence"), (snap) => {
    snap.docChanges().forEach(change => {
      const uid  = change.doc.id;
      const data = change.doc.data();

      if (change.type === "removed") { removePresenceUser(uid); return; }

      const online = isTrulyOnline(data);
      upsertPresenceUser(uid, {
        name: data.name || uid, avatar: data.avatar || "", status: data.status || "",
        online, lastSeen: data.updatedAt || data.lastSeen || null,
      });

      // Sync own status changes
      if (uid === ME?.uid && data.status && data.status !== ME.status) {
        ME.status = data.status;
        if (ipAbout && !ipAbout.parentElement?.querySelector(".about-edit-wrap"))
          ipAbout.textContent = data.status;
      }
    });

    const allUsers    = getAllPresenceUsers();
    const onlineUsers = allUsers.filter(u => u.online);

    renderOnlineStrip(onlineUsers);

    // Sync DM room presence data
    allUsers.forEach(u => {
      if (u.uid !== ME?.uid && existingDmRooms.has(u.uid))
        upsertDmRoom(u.uid, { name: u.name, avatar: u.avatar, status: u.status, online: u.online });
    });

    renderAllUsersPanel(allUsers);

    // Update chat header if open
    if (activeRoomId && activeRoomId !== ROOM_GENERAL && !activeRoomMeta.isGroup) {
      const other = allUsers.find(u => u.uid !== ME?.uid && getRoomId(ME.uid, u.uid) === activeRoomId);
      if (other) updateChatHeaderPresence(other);
    }

    renderContactsList();

    // Update view profile panel badge if open
    if (currentViewedUid && vpOnlineBadge) {
      const viewed = presenceUsersMap.get(currentViewedUid);
      if (viewed) {
        vpOnlineBadge.className = `vp-online-badge ${viewed.online ? "online" : "offline"}`;
        if (vpOnlineLabel) vpOnlineLabel.textContent = viewed.online ? "Online" : "Offline";
      }
    }
  });
}

function updateChatHeaderPresence(user) {
  chPresence.className = `ch-presence ${user.online ? "online" : "offline"}`;
  if (!chStatus.classList.contains("typing")) {
    chStatus.textContent = user.online ? "Online" : "Offline";
    chStatus.className   = `ch-status ${user.online ? "online-status" : "offline-status"}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEW PROFILE PANEL
// ═══════════════════════════════════════════════════════════════════════════════
function initViewProfilePanel() {
  vpCloseBtn?.addEventListener("click", closeViewProfile);
  viewProfileOverlay?.addEventListener("click", closeViewProfile);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && viewProfilePanel?.classList.contains("open")) closeViewProfile();
  });

  vpMsgBtn?.addEventListener("click", () => {
    if (!currentViewedUid || !ME) return;
    const user   = presenceUsersMap.get(currentViewedUid) || { uid: currentViewedUid, name: currentViewedUid, avatar: "", online: false, status: "" };
    const roomId = getRoomId(ME.uid, currentViewedUid);
    closeViewProfile();
    startDmWithUser(roomId, currentViewedUid, user);
  });

  document.getElementById("vpBlockBtn")?.addEventListener("click", async () => {
    if (!currentViewedUid) return;
    const name = vpName?.textContent || "User";
    const btn  = document.getElementById("vpBlockBtn");
    if (blockedUsers.has(currentViewedUid)) {
      await unblockUser(currentViewedUid, name);
      btn.innerHTML = `<i class="ri-forbid-line"></i> Block User`;
      btn.style.cssText = "";
    } else {
      if (!confirm(`Block "${name}"?`)) return;
      await blockUser(currentViewedUid, name);
      btn.innerHTML = `<i class="ri-user-received-line"></i> Unblock User`;
      btn.style.background   = "#f0fff4";
      btn.style.color        = "#16a34a";
      btn.style.borderColor  = "#86efac";
    }
  });
}

async function openViewProfile(uid) {
  if (!uid || uid === ME?.uid) return;

  if (currentViewedUid !== uid) {
    currentViewedUid = uid;
    showViewProfileSkeleton();
    await loadViewProfileData(uid);
  }

  const vpBlockBtn = document.getElementById("vpBlockBtn");
  if (vpBlockBtn) {
    const blocked = blockedUsers.has(uid);
    vpBlockBtn.innerHTML      = blocked ? `<i class="ri-user-received-line"></i> Unblock User` : `<i class="ri-forbid-line"></i> Block User`;
    vpBlockBtn.style.background   = blocked ? "#f0fff4" : "";
    vpBlockBtn.style.color        = blocked ? "#16a34a" : "";
    vpBlockBtn.style.borderColor  = blocked ? "#86efac" : "";
  }

  viewProfilePanel?.classList.add("open");
  viewProfileOverlay?.classList.add("active");
  if (window.innerWidth <= 768) document.body.style.overflow = "hidden";
}

function closeViewProfile() {
  viewProfilePanel?.classList.remove("open");
  viewProfileOverlay?.classList.remove("active");
  document.body.style.overflow = "";
  viewProfileUnsub?.();       viewProfileUnsub      = null;
  viewProfileMediaUnsub?.();  viewProfileMediaUnsub = null;
  currentViewedUid = null;
}

function showViewProfileSkeleton() {
  vpSkeleton?.classList.remove("hidden");
  vpContent?.classList.add("hidden");
}

function hideViewProfileSkeleton() {
  vpSkeleton?.classList.add("hidden");
  vpContent?.classList.remove("hidden");
}

async function loadViewProfileData(uid) {
  viewProfileUnsub?.();
  viewProfileMediaUnsub?.();

  let cachedProfile = null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (snap.exists()) cachedProfile = snap.data();
  } catch (err) { console.warn("vp users fetch:", err); }

  const presUnsub  = onSnapshot(doc(db, "presence", uid), (presSnap) => {
    const pres    = presSnap.exists() ? presSnap.data() : null;
    const mapUser = presenceUsersMap.get(uid);
    renderViewProfileUI(uid, buildProfileData(uid, cachedProfile, pres, mapUser));
  });

  const usersUnsub = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    cachedProfile = snap.data();
    const mapUser = presenceUsersMap.get(uid);
    renderViewProfileUI(uid, buildProfileData(uid, cachedProfile, null, mapUser));
  });

  viewProfileUnsub = () => { presUnsub(); usersUnsub(); };
  await loadViewProfileMedia(uid);
}

function buildProfileData(uid, userDoc, presDoc, mapUser) {
  const isOnline = presDoc ? isTrulyOnline(presDoc) : (mapUser?.online ?? false);
  return {
    name:      userDoc?.name      || presDoc?.name   || mapUser?.name   || uid,
    avatar:    userDoc?.avatar    || presDoc?.avatar  || mapUser?.avatar || "",
    status:    userDoc?.status    || presDoc?.status  || mapUser?.status || "Hey there! I'm using NexTalk",
    online:    isOnline,
    email:     userDoc?.email     || "",
    phone:     userDoc?.phone     || "",
    dob:       userDoc?.dob       || "",
    gender:    userDoc?.gender    || "",
    location:  userDoc?.location  || {},
    interests: userDoc?.interests || [],
    createdAt: userDoc?.createdAt || presDoc?.createdAt || null,
  };
}

function renderViewProfileUI(uid, p) {
  hideViewProfileSkeleton();

  if (vpAvatar) {
    vpAvatar.style.background = colorFor(p.name);
    vpAvatar.innerHTML = p.avatar
      ? `<img src="${escHtml(p.avatar)}" alt="${escHtml(p.name)}" />`
      : `<span>${(p.name || "?").charAt(0).toUpperCase()}</span>`;
  }

  if (vpName)     vpName.textContent     = p.name || uid;
  if (vpUsername) vpUsername.textContent = `@${(p.name || uid).toLowerCase().replace(/\s+/g, "")}`;

  if (vpOnlineBadge) {
    vpOnlineBadge.className = `vp-online-badge ${p.online ? "online" : "offline"}`;
    if (vpOnlineLabel) vpOnlineLabel.textContent = p.online ? "Online" : "Offline";
  }

  if (vpAbout) vpAbout.textContent = p.status || "Hey there! I'm using NexTalk";

  setVpText(vpEmail,  p.email || "—");
  setVpText(vpPhone,  p.phone || "—");
  setVpText(vpDob,    p.dob ? formatDob(p.dob) : "—");

  if (vpGender) {
    vpGender.innerHTML = (p.gender && p.gender !== "Not specified")
      ? `${genderIcon(p.gender)} <span style="font-size:13px;color:var(--text);margin-left:4px;">${escHtml(p.gender)}</span>`
      : "—";
    if (!p.gender || p.gender === "Not specified") vpGender.style.color = "var(--text-grey)";
  }

  if (vpLocation) {
    const display = p.location?.display || "";
    vpLocation.innerHTML = display
      ? `<span class="ip-location-chip"><i class="ri-map-pin-2-fill" style="color:var(--primary);margin-right:4px;"></i>${escHtml(display)}</span>`
      : "—";
    if (!display) vpLocation.style.color = "var(--text-grey)";
  }

  if (vpInterests) {
    vpInterests.innerHTML = "";
    if (p.interests?.length) {
      vpInterests.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
      p.interests.forEach(tag => {
        const chip = document.createElement("span");
        chip.className   = "vp-interest-chip";
        chip.textContent = tag;
        vpInterests.appendChild(chip);
      });
    } else {
      vpInterests.innerHTML = `<span style="font-size:13px;color:var(--text-grey)">No interests added</span>`;
    }
  }

  if (vpJoined) {
    vpJoined.textContent = p.createdAt
      ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt))
          .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : "—";
  }
}

function setVpText(el, value) {
  if (!el) return;
  el.textContent = value || "—";
  el.style.color = (value && value !== "—") ? "var(--text)" : "var(--text-grey)";
}

async function loadViewProfileMedia(uid) {
  if (!ME || !vpMediaGrid) return;
  const roomId = getRoomId(ME.uid, uid);
  vpMediaGrid.innerHTML = `<div class="vp-media-loading"><div class="vp-skeleton-block" style="height:72px;border-radius:10px;"></div><div class="vp-skeleton-block" style="height:72px;border-radius:10px;"></div><div class="vp-skeleton-block" style="height:72px;border-radius:10px;"></div></div>`;
  if (vpMediaCount) vpMediaCount.textContent = "";

  try {
    const q = query(collection(db, "rooms", roomId, "messages"), where("type", "==", "image"), orderBy("createdAt", "desc"), limit(9));
    viewProfileMediaUnsub = onSnapshot(q, (snap) => {
      const images = snap.docs.map(d => d.data()).filter(d => !d.deleted && (d.fileUrl || d.fileData));
      if (!images.length) {
        vpMediaGrid.innerHTML = `<div class="vp-media-empty"><i class="ri-image-line"></i><span>No shared media yet</span></div>`;
        if (vpMediaCount) vpMediaCount.textContent = "";
        return;
      }
      if (vpMediaCount) vpMediaCount.textContent = `${images.length} photo${images.length !== 1 ? "s" : ""}`;
      vpMediaGrid.innerHTML = images.map(img => {
        const src  = escHtml(img.fileUrl || img.fileData || "");
        const name = escHtml(img.fileName || "image.png");
        return `<a class="vp-media-thumb" href="${src}" target="_blank" title="${name}"><img src="${src}" alt="${name}" loading="lazy" onerror="this.parentElement.style.display='none'" /></a>`;
      }).join("");
    });
  } catch {
    vpMediaGrid.innerHTML = `<div class="vp-media-empty"><i class="ri-image-line"></i><span>No shared media yet</span></div>`;
  }
}

mdViewProfile?.addEventListener("click", () => {
  closeMoreDropdown();
  if (!activeRoomId || activeRoomId === ROOM_GENERAL || activeRoomMeta.isGroup) {
    showToast("View Profile is only available for direct messages.", "warning"); return;
  }
  const otherUid = activeRoomId.split("__").find(p => p !== ME?.uid);
  if (otherUid) openViewProfile(otherUid);
});

chAvatar?.addEventListener("click", () => {
  if (!activeRoomId || activeRoomId === ROOM_GENERAL || activeRoomMeta.isGroup) return;
  const otherUid = activeRoomId.split("__").find(p => p !== ME?.uid);
  if (otherUid) openViewProfile(otherUid);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPS
// ═══════════════════════════════════════════════════════════════════════════════
function listenGroups() {
  groupsUnsub = onSnapshot(collection(db, "groups"), (snap) => {
    allGroups = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(g => g.members?.includes(ME?.uid));
    renderGroupsList();
  });
}

function openGroupsPanel()  { groupsPanel?.classList.add("open"); groupsPanelOverlay?.classList.add("active"); renderGroupsList(); }
function closeGroupsPanel() { groupsPanel?.classList.remove("open"); groupsPanelOverlay?.classList.remove("active"); }

function renderGroupsList() {
  if (!groupsList) return;
  if (!allGroups.length) {
    groupsList.innerHTML = `<li class="groups-empty"><i class="ri-team-line"></i>No groups yet.<br>Tap <b>+</b> to create one.</li>`;
    return;
  }
  groupsList.innerHTML = allGroups.map(g => {
    const isAdmin  = g.adminUid === ME?.uid;
    const isActive = activeRoomId === `group__${g.id}`;
    return `
      <li class="group-item ${isActive ? "active" : ""}" data-id="${g.id}">
        <div class="group-av">${escHtml(g.icon || "💬")}</div>
        <div class="group-info">
          <div class="group-name">${escHtml(g.name)}</div>
          <div class="group-desc">${escHtml(g.desc || `${g.members?.length || 0} members`)}</div>
        </div>
        ${isAdmin ? `<span class="group-admin-badge">Admin</span>` : ""}
      </li>`;
  }).join("");

  groupsList.querySelectorAll(".group-item").forEach(el => {
    el.addEventListener("click", () => {
      const grp = allGroups.find(g => g.id === el.dataset.id);
      if (!grp) return;
      closeGroupsPanel();
      openRoom(`group__${grp.id}`, grp.name, null, false, null, true, grp);
      highlightContact(`group__${grp.id}`);
      mobileChatOpen();
    });
  });
}

groupsNavItem?.addEventListener("click", (e) => {
  e.preventDefault();
  groupsPanel?.classList.contains("open") ? closeGroupsPanel() : openGroupsPanel();
});
groupsPanelClose?.addEventListener("click", closeGroupsPanel);
groupsPanelOverlay?.addEventListener("click", closeGroupsPanel);

function openCreateGroupModal() {
  groupSelectedMembers.clear();
  selectedGroupIcon = "💬";
  if (groupNameInput) groupNameInput.value = "";
  if (groupDescInput) groupDescInput.value = "";
  renderSelectedMembersChips();
  renderGroupMemberPicker("");
  groupIconPicker?.querySelectorAll(".gip-item").forEach(el => el.classList.toggle("active", el.dataset.icon === "💬"));
  createGroupModal?.classList.remove("hidden");
  groupNameInput?.focus();
}

createGroupBtn?.addEventListener("click", () => { closeGroupsPanel(); openCreateGroupModal(); });
createGroupModalClose?.addEventListener("click", () => createGroupModal?.classList.add("hidden"));
createGroupCancel?.addEventListener("click", () => createGroupModal?.classList.add("hidden"));
createGroupModal?.addEventListener("click", (e) => { if (e.target === createGroupModal) createGroupModal.classList.add("hidden"); });

groupIconPicker?.addEventListener("click", (e) => {
  const item = e.target.closest(".gip-item");
  if (!item) return;
  selectedGroupIcon = item.dataset.icon;
  groupIconPicker.querySelectorAll(".gip-item").forEach(el => el.classList.toggle("active", el === item));
});

groupMemberSearch?.addEventListener("input", () => renderGroupMemberPicker(groupMemberSearch.value.toLowerCase()));

function renderGroupMemberPicker(q) {
  if (!groupMemberList) return;
  const users = getAllPresenceUsers().filter(u => u.uid !== ME?.uid && !groupSelectedMembers.has(u.uid) && (!q || u.name.toLowerCase().includes(q)));
  if (!users.length) { groupMemberList.innerHTML = `<li class="modal-empty">${q ? "No users found" : "No other users available"}</li>`; return; }
  groupMemberList.innerHTML = users.map(u => buildModalUserItem(u)).join("");
  groupMemberList.querySelectorAll(".modal-user-item").forEach(el => {
    el.addEventListener("click", () => {
      const user = presenceUsersMap.get(el.dataset.uid);
      if (!user) return;
      groupSelectedMembers.set(el.dataset.uid, user);
      renderSelectedMembersChips();
      renderGroupMemberPicker(groupMemberSearch?.value.toLowerCase() || "");
    });
  });
}

function renderSelectedMembersChips() {
  if (!selectedMembersWrap) return;
  selectedMembersWrap.innerHTML = [...groupSelectedMembers.values()].map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" />` : u.name.charAt(0).toUpperCase();
    return `<div class="member-chip" data-uid="${u.uid}"><div class="chip-av" style="background:${color};">${av}</div><span>${escHtml(u.name)}</span><span class="chip-remove" title="Remove">✕</span></div>`;
  }).join("");
  selectedMembersWrap.querySelectorAll(".member-chip").forEach(el => {
    el.querySelector(".chip-remove")?.addEventListener("click", () => {
      groupSelectedMembers.delete(el.dataset.uid);
      renderSelectedMembersChips();
      renderGroupMemberPicker(groupMemberSearch?.value.toLowerCase() || "");
    });
  });
}

createGroupSave?.addEventListener("click", async () => {
  const name = groupNameInput?.value.trim();
  if (!name) { showToast("Please enter a group name", "warning"); return; }
  if (groupSelectedMembers.size < 1) { showToast("Add at least 1 member", "warning"); return; }
  const members = [ME.uid, ...groupSelectedMembers.keys()];
  try {
    createGroupSave.disabled = true;
    const ref = await addDoc(collection(db, "groups"), {
      name, desc: groupDescInput?.value.trim() || "", icon: selectedGroupIcon,
      adminUid: ME.uid, members, createdAt: serverTimestamp(),
    });
    showToast(`Group "${name}" created! 🎉`);
    createGroupModal?.classList.add("hidden");
    const newGroup = { id: ref.id, name, desc: groupDescInput?.value.trim() || "", icon: selectedGroupIcon, adminUid: ME.uid, members };
    openRoom(`group__${ref.id}`, name, null, false, null, true, newGroup);
    mobileChatOpen();
  } catch (err) { showToast("Failed to create group: " + err.message, "error"); }
  finally { if (createGroupSave) createGroupSave.disabled = false; }
});

groupSettingsBtn?.addEventListener("click", openGroupSettingsModal);

function openGroupSettingsModal() {
  const grp = activeRoomMeta.groupData;
  if (!grp) return;
  if (gsGroupName) gsGroupName.value = grp.name || "";
  renderGsMembers(grp);
  renderGsAddMembers("");
  groupSettingsModal?.classList.remove("hidden");
}

function renderGsMembers(grp) {
  if (!gsGroupMembersList) return;
  const members = grp.members || [];
  if (!members.length) { gsGroupMembersList.innerHTML = `<li class="modal-empty">No members</li>`; return; }
  gsGroupMembersList.innerHTML = members.map(uid => {
    const u       = presenceUsersMap.get(uid) || { uid, name: uid, avatar: "", online: false };
    const color   = colorFor(u.name);
    const av      = u.avatar ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : u.name.charAt(0).toUpperCase();
    const isAdmin = uid === grp.adminUid;
    const canKick = !isAdmin && uid !== ME?.uid;
    return `
      <li class="modal-user-item" data-uid="${uid}" style="cursor:default;">
        <div class="modal-user-av" style="background:${color};">${av}<div class="modal-online-dot ${u.online ? "online" : "offline"}"></div></div>
        <div class="modal-user-info">
          <div class="modal-user-name">${escHtml(u.name)}${isAdmin ? ' <span style="font-size:10px;color:var(--primary);font-weight:700;">(Admin)</span>' : ""}</div>
          <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
        </div>
        ${canKick ? `<button class="icon-btn gs-kick-btn" data-uid="${uid}" title="Remove" style="color:var(--error);"><i class="ri-user-unfollow-line"></i></button>` : ""}
      </li>`;
  }).join("");
  gsGroupMembersList.querySelectorAll(".gs-kick-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const u = presenceUsersMap.get(btn.dataset.uid);
      if (!confirm(`Remove ${u?.name || btn.dataset.uid} from group?`)) return;
      await kickMemberFromGroup(grp.id, btn.dataset.uid);
    });
  });
}

function renderGsAddMembers(q) {
  if (!gsAddMemberList) return;
  const grp = activeRoomMeta.groupData;
  if (!grp) return;
  const existing = new Set(grp.members || []);
  const users    = getAllPresenceUsers().filter(u => u.uid !== ME?.uid && !existing.has(u.uid) && (!q || u.name.toLowerCase().includes(q)));
  if (!users.length) { gsAddMemberList.innerHTML = `<li class="modal-empty">No users to add</li>`; return; }
  gsAddMemberList.innerHTML = users.map(u => buildModalUserItem(u, true)).join("");
  gsAddMemberList.querySelectorAll(".modal-user-item").forEach(el => {
    el.addEventListener("click", async () => {
      const grp2 = activeRoomMeta.groupData;
      if (!grp2) return;
      const newMembers = [...(grp2.members || []), el.dataset.uid];
      await updateDoc(doc(db, "groups", grp2.id), { members: newMembers });
      grp2.members = newMembers;
      showToast("Member added!");
      renderGsMembers(grp2);
      renderGsAddMembers(gsAddMemberSearch?.value.toLowerCase() || "");
    });
  });
}

function buildModalUserItem(u, showAdd = false) {
  const color = colorFor(u.name);
  const av    = u.avatar ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : u.name.charAt(0).toUpperCase();
  const extra = showAdd ? `<button class="icon-btn" style="color:var(--primary);"><i class="ri-user-add-line"></i></button>` : `<div class="modal-check"><i class="ri-check-line"></i></div>`;
  return `
    <li class="modal-user-item" data-uid="${u.uid}">
      <div class="modal-user-av" style="background:${color};">${av}<div class="modal-online-dot ${u.online ? "online" : "offline"}"></div></div>
      <div class="modal-user-info">
        <div class="modal-user-name">${escHtml(u.name)}</div>
        <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
      </div>
      ${extra}
    </li>`;
}

gsAddMemberSearch?.addEventListener("input", () => renderGsAddMembers(gsAddMemberSearch.value.toLowerCase()));
groupSettingsModalClose?.addEventListener("click", () => groupSettingsModal?.classList.add("hidden"));
groupSettingsCancel?.addEventListener("click",     () => groupSettingsModal?.classList.add("hidden"));
groupSettingsModal?.addEventListener("click", (e) => { if (e.target === groupSettingsModal) groupSettingsModal.classList.add("hidden"); });

groupSettingsSave?.addEventListener("click", async () => {
  const grp = activeRoomMeta.groupData;
  if (!grp) return;
  const newName = gsGroupName?.value.trim();
  if (!newName) { showToast("Group name cannot be empty", "warning"); return; }
  await updateDoc(doc(db, "groups", grp.id), { name: newName });
  if (chName) chName.textContent = newName;
  if (ipName) ipName.textContent = newName;
  grp.name = newName;
  showToast("Group updated!");
  groupSettingsModal?.classList.add("hidden");
});

gsDeleteGroup?.addEventListener("click", async () => {
  const grp = activeRoomMeta.groupData;
  if (!grp || !confirm(`Delete group "${grp.name}"? This cannot be undone.`)) return;
  try {
    const snap = await getDocs(collection(db, "rooms", `group__${grp.id}`, "messages"));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "groups", grp.id));
    groupSettingsModal?.classList.add("hidden");
    activeRoomId = null;
    chatView.classList.add("hidden");
    chatEmpty.classList.remove("hidden");
    mobileChatClose();
    showToast("Group deleted");
  } catch (err) { showToast("Failed to delete group: " + err.message, "error"); }
});

async function kickMemberFromGroup(groupId, uid) {
  try {
    const ref  = doc(db, "groups", groupId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const newMembers = (snap.data().members || []).filter(m => m !== uid);
    await updateDoc(ref, { members: newMembers });
    if (activeRoomMeta.groupData) activeRoomMeta.groupData.members = newMembers;
    showToast("Member removed");
    renderGsMembers(activeRoomMeta.groupData);
    renderGsAddMembers("");
  } catch (err) { showToast("Failed to remove member: " + err.message, "error"); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PIN HELPERS
// ═══════════════════════════════════════════════════════════════════════════════
function loadPinnedChats(uid) {
  try {
    const raw = localStorage.getItem(`nt_pinned_${uid}`);
    return raw ? new Set(JSON.parse(raw)) : new Set([ROOM_GENERAL]);
  } catch { return new Set([ROOM_GENERAL]); }
}

function savePinnedChats() {
  if (!ME) return;
  localStorage.setItem(`nt_pinned_${ME.uid}`, JSON.stringify([...pinnedChats]));
}

function togglePin(id) {
  if (pinnedChats.has(id)) { pinnedChats.delete(id); showToast("Chat unpinned"); }
  else                     { pinnedChats.add(id);    showToast("Chat pinned 📌"); }
  savePinnedChats();
  renderContactsList();
  updatePinMenuLabel();
}

function updatePinMenuLabel() {
  if (!mdPinChat) return;
  const isPinned = activeRoomId && pinnedChats.has(activeRoomId);
  mdPinChat.innerHTML = isPinned
    ? `<i class="ri-pushpin-fill"></i> Unpin Chat`
    : `<i class="ri-pushpin-line"></i> Pin Chat`;
  mdPinChat.classList.toggle("pinned-active", !!isPinned);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACTS LIST
// ═══════════════════════════════════════════════════════════════════════════════
function renderContactsList() {
  if (!pinnedList) return;
  pinnedList.innerHTML = "";

  // General Chat (always pinned)
  const generalUnread = unreadCounts.get(ROOM_GENERAL) || 0;
  const generalLi     = document.createElement("li");
  generalLi.innerHTML = buildChatItemHtml({
    id: ROOM_GENERAL, name: getGeneralChatName(), avatar: "",
    preview: "Public room — everyone can chat", time: "", unread: generalUnread, online: true, isPinned: true,
  }, activeRoomId === ROOM_GENERAL);
  const generalEl = generalLi.firstElementChild;
  if (generalEl) {
    pinnedList.appendChild(generalEl);
    generalEl.addEventListener("click", () => {
      markRoomRead(ROOM_GENERAL);
      openRoom(ROOM_GENERAL, getGeneralChatName(), null, true, null, false);
      highlightContact(ROOM_GENERAL);
      mobileChatOpen();
    });
  }

  // Pinned DM contacts
  getAllPresenceUsers()
    .filter(u => u.uid !== ME?.uid && pinnedChats.has(u.uid))
    .forEach(u => {
      const roomId = getRoomId(ME.uid, u.uid);
      const unread = unreadCounts.get(roomId) || 0;
      const li     = document.createElement("li");
      li.innerHTML = buildChatItemHtml({
        id: u.uid, name: u.name, avatar: u.avatar,
        preview: u.status || "Say hello!", time: "", unread, online: u.online, isPinned: true,
      }, activeRoomId === roomId);
      const el = li.firstElementChild;
      if (el) {
        pinnedList.appendChild(el);
        el.addEventListener("click", () => {
          markRoomRead(roomId);
          openRoom(roomId, u.name, u.avatar, false, u, false);
          highlightContact(u.uid);
          mobileChatOpen();
        });
      }
    });
}

function buildChatItemHtml({ id, name, avatar, preview, time, unread, online, isPinned }, active = false) {
  const color     = colorFor(name);
  const avatarHtml = avatar
    ? `<img src="${escHtml(avatar)}" alt="${escHtml(name)}" />`
    : `<span style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-weight:700;font-size:17px;color:white;">${escHtml(name.charAt(0).toUpperCase())}</span>`;

  return `
    <li class="chat-item ${active ? "active" : ""}" data-id="${id}">
      <div class="ci-avatar-wrap">
        <div class="ci-avatar" style="background:${color};">${avatarHtml}</div>
        <span class="ci-presence ${online ? "online" : "offline"}"></span>
      </div>
      <div class="ci-info">
        <div class="ci-name">${escHtml(name)} ${isPinned ? `<i class="ri-pushpin-fill ci-pin-icon"></i>` : ""}</div>
        <div class="ci-preview">${escHtml(preview)}</div>
      </div>
      <div class="ci-meta">
        ${time   ? `<span class="ci-time">${escHtml(time)}</span>` : ""}
        ${unread ? `<span class="ci-unread">${unread > 99 ? "99+" : unread}</span>` : ""}
      </div>
    </li>`;
}

function highlightContact(id) {
  document.querySelectorAll(".chat-item").forEach(el => el.classList.toggle("active", el.dataset.id === id));
}

// ═══════════════════════════════════════════════════════════════════════════════
// ONLINE STRIP
// ═══════════════════════════════════════════════════════════════════════════════
function renderOnlineStrip(users) {
  if (!onlineStrip) return;
  if (!users.length) {
    onlineStrip.innerHTML = `<span style="font-size:12px;color:var(--text-grey);">No one online yet</span>`;
    return;
  }
  onlineStrip.innerHTML = users.map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar
      ? `<img src="${escHtml(u.avatar)}" alt="${escHtml(u.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : u.name.charAt(0).toUpperCase();
    return `
      <div class="online-pill" title="${escHtml(u.name)}">
        <div class="op-av-wrap">
          <div class="op-av" style="background:${color};">${av}</div>
          <div class="op-dot"></div>
        </div>
        <div class="op-name">${escHtml(u.name)}${u.uid === ME?.uid ? " (you)" : ""}</div>
      </div>`;
  }).join("");
}

// ═══════════════════════════════════════════════════════════════════════════════
// ALL USERS PANEL (allChatList)
// ═══════════════════════════════════════════════════════════════════════════════
function renderAllUsersPanel(presenceUsers) {
  const others = presenceUsers.filter(u => u.uid !== ME?.uid);

  // Merge presence + existing DM rooms into one map
  const usersMap = new Map();
  others.forEach(u => usersMap.set(u.uid, { uid: u.uid, name: u.name, avatar: u.avatar, status: u.status, online: u.online }));
  allDmRooms().forEach(r => {
    if (!usersMap.has(r.uid) && r.uid !== ME?.uid)
      usersMap.set(r.uid, { uid: r.uid, name: r.name || r.uid, avatar: r.avatar || "", status: r.status || "", online: false });
  });

  const allUsers = Array.from(usersMap.values());

  if (!allChatList) return;
  if (!allUsers.length) {
    allChatList.innerHTML = `<li style="padding:10px 18px;font-size:13px;color:var(--text-grey);">No other users found. Invite friends to join!</li>`;
    return;
  }

  // Sort: online first, then by last message time
  allUsers.sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    const aTs = getDmRoom(a.uid)?.lastTs?.getTime() || 0;
    const bTs = getDmRoom(b.uid)?.lastTs?.getTime() || 0;
    return bTs - aTs;
  });

  allChatList.innerHTML = allUsers.map(u => {
    const isPinned = pinnedChats.has(u.uid);
    const dmRoom   = getDmRoom(u.uid);
    const roomId   = getRoomId(ME?.uid, u.uid);
    const unread   = unreadCounts.get(roomId) || 0;
    const preview  = dmRoom?.lastText || u.status || "Tap to start chatting";
    const timeStr  = dmRoom?.lastTs ? formatChatTime(dmRoom.lastTs) : "";
    return buildChatItemHtml({
      id: u.uid, name: u.name, avatar: u.avatar,
      preview, time: timeStr, unread, online: u.online, isPinned,
    }, activeRoomId === roomId);
  }).join("");

  allChatList.querySelectorAll(".chat-item").forEach(el => {
    el.addEventListener("click", () => {
      const uid  = el.dataset.id;
      const user = usersMap.get(uid);
      if (!user) return;
      const roomId = getRoomId(ME.uid, uid);
      markRoomRead(roomId);
      startDmWithUser(roomId, uid, user);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// START DM
// ═══════════════════════════════════════════════════════════════════════════════
async function startDmWithUser(roomId, otherUid, user) {
  upsertDmRoom(otherUid, { roomId, name: user.name, avatar: user.avatar || "", status: user.status || "", online: user.online });
  registerDmRoom(roomId).catch(console.warn);
  openRoom(roomId, user.name, user.avatar, false, user, false);
  highlightContact(otherUid);
  mobileChatOpen();
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN ROOM
// ═══════════════════════════════════════════════════════════════════════════════
function openRoom(roomId, name, avatar, isPublic, targetUser = null, isGroup = false, groupData = null) {
  activeRoomId   = roomId;
  activeRoomMeta = { name, isPublic, isGroup, groupData };

  chatEmpty.classList.add("hidden");
  chatView.classList.remove("hidden");

  buildAvatarEl(chAvatar, name, avatar || "");
  chAvatar.style.width  = "42px";
  chAvatar.style.height = "42px";
  chName.textContent    = name;

  const canViewProfile  = !isPublic && !isGroup;
  chAvatar.style.cursor = canViewProfile ? "pointer" : "default";
  chAvatar.title        = canViewProfile ? "View Profile" : "";

  if (isPublic) {
    chStatus.textContent = "Public Room · All users";
    chStatus.className   = "ch-status";
    chPresence.className = "ch-presence online";
  } else if (isGroup) {
    chStatus.textContent = `${groupData?.members?.length || 0} members`;
    chStatus.className   = "ch-status";
    chPresence.className = "ch-presence online";
    groupSettingsBtn?.classList.toggle("hidden", groupData?.adminUid !== ME?.uid);
  } else {
    const online         = targetUser?.online ?? false;
    chStatus.textContent = online ? "Online" : "Offline";
    chStatus.className   = `ch-status ${online ? "online-status" : "offline-status"}`;
    chPresence.className = `ch-presence ${online ? "online" : "offline"}`;
    groupSettingsBtn?.classList.add("hidden");
  }
  if (!isGroup) groupSettingsBtn?.classList.add("hidden");

  mdViewProfile?.classList.toggle("hidden", isPublic || isGroup);

  // Mark as read when opening
  markRoomRead(roomId);
  renderContactsList();
  renderAllUsersPanel(getAllPresenceUsers());

  // Teardown old listeners
  msgUnsub?.();
  typingUnsub?.();
  messagesArea.innerHTML = "";
  typingRow.classList.add("hidden");
  closeEmojiPanel();
  closeChatSearch();
  closeMoreDropdown();
  updatePinMenuLabel();
  if (_isRecording) _stopRecording(false);

  setTimeout(() => { updateBlockedUI(); updateBlockMenuLabels(); }, 50);

  listenMessages(roomId);
  listenTyping(roomId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MORE MENU
// ═══════════════════════════════════════════════════════════════════════════════
function openMoreDropdown()  { moreDropdown?.classList.remove("hidden"); moreDropdownOpen = true; updatePinMenuLabel(); updateBlockMenuLabels(); }
function closeMoreDropdown() { moreDropdown?.classList.add("hidden");    moreDropdownOpen = false; }

moreMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  moreDropdownOpen ? closeMoreDropdown() : (closeEmojiPanel(), closeAttachMenu(), openMoreDropdown());
});
moreDropdown?.addEventListener("click", (e) => e.stopPropagation());

mdSearch?.addEventListener("click", () => { closeMoreDropdown(); chatSearchBar.classList.remove("hidden"); chatSearchInput.focus(); });

mdPinChat?.addEventListener("click", () => {
  closeMoreDropdown();
  if (!activeRoomId) return;
  const pinId = activeRoomId === ROOM_GENERAL
    ? ROOM_GENERAL
    : activeRoomId.includes("__") ? (activeRoomId.split("__").find(p => p !== ME.uid) || activeRoomId) : activeRoomId;
  togglePin(pinId);
});

mdSelectMsg?.addEventListener("click", () => { closeMoreDropdown(); enterSelectMode(); });

mdEditNick?.addEventListener("click", () => {
  closeMoreDropdown();
  if (editNickModalTitle) editNickModalTitle.textContent = "Edit Nickname";
  editNickModal.classList.remove("hidden");
  editNickInput.value = chName.textContent;
  editNickInput.placeholder = "Enter nickname…";
  editNickInput.focus();
});

mdRenameChat?.addEventListener("click", () => {
  closeMoreDropdown();
  if (editNickModalTitle) editNickModalTitle.textContent = "Rename Chat";
  editNickModal.classList.remove("hidden");
  editNickInput.value = chName.textContent;
  editNickInput.placeholder = activeRoomMeta.isPublic ? "Rename General Chat…" : "Enter nickname…";
  editNickInput.focus();
});

mdClearChat?.addEventListener("click", async () => {
  closeMoreDropdown();
  if (!activeRoomId || !confirm("Clear all messages in this chat?")) return;
  try {
    const snap = await getDocs(collection(db, "rooms", activeRoomId, "messages"));
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { text: "", deleted: true, fileData: null })));
    showToast("Chat cleared");
  } catch { showToast("Failed to clear chat", "error"); }
});

mdDeleteChat?.addEventListener("click", async () => {
  closeMoreDropdown();
  if (!activeRoomId || !confirm("Delete this entire chat? Cannot be undone.")) return;
  try {
    const snap  = await getDocs(collection(db, "rooms", activeRoomId, "messages"));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    const pinId = activeRoomId === ROOM_GENERAL ? ROOM_GENERAL : activeRoomId.split("__").find(p => p !== ME.uid);
    pinnedChats.delete(pinId);
    savePinnedChats();
    if (pinId && pinId !== ROOM_GENERAL) removeDmRoom(pinId);
    activeRoomId = null;
    chatView.classList.add("hidden");
    chatEmpty.classList.remove("hidden");
    mobileChatClose();
    renderContactsList();
    showToast("Chat deleted");
  } catch { showToast("Failed to delete chat", "error"); }
});

mdAddFav?.addEventListener("click", () => {
  closeMoreDropdown();
  if (!activeRoomId) return;
  const favId = activeRoomId === ROOM_GENERAL ? ROOM_GENERAL : (activeRoomId.split("__").find(p => p !== ME.uid) || activeRoomId);
  if (favouriteChats.has(favId)) {
    favouriteChats.delete(favId);
    showToast("Removed from favourites");
    if (mdAddFav) mdAddFav.innerHTML = `<i class="ri-star-line"></i> Add to Fav`;
  } else {
    favouriteChats.add(favId);
    showToast("Added to favourites ⭐");
    if (mdAddFav) mdAddFav.innerHTML = `<i class="ri-star-fill"></i> Remove from Fav`;
  }
});

editNickClose?.addEventListener("click",   () => editNickModal.classList.add("hidden"));
editNickCancel?.addEventListener("click",  () => editNickModal.classList.add("hidden"));
editNickModal?.addEventListener("click",   (e) => { if (e.target === editNickModal) editNickModal.classList.add("hidden"); });

editNickSave?.addEventListener("click", () => {
  const nick = editNickInput.value.trim();
  if (!nick) return;
  chName.textContent = nick;
  if (ipName) ipName.textContent = nick;
  if (activeRoomId === ROOM_GENERAL) { localStorage.setItem("nt_general_name", nick); renderContactsList(); }
  editNickModal.classList.add("hidden");
  showToast(`Renamed to "${nick}"`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SELECT MODE
// ═══════════════════════════════════════════════════════════════════════════════
function enterSelectMode() {
  selectMode = true;
  selectedMsgIds.clear();
  messagesArea.classList.add("select-mode");
  selectBar.classList.remove("hidden");
  selectCount.textContent = "0 selected";
  messagesArea.querySelectorAll(".msg-row").forEach(row => row.addEventListener("click", handleSelectClick));
}

function exitSelectMode() {
  selectMode = false;
  selectedMsgIds.clear();
  messagesArea.classList.remove("select-mode");
  selectBar.classList.add("hidden");
  messagesArea.querySelectorAll(".msg-row").forEach(row => { row.classList.remove("msg-selected"); row.removeEventListener("click", handleSelectClick); });
}

function handleSelectClick(e) {
  const row = e.currentTarget;
  const id  = row.dataset.id;
  if (selectedMsgIds.has(id)) { selectedMsgIds.delete(id); row.classList.remove("msg-selected"); }
  else                        { selectedMsgIds.add(id);    row.classList.add("msg-selected");    }
  selectCount.textContent = `${selectedMsgIds.size} selected`;
}

selectCancel?.addEventListener("click", exitSelectMode);
selectDelete?.addEventListener("click", async () => {
  if (!selectedMsgIds.size || !confirm(`Delete ${selectedMsgIds.size} message(s)?`)) return;
  for (const id of selectedMsgIds) {
    try { await updateDoc(doc(db, "rooms", activeRoomId, "messages", id), { text: "", deleted: true, fileData: null }); } catch (_) {}
  }
  showToast(`${selectedMsgIds.size} message(s) deleted`);
  exitSelectMode();
});
selectForward?.addEventListener("click", () => { showToast("Forward coming soon!", "warning"); exitSelectMode(); });

// ═══════════════════════════════════════════════════════════════════════════════
// MESSAGES LISTENER
// ═══════════════════════════════════════════════════════════════════════════════
let lastRenderDate = null;

function listenMessages(roomId) {
  lastRenderDate = null;
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));

  msgUnsub = onSnapshot(q, (snap) => {
    snap.docChanges().forEach(change => {
      const data = change.doc.data();
      if (data.uid === "system") return;

      if (change.type === "added") {
        renderMessage(data, change.doc.id);
        updateDmRoomPreview(roomId, data);

        // Unread: count messages from others that arrive while we have this room open
        // (shouldn't happen as we just opened it, but guard for real-time arrivals)
        if (data.uid !== ME?.uid && data.uid !== "system" && !data.deleted) {
          const isActiveRoom = activeRoomId === roomId && document.hasFocus();
          if (!isActiveRoom) {
            incrementUnread(roomId);
            renderContactsList();
            renderAllUsersPanel(getAllPresenceUsers());
          }
        }
      } else if (change.type === "modified") {
        updateRenderedMessage(change.doc.data(), change.doc.id);
      } else if (change.type === "removed") {
        removeRenderedMessage(change.doc.id);
      }
    });
    scrollBottom();
  });
}

function updateDmRoomPreview(roomId, data) {
  if (!data || data.uid === "system" || data.deleted) return;
  const parts    = roomId.split("__");
  const otherUid = parts.find(p => p !== ME?.uid);
  if (!otherUid) return;

  const lastText = data.type === "image"  ? "📷 Image"
                 : data.type === "file"   ? `📎 ${data.fileName || "File"}`
                 : data.type === "sticker"? data.text
                 : data.type === "voice"  ? "🎤 Voice message"
                 : (data.text || "");
  const lastTs   = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  upsertDmRoom(otherUid, { lastText, lastTs });
}

// ─── Render one message ───────────────────────────────────────────────────────
function renderMessage(data, id) {
  const ts      = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  const isMine  = data.uid === ME?.uid;
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = ts.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  // Date divider
  if (dateStr !== lastRenderDate) {
    lastRenderDate = dateStr;
    const div = document.createElement("div");
    div.className = "date-divider";
    div.innerHTML = `<span>${dateStr}</span>`;
    messagesArea.appendChild(div);
  }

  // Sticker (no bubble wrapper)
  if (data.type === "sticker") {
    const row   = document.createElement("div");
    row.className = `msg-row ${isMine ? "sent" : "received"}`;
    row.dataset.id = id;
    const color = colorFor(data.name || "?");
    const avHtml = data.avatar ? `<img src="${escHtml(data.avatar)}" style="width:100%;height:100%;object-fit:cover;" />` : (data.name || "?").charAt(0).toUpperCase();
    row.innerHTML = isMine
      ? `<div class="msg-col"><div class="msg-sticker">${escHtml(data.text)}</div><div class="msg-meta">${timeStr}</div></div>`
      : `<div class="msg-av" style="background:${color};">${avHtml}</div><div class="msg-col"><div class="msg-sender-name">${escHtml(data.name || "")}</div><div class="msg-sticker">${escHtml(data.text)}</div><div class="msg-meta">${timeStr}</div></div>`;
    messagesArea.appendChild(row);
    return;
  }

  // Regular message row
  const row   = document.createElement("div");
  row.className = `msg-row ${isMine ? "sent" : "received"}`;
  row.dataset.id = id;

  const color   = colorFor(data.name || "?");
  const avHtml  = data.avatar ? `<img src="${escHtml(data.avatar)}" style="width:100%;height:100%;object-fit:cover;" />` : (data.name || "?").charAt(0).toUpperCase();
  const canEdit = isMine && data.type === "text" && !data.deleted && !data.edited;

  const actionsHtml = isMine && !data.deleted ? `
    <div class="msg-actions">
      ${canEdit ? `<button class="msg-act-btn" data-action="edit" data-id="${id}" title="Edit"><i class="ri-edit-line"></i></button>` : ""}
      <button class="msg-act-btn delete" data-action="delete" data-id="${id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
    </div>` : "";

  row.innerHTML = isMine
    ? `${actionsHtml}<div class="msg-col"><div class="bubble">${buildBubbleContent(data, timeStr, true)}</div></div>`
    : `<div class="msg-av" style="background:${color};">${avHtml}</div>
       <div class="msg-col">
         <div class="msg-sender-name">${escHtml(data.name || "Unknown")}</div>
         <div class="bubble">${buildBubbleContent(data, timeStr, false)}</div>
       </div>`;

  if (data.deleted) row.querySelector(".bubble")?.classList.add("deleted-msg");
  messagesArea.appendChild(row);
  bindMsgActions(row, data, id);
}

function buildBubbleContent(data, timeStr, isMine) {
  const check       = isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : "";
  const editedLabel = data.edited ? `<span class="msg-edited">(edited)</span>` : "";

  if (data.deleted)
    return `<span>🚫 This message was deleted</span><div class="msg-meta">${timeStr}</div>`;

  if (data.type === "image") {
    const src  = escHtml(data.fileUrl || data.fileData || "");
    const name = escHtml(data.fileName || "image.png");
    if (!src) return `<span>🖼️ Image unavailable</span><div class="msg-meta">${timeStr}</div>`;
    return `
      <div class="msg-img-wrap">
        <img class="msg-img" src="${src}" alt="${name}" loading="lazy" onerror="this.style.opacity='0.4'" />
        <a class="msg-img-download" href="${src}" download="${name}" target="_blank" onclick="event.stopPropagation()"><i class="ri-download-2-line"></i></a>
      </div>
      <div class="msg-meta">${timeStr}${editedLabel}${check}</div>`;
  }

  if (data.type === "file") {
    const src  = escHtml(data.fileUrl || data.fileData || "");
    const icon = getFileIcon(data.fileName || "");
    const size = formatFileSize(data.fileSize || 0);
    if (!src) return `<span>📎 File unavailable</span><div class="msg-meta">${timeStr}</div>`;
    return `
      <a class="msg-file" href="${src}" download="${escHtml(data.fileName || "file")}" target="_blank">
        <i class="${icon}"></i>
        <div class="msg-file-info">
          <div class="msg-file-name">${escHtml(data.fileName || "File")}</div>
          <div class="msg-file-size">${size}</div>
        </div>
        <span class="msg-file-download" onclick="event.stopPropagation()"><i class="ri-download-2-line"></i></span>
      </a>
      <div class="msg-meta">${timeStr}${editedLabel}${check}</div>`;
  }

  if (data.type === "voice") {
    const src      = escHtml(data.fileUrl || "");
    const duration = escHtml(data.duration || "0:00");
    if (!src) return `<span>🎤 Voice message unavailable</span><div class="msg-meta">${timeStr}</div>`;
    const btnBg    = isMine ? "rgba(255,255,255,0.25)" : "var(--primary-xlight)";
    const btnColor = isMine ? "#fff" : "var(--primary)";
    const barBg    = isMine ? "rgba(255,255,255,0.3)" : "var(--border)";
    const fillBg   = isMine ? "#fff" : "var(--primary)";
    return `
      <div class="msg-voice" style="display:flex;align-items:center;gap:10px;min-width:180px;max-width:260px;">
        <button class="voice-play-btn" data-src="${src}" style="width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;background:${btnBg};color:${btnColor};transition:background .15s;">
          <i class="ri-play-fill"></i>
        </button>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;">
          <div class="voice-progress-bar" style="height:3px;background:${barBg};border-radius:4px;overflow:hidden;cursor:pointer;">
            <div class="voice-progress-fill" style="height:100%;width:0%;background:${fillBg};border-radius:4px;transition:width .1s;"></div>
          </div>
          <span style="font-size:11px;opacity:.7;">${duration}</span>
        </div>
      </div>
      <div class="msg-meta">${timeStr}${check}</div>`;
  }

  // Plain text
  return `${escHtml(data.text)}${editedLabel}<div class="msg-meta">${timeStr}${check}</div>`;
}

function bindMsgActions(row, data, id) {
  // Voice player
  const playBtn = row.querySelector(".voice-play-btn");
  if (playBtn) {
    let audio   = null;
    let playing = false;
    const fill  = row.querySelector(".voice-progress-fill");
    const bar   = row.querySelector(".voice-progress-bar");

    playBtn.addEventListener("click", () => {
      if (!audio) {
        audio = new Audio(playBtn.dataset.src);
        audio.addEventListener("timeupdate", () => { if (audio.duration && fill) fill.style.width = (audio.currentTime / audio.duration * 100) + "%"; });
        audio.addEventListener("ended", () => { playing = false; playBtn.innerHTML = `<i class="ri-play-fill"></i>`; if (fill) fill.style.width = "0%"; });
      }
      if (playing) { audio.pause(); playing = false; playBtn.innerHTML = `<i class="ri-play-fill"></i>`; }
      else         { audio.play();  playing = true;  playBtn.innerHTML = `<i class="ri-pause-fill"></i>`; }
    });
    bar?.addEventListener("click", (e) => {
      if (!audio?.duration) return;
      const rect = bar.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
  }

  // Edit / delete buttons
  row.querySelectorAll(".msg-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.action === "edit") {
        if (data.edited) { showToast("Messages can only be edited once", "warning"); return; }
        openEditModal(id, data.text);
      }
      if (btn.dataset.action === "delete") confirmDeleteMsg(id);
    });
  });
}

function updateRenderedMessage(data, id) {
  const row    = messagesArea.querySelector(`.msg-row[data-id="${id}"]`);
  const bubble = row?.querySelector(".bubble");
  if (!bubble) return;
  const isMine = data.uid === ME?.uid;
  const ts     = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  bubble.innerHTML = buildBubbleContent(data, timeStr, isMine);
  bubble.classList.toggle("deleted-msg", !!data.deleted);
  if (data.edited || data.deleted) row.querySelector('.msg-act-btn[data-action="edit"]')?.remove();
}

function removeRenderedMessage(id) { messagesArea.querySelector(`.msg-row[data-id="${id}"]`)?.remove(); }

// ═══════════════════════════════════════════════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function openEditModal(id, currentText) { editingMsgId = id; editMsgInput.value = currentText; editMsgModal.classList.remove("hidden"); editMsgInput.focus(); }
function closeEditModal()               { editMsgModal.classList.add("hidden"); editingMsgId = null; }

editMsgClose?.addEventListener("click",  closeEditModal);
editMsgCancel?.addEventListener("click", closeEditModal);
editMsgModal?.addEventListener("click",  (e) => { if (e.target === editMsgModal) closeEditModal(); });

editMsgSave?.addEventListener("click", async () => {
  const newText = editMsgInput.value.trim();
  if (!newText || !editingMsgId || !activeRoomId) return;
  try {
    await updateDoc(doc(db, "rooms", activeRoomId, "messages", editingMsgId), { text: newText, edited: true });
    showToast("Message edited ✏️");
  } catch { showToast("Edit failed", "error"); }
  closeEditModal();
});

async function confirmDeleteMsg(id) {
  if (!confirm("Delete this message?")) return;
  try {
    await updateDoc(doc(db, "rooms", activeRoomId, "messages", id), { text: "", deleted: true, fileData: null, fileUrl: null });
    showToast("Message deleted");
  } catch { showToast("Delete failed", "error"); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SEND TEXT
// ═══════════════════════════════════════════════════════════════════════════════
async function sendMessage() {
  if (!ME || !activeRoomId) return;
  if (isCurrentChatBlocked()) { showToast("Messaging unavailable", "warning"); return; }
  const text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = "";
  clearMyTyping();
  try {
    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar,
      text, type: "text", deleted: false, edited: false, createdAt: serverTimestamp(),
    });
    if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__"))
      registerDmRoom(activeRoomId).catch(() => {});
  } catch (err) { showToast("Failed to send: " + err.message, "error"); }
}

sendBtn?.addEventListener("click", sendMessage);
msgInput?.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

// ═══════════════════════════════════════════════════════════════════════════════
// SEND FILE
// ═══════════════════════════════════════════════════════════════════════════════
async function sendFile(file, msgType) {
  if (!ME || !activeRoomId || !file) return;
  if (isCurrentChatBlocked()) { showToast("Messaging unavailable", "warning"); return; }
  if (file.size > 10 * 1024 * 1024) { showToast("File too large. Max 10 MB.", "warning"); return; }

  showToast("Uploading…");
  try {
    const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath   = `rooms/${activeRoomId}/${ME.uid}/${uniqueName}`;
    const fileRef    = storageRef(storage, filePath);
    const snapshot   = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar,
      text: file.name,
      type: msgType === "image" ? "image" : "file",
      fileName: file.name, fileSize: file.size,
      fileUrl: downloadURL, fileData: null, storagePath: filePath,
      deleted: false, edited: false, createdAt: serverTimestamp(),
    });

    if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__"))
      registerDmRoom(activeRoomId).catch(() => {});

    showToast("File sent! ✓");
  } catch (err) { showToast("Upload failed: " + err.message, "error"); }
}

imgFileInput?.addEventListener("change", () => { if (imgFileInput.files[0]) sendFile(imgFileInput.files[0], "image"); imgFileInput.value = ""; closeAttachMenu(); });
docFileInput?.addEventListener("change", () => { if (docFileInput.files[0]) sendFile(docFileInput.files[0], "file");  docFileInput.value = ""; closeAttachMenu(); });
anyFileInput?.addEventListener("change", () => { if (anyFileInput.files[0]) sendFile(anyFileInput.files[0], "file");  anyFileInput.value = ""; closeAttachMenu(); });

// ═══════════════════════════════════════════════════════════════════════════════
// ATTACH MENU
// ═══════════════════════════════════════════════════════════════════════════════
attachBtn?.addEventListener("click", (e) => { e.stopPropagation(); attachMenu.classList.toggle("hidden"); closeEmojiPanel(); closeMoreDropdown(); });
function closeAttachMenu() { attachMenu?.classList.add("hidden"); }
document.addEventListener("click", closeAttachMenu);
attachMenu?.addEventListener("click", (e) => e.stopPropagation());

// ═══════════════════════════════════════════════════════════════════════════════
// TYPING
// ═══════════════════════════════════════════════════════════════════════════════
msgInput?.addEventListener("input", async () => {
  if (!ME || !activeRoomId || isCurrentChatBlocked()) return;
  const now = Date.now();
  if (now - lastTypingSent > 1800) {
    lastTypingSent = now;
    await setDoc(doc(db, "rooms", activeRoomId, "typing", ME.uid), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar, ts: serverTimestamp(),
    });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(clearMyTyping, 2500);
});

async function clearMyTyping() {
  if (!ME || !activeRoomId) return;
  try { await deleteDoc(doc(db, "rooms", activeRoomId, "typing", ME.uid)); } catch (_) {}
}

function listenTyping(roomId) {
  typingUnsub = onSnapshot(collection(db, "rooms", roomId, "typing"), (snap) => {
    const others = snap.docs.filter(d => d.id !== ME?.uid).map(d => d.data());
    if (others.length) {
      const t = others[0];
      buildAvatarEl(typingAv, t.name, t.avatar || "");
      typingAv.style.cssText = "background:" + colorFor(t.name) + ";width:26px;height:26px;border-radius:50%;";
      typingRow.classList.remove("hidden");
      chStatus.textContent = `${t.name} is typing…`;
      chStatus.className   = "ch-status typing";
    } else {
      typingRow.classList.add("hidden");
      restoreChatStatus();
    }
    scrollBottom();
  });
}

function restoreChatStatus() {
  if (activeRoomMeta.isPublic) {
    chStatus.textContent = "Public Room · All users"; chStatus.className = "ch-status";
  } else if (activeRoomMeta.isGroup) {
    chStatus.textContent = `${activeRoomMeta.groupData?.members?.length || 0} members`; chStatus.className = "ch-status";
  } else {
    const other = getAllPresenceUsers().find(u => u.uid !== ME?.uid && getRoomId(ME.uid, u.uid) === activeRoomId);
    if (other) { chStatus.textContent = other.online ? "Online" : "Offline"; chStatus.className = `ch-status ${other.online ? "online-status" : "offline-status"}`; }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMOJI / STICKER PANEL
// ═══════════════════════════════════════════════════════════════════════════════
emojiToggleBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (emojiPanel.classList.contains("hidden")) { openEmojiPanel(); closeAttachMenu(); closeMoreDropdown(); }
  else closeEmojiPanel();
});
document.addEventListener("click", (e) => { if (!emojiPanel?.contains(e.target) && e.target !== emojiToggleBtn) closeEmojiPanel(); });

function openEmojiPanel()  { emojiPanel.classList.remove("hidden"); renderEmojiTab(currentEmojiTab); }
function closeEmojiPanel() { emojiPanel?.classList.add("hidden"); }

document.querySelectorAll(".etab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".etab").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentEmojiTab = btn.dataset.tab;
    renderEmojiTab(currentEmojiTab);
  });
});

function renderEmojiTab(tab) {
  emojiContent.innerHTML = "";
  if (tab === "emoji") {
    const grid = document.createElement("div");
    grid.className = "emoji-grid";
    EMOJIS.forEach(em => {
      const btn = document.createElement("div");
      btn.className   = "emoji-btn-item";
      btn.textContent = em;
      btn.addEventListener("click", () => { msgInput.value += em; msgInput.focus(); });
      grid.appendChild(btn);
    });
    emojiContent.appendChild(grid);
  } else if (tab === "sticker") {
    const grid = document.createElement("div");
    grid.className = "sticker-grid";
    STICKERS.forEach(st => {
      const item = document.createElement("div");
      item.className   = "sticker-item";
      item.textContent = st;
      item.addEventListener("click", () => sendSticker(st));
      grid.appendChild(item);
    });
    emojiContent.appendChild(grid);
  } else {
    emojiContent.innerHTML = `<div class="gif-placeholder"><i class="ri-film-line"></i><span>GIF support coming soon!</span></div>`;
  }
}

async function sendSticker(sticker) {
  if (!ME || !activeRoomId) return;
  if (isCurrentChatBlocked()) { showToast("Messaging unavailable", "warning"); return; }
  closeEmojiPanel();
  await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
    uid: ME.uid, name: ME.name, avatar: ME.avatar,
    text: sticker, type: "sticker", deleted: false, createdAt: serverTimestamp(),
  });
  if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__"))
    registerDmRoom(activeRoomId).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOICE / MIC RECORDING
// ═══════════════════════════════════════════════════════════════════════════════
function _fmtRecTime(s) { return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60); }

function _showRecordingUI() {
  if (msgInput) { msgInput.style.cssText = "opacity:0;pointer-events:none;width:0;flex:0;padding:0;"; }
  waveformWrap?.classList.add("active");
  recTimerEl?.classList.add("active");
  micBtn?.classList.add("recording");
  if (micIcon) micIcon.className = "ri-stop-circle-line";
  micBtn?.setAttribute("aria-label", "Stop recording");
  if (recTimeEl) recTimeEl.textContent = "0:00";
}

function _hideRecordingUI() {
  if (msgInput) { msgInput.style.cssText = "opacity:1;pointer-events:'';width:'';flex:1;padding:'';"; }
  waveformWrap?.classList.remove("active");
  recTimerEl?.classList.remove("active");
  micBtn?.classList.remove("recording");
  if (micIcon) micIcon.className = "ri-mic-line";
  micBtn?.setAttribute("aria-label", "Record voice message");
}

async function _startRecording() {
  if (!ME || !activeRoomId) { showToast("Please open a chat first", "warning"); return; }
  if (isCurrentChatBlocked()) { showToast("Messaging unavailable", "warning"); return; }
  if (!navigator.mediaDevices?.getUserMedia) { showToast("Microphone not supported", "warning"); return; }

  try {
    _recStream     = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks   = [];
    _mediaRecorder = new MediaRecorder(_recStream);

    _mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) _audioChunks.push(e.data); };
    _mediaRecorder.onstop          = async () => {
      const blob     = new Blob(_audioChunks, { type: "audio/webm" });
      _audioChunks   = [];
      _recStream?.getTracks().forEach(t => t.stop());
      _recStream = null;
      await _uploadAndSendVoice(blob, _fmtRecTime(_recSeconds));
    };

    _mediaRecorder.start(200);
    _isRecording = true;
    _recSeconds  = 0;
    _showRecordingUI();

    _recInterval = setInterval(() => {
      _recSeconds++;
      if (recTimeEl) recTimeEl.textContent = _fmtRecTime(_recSeconds);
      if (_recSeconds >= 120) _stopRecording(true);
    }, 1000);

  } catch (err) {
    showToast(err.name === "NotAllowedError" ? "Microphone permission denied." : "Mic error: " + err.message, "warning");
  }
}

function _stopRecording(send) {
  if (!_isRecording) return;
  _isRecording = false;
  clearInterval(_recInterval);
  _hideRecordingUI();

  if (send && _mediaRecorder && _mediaRecorder.state !== "inactive") {
    _mediaRecorder.stop();
  } else {
    _audioChunks = [];
    _recStream?.getTracks().forEach(t => t.stop());
    _recStream     = null;
    _mediaRecorder = null;
    showToast("Recording cancelled");
  }
}

async function _uploadAndSendVoice(blob, duration) {
  if (!ME || !activeRoomId || isCurrentChatBlocked()) { showToast("Messaging unavailable", "warning"); return; }
  showToast("Sending voice message…");
  try {
    const fileName  = `voice_${Date.now()}.webm`;
    const filePath  = `rooms/${activeRoomId}/${ME.uid}/${fileName}`;
    const fileRef   = storageRef(storage, filePath);
    const snapshot  = await uploadBytes(fileRef, blob);
    const downloadURL = await getDownloadURL(snapshot.ref);

    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar,
      text: "Voice message", type: "voice",
      fileUrl: downloadURL, fileName, fileSize: blob.size, storagePath: filePath,
      duration, deleted: false, edited: false, createdAt: serverTimestamp(),
    });

    if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__"))
      registerDmRoom(activeRoomId).catch(() => {});

    showToast(`Voice message sent (${duration}) 🎤`);
  } catch (err) { showToast("Voice upload failed: " + err.message, "error"); }
}

function initMicButton() {
  if (!micBtn) return;
  micBtn.addEventListener("click", () => { _isRecording ? _stopRecording(true) : _startRecording(); });

  let _touchStartX = 0;
  micBtn.addEventListener("touchstart", (e) => { _touchStartX = e.touches[0].clientX; }, { passive: true });
  micBtn.addEventListener("touchmove",  (e) => { if (_isRecording && e.touches[0].clientX - _touchStartX < -60) _stopRecording(false); }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONTACT LIST SEARCH
// ═══════════════════════════════════════════════════════════════════════════════
searchInput?.addEventListener("input", () => {
  const q = searchInput.value.trim().toLowerCase();
  if (!q) {
    searchResultsList.classList.add("hidden");
    normalChatLists.classList.remove("hidden");
    searchClearBtn.classList.add("hidden");
    return;
  }
  searchClearBtn.classList.remove("hidden");
  normalChatLists.classList.add("hidden");
  searchResultsList.classList.remove("hidden");
  runContactSearch(q);
});

searchClearBtn?.addEventListener("click", () => {
  searchInput.value = "";
  searchResultsList.classList.add("hidden");
  normalChatLists.classList.remove("hidden");
  searchClearBtn.classList.add("hidden");
});

async function runContactSearch(q) {
  searchResultsList.innerHTML = `<li class="search-no-result">Searching…</li>`;
  const results     = [];
  const roomsToSearch = [{ roomId: ROOM_GENERAL, name: getGeneralChatName() }];

  getAllPresenceUsers().filter(u => u.uid !== ME.uid).forEach(u =>
    roomsToSearch.push({ roomId: getRoomId(ME.uid, u.uid), name: u.name })
  );
  allDmRooms().forEach(r => {
    if (!roomsToSearch.find(x => x.roomId === r.roomId)) roomsToSearch.push({ roomId: r.roomId, name: r.name });
  });
  allGroups.forEach(g => roomsToSearch.push({ roomId: `group__${g.id}`, name: g.name }));

  for (const room of roomsToSearch) {
    try {
      const snap = await getDocs(query(collection(db, "rooms", room.roomId, "messages"), orderBy("createdAt", "desc")));
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.uid === "system" || data.type !== "text" || data.deleted) return;
        if (data.text.toLowerCase().includes(q)) {
          const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
          results.push({ roomId: room.roomId, roomName: room.name, msgId: d.id, text: data.text, senderName: data.name, ts });
        }
      });
    } catch (_) {}
  }

  if (!results.length) {
    searchResultsList.innerHTML = `<li class="search-no-result">No messages found for "${escHtml(q)}"</li>`;
    return;
  }

  const roomsMap = Object.fromEntries(roomsToSearch.map(r => [r.roomId, r]));
  searchResultsList.innerHTML =
    `<li class="search-result-label">Messages (${results.length})</li>` +
    results.slice(0, 40).map(r => {
      const highlighted = escHtml(r.text).replace(new RegExp(escHtml(q), "gi"), m => `<mark>${m}</mark>`);
      const timeStr     = r.ts.toLocaleDateString([], { month: "short", day: "numeric" });
      return `<li class="search-result-msg" data-room="${r.roomId}" data-msg="${r.msgId}">
        <div class="srm-name">${escHtml(r.roomName)} · ${escHtml(r.senderName)}</div>
        <div class="srm-text">${highlighted}</div>
        <div class="srm-time">${timeStr}</div>
      </li>`;
    }).join("");

  searchResultsList.querySelectorAll(".search-result-msg").forEach(el => {
    el.addEventListener("click", () => {
      const roomId = el.dataset.room;
      const room   = roomsMap[roomId];
      if (!room) return;
      const target  = getAllPresenceUsers().find(u => getRoomId(ME.uid, u.uid) === roomId);
      const isPublic = roomId === ROOM_GENERAL;
      const isGroup  = roomId.startsWith("group__");
      const grpData  = isGroup ? allGroups.find(g => `group__${g.id}` === roomId) : null;
      openRoom(roomId, room.name, target?.avatar || null, isPublic, target || null, isGroup, grpData);
      highlightContact(target?.uid || ROOM_GENERAL);
      mobileChatOpen();
      searchInput.value = "";
      searchResultsList.classList.add("hidden");
      normalChatLists.classList.remove("hidden");
      searchClearBtn.classList.add("hidden");
      setTimeout(() => scrollToMsg(el.dataset.msg), 1200);
    });
  });
}

function scrollToMsg(msgId) {
  const el = messagesArea.querySelector(`.msg-row[data-id="${msgId}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("search-highlight");
  setTimeout(() => el.classList.remove("search-highlight"), 2500);
}

// ═══════════════════════════════════════════════════════════════════════════════
// IN-CHAT SEARCH
// ═══════════════════════════════════════════════════════════════════════════════
chatSearchBtn?.addEventListener("click", () => { chatSearchBar.classList.toggle("hidden"); if (!chatSearchBar.classList.contains("hidden")) chatSearchInput.focus(); else closeChatSearch(); });
chatSearchClose?.addEventListener("click", closeChatSearch);

chatSearchInput?.addEventListener("input", () => {
  const q = chatSearchInput.value.trim().toLowerCase();
  clearSearchHighlights();
  if (!q) { chatSearchCount.textContent = ""; searchMatches = []; searchCurrentIdx = -1; return; }
  searchMatches    = Array.from(messagesArea.querySelectorAll(".msg-row")).filter(row => row.querySelector(".bubble")?.textContent?.toLowerCase().includes(q));
  chatSearchCount.textContent = searchMatches.length ? `1/${searchMatches.length}` : "No results";
  searchCurrentIdx = searchMatches.length ? 0 : -1;
  highlightSearchMatches();
  jumpToSearchResult(0);
});

chatSearchNext?.addEventListener("click", () => {
  if (!searchMatches.length) return;
  searchCurrentIdx = (searchCurrentIdx + 1) % searchMatches.length;
  jumpToSearchResult(searchCurrentIdx);
  chatSearchCount.textContent = `${searchCurrentIdx + 1}/${searchMatches.length}`;
});
chatSearchPrev?.addEventListener("click", () => {
  if (!searchMatches.length) return;
  searchCurrentIdx = (searchCurrentIdx - 1 + searchMatches.length) % searchMatches.length;
  jumpToSearchResult(searchCurrentIdx);
  chatSearchCount.textContent = `${searchCurrentIdx + 1}/${searchMatches.length}`;
});

function closeChatSearch() {
  chatSearchBar?.classList.add("hidden");
  if (chatSearchInput) chatSearchInput.value = "";
  if (chatSearchCount) chatSearchCount.textContent = "";
  clearSearchHighlights();
  searchMatches = []; searchCurrentIdx = -1;
}
function clearSearchHighlights() { messagesArea.querySelectorAll(".search-highlight, .search-current").forEach(el => el.classList.remove("search-highlight", "search-current")); }
function highlightSearchMatches() { searchMatches.forEach(row => row.classList.add("search-highlight")); }
function jumpToSearchResult(idx) {
  messagesArea.querySelectorAll(".search-current").forEach(el => el.classList.remove("search-current"));
  searchMatches[idx]?.classList.add("search-current");
  searchMatches[idx]?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW CHAT MODAL
// ═══════════════════════════════════════════════════════════════════════════════
newChatBtn?.addEventListener("click", (e) => { e.stopPropagation(); openNewChatModal(); });
newChatModalClose?.addEventListener("click", () => newChatModal.classList.add("hidden"));
newChatModal?.addEventListener("click", (e) => { if (e.target === newChatModal) newChatModal.classList.add("hidden"); });

function openNewChatModal() {
  newChatModal.classList.remove("hidden");
  newChatSearch.value = "";
  renderNewChatList(getAllPresenceUsers().filter(u => u.uid !== ME?.uid));
  newChatSearch.focus();
}

newChatSearch?.addEventListener("input", () => {
  const q = newChatSearch.value.toLowerCase();
  renderNewChatList(getAllPresenceUsers().filter(u => u.uid !== ME?.uid && u.name.toLowerCase().includes(q)));
});

function renderNewChatList(users) {
  if (!users.length) { newChatUserList.innerHTML = `<li class="modal-empty">No users found</li>`; return; }
  newChatUserList.innerHTML = users.map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />` : u.name.charAt(0).toUpperCase();
    return `
      <li class="modal-user-item" data-uid="${u.uid}">
        <div class="modal-user-av" style="background:${color};">${av}<div class="modal-online-dot ${u.online ? "online" : "offline"}"></div></div>
        <div class="modal-user-info">
          <div class="modal-user-name">${escHtml(u.name)}</div>
          <div class="modal-user-status">${escHtml(u.status || "")}</div>
        </div>
        <span class="modal-user-badge ${u.online ? "online" : "offline"}">${u.online ? "● Online" : "○ Offline"}</span>
      </li>`;
  }).join("");

  newChatUserList.querySelectorAll(".modal-user-item").forEach(el => {
    el.addEventListener("click", () => {
      const user = presenceUsersMap.get(el.dataset.uid);
      if (!user) return;
      newChatModal.classList.add("hidden");
      startDmWithUser(getRoomId(ME.uid, user.uid), user.uid, user);
    });
  });
}

window.copyRoomLink = function () {
  navigator.clipboard.writeText(window.location.href).then(() => showToast("Room link copied!"));
};
