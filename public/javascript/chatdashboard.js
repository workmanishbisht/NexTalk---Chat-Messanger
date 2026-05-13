// chatdashboard.js — FIXED: Complete duplicate user/profile prevention across all devices/sessions
// UPDATED: Added dynamic "View Profile" feature with real-time Firebase data fetching
// FIX v2: Profile data now stored in Firestore `users/{uid}` so every user's full profile loads correctly
// v3: Voice/Mic recording feature added with waveform animation, timer, swipe-to-cancel

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  where,
  getDocs,
  limit,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  getStorage,
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJea9IVCNXyeUKCpO_Jhbg-s-PeGoWyDc",
  authDomain: "nextalk-34dad.firebaseapp.com",
  projectId: "nextalk-34dad",
  storageBucket: "nextalk-34dad.appspot.com",
  messagingSenderId: "730298460453",
  appId: "1:730298460453:web:c69d16bd96e14876a4d2cc",
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const storage = getStorage(fbApp);

// ─── State ────────────────────────────────────────────────────────────────────
let ME = null;

// Core dedup store: Map<uid → roomData>. One entry per uid, always.
let existingDmRooms = new Map();

// FIX: allPresenceUsers is now a Map<uid → user> instead of an array
let presenceUsersMap = new Map();

let activeRoomId = null;
let activeRoomMeta = { name: "", isPublic: false, isGroup: false, groupData: null };
let msgUnsub = null;
let typingUnsub = null;
let presenceUnsub = null;
let groupsUnsub = null;
let typingTimer = null;
let lastTypingSent = 0;
let currentEmojiTab = "emoji";
let pinnedChats = new Set();
let ctxMsgId = null;
let ctxMsgData = null;
let searchMatches = [];
let searchCurrentIdx = -1;
let moreDropdownOpen = false;
let selectMode = false;
let selectedMsgIds = new Set();
let favouriteChats = new Set();
let groupSelectedMembers = new Map();
let selectedGroupIcon = "💬";

// ─── View Profile State ───────────────────────────────────────────────────────
let viewProfileUnsub = null;
let currentViewedUid = null;
let viewProfileMediaUnsub = null;

// ─── Voice Recording State ────────────────────────────────────────────────────
let _isRecording = false;
let _recInterval = null;
let _recSeconds  = 0;
let _mediaRecorder = null;
let _audioChunks   = [];
let _recStream     = null;

const ROOM_GENERAL = "general";
const COLORS = ["#008080", "#0e9f6e", "#0ea5e9", "#7c3aed", "#db2777", "#ea580c", "#0891b2"];

function colorFor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return COLORS[Math.abs(h) % COLORS.length];
}

function getAllPresenceUsers() {
  return Array.from(presenceUsersMap.values());
}

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

const $ = (id) => document.getElementById(id);

const sidebarAvatar     = $("sidebarAvatar");
const totalUnreadBadge  = $("totalUnread");
const onlineStrip       = $("onlineStrip");
const pinnedList        = $("pinnedList");
const allChatList       = $("allChatList");
const chatEmpty         = $("chatEmpty");
const chatView          = $("chatView");
const chAvatar          = $("chAvatar");
const chPresence        = $("chPresence");
const chName            = $("chName");
const chStatus          = $("chStatus");
const messagesArea      = $("messagesArea");
const typingRow         = $("typingRow");
const typingAv          = $("typingAv");
const msgInput          = $("msgInput");
const sendBtn           = $("sendBtn");

const ipAvatar               = $("ipAvatar");
const ipName                 = $("ipName");
const ipUsername             = $("ipUsername");
const ipAbout                = $("ipAbout");
const ipEmail                = $("ipEmail");
const ipPhone                = $("ipPhone");
const ipJoined               = $("ipJoined");
const ipStatus               = $("ipStatus");
const ipGroupMembersSection  = $("ipGroupMembersSection");
const ipGroupMembersList     = $("ipGroupMembersList");
const ipDob                  = $("ipDob");
const ipGender               = $("ipGender");
const ipInterests            = $("ipInterests");
const ipExtraSection         = $("ipExtraSection");
const ipLocation             = $("ipLocation");

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
const groupSettingsCancel = $("groupSettingsCancel");
const groupSettingsSave  = $("groupSettingsSave");
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

const groupsNavItem          = $("groupsNavItem");
const groupsPanel            = $("groupsPanel");
const groupsPanelClose       = $("groupsPanelClose");
const groupsPanelOverlay     = $("groupsPanelOverlay");
const groupsList             = $("groupsList");
const createGroupBtn         = $("createGroupBtn");
const createGroupModal       = $("createGroupModal");
const createGroupModalClose  = $("createGroupModalClose");
const createGroupCancel      = $("createGroupCancel");
const createGroupSave        = $("createGroupSave");
const groupNameInput         = $("groupNameInput");
const groupDescInput         = $("groupDescInput");
const groupIconPicker        = $("groupIconPicker");
const groupMemberSearch      = $("groupMemberSearch");
const groupMemberList        = $("groupMemberList");
const selectedMembersWrap    = $("selectedMembersWrap");

// View Profile Panel elements
const viewProfilePanel       = $("viewProfilePanel");
const viewProfileOverlay     = $("viewProfileOverlay");
const vpCloseBtn             = $("vpCloseBtn");
const vpAvatar               = $("vpAvatar");
const vpName                 = $("vpName");
const vpUsername             = $("vpUsername");
const vpOnlineBadge          = $("vpOnlineBadge");
const vpOnlineLabel          = $("vpOnlineLabel");
const vpAbout                = $("vpAbout");
const vpEmail                = $("vpEmail");
const vpPhone                = $("vpPhone");
const vpJoined               = $("vpJoined");
const vpDob                  = $("vpDob");
const vpGender               = $("vpGender");
const vpLocation             = $("vpLocation");
const vpInterests            = $("vpInterests");
const vpMediaGrid            = $("vpMediaGrid");
const vpMediaCount           = $("vpMediaCount");
const vpSkeleton             = $("vpSkeleton");
const vpContent              = $("vpContent");
const vpMsgBtn               = $("vpMsgBtn");

// Voice/Mic elements
const micBtn    = $("micBtn");
const micIcon   = $("micIcon");
const waveformWrap = $("waveform");
const recTimerEl   = $("recTimer");
const recTimeEl    = $("recTime");

// ═══════════════════════════════════════════════════════════════════════════
// PRESENCE MAP HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function upsertPresenceUser(uid, fields) {
  if (!uid) return;
  const existing = presenceUsersMap.get(uid);
  if (existing) {
    if (fields.name   !== undefined) existing.name   = fields.name;
    if (fields.avatar !== undefined) existing.avatar = fields.avatar;
    if (fields.status !== undefined) existing.status = fields.status;
    if (fields.online !== undefined) existing.online = fields.online;
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

function removePresenceUser(uid) {
  presenceUsersMap.delete(uid);
}

// ═══════════════════════════════════════════════════════════════════════════
// DM ROOMS MAP HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function getDmRoom(otherUid) {
  return existingDmRooms.get(otherUid) || null;
}

function upsertDmRoom(otherUid, fields) {
  const existing = existingDmRooms.get(otherUid);
  if (existing) {
    if (fields.roomId    !== undefined) existing.roomId    = fields.roomId;
    if (fields.name      !== undefined) existing.name      = fields.name;
    if (fields.avatar    !== undefined) existing.avatar    = fields.avatar;
    if (fields.status    !== undefined) existing.status    = fields.status;
    if (fields.online    !== undefined) existing.online    = fields.online;
    if (fields.lastText  !== undefined) existing.lastText  = fields.lastText;
    if (fields.lastTs    !== undefined) existing.lastTs    = fields.lastTs;
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

function removeDmRoom(otherUid) {
  existingDmRooms.delete(otherUid);
}

function allDmRooms() {
  return Array.from(existingDmRooms.values());
}

// ═══════════════════════════════════════════════════════════════════════════
// RESET INFO PANEL FIELDS
// ═══════════════════════════════════════════════════════════════════════════
function resetInfoPanelFields() {
  if (ipName)     ipName.textContent     = "";
  if (ipUsername) ipUsername.textContent = "";
  if (ipAbout)    ipAbout.textContent    = "";
  if (ipStatus)   ipStatus.textContent   = "";
  if (ipJoined)   ipJoined.textContent   = "";

  if (ipAvatar) {
    ipAvatar.style.background = "";
    ipAvatar.innerHTML        = "";
    ipAvatar.style.width      = "72px";
    ipAvatar.style.height     = "72px";
  }

  const clearEl = (el) => {
    if (!el) return;
    el.innerHTML        = "";
    el.style.display    = "";
    el.style.alignItems = "";
    el.style.gap        = "";
  };

  clearEl(ipEmail);
  clearEl(ipPhone);
  clearEl(ipDob);
  clearEl(ipGender);
  clearEl(ipLocation);

  if (ipInterests) {
    ipInterests.innerHTML    = "";
    ipInterests.style.display   = "";
    ipInterests.style.flexWrap  = "";
    ipInterests.style.gap       = "";
  }

  if (ipGroupMembersList) ipGroupMembersList.innerHTML = "";
  if (ipExtraSection)     ipExtraSection.classList.add("hidden");
  if (ipGroupMembersSection) ipGroupMembersSection.classList.add("hidden");
}

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSIVE
// ═══════════════════════════════════════════════════════════════════════════
function openSidebar()  { sidebar?.classList.add("open");    sidebarOverlay?.classList.add("active"); }
function closeSidebar() { sidebar?.classList.remove("open"); sidebarOverlay?.classList.remove("active"); }

mobileMenuBtn?.addEventListener("click", openSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
sidebarOverlay?.addEventListener("click", closeSidebar);
mobileNewChatBtn?.addEventListener("click", () => { closeSidebar(); openNewChatModal(); });

function mobileChatOpen()  { if (window.innerWidth <= 768) { document.body.classList.add("chat-active"); closeSidebar(); closeGroupsPanel(); } }
function mobileChatClose() { document.body.classList.remove("chat-active"); }
chatBackBtn?.addEventListener("click", mobileChatClose);

function openInfoPanel()  { infoPanel?.classList.add("open");    if (window.innerWidth <= 1024) infoPanelOverlay?.classList.add("active"); }
function closeInfoPanel() { infoPanel?.classList.remove("open"); infoPanelOverlay?.classList.remove("active"); }
infoPanelToggleBtn?.addEventListener("click", openInfoPanel);
infoPanelCloseBtn?.addEventListener("click", closeInfoPanel);
infoPanelOverlay?.addEventListener("click", closeInfoPanel);

let _lastW = window.innerWidth;
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  if (w > 768  && _lastW <= 768)  { closeSidebar(); mobileChatClose(); closeInfoPanel(); closeGroupsPanel(); closeViewProfile(); }
  if (w > 1024) { closeInfoPanel(); }
  _lastW = w;
});

// ═══════════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function buildAvatarEl(el, name, avatarUrl) {
  el.style.background = colorFor(name || "?");
  el.innerHTML = avatarUrl
    ? `<img src="${avatarUrl}" alt="${escHtml(name)}" />`
    : (name || "?").charAt(0).toUpperCase();
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function loadMyProfile(uid) {
  const raw = localStorage.getItem(`nextalk_profile_${uid}`);
  return raw ? JSON.parse(raw) : null;
}

function formatChatTime(date) {
  if (!date) return "";
  const now  = new Date();
  const diff = now - date;
  const oneDay = 86400000;
  if (diff < oneDay && now.getDate() === date.getDate())
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diff < 2 * oneDay) return "Yesterday";
  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function formatDob(dobStr) {
  if (!dobStr) return "—";
  try {
    const d = new Date(dobStr);
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return dobStr; }
}

function genderIcon(gender) {
  if (!gender) return "";
  if (gender === "Male")   return `<i class="ri-men-line"   style="color:var(--primary)"></i>`;
  if (gender === "Female") return `<i class="ri-women-line" style="color:#db2777"></i>`;
  return `<i class="ri-question-line" style="color:var(--text-grey)"></i>`;
}

function getGeneralChatName() {
  return localStorage.getItem("nt_general_name") || "General Chat";
}

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
  if (pinnedChats.has(id)) { pinnedChats.delete(id); showToast("Chat unpinned", "success"); }
  else                     { pinnedChats.add(id);    showToast("Chat pinned 📌", "success"); }
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

// ═══════════════════════════════════════════════════════════════════════════
// THEME
// ═══════════════════════════════════════════════════════════════════════════
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (themeIcon)      themeIcon.className         = theme === "dark" ? "ri-sun-line" : "ri-moon-line";
  if (themeLabelText) themeLabelText.textContent  = theme === "dark" ? "Light Mode" : "Dark Mode";
  localStorage.setItem("nt_theme", theme);
}
themeToggleBtn?.addEventListener("click", () => {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
applyTheme(localStorage.getItem("nt_theme") || "light");

// ═══════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════
document.addEventListener("click", () => { closeMoreDropdown(); });

pdLogout?.addEventListener("click", async () => {
  await setPresence(false);
  await signOut(auth);
  window.location.href = "./authentication.html";
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async (user) => {
  if (!user) { window.location.href = "./authentication.html"; return; }
  const profile = loadMyProfile(user.uid);
  if (!profile || !profile.setupDone) { window.location.href = "./profile-setup.html"; return; }
  ME = {
    uid:       user.uid,
    name:      profile.name,
    avatar:    profile.avatar || "",
    status:    profile.status || "Hey there! I'm using NexTalk",
    email:     profile.email || user.email || "",
    phone:     profile.phone || "",
    dob:       profile.dob || "",
    gender:    profile.gender || "",
    interests: profile.interests || [],
    location:  profile.location || { display: "", city: "", country: "", lat: null, lng: null },
  };
  pinnedChats = loadPinnedChats(user.uid);
  init();
});

// ═══════════════════════════════════════════════════════════════════════════
// WRITE FULL PROFILE TO FIRESTORE users/{uid}
// ═══════════════════════════════════════════════════════════════════════════
async function syncProfileToFirestore() {
  if (!ME) return;
  try {
    const profile = loadMyProfile(ME.uid);
    await setDoc(doc(db, "users", ME.uid), {
      uid:       ME.uid,
      name:      ME.name,
      avatar:    ME.avatar,
      status:    ME.status,
      email:     ME.email,
      phone:     ME.phone || "",
      dob:       ME.dob || "",
      gender:    ME.gender || "",
      interests: ME.interests || [],
      location:  ME.location || {},
      createdAt: profile?.createdAt ? new Date(profile.createdAt) : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch (err) {
    console.warn("syncProfileToFirestore error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
async function init() {
  buildAvatarEl(sidebarAvatar, ME.name, ME.avatar);
  renderOwnProfileInInfoPanel();
  await setPresence(true);

  syncProfileToFirestore().catch(e => console.warn("profile sync:", e));

  window.addEventListener("beforeunload", () => setPresence(false));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") setPresence(false);
    else setPresence(true);
  });
  await cleanupDuplicateRooms();
  await loadExistingDmRooms();
  renderContactsList();
  listenPresence();
  listenGroups();
  openRoom(ROOM_GENERAL, getGeneralChatName(), null, true, null, false);
  startPresenceHeartbeat();
  initViewProfilePanel();
  initMicButton();
}

// ═══════════════════════════════════════════════════════════════════════════
// CLEANUP DUPLICATE ROOMS
// ═══════════════════════════════════════════════════════════════════════════
async function cleanupDuplicateRooms() {
  if (!ME) return;
  try {
    const userRoomsRef = doc(db, "userRooms", ME.uid);
    const snap = await getDoc(userRoomsRef);
    if (!snap.exists()) return;

    const raw = snap.data().rooms || [];
    const cleaned = [];
    const seenUids = new Set();

    for (const roomId of raw) {
      const parts = roomId.split("__");
      if (parts.length !== 2) { cleaned.push(roomId); continue; }
      const otherUid = parts.find(p => p !== ME.uid);
      if (!otherUid) continue;

      if (!seenUids.has(otherUid)) {
        seenUids.add(otherUid);
        cleaned.push(roomId);
      } else {
        console.log(`[Cleanup] Removed duplicate roomId: ${roomId}`);
      }
    }

    if (cleaned.length !== raw.length) {
      await setDoc(userRoomsRef, { rooms: cleaned }, { merge: true });
      console.log(`[Cleanup] Removed ${raw.length - cleaned.length} duplicate(s)`);
    }
  } catch (err) {
    console.warn("cleanupDuplicateRooms error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD EXISTING DM ROOMS
// ═══════════════════════════════════════════════════════════════════════════
async function loadExistingDmRooms() {
  if (!ME) return;
  existingDmRooms.clear();

  try {
    const userRoomsRef  = doc(db, "userRooms", ME.uid);
    const userRoomsSnap = await getDoc(userRoomsRef);
    if (!userRoomsSnap.exists()) return;

    const data    = userRoomsSnap.data();
    const roomIds = [...new Set(data.rooms || [])];

    for (const roomId of roomIds) {
      const parts    = roomId.split("__");
      if (parts.length !== 2) continue;

      const otherUid = parts.find(p => p !== ME.uid);
      if (!otherUid || otherUid === ME.uid) continue;

      if (existingDmRooms.has(otherUid)) {
        console.warn(`[DM dedup] Skipping duplicate roomId "${roomId}" for uid "${otherUid}"`);
        continue;
      }

      let lastText = "";
      let lastTs   = null;
      try {
        const lastMsgSnap = await getDocs(
          query(
            collection(db, "rooms", roomId, "messages"),
            orderBy("createdAt", "desc"),
            limit(1)
          )
        );
        if (!lastMsgSnap.empty) {
          const lastMsg = lastMsgSnap.docs[0].data();
          if (lastMsg.uid !== "system" && !lastMsg.deleted) {
            lastText = lastMsg.type === "image"   ? "📷 Image"
                     : lastMsg.type === "file"    ? `📎 ${lastMsg.fileName || "File"}`
                     : lastMsg.type === "sticker" ? lastMsg.text
                     : lastMsg.type === "voice"   ? "🎤 Voice message"
                     : (lastMsg.text || "");
          }
          lastTs = lastMsg.createdAt?.toDate ? lastMsg.createdAt.toDate() : null;
        }
      } catch (_) { }

      upsertDmRoom(otherUid, {
        roomId,
        name:     otherUid,
        avatar:   "",
        status:   "",
        online:   false,
        lastText,
        lastTs,
      });
    }
  } catch (err) {
    console.warn("loadExistingDmRooms error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// REGISTER DM ROOM
// ═══════════════════════════════════════════════════════════════════════════
async function registerDmRoom(roomId) {
  if (!ME) return;
  try {
    const parts = roomId.split("__");
    if (parts.length !== 2) return;
    const otherUid = parts.find(p => p !== ME.uid);
    if (!otherUid) return;

    const myRef    = doc(db, "userRooms", ME.uid);
    const mySnap   = await getDoc(myRef);
    const myRooms  = [...new Set(mySnap.exists() ? (mySnap.data().rooms || []) : [])];
    if (!myRooms.includes(roomId)) {
      await setDoc(myRef, { rooms: [...myRooms, roomId] }, { merge: true });
    }

    const otherRef   = doc(db, "userRooms", otherUid);
    const otherSnap  = await getDoc(otherRef);
    const otherRooms = [...new Set(otherSnap.exists() ? (otherSnap.data().rooms || []) : [])];
    if (!otherRooms.includes(roomId)) {
      await setDoc(otherRef, { rooms: [...otherRooms, roomId] }, { merge: true });
    }
  } catch (err) {
    console.warn("registerDmRoom error:", err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// RENDER OWN PROFILE IN INFO PANEL
// ═══════════════════════════════════════════════════════════════════════════
function renderOwnProfileInInfoPanel() {
  if (!ME) return;
  resetInfoPanelFields();

  buildAvatarEl(ipAvatar, ME.name, ME.avatar);
  if (ipAvatar) { ipAvatar.style.width = "72px"; ipAvatar.style.height = "72px"; }

  if (ipName)     ipName.textContent     = ME.name;
  if (ipUsername) ipUsername.textContent = `@${ME.name.toLowerCase().replace(/\s+/g, "")}`;
  if (ipAbout)    ipAbout.textContent    = ME.status || "Hey there! I'm using NexTalk";
  if (ipStatus)   ipStatus.textContent   = "Your profile";

  if (ipEmail) {
    renderEditableField(ipEmail, ME.email || "—", "email", async () => {
      showToast("Email cannot be changed here. Update from account settings.", "warning");
    }, true);
  }

  if (ipPhone) {
    renderEditableField(ipPhone, ME.phone || "Add phone number", "phone", async (val) => {
      const p = loadMyProfile(ME.uid);
      if (p) { p.phone = val; localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(p)); ME.phone = val; }
      showToast("Phone number saved ✓", "success");
      syncProfileToFirestore().catch(() => {});
    }, false);
  }

  if (ipDob) {
    const dobDisplay = formatDob(ME.dob);
    renderEditableField(ipDob, dobDisplay !== "—" ? dobDisplay : "Add date of birth", "dob", async (val) => {
      const p = loadMyProfile(ME.uid);
      if (p) { p.dob = val; localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(p)); ME.dob = val; }
      showToast("Date of birth saved ✓", "success");
      syncProfileToFirestore().catch(() => {});
    }, false, "date");
  }

  if (ipGender)    renderGenderField(ipGender, ME.gender || "");
  if (ipInterests) renderInterestTags(ipInterests, ME.interests || []);
  if (ipLocation)  renderLocationField(ipLocation, ME.location || {});

  if (ipJoined) {
    const profile    = loadMyProfile(ME.uid);
    const joinedDate = profile?.createdAt
      ? new Date(profile.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
      : new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    ipJoined.textContent = joinedDate;
  }

  if (ipExtraSection)        ipExtraSection.classList.remove("hidden");
  if (ipGroupMembersSection) ipGroupMembersSection.classList.add("hidden");
}

function renderLocationField(el, location) {
  el.innerHTML = "";
  el.style.display    = "flex";
  el.style.alignItems = "center";
  el.style.gap        = "6px";

  const displayText = location?.display || "";
  const span        = document.createElement("span");
  span.style.cssText = "flex:1; color: var(--text); font-size:13px; word-break:break-all;";

  if (displayText) {
    span.innerHTML = `<span class="ip-location-chip"><i class="ri-map-pin-2-fill" style="color:var(--primary);margin-right:4px;"></i>${escHtml(displayText)}</span>`;
  } else {
    span.innerHTML = `<span style="color:var(--text-grey)">Add location</span>`;
  }
  el.appendChild(span);

  const editBtn   = document.createElement("button");
  editBtn.className = "icon-btn";
  editBtn.style.cssText = "width:22px;height:22px;font-size:13px;opacity:0.55;flex-shrink:0;";
  editBtn.innerHTML = `<i class="ri-edit-line"></i>`;
  editBtn.title     = "Edit location";
  el.appendChild(editBtn);

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.innerHTML        = "";
    el.style.flexWrap   = "nowrap";

    const input = document.createElement("input");
    input.type  = "text";
    input.value = displayText || "";
    input.placeholder = "e.g. Dehradun, Uttarakhand";
    input.style.cssText = `flex:1;border:none;border-bottom:1.5px solid var(--primary);background:transparent;font-family:'Work Sans',sans-serif;font-size:13px;color:var(--text);outline:none;padding:2px 4px;min-width:0;`;

    const saveBtn   = document.createElement("button");
    saveBtn.className = "icon-btn";
    saveBtn.style.cssText = "width:22px;height:22px;font-size:13px;color:var(--primary);flex-shrink:0;";
    saveBtn.innerHTML = `<i class="ri-check-line"></i>`;

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "icon-btn";
    cancelBtn.style.cssText = "width:22px;height:22px;font-size:13px;flex-shrink:0;";
    cancelBtn.innerHTML = `<i class="ri-close-line"></i>`;

    el.appendChild(input);
    el.appendChild(saveBtn);
    el.appendChild(cancelBtn);
    input.focus();

    const doSave = async () => {
      const newVal = input.value.trim();
      const p = loadMyProfile(ME.uid);
      if (p) {
        if (!p.location) p.location = {};
        p.location.display = newVal;
        localStorage.setItem(`nextalk_profile_${ME.uid}`, JSON.stringify(p));
        ME.location = { ...ME.location, display: newVal };
      }
      showToast("Location saved ✓", "success");
      syncProfileToFirestore().catch(() => {});
      renderLocationField(el, ME.location);
    };

    saveBtn.addEventListener("click",   doSave);
    cancelBtn.addEventListener("click", () => renderLocationField(el, location));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  doSave();
      if (e.key === "Escape") renderLocationField(el, location);
    });
  });
}

function renderGenderField(el, gender) {
  el.innerHTML        = "";
  el.style.display    = "flex";
  el.style.alignItems = "center";
  el.style.gap        = "6px";
  if (gender && gender !== "Not specified") {
    el.innerHTML = `${genderIcon(gender)}<span style="font-size:13px;color:var(--text)">${escHtml(gender)}</span>`;
  } else {
    el.innerHTML = `<span style="font-size:13px;color:var(--text-grey)">Not specified</span>`;
  }
}

function renderInterestTags(el, interests) {
  el.innerHTML = "";
  if (!interests || !interests.length) {
    el.innerHTML = `<span style="font-size:13px;color:var(--text-grey)">No interests added</span>`;
    return;
  }
  el.style.display  = "flex";
  el.style.flexWrap = "wrap";
  el.style.gap      = "6px";
  interests.forEach(tag => {
    const chip = document.createElement("span");
    chip.style.cssText = `display:inline-flex;align-items:center;padding:3px 10px;background:rgba(0,128,128,0.1);color:var(--primary);border-radius:20px;font-size:12px;font-weight:600;`;
    chip.textContent   = tag;
    el.appendChild(chip);
  });
}

function renderEditableField(el, value, fieldName, onSave, readonly = false, inputType = "text") {
  el.innerHTML        = "";
  el.style.display    = "flex";
  el.style.alignItems = "center";
  el.style.gap        = "6px";

  const span = document.createElement("span");
  span.textContent   = value || "—";
  span.style.cssText = "flex:1; color: var(--text); font-size:13px; word-break:break-all;";
  el.appendChild(span);

  if (!readonly) {
    const editBtn = document.createElement("button");
    editBtn.className = "icon-btn";
    editBtn.style.cssText = "width:22px;height:22px;font-size:13px;opacity:0.55;flex-shrink:0;";
    editBtn.innerHTML = `<i class="ri-edit-line"></i>`;
    editBtn.title     = `Edit ${fieldName}`;
    el.appendChild(editBtn);

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      el.innerHTML        = "";
      el.style.flexWrap   = "nowrap";
      const input         = document.createElement("input");
      input.type          = inputType;
      const isPlaceholder = value.startsWith("Add ");
      input.value         = isPlaceholder ? "" : (value || "");
      input.placeholder   = fieldName === "phone" ? "+91 98765 43210"
                          : fieldName === "dob"   ? "YYYY-MM-DD"
                          : "your@email.com";
      input.style.cssText = `flex:1;border:none;border-bottom:1.5px solid var(--primary);background:transparent;font-family:'Work Sans',sans-serif;font-size:13px;color:var(--text);outline:none;padding:2px 4px;min-width:0;`;

      const saveBtn   = document.createElement("button");
      saveBtn.className   = "icon-btn";
      saveBtn.style.cssText = "width:22px;height:22px;font-size:13px;color:var(--primary);flex-shrink:0;";
      saveBtn.innerHTML   = `<i class="ri-check-line"></i>`;

      const cancelBtn = document.createElement("button");
      cancelBtn.className   = "icon-btn";
      cancelBtn.style.cssText = "width:22px;height:22px;font-size:13px;flex-shrink:0;";
      cancelBtn.innerHTML   = `<i class="ri-close-line"></i>`;

      el.appendChild(input);
      el.appendChild(saveBtn);
      el.appendChild(cancelBtn);
      input.focus();

      const doSave = async () => {
        const newVal     = input.value.trim();
        await onSave(newVal);
        const displayVal = fieldName === "dob" && newVal ? formatDob(newVal) : (newVal || value);
        renderEditableField(el, displayVal, fieldName, onSave, readonly, inputType);
      };
      saveBtn.addEventListener("click",   doSave);
      cancelBtn.addEventListener("click", () => renderEditableField(el, value, fieldName, onSave, readonly, inputType));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter")  doSave();
        if (e.key === "Escape") renderEditableField(el, value, fieldName, onSave, readonly, inputType);
      });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PRESENCE
// ═══════════════════════════════════════════════════════════════════════════
async function setPresence(online) {
  if (!ME) return;
  try {
    await setDoc(doc(db, "presence", ME.uid), {
      uid:      ME.uid,
      name:     ME.name,
      avatar:   ME.avatar,
      status:   ME.status,
      online,
      lastSeen: serverTimestamp(),
    });
  } catch (_) { }
}

let presenceHeartbeat = null;
function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  presenceHeartbeat = setInterval(() => {
    if (document.visibilityState !== "hidden") setPresence(true);
  }, 30000);
}
function stopPresenceHeartbeat() {
  if (presenceHeartbeat) { clearInterval(presenceHeartbeat); presenceHeartbeat = null; }
}

function isTrulyOnline(presenceData) {
  if (!presenceData.online) return false;
  if (!presenceData.lastSeen) return true;
  const lastSeenDate = presenceData.lastSeen.toDate
    ? presenceData.lastSeen.toDate()
    : new Date(presenceData.lastSeen);
  return (Date.now() - lastSeenDate.getTime()) / 1000 < 120;
}

// ═══════════════════════════════════════════════════════════════════════════
// LISTEN PRESENCE
// ═══════════════════════════════════════════════════════════════════════════
function listenPresence() {
  presenceUnsub = onSnapshot(collection(db, "presence"), (snap) => {
    snap.docChanges().forEach(change => {
      const data = change.doc.data();
      const uid = change.doc.id;

      if (change.type === "removed") {
        removePresenceUser(uid);
        return;
      }

      upsertPresenceUser(uid, {
        name:     data.name     || uid,
        avatar:   data.avatar   || "",
        status:   data.status   || "",
        online:   isTrulyOnline(data),
        lastSeen: data.lastSeen || null,
      });
    });

    const allUsers    = getAllPresenceUsers();
    const onlineUsers = allUsers.filter(u => u.online);

    renderOnlineStrip(onlineUsers);

    allUsers.forEach(liveUser => {
      if (liveUser.uid === ME?.uid) return;
      if (existingDmRooms.has(liveUser.uid)) {
        upsertDmRoom(liveUser.uid, {
          name:   liveUser.name   || undefined,
          avatar: liveUser.avatar || undefined,
          status: liveUser.status || undefined,
          online: liveUser.online,
        });
      }
    });

    renderAllUsersPanel(allUsers);

    if (activeRoomId && activeRoomId !== ROOM_GENERAL && !activeRoomMeta.isGroup) {
      const otherUser = allUsers.find(
        u => u.uid !== ME?.uid && getRoomId(ME.uid, u.uid) === activeRoomId
      );
      if (otherUser) updateChatHeaderPresence(otherUser);
    }

    renderContactsList();

    if (currentViewedUid) {
      const viewedUser = presenceUsersMap.get(currentViewedUid);
      if (viewedUser && vpOnlineBadge) {
        const isOnline = viewedUser.online;
        vpOnlineBadge.className = `vp-online-badge ${isOnline ? "online" : "offline"}`;
        if (vpOnlineLabel) vpOnlineLabel.textContent = isOnline ? "Online" : "Offline";
      }
    }
  });
}

function updateChatHeaderPresence(user) {
  const isOnline = user.online;
  chPresence.className = `ch-presence ${isOnline ? "online" : "offline"}`;
  if (!chStatus.classList.contains("typing")) {
    chStatus.textContent = isOnline ? "Online" : "Offline";
    chStatus.className   = `ch-status ${isOnline ? "online-status" : "offline-status"}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VIEW PROFILE PANEL
// ═══════════════════════════════════════════════════════════════════════════

function initViewProfilePanel() {
  vpCloseBtn?.addEventListener("click", closeViewProfile);
  viewProfileOverlay?.addEventListener("click", closeViewProfile);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && viewProfilePanel?.classList.contains("open")) {
      closeViewProfile();
    }
  });

  vpMsgBtn?.addEventListener("click", () => {
    if (!currentViewedUid || !ME) return;
    const user = presenceUsersMap.get(currentViewedUid) || { uid: currentViewedUid, name: currentViewedUid, avatar: "", online: false, status: "" };
    const roomId = getRoomId(ME.uid, currentViewedUid);
    closeViewProfile();
    startDmWithUser(roomId, currentViewedUid, user);
  });
}

async function openViewProfile(uid) {
  if (!uid || uid === ME?.uid) return;

  if (currentViewedUid !== uid) {
    currentViewedUid = uid;
    showViewProfileSkeleton();
    await loadViewProfileData(uid);
  }

  viewProfilePanel?.classList.add("open");
  viewProfileOverlay?.classList.add("active");

  if (window.innerWidth <= 768) {
    document.body.style.overflow = "hidden";
  }
}

function closeViewProfile() {
  viewProfilePanel?.classList.remove("open");
  viewProfileOverlay?.classList.remove("active");
  document.body.style.overflow = "";

  if (viewProfileUnsub) { viewProfileUnsub(); viewProfileUnsub = null; }
  if (viewProfileMediaUnsub) { viewProfileMediaUnsub(); viewProfileMediaUnsub = null; }

  currentViewedUid = null;
}

function showViewProfileSkeleton() {
  if (vpSkeleton)  vpSkeleton.classList.remove("hidden");
  if (vpContent)   vpContent.classList.add("hidden");
}

function hideViewProfileSkeleton() {
  if (vpSkeleton)  vpSkeleton.classList.add("hidden");
  if (vpContent)   vpContent.classList.remove("hidden");
}

async function loadViewProfileData(uid) {
  if (viewProfileUnsub) { viewProfileUnsub(); viewProfileUnsub = null; }
  if (viewProfileMediaUnsub) { viewProfileMediaUnsub(); viewProfileMediaUnsub = null; }

  const presenceRef = doc(db, "presence", uid);
  let cachedUserProfile = null;

  try {
    const userSnap = await getDoc(doc(db, "users", uid));
    if (userSnap.exists()) {
      cachedUserProfile = userSnap.data();
    }
  } catch (err) {
    console.warn("loadViewProfileData users fetch error:", err);
  }

  viewProfileUnsub = onSnapshot(presenceRef, (presSnap) => {
    const presData   = presSnap.exists() ? presSnap.data() : null;
    const mapUser    = presenceUsersMap.get(uid);
    const isOnline   = presData ? isTrulyOnline(presData) : (mapUser?.online ?? false);

    const profile = {
      name:      cachedUserProfile?.name      || presData?.name      || mapUser?.name      || uid,
      avatar:    cachedUserProfile?.avatar    || presData?.avatar    || mapUser?.avatar    || "",
      status:    cachedUserProfile?.status    || presData?.status    || mapUser?.status    || "Hey there! I'm using NexTalk",
      online:    isOnline,
      email:     cachedUserProfile?.email     || "",
      phone:     cachedUserProfile?.phone     || "",
      dob:       cachedUserProfile?.dob       || "",
      gender:    cachedUserProfile?.gender    || "",
      location:  cachedUserProfile?.location  || {},
      interests: cachedUserProfile?.interests || [],
      createdAt: cachedUserProfile?.createdAt || presData?.createdAt || null,
    };

    renderViewProfileUI(uid, profile);
  });

  const usersUnsub = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    cachedUserProfile = snap.data();
    const mapUser  = presenceUsersMap.get(uid);
    const isOnline = mapUser?.online ?? false;
    renderViewProfileUI(uid, {
      name:      cachedUserProfile.name      || uid,
      avatar:    cachedUserProfile.avatar    || "",
      status:    cachedUserProfile.status    || "Hey there! I'm using NexTalk",
      online:    isOnline,
      email:     cachedUserProfile.email     || "",
      phone:     cachedUserProfile.phone     || "",
      dob:       cachedUserProfile.dob       || "",
      gender:    cachedUserProfile.gender    || "",
      location:  cachedUserProfile.location  || {},
      interests: cachedUserProfile.interests || [],
      createdAt: cachedUserProfile.createdAt || null,
    });
  });

  const origUnsub = viewProfileUnsub;
  viewProfileUnsub = () => { origUnsub(); usersUnsub(); };

  await loadViewProfileMedia(uid);
}

function renderViewProfileUI(uid, profile) {
  hideViewProfileSkeleton();

  if (vpAvatar) {
    vpAvatar.style.background = colorFor(profile.name);
    vpAvatar.innerHTML = profile.avatar
      ? `<img src="${escHtml(profile.avatar)}" alt="${escHtml(profile.name)}" />`
      : `<span>${(profile.name || "?").charAt(0).toUpperCase()}</span>`;
  }

  if (vpName)     vpName.textContent     = profile.name || uid;
  if (vpUsername) vpUsername.textContent = `@${(profile.name || uid).toLowerCase().replace(/\s+/g, "")}`;

  if (vpOnlineBadge) {
    vpOnlineBadge.className = `vp-online-badge ${profile.online ? "online" : "offline"}`;
    if (vpOnlineLabel) vpOnlineLabel.textContent = profile.online ? "Online" : "Offline";
  }

  if (vpAbout) vpAbout.textContent = profile.status || "Hey there! I'm using NexTalk";

  renderVpInfoRow(vpEmail,  profile.email  || "—");
  renderVpInfoRow(vpPhone,  profile.phone  || "—");
  renderVpInfoRow(vpDob,    profile.dob    ? formatDob(profile.dob) : "—");
  renderVpGender(profile.gender);
  renderVpLocation(profile.location);
  renderVpInterests(profile.interests);

  if (vpJoined) {
    if (profile.createdAt) {
      const d = profile.createdAt.toDate ? profile.createdAt.toDate() : new Date(profile.createdAt);
      vpJoined.textContent = d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    } else {
      vpJoined.textContent = "—";
    }
  }
}

function renderVpInfoRow(el, value) {
  if (!el) return;
  el.textContent = value || "—";
  el.style.color = (value && value !== "—") ? "var(--text)" : "var(--text-grey)";
}

function renderVpGender(gender) {
  if (!vpGender) return;
  if (gender && gender !== "Not specified") {
    vpGender.innerHTML = `${genderIcon(gender)} <span style="font-size:13px;color:var(--text);margin-left:4px;">${escHtml(gender)}</span>`;
  } else {
    vpGender.textContent = "—";
    vpGender.style.color = "var(--text-grey)";
  }
}

function renderVpLocation(location) {
  if (!vpLocation) return;
  const display = location?.display || "";
  if (display) {
    vpLocation.innerHTML = `<span class="ip-location-chip"><i class="ri-map-pin-2-fill" style="color:var(--primary);margin-right:4px;"></i>${escHtml(display)}</span>`;
  } else {
    vpLocation.textContent = "—";
    vpLocation.style.color = "var(--text-grey)";
  }
}

function renderVpInterests(interests) {
  if (!vpInterests) return;
  vpInterests.innerHTML = "";
  if (!interests || !interests.length) {
    vpInterests.innerHTML = `<span style="font-size:13px;color:var(--text-grey)">No interests added</span>`;
    return;
  }
  vpInterests.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
  interests.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "vp-interest-chip";
    chip.textContent = tag;
    vpInterests.appendChild(chip);
  });
}

async function loadViewProfileMedia(uid) {
  if (!ME || !vpMediaGrid) return;
  const roomId = getRoomId(ME.uid, uid);

  vpMediaGrid.innerHTML = `<div class="vp-media-loading"><div class="vp-skeleton-block" style="height:72px;border-radius:10px;"></div><div class="vp-skeleton-block" style="height:72px;border-radius:10px;"></div><div class="vp-skeleton-block" style="height:72px;border-radius:10px;"></div></div>`;
  if (vpMediaCount) vpMediaCount.textContent = "";

  try {
    const q = query(
      collection(db, "rooms", roomId, "messages"),
      where("type", "==", "image"),
      orderBy("createdAt", "desc"),
      limit(9)
    );

    viewProfileMediaUnsub = onSnapshot(q, (snap) => {
      const images = snap.docs
        .map(d => d.data())
        .filter(d => !d.deleted && (d.fileUrl || d.fileData));

      if (!images.length) {
        vpMediaGrid.innerHTML = `<div class="vp-media-empty"><i class="ri-image-line"></i><span>No shared media yet</span></div>`;
        if (vpMediaCount) vpMediaCount.textContent = "";
        return;
      }

      if (vpMediaCount) vpMediaCount.textContent = `${images.length} photo${images.length !== 1 ? "s" : ""}`;

      vpMediaGrid.innerHTML = images.map(img => {
        const src  = escHtml(img.fileUrl || img.fileData || "");
        const name = escHtml(img.fileName || "image.png");
        return `
          <a class="vp-media-thumb" href="${src}" target="_blank" title="${name}">
            <img src="${src}" alt="${name}" loading="lazy"
                 onerror="this.parentElement.style.display='none'" />
          </a>`;
      }).join("");
    });
  } catch (err) {
    vpMediaGrid.innerHTML = `<div class="vp-media-empty"><i class="ri-image-line"></i><span>No shared media yet</span></div>`;
  }
}

mdViewProfile?.addEventListener("click", () => {
  closeMoreDropdown();
  if (!activeRoomId || activeRoomId === ROOM_GENERAL || activeRoomMeta.isGroup) {
    showToast("View Profile is only available for direct messages.", "warning");
    return;
  }
  const parts = activeRoomId.split("__");
  const otherUid = parts.find(p => p !== ME?.uid);
  if (!otherUid) return;
  openViewProfile(otherUid);
});

chAvatar?.addEventListener("click", () => {
  if (!activeRoomId || activeRoomId === ROOM_GENERAL || activeRoomMeta.isGroup) return;
  const parts = activeRoomId.split("__");
  const otherUid = parts.find(p => p !== ME?.uid);
  if (otherUid) openViewProfile(otherUid);
});

// ═══════════════════════════════════════════════════════════════════════════
// GROUPS
// ═══════════════════════════════════════════════════════════════════════════
let allGroups = [];

function listenGroups() {
  groupsUnsub = onSnapshot(collection(db, "groups"), (snap) => {
    allGroups = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(g => g.members && g.members.includes(ME?.uid));
    renderGroupsList();
  });
}

function openGroupsPanel()  { groupsPanel?.classList.add("open");    groupsPanelOverlay?.classList.add("active");    renderGroupsList(); }
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
      const id  = el.dataset.id;
      const grp = allGroups.find(g => g.id === id);
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
groupsPanelClose?.addEventListener("click",   closeGroupsPanel);
groupsPanelOverlay?.addEventListener("click", closeGroupsPanel);

function openCreateGroupModal() {
  groupSelectedMembers.clear();
  selectedGroupIcon = "💬";
  if (groupNameInput) groupNameInput.value = "";
  if (groupDescInput) groupDescInput.value = "";
  renderSelectedMembersChips();
  renderGroupMemberPicker("");
  groupIconPicker?.querySelectorAll(".gip-item").forEach(el => {
    el.classList.toggle("active", el.dataset.icon === "💬");
  });
  createGroupModal?.classList.remove("hidden");
  groupNameInput?.focus();
}

createGroupBtn?.addEventListener("click",       () => { closeGroupsPanel(); openCreateGroupModal(); });
createGroupModalClose?.addEventListener("click", () => createGroupModal?.classList.add("hidden"));
createGroupCancel?.addEventListener("click",     () => createGroupModal?.classList.add("hidden"));
createGroupModal?.addEventListener("click",      (e) => { if (e.target === createGroupModal) createGroupModal.classList.add("hidden"); });

groupIconPicker?.addEventListener("click", (e) => {
  const item = e.target.closest(".gip-item");
  if (!item) return;
  selectedGroupIcon = item.dataset.icon;
  groupIconPicker.querySelectorAll(".gip-item").forEach(el => el.classList.toggle("active", el === item));
});

groupMemberSearch?.addEventListener("input", () => renderGroupMemberPicker(groupMemberSearch.value.toLowerCase()));

function renderGroupMemberPicker(q) {
  if (!groupMemberList) return;
  const users = getAllPresenceUsers().filter(
    u => u.uid !== ME?.uid && !groupSelectedMembers.has(u.uid) && (!q || u.name.toLowerCase().includes(q))
  );
  if (!users.length) {
    groupMemberList.innerHTML = `<li class="modal-empty">${q ? "No users found" : "No other users available"}</li>`;
    return;
  }
  groupMemberList.innerHTML = users.map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar
      ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : u.name.charAt(0).toUpperCase();
    return `
      <li class="modal-user-item" data-uid="${u.uid}">
        <div class="modal-user-av" style="background:${color};">${av}
          <div class="modal-online-dot ${u.online ? "online" : "offline"}"></div>
        </div>
        <div class="modal-user-info">
          <div class="modal-user-name">${escHtml(u.name)}</div>
          <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
        </div>
        <div class="modal-check"><i class="ri-check-line"></i></div>
      </li>`;
  }).join("");

  groupMemberList.querySelectorAll(".modal-user-item").forEach(el => {
    el.addEventListener("click", () => {
      const uid  = el.dataset.uid;
      const user = presenceUsersMap.get(uid);
      if (!user) return;
      groupSelectedMembers.set(uid, user);
      renderSelectedMembersChips();
      renderGroupMemberPicker(groupMemberSearch?.value.toLowerCase() || "");
    });
  });
}

function renderSelectedMembersChips() {
  if (!selectedMembersWrap) return;
  selectedMembersWrap.innerHTML = [...groupSelectedMembers.values()].map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar
      ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
      : u.name.charAt(0).toUpperCase();
    return `
      <div class="member-chip" data-uid="${u.uid}">
        <div class="chip-av" style="background:${color};">${av}</div>
        <span>${escHtml(u.name)}</span>
        <span class="chip-remove" title="Remove">✕</span>
      </div>`;
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
  if (!name)                          { showToast("Please enter a group name", "warning"); return; }
  if (groupSelectedMembers.size < 1)  { showToast("Add at least 1 member to the group", "warning"); return; }
  const members = [ME.uid, ...groupSelectedMembers.keys()];
  try {
    createGroupSave.disabled = true;
    const ref = await addDoc(collection(db, "groups"), {
      name,
      desc:      groupDescInput?.value.trim() || "",
      icon:      selectedGroupIcon,
      adminUid:  ME.uid,
      members,
      createdAt: serverTimestamp(),
    });
    showToast(`Group "${name}" created! 🎉`, "success");
    createGroupModal?.classList.add("hidden");
    const newGroup = {
      id:       ref.id, name,
      desc:     groupDescInput?.value.trim() || "",
      icon:     selectedGroupIcon,
      adminUid: ME.uid,
      members,
    };
    openRoom(`group__${ref.id}`, name, null, false, null, true, newGroup);
    mobileChatOpen();
  } catch (err) {
    showToast("Failed to create group: " + err.message, "error");
  } finally {
    if (createGroupSave) createGroupSave.disabled = false;
  }
});

groupSettingsBtn?.addEventListener("click", () => openGroupSettingsModal());

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
    const u        = presenceUsersMap.get(uid) || { uid, name: uid, avatar: "", online: false };
    const color    = colorFor(u.name);
    const av       = u.avatar
      ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : u.name.charAt(0).toUpperCase();
    const isAdmin  = uid === grp.adminUid;
    const isSelf   = uid === ME?.uid;
    const canKick  = !isAdmin && !isSelf;
    return `
      <li class="modal-user-item" data-uid="${uid}" style="cursor:default;">
        <div class="modal-user-av" style="background:${color};">${av}
          <div class="modal-online-dot ${u.online ? "online" : "offline"}"></div>
        </div>
        <div class="modal-user-info">
          <div class="modal-user-name">${escHtml(u.name)}${isAdmin ? ' <span style="font-size:10px;color:var(--primary);font-weight:700;">(Admin)</span>' : ""}</div>
          <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
        </div>
        ${canKick ? `<button class="icon-btn gs-kick-btn" data-uid="${uid}" title="Remove" style="color:var(--error);"><i class="ri-user-unfollow-line"></i></button>` : ""}
      </li>`;
  }).join("");

  gsGroupMembersList.querySelectorAll(".gs-kick-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const uid = btn.dataset.uid;
      const u   = presenceUsersMap.get(uid);
      if (!confirm(`Remove ${u?.name || uid} from group?`)) return;
      await kickMemberFromGroup(grp.id, uid);
    });
  });
}

function renderGsAddMembers(q) {
  if (!gsAddMemberList) return;
  const grp = activeRoomMeta.groupData;
  if (!grp) return;
  const existingMembers = new Set(grp.members || []);
  const users = getAllPresenceUsers().filter(
    u => u.uid !== ME?.uid && !existingMembers.has(u.uid) && (!q || u.name.toLowerCase().includes(q))
  );
  if (!users.length) { gsAddMemberList.innerHTML = `<li class="modal-empty">No users to add</li>`; return; }
  gsAddMemberList.innerHTML = users.map(u => {
    const color = colorFor(u.name);
    const av    = u.avatar
      ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : u.name.charAt(0).toUpperCase();
    return `
      <li class="modal-user-item" data-uid="${u.uid}">
        <div class="modal-user-av" style="background:${color};">${av}
          <div class="modal-online-dot ${u.online ? "online" : "offline"}"></div>
        </div>
        <div class="modal-user-info">
          <div class="modal-user-name">${escHtml(u.name)}</div>
          <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
        </div>
        <button class="icon-btn" style="color:var(--primary);"><i class="ri-user-add-line"></i></button>
      </li>`;
  }).join("");

  gsAddMemberList.querySelectorAll(".modal-user-item").forEach(el => {
    el.addEventListener("click", async () => {
      const uid  = el.dataset.uid;
      const grp2 = activeRoomMeta.groupData;
      if (!grp2) return;
      const newMembers = [...(grp2.members || []), uid];
      await updateDoc(doc(db, "groups", grp2.id), { members: newMembers });
      grp2.members = newMembers;
      showToast("Member added!", "success");
      renderGsMembers(grp2);
      renderGsAddMembers(gsAddMemberSearch?.value.toLowerCase() || "");
    });
  });
}

gsAddMemberSearch?.addEventListener("input", () => renderGsAddMembers(gsAddMemberSearch.value.toLowerCase()));
groupSettingsModalClose?.addEventListener("click", () => groupSettingsModal?.classList.add("hidden"));
groupSettingsCancel?.addEventListener("click",     () => groupSettingsModal?.classList.add("hidden"));
groupSettingsModal?.addEventListener("click",      (e) => { if (e.target === groupSettingsModal) groupSettingsModal.classList.add("hidden"); });

groupSettingsSave?.addEventListener("click", async () => {
  const grp     = activeRoomMeta.groupData;
  if (!grp) return;
  const newName = gsGroupName?.value.trim();
  if (!newName) { showToast("Group name cannot be empty", "warning"); return; }
  await updateDoc(doc(db, "groups", grp.id), { name: newName });
  if (chName) chName.textContent  = newName;
  if (ipName) ipName.textContent  = newName;
  grp.name = newName;
  showToast("Group updated!", "success");
  groupSettingsModal?.classList.add("hidden");
});

gsDeleteGroup?.addEventListener("click", async () => {
  const grp = activeRoomMeta.groupData;
  if (!grp) return;
  if (!confirm(`Delete group "${grp.name}"? This cannot be undone.`)) return;
  try {
    const snap = await getDocs(collection(db, "rooms", `group__${grp.id}`, "messages"));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    await deleteDoc(doc(db, "groups", grp.id));
    groupSettingsModal?.classList.add("hidden");
    activeRoomId = null;
    chatView.classList.add("hidden");
    chatEmpty.classList.remove("hidden");
    chatEmpty.style.display = "";
    mobileChatClose();
    showToast("Group deleted", "success");
  } catch (err) { showToast("Failed to delete group: " + err.message, "error"); }
});

async function kickMemberFromGroup(groupId, uid) {
  try {
    const grpRef  = doc(db, "groups", groupId);
    const snap    = await getDoc(grpRef);
    if (!snap.exists()) return;
    const data       = snap.data();
    const newMembers = (data.members || []).filter(m => m !== uid);
    await updateDoc(grpRef, { members: newMembers });
    if (activeRoomMeta.groupData) activeRoomMeta.groupData.members = newMembers;
    showToast("Member removed from group", "success");
    renderGsMembers(activeRoomMeta.groupData);
    renderGsAddMembers("");
  } catch (err) { showToast("Failed to remove member: " + err.message, "error"); }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACTS LIST (PINNED)
// ═══════════════════════════════════════════════════════════════════════════
function renderContactsList() {
  if (!pinnedList) return;
  pinnedList.innerHTML = "";

  const generalLi = document.createElement("li");
  generalLi.innerHTML = buildChatItemHtml({
    id: ROOM_GENERAL, name: getGeneralChatName(), avatar: "",
    preview: "Public room — everyone can chat", time: "", unread: 0, online: true, isPinned: true,
  }, activeRoomId === ROOM_GENERAL);
  const generalEl = generalLi.firstElementChild;
  if (generalEl) {
    pinnedList.appendChild(generalEl);
    generalEl.addEventListener("click", () => {
      openRoom(ROOM_GENERAL, getGeneralChatName(), null, true, null, false);
      highlightContact(ROOM_GENERAL);
      mobileChatOpen();
    });
  }

  const allUsers = getAllPresenceUsers();
  const pinnedOthers = allUsers.filter(u => u.uid !== ME?.uid && pinnedChats.has(u.uid));
  pinnedOthers.forEach(u => {
    const li = document.createElement("li");
    li.innerHTML = buildChatItemHtml({
      id: u.uid, name: u.name, avatar: u.avatar,
      preview: u.status || "Say hello!", time: "", unread: 0, online: u.online, isPinned: true,
    }, activeRoomId === getRoomId(ME.uid, u.uid));
    const el = li.firstElementChild;
    if (el) {
      pinnedList.appendChild(el);
      el.addEventListener("click", () => {
        const roomId = getRoomId(ME.uid, u.uid);
        openRoom(roomId, u.name, u.avatar, false, u, false);
        highlightContact(u.uid);
        mobileChatOpen();
      });
    }
  });
}

function buildChatItemHtml({ id, name, avatar, preview, time, unread, online, isPinned }, active = false) {
  const color      = colorFor(name);
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
        ${time   ? `<span class="ci-time">${escHtml(time)}</span>`     : ""}
        ${unread ? `<span class="ci-unread">${unread}</span>`          : ""}
      </div>
    </li>`;
}

function highlightContact(id) {
  document.querySelectorAll(".chat-item").forEach(el => {
    el.classList.toggle("active", el.dataset.id === id);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ONLINE STRIP
// ═══════════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════════
// ALL USERS PANEL
// ═══════════════════════════════════════════════════════════════════════════
function renderAllUsersPanel(presenceUsers) {
  const others = presenceUsers.filter(u => u.uid !== ME?.uid);

  const allUsersMap = new Map();
  others.forEach(u => allUsersMap.set(u.uid, { uid: u.uid, name: u.name, avatar: u.avatar, status: u.status, online: u.online }));

  allDmRooms().forEach(r => {
    if (!allUsersMap.has(r.uid) && r.uid !== ME?.uid) {
      allUsersMap.set(r.uid, {
        uid:    r.uid,
        name:   r.name || r.uid,
        avatar: r.avatar || "",
        status: r.status || "",
        online: false,
      });
    }
  });

  const allUsers = Array.from(allUsersMap.values());

  if (!allChatList) return;
  if (!allUsers.length) {
    allChatList.innerHTML = `<li style="padding:10px 18px;font-size:13px;color:var(--text-grey);">No other users found. Invite friends to join!</li>`;
    return;
  }

  allUsers.sort((a, b) => {
    if (a.online && !b.online) return -1;
    if (!a.online && b.online) return  1;
    const aTs = getDmRoom(a.uid)?.lastTs?.getTime() || 0;
    const bTs = getDmRoom(b.uid)?.lastTs?.getTime() || 0;
    return bTs - aTs;
  });

  allChatList.innerHTML = allUsers.map(u => {
    const isPinned      = pinnedChats.has(u.uid);
    const dmRoom        = getDmRoom(u.uid);
    const preview       = dmRoom?.lastText || u.status || "Tap to start chatting";
    const timeStr       = dmRoom?.lastTs ? formatChatTime(dmRoom.lastTs) : "";
    const currentRoomId = getRoomId(ME?.uid, u.uid);
    return buildChatItemHtml({
      id: u.uid, name: u.name, avatar: u.avatar,
      preview, time: timeStr, unread: 0, online: u.online, isPinned,
    }, activeRoomId === currentRoomId);
  }).join("");

  allChatList.querySelectorAll(".chat-item").forEach(el => {
    el.addEventListener("click", () => {
      const uid  = el.dataset.id;
      const user = allUsersMap.get(uid);
      if (!user) return;
      const roomId = getRoomId(ME.uid, uid);
      startDmWithUser(roomId, uid, user);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// START DM WITH USER
// ═══════════════════════════════════════════════════════════════════════════
async function startDmWithUser(roomId, otherUid, user) {
  upsertDmRoom(otherUid, {
    roomId,
    name:   user.name,
    avatar: user.avatar || "",
    status: user.status || "",
    online: user.online,
  });

  registerDmRoom(roomId).catch(e => console.warn("registerDmRoom bg:", e));

  openRoom(roomId, user.name, user.avatar, false, user, false);
  highlightContact(otherUid);
  mobileChatOpen();
}

function getRoomId(a, b) {
  return [a, b].sort().join("__");
}

// ═══════════════════════════════════════════════════════════════════════════
// OPEN ROOM
// ═══════════════════════════════════════════════════════════════════════════
function openRoom(roomId, name, avatar, isPublic, targetUser = null, isGroup = false, groupData = null) {
  activeRoomId   = roomId;
  activeRoomMeta = { name, isPublic, isGroup, groupData };

  chatEmpty.classList.add("hidden");
  chatView.classList.remove("hidden");
  chatView.style.display = "";

  buildAvatarEl(chAvatar, name, avatar || "");
  chAvatar.style.width  = "42px";
  chAvatar.style.height = "42px";
  chName.textContent    = name;

  if (!isPublic && !isGroup) {
    chAvatar.style.cursor = "pointer";
    chAvatar.title        = "View Profile";
  } else {
    chAvatar.style.cursor = "default";
    chAvatar.title        = "";
  }

  if (isPublic) {
    chStatus.textContent = "Public Room · All users";
    chStatus.className   = "ch-status";
    chPresence.className = "ch-presence online";
  } else if (isGroup) {
    const memberCount    = groupData?.members?.length || 0;
    chStatus.textContent = `${memberCount} members`;
    chStatus.className   = "ch-status";
    chPresence.className = "ch-presence online";
    if (groupSettingsBtn) groupSettingsBtn.classList.toggle("hidden", groupData?.adminUid !== ME?.uid);
  } else {
    const isOnline       = targetUser?.online ?? false;
    chStatus.textContent = isOnline ? "Online" : "Offline";
    chStatus.className   = `ch-status ${isOnline ? "online-status" : "offline-status"}`;
    chPresence.className = `ch-presence ${isOnline ? "online" : "offline"}`;
    if (groupSettingsBtn) groupSettingsBtn.classList.add("hidden");
  }
  if (!isGroup && groupSettingsBtn) groupSettingsBtn.classList.add("hidden");

  if (mdViewProfile) {
    mdViewProfile.classList.toggle("hidden", isPublic || isGroup);
  }

  if (msgUnsub)    msgUnsub();
  if (typingUnsub) typingUnsub();
  messagesArea.innerHTML = "";
  typingRow.classList.add("hidden");
  closeEmojiPanel();
  closeChatSearch();
  closeMoreDropdown();
  updatePinMenuLabel();

  // Stop any ongoing recording when switching rooms
  if (_isRecording) _stopRecording(false);

  listenMessages(roomId);
  listenTyping(roomId);
}

// ═══════════════════════════════════════════════════════════════════════════
// MORE MENU
// ═══════════════════════════════════════════════════════════════════════════
function openMoreDropdown()  { moreDropdown.classList.remove("hidden"); moreDropdownOpen = true; updatePinMenuLabel(); }
function closeMoreDropdown() { moreDropdown?.classList.add("hidden");   moreDropdownOpen = false; }

moreMenuBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  if (moreDropdownOpen) closeMoreDropdown();
  else { closeEmojiPanel(); closeAttachMenu(); openMoreDropdown(); }
});
moreDropdown?.addEventListener("click", (e) => e.stopPropagation());

mdSearch?.addEventListener("click", () => {
  closeMoreDropdown();
  chatSearchBar.classList.remove("hidden");
  chatSearchInput.focus();
});

mdPinChat?.addEventListener("click", () => {
  closeMoreDropdown();
  if (!activeRoomId) return;
  const pinId = activeRoomId === ROOM_GENERAL ? ROOM_GENERAL
    : activeRoomId.includes("__") ? activeRoomId.split("__").find(p => p !== ME.uid) || activeRoomId
    : activeRoomId;
  togglePin(pinId);
});

mdSelectMsg?.addEventListener("click", () => { closeMoreDropdown(); enterSelectMode(); });

mdEditNick?.addEventListener("click", () => {
  closeMoreDropdown();
  if (editNickModalTitle) editNickModalTitle.textContent = "Edit Nickname";
  editNickModal.classList.remove("hidden");
  editNickInput.value       = chName.textContent;
  editNickInput.placeholder = "Enter nickname…";
  editNickInput.focus();
});

mdRenameChat?.addEventListener("click", () => {
  closeMoreDropdown();
  if (editNickModalTitle) editNickModalTitle.textContent = "Rename Chat";
  editNickModal.classList.remove("hidden");
  editNickInput.value       = chName.textContent;
  editNickInput.placeholder = activeRoomMeta.isPublic ? "Rename General Chat…" : "Enter nickname…";
  editNickInput.focus();
});

mdClearChat?.addEventListener("click", async () => {
  closeMoreDropdown();
  if (!activeRoomId) return;
  if (!confirm("Clear all messages in this chat?")) return;
  try {
    const snap = await getDocs(collection(db, "rooms", activeRoomId, "messages"));
    await Promise.all(snap.docs.map(d => updateDoc(d.ref, { text: "", deleted: true, fileData: null })));
    showToast("Chat cleared", "success");
  } catch { showToast("Failed to clear chat", "error"); }
});

mdDeleteChat?.addEventListener("click", async () => {
  closeMoreDropdown();
  if (!activeRoomId) return;
  if (!confirm("Delete this entire chat? This cannot be undone.")) return;
  try {
    const snap = await getDocs(collection(db, "rooms", activeRoomId, "messages"));
    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
    const pinId = activeRoomId === ROOM_GENERAL
      ? ROOM_GENERAL
      : activeRoomId.split("__").find(p => p !== ME.uid);
    pinnedChats.delete(pinId);
    savePinnedChats();

    if (pinId && pinId !== ROOM_GENERAL) removeDmRoom(pinId);

    activeRoomId = null;
    chatView.classList.add("hidden");
    chatEmpty.classList.remove("hidden");
    chatEmpty.style.display = "";
    mobileChatClose();
    renderContactsList();
    showToast("Chat deleted", "success");
  } catch { showToast("Failed to delete chat", "error"); }
});

mdBlock?.addEventListener("click",  () => { closeMoreDropdown(); showToast("Block feature coming soon!", "warning"); });

mdAddFav?.addEventListener("click", () => {
  closeMoreDropdown();
  if (!activeRoomId) return;
  const favId = activeRoomId === ROOM_GENERAL
    ? ROOM_GENERAL
    : activeRoomId.split("__").find(p => p !== ME.uid) || activeRoomId;
  if (favouriteChats.has(favId)) {
    favouriteChats.delete(favId);
    showToast("Removed from favourites", "success");
    if (mdAddFav) mdAddFav.innerHTML = `<i class="ri-star-line"></i> Add to Fav`;
  } else {
    favouriteChats.add(favId);
    showToast("Added to favourites ⭐", "success");
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
  if (activeRoomId === ROOM_GENERAL) {
    localStorage.setItem("nt_general_name", nick);
    renderContactsList();
  }
  editNickModal.classList.add("hidden");
  showToast(`Renamed to "${nick}"`, "success");
});

// ═══════════════════════════════════════════════════════════════════════════
// SELECT MODE
// ═══════════════════════════════════════════════════════════════════════════
function enterSelectMode() {
  selectMode = true; selectedMsgIds.clear();
  messagesArea.classList.add("select-mode");
  selectBar.classList.remove("hidden");
  selectCount.textContent = "0 selected";
  messagesArea.querySelectorAll(".msg-row").forEach(row => row.addEventListener("click", handleSelectClick));
}
function exitSelectMode() {
  selectMode = false; selectedMsgIds.clear();
  messagesArea.classList.remove("select-mode");
  selectBar.classList.add("hidden");
  messagesArea.querySelectorAll(".msg-row").forEach(row => {
    row.classList.remove("msg-selected");
    row.removeEventListener("click", handleSelectClick);
  });
}
function handleSelectClick(e) {
  const row = e.currentTarget, id = row.dataset.id;
  if (selectedMsgIds.has(id)) { selectedMsgIds.delete(id); row.classList.remove("msg-selected"); }
  else                        { selectedMsgIds.add(id);    row.classList.add("msg-selected"); }
  selectCount.textContent = `${selectedMsgIds.size} selected`;
}
selectCancel?.addEventListener("click", exitSelectMode);
selectDelete?.addEventListener("click", async () => {
  if (!selectedMsgIds.size) return;
  if (!confirm(`Delete ${selectedMsgIds.size} message(s)?`)) return;
  for (const id of selectedMsgIds) {
    try { await updateDoc(doc(db, "rooms", activeRoomId, "messages", id), { text: "", deleted: true, fileData: null }); } catch (_) { }
  }
  showToast(`${selectedMsgIds.size} message(s) deleted`, "success");
  exitSelectMode();
});
selectForward?.addEventListener("click", () => { showToast("Forward coming soon!", "warning"); exitSelectMode(); });

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES
// ═══════════════════════════════════════════════════════════════════════════
let lastRenderDate = null;

function listenMessages(roomId) {
  lastRenderDate = null;
  const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
  msgUnsub = onSnapshot(q, (snap) => {
    snap.docChanges().forEach(change => {
      if (change.type === "added") {
        const data = change.doc.data();
        if (data.uid === "system") return;
        renderMessage(data, change.doc.id);
        updateDmRoomPreview(roomId, data);
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

  const lastText = data.type === "image"   ? "📷 Image"
                 : data.type === "file"    ? `📎 ${data.fileName || "File"}`
                 : data.type === "sticker" ? data.text
                 : data.type === "voice"   ? "🎤 Voice message"
                 : (data.text || "");
  const lastTs   = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();

  upsertDmRoom(otherUid, { lastText, lastTs });
}

function renderMessage(data, id) {
  const ts      = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  const isMine  = data.uid === ME?.uid;
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = ts.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (dateStr !== lastRenderDate) {
    lastRenderDate = dateStr;
    const div = document.createElement("div");
    div.className = "date-divider";
    div.innerHTML = `<span>${dateStr}</span>`;
    messagesArea.appendChild(div);
  }

  if (data.type === "sticker") {
    const row   = document.createElement("div");
    row.className = `msg-row ${isMine ? "sent" : "received"}`;
    row.dataset.id = id;
    const color = colorFor(data.name || "?");
    const avHtml = data.avatar
      ? `<img src="${escHtml(data.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
      : (data.name || "?").charAt(0).toUpperCase();
    if (isMine) {
      row.innerHTML = `<div class="msg-col"><div class="msg-sticker">${escHtml(data.text)}</div><div class="msg-meta">${timeStr}</div></div>`;
    } else {
      row.innerHTML = `<div class="msg-av" style="background:${color};">${avHtml}</div><div class="msg-col"><div class="msg-sender-name">${escHtml(data.name || "")}</div><div class="msg-sticker">${escHtml(data.text)}</div><div class="msg-meta">${timeStr}</div></div>`;
    }
    messagesArea.appendChild(row);
    return;
  }

  const row     = document.createElement("div");
  row.className = `msg-row ${isMine ? "sent" : "received"}`;
  row.dataset.id = id;

  const color         = colorFor(data.name || "?");
  const avHtml        = data.avatar
    ? `<img src="${escHtml(data.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
    : (data.name || "?").charAt(0).toUpperCase();
  const bubbleContent = buildBubbleContent(data, timeStr, isMine);
  const canEdit       = isMine && data.type === "text" && !data.deleted && !data.edited;
  const actionsHtml   = isMine && !data.deleted
    ? `<div class="msg-actions">
         ${canEdit ? `<button class="msg-act-btn" data-action="edit" data-id="${id}" title="Edit"><i class="ri-edit-line"></i></button>` : ""}
         <button class="msg-act-btn delete" data-action="delete" data-id="${id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
       </div>` : "";

  if (isMine) {
    row.innerHTML = `${actionsHtml}<div class="msg-col"><div class="bubble">${bubbleContent}</div></div>`;
  } else {
    row.innerHTML = `
      <div class="msg-av" style="background:${color};">${avHtml}</div>
      <div class="msg-col">
        <div class="msg-sender-name">${escHtml(data.name || "Unknown")}</div>
        <div class="bubble">${bubbleContent}</div>
      </div>`;
  }

  if (data.deleted) row.querySelector(".bubble")?.classList.add("deleted-msg");
  messagesArea.appendChild(row);
  bindMsgActions(row, data, id);
}

function buildBubbleContent(data, timeStr, isMine) {
  if (data.deleted) return `<span>🚫 This message was deleted</span><div class="msg-meta">${timeStr}</div>`;
  const editedLabel = data.edited ? `<span class="msg-edited">(edited)</span>` : "";

  if (data.type === "image") {
    const imgSrc  = escHtml(data.fileUrl || data.fileData || "");
    const fileName = escHtml(data.fileName || "image.png");
    if (!imgSrc) return `<span>🖼️ Image unavailable</span><div class="msg-meta">${timeStr}</div>`;
    return `
      <div class="msg-img-wrap">
        <img class="msg-img" src="${imgSrc}" alt="${fileName}" loading="lazy"
             onerror="this.style.opacity='0.4';this.title='Image failed to load';" />
        <a class="msg-img-download" href="${imgSrc}" download="${fileName}" title="Download" target="_blank" onclick="event.stopPropagation()">
          <i class="ri-download-2-line"></i>
        </a>
      </div>
      <div class="msg-meta">${timeStr}${editedLabel}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
  }

  if (data.type === "file") {
    const fileSrc = escHtml(data.fileUrl || data.fileData || "");
    const icon    = getFileIcon(data.fileName || "");
    const sizeStr = formatFileSize(data.fileSize || 0);
    if (!fileSrc) return `<span>📎 File unavailable</span><div class="msg-meta">${timeStr}</div>`;
    return `
      <a class="msg-file" href="${fileSrc}" download="${escHtml(data.fileName || "file")}" target="_blank">
        <i class="${icon}"></i>
        <div class="msg-file-info">
          <div class="msg-file-name">${escHtml(data.fileName || "File")}</div>
          <div class="msg-file-size">${sizeStr}</div>
        </div>
        <span class="msg-file-download" title="Download" onclick="event.stopPropagation()"><i class="ri-download-2-line"></i></span>
      </a>
      <div class="msg-meta">${timeStr}${editedLabel}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
  }

  // ── Voice message bubble ──────────────────────────────────────────────
  if (data.type === "voice") {
    const src      = escHtml(data.fileUrl || "");
    const duration = escHtml(data.duration || "0:00");
    if (!src) return `<span>🎤 Voice message unavailable</span><div class="msg-meta">${timeStr}</div>`;
    return `
      <div class="msg-voice" style="display:flex;align-items:center;gap:10px;min-width:180px;max-width:260px;">
        <button class="voice-play-btn" data-src="${src}" title="Play/Pause"
          style="width:36px;height:36px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0;background:${isMine ? "rgba(255,255,255,0.25)" : "var(--primary-xlight)"};color:${isMine ? "#fff" : "var(--primary)"};transition:background .15s;">
          <i class="ri-play-fill"></i>
        </button>
        <div style="flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;">
          <div class="voice-progress-bar" style="height:3px;background:${isMine ? "rgba(255,255,255,0.3)" : "var(--border)"};border-radius:4px;overflow:hidden;cursor:pointer;">
            <div class="voice-progress-fill" style="height:100%;width:0%;background:${isMine ? "#fff" : "var(--primary)"};border-radius:4px;transition:width .1s;"></div>
          </div>
          <span style="font-size:11px;opacity:.7;">${duration}</span>
        </div>
      </div>
      <div class="msg-meta">${timeStr}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
  }

  return `${escHtml(data.text)}${editedLabel}<div class="msg-meta">${timeStr}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
}

function bindMsgActions(row, data, id) {
  // Voice play button
  const playBtn = row.querySelector(".voice-play-btn");
  if (playBtn) {
    let audio = null;
    let playing = false;
    const progressFill = row.querySelector(".voice-progress-fill");
    const progressBar  = row.querySelector(".voice-progress-bar");

    playBtn.addEventListener("click", () => {
      if (!audio) {
        audio = new Audio(playBtn.dataset.src);
        audio.addEventListener("timeupdate", () => {
          if (audio.duration && progressFill) {
            progressFill.style.width = ((audio.currentTime / audio.duration) * 100) + "%";
          }
        });
        audio.addEventListener("ended", () => {
          playing = false;
          playBtn.innerHTML = `<i class="ri-play-fill"></i>`;
          if (progressFill) progressFill.style.width = "0%";
        });
      }
      if (playing) {
        audio.pause();
        playing = false;
        playBtn.innerHTML = `<i class="ri-play-fill"></i>`;
      } else {
        audio.play();
        playing = true;
        playBtn.innerHTML = `<i class="ri-pause-fill"></i>`;
      }
    });

    progressBar?.addEventListener("click", (e) => {
      if (!audio || !audio.duration) return;
      const rect = progressBar.getBoundingClientRect();
      const pct  = (e.clientX - rect.left) / rect.width;
      audio.currentTime = pct * audio.duration;
    });
  }

  // Text / file edit-delete actions
  row.querySelectorAll(".msg-act-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "edit") {
        if (data.edited) { showToast("Messages can only be edited once", "warning"); return; }
        openEditModal(id, data.text);
      }
      if (action === "delete") confirmDeleteMsg(id);
    });
  });
}

function updateRenderedMessage(data, id) {
  const row    = messagesArea.querySelector(`.msg-row[data-id="${id}"]`);
  if (!row) return;
  const bubble = row.querySelector(".bubble");
  if (!bubble) return;
  const isMine = data.uid === ME?.uid;
  const ts     = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  bubble.innerHTML = buildBubbleContent(data, timeStr, isMine);
  if (data.deleted) bubble.classList.add("deleted-msg"); else bubble.classList.remove("deleted-msg");
  if (data.edited || data.deleted) row.querySelector('.msg-act-btn[data-action="edit"]')?.remove();
}

function removeRenderedMessage(id) { messagesArea.querySelector(`.msg-row[data-id="${id}"]`)?.remove(); }

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════════════════════════════════════════
let editingMsgId = null;

function openEditModal(id, currentText) {
  editingMsgId       = id;
  editMsgInput.value = currentText;
  editMsgModal.classList.remove("hidden");
  editMsgInput.focus();
}
function closeEditModal() { editMsgModal.classList.add("hidden"); editingMsgId = null; }

editMsgClose?.addEventListener("click",   closeEditModal);
editMsgCancel?.addEventListener("click",  closeEditModal);
editMsgSave?.addEventListener("click", async () => {
  const newText = editMsgInput.value.trim();
  if (!newText || !editingMsgId || !activeRoomId) return;
  try {
    await updateDoc(doc(db, "rooms", activeRoomId, "messages", editingMsgId), { text: newText, edited: true });
    showToast("Message edited ✏️", "success");
  } catch { showToast("Edit failed", "error"); }
  closeEditModal();
});
editMsgModal?.addEventListener("click", (e) => { if (e.target === editMsgModal) closeEditModal(); });

async function confirmDeleteMsg(id) {
  if (!confirm("Delete this message?")) return;
  try {
    await updateDoc(doc(db, "rooms", activeRoomId, "messages", id), {
      text: "", deleted: true, fileData: null, fileUrl: null,
    });
    showToast("Message deleted", "success");
  } catch { showToast("Delete failed", "error"); }
}

// ═══════════════════════════════════════════════════════════════════════════
// SEND TEXT
// ═══════════════════════════════════════════════════════════════════════════
async function sendMessage() {
  if (!ME || !activeRoomId) return;
  const text = msgInput.value.trim();
  if (!text) return;
  msgInput.value = "";
  clearMyTyping();
  try {
    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar,
      text, type: "text", deleted: false, edited: false, createdAt: serverTimestamp(),
    });
    if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__")) {
      registerDmRoom(activeRoomId).catch(() => { });
    }
  } catch (err) {
    showToast("Failed to send message: " + err.message, "error");
  }
}
sendBtn?.addEventListener("click", sendMessage);
msgInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ═══════════════════════════════════════════════════════════════════════════
// SEND FILE
// ═══════════════════════════════════════════════════════════════════════════
async function sendFile(file, msgType) {
  if (!ME || !activeRoomId || !file) return;
  if (file.size > 10 * 1024 * 1024) { showToast("File too large. Max 10 MB allowed.", "warning"); return; }

  showToast("Uploading…", "success");
  try {
    const uniqueName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    const filePath   = `rooms/${activeRoomId}/${ME.uid}/${uniqueName}`;
    const fileRef    = storageRef(storage, filePath);
    const snapshot   = await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);

    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
      uid: ME.uid, name: ME.name, avatar: ME.avatar,
      text:        file.name,
      type:        msgType === "image" ? "image" : "file",
      fileName:    file.name,
      fileSize:    file.size,
      fileUrl:     downloadURL,
      fileData:    null,
      storagePath: filePath,
      deleted:     false,
      edited:      false,
      createdAt:   serverTimestamp(),
    });

    if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__")) {
      registerDmRoom(activeRoomId).catch(() => { });
    }
    showToast("File sent! ✓", "success");
  } catch (err) {
    console.error("File upload error:", err);
    showToast("Upload failed: " + err.message, "error");
  }
}

imgFileInput?.addEventListener("change", () => { if (imgFileInput.files[0]) sendFile(imgFileInput.files[0], "image"); imgFileInput.value = ""; closeAttachMenu(); });
docFileInput?.addEventListener("change", () => { if (docFileInput.files[0]) sendFile(docFileInput.files[0], "file");  docFileInput.value = ""; closeAttachMenu(); });
anyFileInput?.addEventListener("change", () => { if (anyFileInput.files[0]) sendFile(anyFileInput.files[0], "file");  anyFileInput.value = ""; closeAttachMenu(); });

// ═══════════════════════════════════════════════════════════════════════════
// ATTACH MENU
// ═══════════════════════════════════════════════════════════════════════════
attachBtn?.addEventListener("click", (e) => { e.stopPropagation(); attachMenu.classList.toggle("hidden"); closeEmojiPanel(); closeMoreDropdown(); });
function closeAttachMenu() { attachMenu?.classList.add("hidden"); }
document.addEventListener("click", closeAttachMenu);
attachMenu?.addEventListener("click", (e) => e.stopPropagation());

// ═══════════════════════════════════════════════════════════════════════════
// TYPING
// ═══════════════════════════════════════════════════════════════════════════
msgInput?.addEventListener("input", async () => {
  if (!ME || !activeRoomId) return;
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
  try { await deleteDoc(doc(db, "rooms", activeRoomId, "typing", ME.uid)); } catch (_) { }
}

function listenTyping(roomId) {
  typingUnsub = onSnapshot(collection(db, "rooms", roomId, "typing"), (snap) => {
    const others = snap.docs.filter(d => d.id !== ME?.uid).map(d => d.data());
    if (others.length) {
      const t = others[0];
      buildAvatarEl(typingAv, t.name, t.avatar || "");
      typingAv.style.background = colorFor(t.name);
      typingAv.style.width      = "26px";
      typingAv.style.height     = "26px";
      typingRow.classList.remove("hidden");
      chStatus.textContent = `${t.name} is typing…`;
      chStatus.className   = "ch-status typing";
    } else {
      typingRow.classList.add("hidden");
      if (activeRoomMeta.isPublic) {
        chStatus.textContent = "Public Room · All users"; chStatus.className = "ch-status";
      } else if (activeRoomMeta.isGroup) {
        chStatus.textContent = `${activeRoomMeta.groupData?.members?.length || 0} members`; chStatus.className = "ch-status";
      } else {
        const other = getAllPresenceUsers().find(u => u.uid !== ME?.uid && getRoomId(ME.uid, u.uid) === activeRoomId);
        if (other) { chStatus.textContent = other.online ? "Online" : "Offline"; chStatus.className = `ch-status ${other.online ? "online-status" : "offline-status"}`; }
      }
    }
    scrollBottom();
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// EMOJI / STICKER PANEL
// ═══════════════════════════════════════════════════════════════════════════
emojiToggleBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  emojiPanel.classList.contains("hidden")
    ? (openEmojiPanel(), closeAttachMenu(), closeMoreDropdown())
    : closeEmojiPanel();
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
  closeEmojiPanel();
  await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
    uid: ME.uid, name: ME.name, avatar: ME.avatar,
    text: sticker, type: "sticker", deleted: false, createdAt: serverTimestamp(),
  });
  if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__")) {
    registerDmRoom(activeRoomId).catch(() => { });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VOICE / MIC RECORDING
// ═══════════════════════════════════════════════════════════════════════════
function _fmtRecTime(s) {
  return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
}

function _showRecordingUI() {
  // Hide text input, show waveform
  if (msgInput) {
    msgInput.style.opacity       = "0";
    msgInput.style.pointerEvents = "none";
    msgInput.style.width         = "0";
    msgInput.style.flex          = "0";
    msgInput.style.padding       = "0";
  }
  waveformWrap?.classList.add("active");
  recTimerEl?.classList.add("active");
  micBtn?.classList.add("recording");
  if (micIcon) micIcon.className = "ri-stop-circle-line";
  micBtn?.setAttribute("aria-label", "Stop recording");
  if (recTimeEl) recTimeEl.textContent = "0:00";
}

function _hideRecordingUI() {
  if (msgInput) {
    msgInput.style.opacity       = "1";
    msgInput.style.pointerEvents = "";
    msgInput.style.width         = "";
    msgInput.style.flex          = "1";
    msgInput.style.padding       = "";
  }
  waveformWrap?.classList.remove("active");
  recTimerEl?.classList.remove("active");
  micBtn?.classList.remove("recording");
  if (micIcon) micIcon.className = "ri-mic-line";
  micBtn?.setAttribute("aria-label", "Record voice message");
}

async function _startRecording() {
  if (!ME || !activeRoomId) { showToast("Please open a chat first", "warning"); return; }

  // Check browser support
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast("Microphone not supported on this browser", "warning");
    return;
  }

  try {
    _recStream    = await navigator.mediaDevices.getUserMedia({ audio: true });
    _audioChunks  = [];
    _mediaRecorder = new MediaRecorder(_recStream);

    _mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) _audioChunks.push(e.data);
    };

    _mediaRecorder.onstop = async () => {
      const blob = new Blob(_audioChunks, { type: "audio/webm" });
      _audioChunks = [];
      _recStream?.getTracks().forEach(t => t.stop());
      _recStream = null;
      const duration = _fmtRecTime(_recSeconds);
      await _uploadAndSendVoice(blob, duration);
    };

    _mediaRecorder.start(200); // collect every 200ms
    _isRecording = true;
    _recSeconds  = 0;
    _showRecordingUI();

    _recInterval = setInterval(() => {
      _recSeconds++;
      if (recTimeEl) recTimeEl.textContent = _fmtRecTime(_recSeconds);
      if (_recSeconds >= 120) _stopRecording(true); // auto-stop at 2 min
    }, 1000);

  } catch (err) {
    console.error("Mic error:", err);
    if (err.name === "NotAllowedError") {
      showToast("Microphone permission denied. Please allow it in browser settings.", "warning");
    } else {
      showToast("Could not access microphone: " + err.message, "error");
    }
  }
}

function _stopRecording(send) {
  if (!_isRecording) return;
  _isRecording = false;
  clearInterval(_recInterval);
  _hideRecordingUI();

  if (send && _mediaRecorder && _mediaRecorder.state !== "inactive") {
    _mediaRecorder.stop(); // triggers onstop → uploads
  } else {
    // Cancel: discard audio
    _audioChunks = [];
    _recStream?.getTracks().forEach(t => t.stop());
    _recStream     = null;
    _mediaRecorder = null;
    showToast("Recording cancelled", "success");
  }
}

async function _uploadAndSendVoice(blob, duration) {
  if (!ME || !activeRoomId) return;
  showToast("Sending voice message…", "success");
  try {
    const fileName   = `voice_${Date.now()}.webm`;
    const filePath   = `rooms/${activeRoomId}/${ME.uid}/${fileName}`;
    const fileRef    = storageRef(storage, filePath);
    const snapshot   = await uploadBytes(fileRef, blob);
    const downloadURL = await getDownloadURL(snapshot.ref);

    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
      uid:         ME.uid,
      name:        ME.name,
      avatar:      ME.avatar,
      text:        "Voice message",
      type:        "voice",
      fileUrl:     downloadURL,
      fileName,
      fileSize:    blob.size,
      storagePath: filePath,
      duration,
      deleted:     false,
      edited:      false,
      createdAt:   serverTimestamp(),
    });

    if (activeRoomId !== ROOM_GENERAL && !activeRoomId.startsWith("group__")) {
      registerDmRoom(activeRoomId).catch(() => {});
    }
    showToast(`Voice message sent (${duration}) 🎤`, "success");
  } catch (err) {
    console.error("Voice upload error:", err);
    showToast("Failed to send voice message: " + err.message, "error");
  }
}

function initMicButton() {
  if (!micBtn) return;

  micBtn.addEventListener("click", () => {
    if (!_isRecording) _startRecording();
    else               _stopRecording(true);
  });

  // Mobile: swipe left on mic button to cancel
  let _touchStartX = 0;
  micBtn.addEventListener("touchstart", (e) => {
    _touchStartX = e.touches[0].clientX;
  }, { passive: true });

  micBtn.addEventListener("touchmove", (e) => {
    if (!_isRecording) return;
    const dx = e.touches[0].clientX - _touchStartX;
    if (dx < -60) _stopRecording(false); // cancel
  }, { passive: true });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT LIST SEARCH
// ═══════════════════════════════════════════════════════════════════════════
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
  const results       = [];
  const roomsToSearch = [{ roomId: ROOM_GENERAL, name: getGeneralChatName() }];

  getAllPresenceUsers().filter(u => u.uid !== ME.uid).forEach(u =>
    roomsToSearch.push({ roomId: getRoomId(ME.uid, u.uid), name: u.name })
  );
  allDmRooms().forEach(r => {
    if (!roomsToSearch.find(x => x.roomId === r.roomId)) {
      roomsToSearch.push({ roomId: r.roomId, name: r.name });
    }
  });
  allGroups.forEach(g => roomsToSearch.push({ roomId: `group__${g.id}`, name: g.name }));

  for (const room of roomsToSearch) {
    try {
      const snap = await getDocs(query(collection(db, "rooms", room.roomId, "messages"), orderBy("createdAt", "desc")));
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.uid === "system") return;
        if (data.type === "text" && !data.deleted && data.text.toLowerCase().includes(q)) {
          const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
          results.push({ roomId: room.roomId, roomName: room.name, msgId: d.id, text: data.text, senderName: data.name, ts });
        }
      });
    } catch (_) { }
  }

  if (!results.length) {
    searchResultsList.innerHTML = `<li class="search-no-result">No messages found for "${escHtml(q)}"</li>`;
    return;
  }

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

  const roomsMap = Object.fromEntries(roomsToSearch.map(r => [r.roomId, r]));
  searchResultsList.querySelectorAll(".search-result-msg").forEach(el => {
    el.addEventListener("click", () => {
      const roomId = el.dataset.room, msgId = el.dataset.msg;
      const room   = roomsMap[roomId];
      if (!room) return;
      const targetUser = getAllPresenceUsers().find(u => getRoomId(ME.uid, u.uid) === roomId);
      const isPublic   = roomId === ROOM_GENERAL;
      const isGroup    = roomId.startsWith("group__");
      const grpData    = isGroup ? allGroups.find(g => `group__${g.id}` === roomId) : null;
      openRoom(roomId, room.name, targetUser?.avatar || null, isPublic, targetUser || null, isGroup, grpData);
      highlightContact(targetUser?.uid || ROOM_GENERAL);
      mobileChatOpen();
      searchInput.value = "";
      searchResultsList.classList.add("hidden");
      normalChatLists.classList.remove("hidden");
      searchClearBtn.classList.add("hidden");
      setTimeout(() => scrollToMsg(msgId), 1200);
    });
  });
}

function scrollToMsg(msgId) {
  const el = messagesArea.querySelector(`.msg-row[data-id="${msgId}"]`);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("search-highlight");
    setTimeout(() => el.classList.remove("search-highlight"), 2500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IN-CHAT SEARCH
// ═══════════════════════════════════════════════════════════════════════════
chatSearchBtn?.addEventListener("click", () => {
  chatSearchBar.classList.toggle("hidden");
  if (!chatSearchBar.classList.contains("hidden")) chatSearchInput.focus();
  else closeChatSearch();
});
chatSearchClose?.addEventListener("click", closeChatSearch);

chatSearchInput?.addEventListener("input", () => {
  const q = chatSearchInput.value.trim().toLowerCase();
  clearSearchHighlights();
  if (!q) { chatSearchCount.textContent = ""; searchMatches = []; searchCurrentIdx = -1; return; }
  searchMatches = [];
  messagesArea.querySelectorAll(".msg-row").forEach(row => {
    const text = row.querySelector(".bubble")?.textContent?.toLowerCase() || "";
    if (text.includes(q)) searchMatches.push(row);
  });
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
  if (chatSearchInput)  chatSearchInput.value    = "";
  if (chatSearchCount)  chatSearchCount.textContent = "";
  clearSearchHighlights();
  searchMatches = []; searchCurrentIdx = -1;
}
function clearSearchHighlights()  { messagesArea.querySelectorAll(".search-highlight, .search-current").forEach(el => el.classList.remove("search-highlight", "search-current")); }
function highlightSearchMatches() { searchMatches.forEach(row => row.classList.add("search-highlight")); }
function jumpToSearchResult(idx) {
  messagesArea.querySelectorAll(".search-current").forEach(el => el.classList.remove("search-current"));
  if (searchMatches[idx]) { searchMatches[idx].classList.add("search-current"); searchMatches[idx].scrollIntoView({ behavior: "smooth", block: "center" }); }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW CHAT MODAL
// ═══════════════════════════════════════════════════════════════════════════
newChatBtn?.addEventListener("click",       (e) => { e.stopPropagation(); openNewChatModal(); });
newChatModalClose?.addEventListener("click", () => newChatModal.classList.add("hidden"));
newChatModal?.addEventListener("click",      (e) => { if (e.target === newChatModal) newChatModal.classList.add("hidden"); });

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
    const av    = u.avatar
      ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
      : u.name.charAt(0).toUpperCase();
    return `
      <li class="modal-user-item" data-uid="${u.uid}">
        <div class="modal-user-av" style="background:${color};">${av}
          <div class="modal-online-dot ${u.online ? "online" : "offline"}"></div>
        </div>
        <div class="modal-user-info">
          <div class="modal-user-name">${escHtml(u.name)}</div>
          <div class="modal-user-status">${escHtml(u.status || "")}</div>
        </div>
        <span class="modal-user-badge ${u.online ? "online" : "offline"}">${u.online ? "● Online" : "○ Offline"}</span>
      </li>`;
  }).join("");

  newChatUserList.querySelectorAll(".modal-user-item").forEach(el => {
    el.addEventListener("click", () => {
      const uid  = el.dataset.uid;
      const user = presenceUsersMap.get(uid);
      if (!user) return;
      const roomId = getRoomId(ME.uid, uid);
      newChatModal.classList.add("hidden");
      startDmWithUser(roomId, uid, user);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function getFileIcon(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  if (ext === "pdf")                          return "ri-file-pdf-line";
  if (["doc","docx"].includes(ext))           return "ri-file-word-line";
  if (["xls","xlsx"].includes(ext))           return "ri-file-excel-line";
  if (["ppt","pptx"].includes(ext))           return "ri-file-ppt-line";
  if (ext === "txt")                          return "ri-file-text-line";
  if (["zip","rar","7z"].includes(ext))       return "ri-file-zip-line";
  if (["mp4","mov","avi"].includes(ext))      return "ri-video-line";
  if (["mp3","wav","ogg"].includes(ext))      return "ri-music-line";
  return "ri-file-line";
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024)           return bytes + " B";
  if (bytes < 1024 * 1024)   return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function scrollBottom() {
  requestAnimationFrame(() => { if (messagesArea) messagesArea.scrollTop = messagesArea.scrollHeight; });
}

window.copyRoomLink = function () {
  navigator.clipboard.writeText(window.location.href).then(() => showToast("Room link copied!", "success"));
};
