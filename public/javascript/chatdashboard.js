// ═══════════════════════════════════════════════════════════════════════════
// chatdashboard.js — NexTalk  (FIX 1: mobile sidebar profile | FIX 2: real groups | FIX 3: presence)
// ═══════════════════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    collection, doc,
    addDoc, setDoc, updateDoc, deleteDoc, getDoc,
    onSnapshot,
    query, orderBy, serverTimestamp,
    where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─── Firebase Config ──────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyCJea9IVCNXyeUKCpO_Jhbg-s-PeGoWyDc",
    authDomain: "nextalk-34dad.firebaseapp.com",
    projectId: "nextalk-34dad",
    storageBucket: "nextalk-34dad.firebasestorage.app",
    messagingSenderId: "730298460453",
    appId: "1:730298460453:web:c69d16bd96e14876a4d2cc"
};

const fbApp = initializeApp(firebaseConfig);
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);

// ─── State ────────────────────────────────────────────────────────────────────
let ME = null;
let activeRoomId = null;
let activeRoomMeta = { name: "", isPublic: false, isGroup: false, groupData: null };
let msgUnsub = null;
let typingUnsub = null;
let presenceUnsub = null;
let groupsUnsub = null;
let typingTimer = null;
let lastTypingSent = 0;
let currentEmojiTab = "emoji";
let allPresenceUsers = [];
let pinnedChats = new Set();
let ctxMsgId = null;
let ctxMsgData = null;
let searchMatches = [];
let searchCurrentIdx = -1;
let moreDropdownOpen = false;
let selectMode = false;
let selectedMsgIds = new Set();
let favouriteChats = new Set();

// Group create state
let groupSelectedMembers = new Map(); // uid -> user object
let selectedGroupIcon = "💬";

// FIX 3: Track presence locally — only mark online when truly connected
// We'll use serverTimestamp + a 60s threshold to decide "truly online"

const ROOM_GENERAL = "general";
const COLORS = ["#008080", "#0e9f6e", "#0ea5e9", "#7c3aed", "#db2777", "#ea580c", "#0891b2"];

function colorFor(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
    return COLORS[Math.abs(h) % COLORS.length];
}

// ─── Emoji & Sticker Data ─────────────────────────────────────────────────────
const EMOJIS = [
    "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
    "😘", "😗", "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐",
    "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒",
    "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "🤯", "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕",
    "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱",
    "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩",
    "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "😺", "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾",
    "👋", "🤚", "🖐", "✋", "🖖", "👌", "🤌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆",
    "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "🫶", "👐", "🤲", "🤝", "🙏", "💪",
    "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
    "💘", "💝", "💟", "☮️", "✝️", "☯️", "🔥", "⚡", "🌈", "⭐", "🌟", "💫", "✨", "🎉", "🎊", "🎈"
];

const STICKERS = [
    "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🙈",
    "🙉", "🙊", "🐔", "🐧", "🐦", "🐤", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛",
    "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐",
    "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🦣",
    "🌸", "🌺", "🌻", "🌹", "🌷", "🌼", "💐", "🍀", "🌿", "🌱", "🌲", "🌳", "🌴", "🍁", "🍂", "🍃",
    "🍎", "🍊", "🍋", "🍇", "🍓", "🫐", "🍈", "🍑", "🍒", "🥝", "🍅", "🥥", "🥦", "🌽", "🍕", "🍔",
    "🌮", "🍜", "🍣", "🍩", "🎂", "🍦", "☕", "🧋", "🍺", "🎮", "⚽", "🏀", "🎸", "🎵", "🎨", "🚀"
];

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const sidebarAvatar = $("sidebarAvatar");
const totalUnreadBadge = $("totalUnread");
const onlineStrip = $("onlineStrip");
const pinnedList = $("pinnedList");
const allChatList = $("allChatList");
const chatEmpty = $("chatEmpty");
const chatView = $("chatView");
const chAvatar = $("chAvatar");
const chPresence = $("chPresence");
const chName = $("chName");
const chStatus = $("chStatus");
const messagesArea = $("messagesArea");
const typingRow = $("typingRow");
const typingAv = $("typingAv");
const msgInput = $("msgInput");
const sendBtn = $("sendBtn");
const ipAvatar = $("ipAvatar");
const ipName = $("ipName");
const ipStatus = $("ipStatus");
const ipOnlineList = $("ipOnlineList");
const ipGroupMembersSection = $("ipGroupMembersSection");
const ipGroupMembersList = $("ipGroupMembersList");
const shareUrl = $("shareUrl");
const toastContainer = $("toastContainer");
const themeToggleBtn = $("themeToggleBtn");
const themeIcon = $("themeIcon");
const avatarWrap = $("avatarWrap");
const profileDropdown = $("profileDropdown");
const pdUser = $("pdUser");
const pdLogout = $("pdLogout");
const attachBtn = $("attachBtn");
const attachMenu = $("attachMenu");
const imgFileInput = $("imgFileInput");
const docFileInput = $("docFileInput");
const anyFileInput = $("anyFileInput");
const emojiToggleBtn = $("emojiToggleBtn");
const emojiPanel = $("emojiPanel");
const emojiContent = $("emojiContent");
const searchInput = $("searchInput");
const searchClearBtn = $("searchClearBtn");
const searchResultsList = $("searchResultsList");
const normalChatLists = $("normalChatLists");
const chatSearchBtn = $("chatSearchBtn");
const chatSearchBar = $("chatSearchBar");
const chatSearchInput = $("chatSearchInput");
const chatSearchCount = $("chatSearchCount");
const chatSearchPrev = $("chatSearchPrev");
const chatSearchNext = $("chatSearchNext");
const chatSearchClose = $("chatSearchClose");
const newChatBtn = $("newChatBtn");
const newChatModal = $("newChatModal");
const newChatModalClose = $("newChatModalClose");
const newChatSearch = $("newChatSearch");
const newChatUserList = $("newChatUserList");
const msgCtxMenu = $("msgCtxMenu");
const ctxEdit = $("ctxEdit");
const ctxDelete = $("ctxDelete");
const editMsgModal = $("editMsgModal");
const editMsgClose = $("editMsgClose");
const editMsgCancel = $("editMsgCancel");
const editMsgSave = $("editMsgSave");
const editMsgInput = $("editMsgInput");
const moreMenuBtn = $("moreMenuBtn");
const moreDropdown = $("moreDropdown");
const mdSearch = $("mdSearch");
const mdSelectMsg = $("mdSelectMsg");
const mdPinChat = $("mdPinChat");
const mdEditNick = $("mdEditNick");
const mdClearChat = $("mdClearChat");
const mdDeleteChat = $("mdDeleteChat");
const mdBlock = $("mdBlock");
const mdAddFav = $("mdAddFav");
const editNickModal = $("editNickModal");
const editNickClose = $("editNickClose");
const editNickCancel = $("editNickCancel");
const editNickSave = $("editNickSave");
const editNickInput = $("editNickInput");
const selectBar = $("selectBar");
const selectCancel = $("selectCancel");
const selectCount = $("selectCount");
const selectDelete = $("selectDelete");
const selectForward = $("selectForward");
const groupSettingsBtn = $("groupSettingsBtn");
const groupSettingsModal = $("groupSettingsModal");
const groupSettingsModalClose = $("groupSettingsModalClose");
const groupSettingsCancel = $("groupSettingsCancel");
const groupSettingsSave = $("groupSettingsSave");
const gsGroupName = $("gsGroupName");
const gsGroupMembersList = $("gsGroupMembersList");
const gsAddMemberSearch = $("gsAddMemberSearch");
const gsAddMemberList = $("gsAddMemberList");
const gsDeleteGroup = $("gsDeleteGroup");

// Responsive
const sidebar = $("sidebar");
const sidebarOverlay = $("sidebarOverlay");
const sidebarCloseBtn = $("sidebarCloseBtn");
const mobileMenuBtn = $("mobileMenuBtn");
const mobileNewChatBtn = $("mobileNewChatBtn");
const chatBackBtn = $("chatBackBtn");
const infoPanel = $("infoPanel");
const infoPanelOverlay = $("infoPanelOverlay");
const infoPanelCloseBtn = $("infoPanelCloseBtn");
const infoPanelToggleBtn = $("infoPanelToggleBtn");

// Groups panel
const groupsNavItem = $("groupsNavItem");
const groupsPanel = $("groupsPanel");
const groupsPanelClose = $("groupsPanelClose");
const groupsPanelOverlay = $("groupsPanelOverlay");
const groupsList = $("groupsList");
const createGroupBtn = $("createGroupBtn");
const createGroupModal = $("createGroupModal");
const createGroupModalClose = $("createGroupModalClose");
const createGroupCancel = $("createGroupCancel");
const createGroupSave = $("createGroupSave");
const groupNameInput = $("groupNameInput");
const groupDescInput = $("groupDescInput");
const groupIconPicker = $("groupIconPicker");
const groupMemberSearch = $("groupMemberSearch");
const groupMemberList = $("groupMemberList");
const selectedMembersWrap = $("selectedMembersWrap");

// ═══════════════════════════════════════════════════════════════════════════
// RESPONSIVE helpers
// ═══════════════════════════════════════════════════════════════════════════
function openSidebar() {
    sidebar?.classList.add("open");
    sidebarOverlay?.classList.add("active");
}

function closeSidebar() {
    sidebar?.classList.remove("open");
    sidebarOverlay?.classList.remove("active");
}

mobileMenuBtn?.addEventListener("click", openSidebar);
sidebarCloseBtn?.addEventListener("click", closeSidebar);
sidebarOverlay?.addEventListener("click", closeSidebar);

mobileNewChatBtn?.addEventListener("click", () => {
    closeSidebar();
    openNewChatModal();
});

function mobileChatOpen() {
    if (window.innerWidth <= 768) {
        document.body.classList.add("chat-active");
        closeSidebar();
        closeGroupsPanel();
    }
}

function mobileChatClose() {
    document.body.classList.remove("chat-active");
}

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

let _lastW = window.innerWidth;
window.addEventListener("resize", () => {
    const w = window.innerWidth;
    if (w > 768 && _lastW <= 768) {
        closeSidebar();
        mobileChatClose();
        closeInfoPanel();
        closeGroupsPanel();
    }
    if (w > 1024) closeInfoPanel();
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

// ─── Pinned Chats ─────────────────────────────────────────────────────────
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
    if (pinnedChats.has(id)) {
        pinnedChats.delete(id);
        showToast("Chat unpinned", "success");
    } else {
        pinnedChats.add(id);
        showToast("Chat pinned 📌", "success");
    }
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
    themeIcon.className = theme === "dark" ? "ri-sun-line" : "ri-moon-line";
    localStorage.setItem("nt_theme", theme);
}

themeToggleBtn.addEventListener("click", () => {
    applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
applyTheme(localStorage.getItem("nt_theme") || "light");

// ═══════════════════════════════════════════════════════════════════════════
// PROFILE DROPDOWN
// ═══════════════════════════════════════════════════════════════════════════
avatarWrap.addEventListener("click", e => {
    e.stopPropagation();
    profileDropdown.classList.toggle("open");
});
document.addEventListener("click", () => {
    profileDropdown.classList.remove("open");
    closeMoreDropdown();
});
profileDropdown.addEventListener("click", e => e.stopPropagation());

// ═══════════════════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════════════════
pdLogout.addEventListener("click", async () => {
    await setPresence(false);
    await signOut(auth);
    window.location.href = "./authentication.html";
});

// ═══════════════════════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════════════════════
onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = "./authentication.html"; return; }
    const profile = loadMyProfile(user.uid);
    if (!profile || !profile.setupDone) { window.location.href = "./profile-setup.html"; return; }
    ME = {
        uid: user.uid, name: profile.name,
        avatar: profile.avatar || "",
        status: profile.status || "Hey there! I'm using NexTalk",
        email: user.email
    };
    pinnedChats = loadPinnedChats(user.uid);
    init();
});

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
async function init() {
    buildAvatarEl(sidebarAvatar, ME.name, ME.avatar);
    pdUser.textContent = ME.name;
    shareUrl.textContent = window.location.href;

    // FIX 1: Set data-name on avatarWrap so CSS ::after shows username in mobile footer
    avatarWrap.setAttribute("data-name", ME.name);

    await setPresence(true);
    // FIX 3: Mark offline on page unload/hide
    window.addEventListener("beforeunload", () => setPresence(false));
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") setPresence(false);
        else setPresence(true);
    });

    renderContactsList();
    listenPresence();
    listenGroups();
    openRoom(ROOM_GENERAL, "General Chat", null, true, null, false);
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 3: PRESENCE — accurate online/offline
// The key fix: only consider a user "online" if their presence doc has
// online=true AND their lastSeen was within the last 90 seconds.
// This prevents stale "online" records from ghost-showing users as online.
// ═══════════════════════════════════════════════════════════════════════════
async function setPresence(online) {
    if (!ME) return;
    try {
        await setDoc(doc(db, "presence", ME.uid), {
            uid: ME.uid, name: ME.name, avatar: ME.avatar,
            status: ME.status, online, lastSeen: serverTimestamp()
        });
    } catch (_) { }
}

// FIX 3: Heartbeat — keep presence fresh while active
let presenceHeartbeat = null;

function startPresenceHeartbeat() {
    stopPresenceHeartbeat();
    presenceHeartbeat = setInterval(() => {
        if (document.visibilityState !== "hidden") setPresence(true);
    }, 30000); // every 30s
}

function stopPresenceHeartbeat() {
    if (presenceHeartbeat) { clearInterval(presenceHeartbeat); presenceHeartbeat = null; }
}

// FIX 3: Determine if a presence record is truly online.
// online flag must be true AND lastSeen must be within 90 seconds.
function isTrulyOnline(presenceData) {
    if (!presenceData.online) return false;
    if (!presenceData.lastSeen) return false;
    const lastSeenDate = presenceData.lastSeen.toDate ? presenceData.lastSeen.toDate() : new Date(presenceData.lastSeen);
    const diffSeconds = (Date.now() - lastSeenDate.getTime()) / 1000;
    return diffSeconds < 90; // 90s threshold — heartbeat is every 30s so 3 missed = offline
}

function listenPresence() {
    presenceUnsub = onSnapshot(collection(db, "presence"), snap => {
        const rawUsers = snap.docs.map(d => d.data());

        // Deduplicate by UID — prefer online record
        const uidMap = new Map();
        rawUsers.forEach(u => {
            if (!uidMap.has(u.uid)) {
                uidMap.set(u.uid, u);
            } else {
                // FIX 3: Prefer truly online record over stale
                const existing = uidMap.get(u.uid);
                const uOnline = isTrulyOnline(u);
                const existingOnline = isTrulyOnline(existing);
                if (uOnline && !existingOnline) uidMap.set(u.uid, u);
            }
        });

        // FIX 3: Apply the isTrulyOnline check to the .online field
        allPresenceUsers = Array.from(uidMap.values()).map(u => ({
            ...u,
            online: isTrulyOnline(u) // override stale online=true
        }));

        const onlineUsers = allPresenceUsers.filter(u => u.online);
        renderOnlineStrip(onlineUsers);
        renderOnlinePanel(allPresenceUsers);

        // Update active DM chat header presence
        if (activeRoomId && activeRoomId !== ROOM_GENERAL && !activeRoomMeta.isGroup) {
            const otherUser = allPresenceUsers.find(
                u => u.uid !== ME?.uid && getRoomId(ME.uid, u.uid) === activeRoomId
            );
            if (otherUser) updateChatHeaderPresence(otherUser);
        }
    });
}

function updateChatHeaderPresence(user) {
    const isOnline = user.online;
    chPresence.className = `ch-presence ${isOnline ? "online" : "offline"}`;
    if (!chStatus.classList.contains("typing")) {
        chStatus.textContent = isOnline ? "Online" : "Offline";
        chStatus.className = `ch-status ${isOnline ? "online-status" : "offline-status"}`;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// FIX 2: GROUPS — Real Firestore-backed groups with admin control
// Schema: groups/{groupId} = { name, desc, icon, adminUid, members: [uid,...], createdAt }
// ═══════════════════════════════════════════════════════════════════════════

let allGroups = []; // live list of groups from Firestore

function listenGroups() {
    // Listen to groups where current user is a member
    // We query all groups and filter client-side (simple approach)
    groupsUnsub = onSnapshot(collection(db, "groups"), snap => {
        allGroups = snap.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(g => g.members && g.members.includes(ME?.uid));
        renderGroupsList();
    });
}

function openGroupsPanel() {
    groupsPanel?.classList.add("open");
    groupsPanelOverlay?.classList.add("active");
    renderGroupsList();
}

function closeGroupsPanel() {
    groupsPanel?.classList.remove("open");
    groupsPanelOverlay?.classList.remove("active");
}

function renderGroupsList() {
    if (!groupsList) return;
    if (!allGroups.length) {
        groupsList.innerHTML = `
            <li class="groups-empty">
                <i class="ri-team-line"></i>
                No groups yet.<br>Tap <b>+</b> to create one.
            </li>`;
        return;
    }
    groupsList.innerHTML = allGroups.map(g => {
        const isAdmin = g.adminUid === ME?.uid;
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
            const id = el.dataset.id;
            const grp = allGroups.find(g => g.id === id);
            if (!grp) return;
            closeGroupsPanel();
            openRoom(`group__${grp.id}`, grp.name, null, false, null, true, grp);
            highlightContact(`group__${grp.id}`);
            mobileChatOpen();
        });
    });
}

groupsNavItem?.addEventListener("click", e => {
    e.preventDefault();
    groupsPanel?.classList.contains("open") ? closeGroupsPanel() : openGroupsPanel();
});
groupsPanelClose?.addEventListener("click", closeGroupsPanel);
groupsPanelOverlay?.addEventListener("click", closeGroupsPanel);

// ─── Create Group Modal ───────────────────────────────────────────────────
createGroupBtn?.addEventListener("click", () => {
    closeGroupsPanel();
    openCreateGroupModal();
});

function openCreateGroupModal() {
    groupSelectedMembers.clear();
    selectedGroupIcon = "💬";
    if (groupNameInput) groupNameInput.value = "";
    if (groupDescInput) groupDescInput.value = "";
    renderSelectedMembersChips();
    renderGroupMemberPicker("");
    // Reset icon picker
    groupIconPicker?.querySelectorAll(".gip-item").forEach(el => {
        el.classList.toggle("active", el.dataset.icon === "💬");
    });
    createGroupModal?.classList.remove("hidden");
    groupNameInput?.focus();
}

createGroupModalClose?.addEventListener("click", () => createGroupModal?.classList.add("hidden"));
createGroupCancel?.addEventListener("click", () => createGroupModal?.classList.add("hidden"));
createGroupModal?.addEventListener("click", e => { if (e.target === createGroupModal) createGroupModal.classList.add("hidden"); });

// Icon picker
groupIconPicker?.addEventListener("click", e => {
    const item = e.target.closest(".gip-item");
    if (!item) return;
    selectedGroupIcon = item.dataset.icon;
    groupIconPicker.querySelectorAll(".gip-item").forEach(el => el.classList.toggle("active", el === item));
});

// Member search in create modal
groupMemberSearch?.addEventListener("input", () => {
    renderGroupMemberPicker(groupMemberSearch.value.toLowerCase());
});

function renderGroupMemberPicker(q) {
    if (!groupMemberList) return;
    const users = allPresenceUsers.filter(u =>
        u.uid !== ME?.uid &&
        !groupSelectedMembers.has(u.uid) &&
        (!q || u.name.toLowerCase().includes(q))
    );
    if (!users.length) {
        groupMemberList.innerHTML = `<li class="modal-empty">${q ? "No users found" : "No other users available"}</li>`;
        return;
    }
    groupMemberList.innerHTML = users.map(u => {
        const color = colorFor(u.name);
        const av = u.avatar
            ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
            : u.name.charAt(0).toUpperCase();
        return `
        <li class="modal-user-item" data-uid="${u.uid}">
            <div class="modal-user-av" style="background:${color};">
                ${av}
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
            const uid = el.dataset.uid;
            const user = allPresenceUsers.find(u => u.uid === uid);
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
        const av = u.avatar
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
    if (!name) { showToast("Please enter a group name", "warning"); return; }
    if (groupSelectedMembers.size < 1) { showToast("Add at least 1 member to the group", "warning"); return; }

    const members = [ME.uid, ...groupSelectedMembers.keys()];
    try {
        createGroupSave.disabled = true;
        const ref = await addDoc(collection(db, "groups"), {
            name,
            desc: groupDescInput?.value.trim() || "",
            icon: selectedGroupIcon,
            adminUid: ME.uid,
            members,
            createdAt: serverTimestamp()
        });
        showToast(`Group "${name}" created! 🎉`, "success");
        createGroupModal?.classList.add("hidden");
        // Auto-open the new group
        const newGroup = { id: ref.id, name, desc: groupDescInput?.value.trim() || "", icon: selectedGroupIcon, adminUid: ME.uid, members };
        openRoom(`group__${ref.id}`, name, null, false, null, true, newGroup);
        mobileChatOpen();
    } catch (err) {
        showToast("Failed to create group: " + err.message, "error");
    } finally {
        if (createGroupSave) createGroupSave.disabled = false;
    }
});

// ─── Group Settings Modal (admin only) ───────────────────────────────────
groupSettingsBtn?.addEventListener("click", () => openGroupSettingsModal());

function openGroupSettingsModal() {
    const grp = activeRoomMeta.groupData;
    if (!grp) return;
    gsGroupName.value = grp.name || "";
    renderGsMembers(grp);
    renderGsAddMembers("");
    groupSettingsModal?.classList.remove("hidden");
}

function renderGsMembers(grp) {
    if (!gsGroupMembersList) return;
    const members = grp.members || [];
    if (!members.length) { gsGroupMembersList.innerHTML = `<li class="modal-empty">No members</li>`; return; }

    gsGroupMembersList.innerHTML = members.map(uid => {
        const u = allPresenceUsers.find(p => p.uid === uid) || { uid, name: uid, avatar: "", online: false };
        const color = colorFor(u.name);
        const av = u.avatar
            ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
            : u.name.charAt(0).toUpperCase();
        const isAdmin = uid === grp.adminUid;
        const isSelf = uid === ME?.uid;
        const canKick = !isAdmin && !isSelf; // admin can kick non-admin, non-self
        return `
        <li class="modal-user-item" data-uid="${uid}" style="cursor:default;">
            <div class="modal-user-av" style="background:${color};">${av}<div class="modal-online-dot ${u.online ? "online" : "offline"}"></div></div>
            <div class="modal-user-info">
                <div class="modal-user-name">${escHtml(u.name)}${isAdmin ? ' <span style="font-size:10px;color:var(--primary);font-weight:700;">(Admin)</span>' : ""}</div>
                <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
            </div>
            ${canKick ? `<button class="icon-btn gs-kick-btn" data-uid="${uid}" title="Remove from group" style="color:var(--error);"><i class="ri-user-unfollow-line"></i></button>` : ""}
        </li>`;
    }).join("");

    gsGroupMembersList.querySelectorAll(".gs-kick-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const uid = btn.dataset.uid;
            const u = allPresenceUsers.find(p => p.uid === uid);
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
    const users = allPresenceUsers.filter(u =>
        u.uid !== ME?.uid &&
        !existingMembers.has(u.uid) &&
        (!q || u.name.toLowerCase().includes(q))
    );
    if (!users.length) { gsAddMemberList.innerHTML = `<li class="modal-empty">No users to add</li>`; return; }
    gsAddMemberList.innerHTML = users.map(u => {
        const color = colorFor(u.name);
        const av = u.avatar
            ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
            : u.name.charAt(0).toUpperCase();
        return `
        <li class="modal-user-item" data-uid="${u.uid}">
            <div class="modal-user-av" style="background:${color};">${av}<div class="modal-online-dot ${u.online ? "online" : "offline"}"></div></div>
            <div class="modal-user-info">
                <div class="modal-user-name">${escHtml(u.name)}</div>
                <div class="modal-user-status">${u.online ? "Online" : "Offline"}</div>
            </div>
            <button class="icon-btn" style="color:var(--primary);"><i class="ri-user-add-line"></i></button>
        </li>`;
    }).join("");

    gsAddMemberList.querySelectorAll(".modal-user-item").forEach(el => {
        el.addEventListener("click", async () => {
            const uid = el.dataset.uid;
            const grp2 = activeRoomMeta.groupData;
            if (!grp2) return;
            const newMembers = [...(grp2.members || []), uid];
            await updateDoc(doc(db, "groups", grp2.id), { members: newMembers });
            // Update local
            grp2.members = newMembers;
            showToast("Member added!", "success");
            renderGsMembers(grp2);
            renderGsAddMembers(gsAddMemberSearch?.value.toLowerCase() || "");
        });
    });
}

gsAddMemberSearch?.addEventListener("input", () => {
    renderGsAddMembers(gsAddMemberSearch.value.toLowerCase());
});

groupSettingsModalClose?.addEventListener("click", () => groupSettingsModal?.classList.add("hidden"));
groupSettingsCancel?.addEventListener("click", () => groupSettingsModal?.classList.add("hidden"));
groupSettingsModal?.addEventListener("click", e => { if (e.target === groupSettingsModal) groupSettingsModal.classList.add("hidden"); });

groupSettingsSave?.addEventListener("click", async () => {
    const grp = activeRoomMeta.groupData;
    if (!grp) return;
    const newName = gsGroupName?.value.trim();
    if (!newName) { showToast("Group name cannot be empty", "warning"); return; }
    await updateDoc(doc(db, "groups", grp.id), { name: newName });
    chName.textContent = newName;
    ipName.textContent = newName;
    grp.name = newName;
    showToast("Group updated!", "success");
    groupSettingsModal?.classList.add("hidden");
});

gsDeleteGroup?.addEventListener("click", async () => {
    const grp = activeRoomMeta.groupData;
    if (!grp) return;
    if (!confirm(`Delete group "${grp.name}"? This will remove all messages and cannot be undone.`)) return;
    try {
        // Delete all messages
        const snap = await getDocs(collection(db, "rooms", `group__${grp.id}`, "messages"));
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
        // Delete the group document
        await deleteDoc(doc(db, "groups", grp.id));
        groupSettingsModal?.classList.add("hidden");
        activeRoomId = null;
        chatView.classList.add("hidden");
        chatEmpty.style.display = "";
        mobileChatClose();
        showToast("Group deleted", "success");
    } catch (err) {
        showToast("Failed to delete group: " + err.message, "error");
    }
});

async function kickMemberFromGroup(groupId, uid) {
    try {
        const grpRef = doc(db, "groups", groupId);
        const snap = await getDoc(grpRef);
        if (!snap.exists()) return;
        const data = snap.data();
        const newMembers = (data.members || []).filter(m => m !== uid);
        await updateDoc(grpRef, { members: newMembers });
        // Update local
        if (activeRoomMeta.groupData) activeRoomMeta.groupData.members = newMembers;
        showToast("Member removed from group", "success");
        renderGsMembers(activeRoomMeta.groupData);
        renderGsAddMembers("");
    } catch (err) {
        showToast("Failed to remove member: " + err.message, "error");
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACTS LIST
// ═══════════════════════════════════════════════════════════════════════════
function renderContactsList() {
    pinnedList.innerHTML = "";

    // General chat is always pinned
    const generalLi = document.createElement("li");
    generalLi.innerHTML = buildChatItemHtml({
        id: ROOM_GENERAL, name: "General Chat", avatar: "",
        preview: "Public room — everyone can chat",
        time: "", unread: 0, online: true, isPinned: true
    }, activeRoomId === ROOM_GENERAL);
    pinnedList.appendChild(generalLi.firstElementChild);
    pinnedList.querySelector(".chat-item")?.addEventListener("click", () => {
        openRoom(ROOM_GENERAL, "General Chat", null, true, null, false);
        highlightContact(ROOM_GENERAL);
        mobileChatOpen();
    });

    // Pinned DM users
    const pinnedOthers = allPresenceUsers.filter(u => u.uid !== ME?.uid && pinnedChats.has(u.uid));
    pinnedOthers.forEach(u => {
        const li = document.createElement("li");
        li.innerHTML = buildChatItemHtml({
            id: u.uid, name: u.name, avatar: u.avatar,
            preview: u.status || "Say hello!",
            time: "", unread: 0, online: u.online, isPinned: true
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
    const color = colorFor(name);
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
        <div class="ci-name">
          ${escHtml(name)}
          ${isPinned ? `<i class="ri-pushpin-fill ci-pin-icon"></i>` : ""}
        </div>
        <div class="ci-preview">${escHtml(preview)}</div>
      </div>
      <div class="ci-meta">
        ${time ? `<span class="ci-time">${escHtml(time)}</span>` : ""}
        ${unread ? `<span class="ci-unread">${unread}</span>` : ""}
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
    if (!users.length) {
        onlineStrip.innerHTML = `<span style="font-size:12px;color:var(--text-grey);">No one online yet</span>`;
        return;
    }
    onlineStrip.innerHTML = users.map(u => {
        const color = colorFor(u.name);
        const av = u.avatar
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
// RIGHT PANEL
// ═══════════════════════════════════════════════════════════════════════════
function renderOnlinePanel(users) {
    const others = users.filter(u => u.uid !== ME?.uid);

    if (!others.length) {
        ipOnlineList.innerHTML = `<li class="ip-no-users">No users yet</li>`;
    } else {
        ipOnlineList.innerHTML = others.map(u => {
            const color = colorFor(u.name);
            const av = u.avatar
                ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
                : u.name.charAt(0).toUpperCase();
            return `
            <li>
              <div class="ip-user-row">
                <div class="ip-user-av-wrap">
                  <div class="ip-user-av" style="background:${color};">${av}</div>
                  ${u.online ? `<div class="ip-user-dot"></div>` : ""}
                </div>
                <div>
                  <div class="ip-user-name">${escHtml(u.name)}</div>
                  <div class="ip-user-label">${u.online ? "Online" : "Offline"}</div>
                </div>
              </div>
            </li>`;
        }).join("");
    }

    if (others.length) {
        allChatList.innerHTML = others.map(u => {
            const isPinned = pinnedChats.has(u.uid);
            return buildChatItemHtml({
                id: u.uid, name: u.name, avatar: u.avatar,
                preview: u.status || "Say hello!",
                time: "", unread: 0, online: u.online, isPinned
            }, activeRoomId === getRoomId(ME?.uid, u.uid));
        }).join("");

        allChatList.querySelectorAll(".chat-item").forEach(el => {
            el.addEventListener("click", () => {
                const uid = el.dataset.id;
                const user = allPresenceUsers.find(u => u.uid === uid);
                if (!user) return;
                const roomId = getRoomId(ME.uid, uid);
                openRoom(roomId, user.name, user.avatar, false, user, false);
                highlightContact(uid);
                mobileChatOpen();
            });
        });
    } else {
        allChatList.innerHTML = `<li style="padding:10px 18px;font-size:13px;color:var(--text-grey);">No other users found.</li>`;
    }
}

function getRoomId(a, b) { return [a, b].sort().join("__"); }

// ═══════════════════════════════════════════════════════════════════════════
// OPEN ROOM
// ═══════════════════════════════════════════════════════════════════════════
function openRoom(roomId, name, avatar, isPublic, targetUser = null, isGroup = false, groupData = null) {
    activeRoomId = roomId;
    activeRoomMeta = { name, isPublic, isGroup, groupData };

    chatEmpty.style.display = "none";
    chatView.classList.remove("hidden");
    chatView.style.display = "flex";

    buildAvatarEl(chAvatar, name, avatar || "");
    chAvatar.style.width = "42px";
    chAvatar.style.height = "42px";
    chName.textContent = name;

    if (isPublic) {
        chStatus.textContent = "Public Room · All users";
        chStatus.className = "ch-status";
        chPresence.className = "ch-presence online";
    } else if (isGroup) {
        const memberCount = groupData?.members?.length || 0;
        chStatus.textContent = `${memberCount} members`;
        chStatus.className = "ch-status";
        chPresence.className = "ch-presence online";
        // Show group settings button for admin
        if (groupSettingsBtn) {
            const isAdmin = groupData?.adminUid === ME?.uid;
            groupSettingsBtn.classList.toggle("hidden", !isAdmin);
        }
    } else {
        const isOnline = targetUser?.online ?? false;
        chStatus.textContent = isOnline ? "Online" : "Offline";
        chStatus.className = `ch-status ${isOnline ? "online-status" : "offline-status"}`;
        chPresence.className = `ch-presence ${isOnline ? "online" : "offline"}`;
        if (groupSettingsBtn) groupSettingsBtn.classList.add("hidden");
    }

    // Hide group settings btn for non-group rooms
    if (!isGroup && groupSettingsBtn) groupSettingsBtn.classList.add("hidden");

    buildAvatarEl(ipAvatar, name, avatar || "");
    ipAvatar.style.width = "72px";
    ipAvatar.style.height = "72px";
    ipName.textContent = name;
    ipStatus.textContent = isGroup
        ? `Group · ${groupData?.members?.length || 0} members`
        : isPublic ? "Public room" : (targetUser?.status || "");

    // Show/hide group members section in info panel
    if (ipGroupMembersSection) {
        ipGroupMembersSection.classList.toggle("hidden", !isGroup);
        if (isGroup && groupData) renderGroupMembersPanel(groupData);
    }

    if (msgUnsub) msgUnsub();
    if (typingUnsub) typingUnsub();
    messagesArea.innerHTML = "";
    typingRow.classList.add("hidden");
    closeEmojiPanel();
    closeChatSearch();
    closeMoreDropdown();
    updatePinMenuLabel();

    listenMessages(roomId);
    listenTyping(roomId);
}

function renderGroupMembersPanel(grp) {
    if (!ipGroupMembersList) return;
    const members = grp.members || [];
    const isAdmin = grp.adminUid === ME?.uid;
    ipGroupMembersList.innerHTML = members.map(uid => {
        const u = allPresenceUsers.find(p => p.uid === uid) || { uid, name: uid, avatar: "", online: false };
        const color = colorFor(u.name);
        const av = u.avatar
            ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
            : u.name.charAt(0).toUpperCase();
        const memberIsAdmin = uid === grp.adminUid;
        const canKick = isAdmin && !memberIsAdmin && uid !== ME?.uid;
        return `
        <li>
          <div class="ip-member-row">
            <div class="ip-user-av-wrap">
              <div class="ip-user-av" style="background:${color};">${av}</div>
              ${u.online ? `<div class="ip-user-dot"></div>` : ""}
            </div>
            <div>
              <div class="ip-user-name">${escHtml(u.name)} ${memberIsAdmin ? '👑' : ""}</div>
              <div class="ip-user-label">${u.online ? "Online" : "Offline"}</div>
            </div>
            ${canKick ? `<button class="ip-member-kick" data-uid="${uid}" title="Remove from group"><i class="ri-user-unfollow-line"></i></button>` : ""}
          </div>
        </li>`;
    }).join("");

    ipGroupMembersList.querySelectorAll(".ip-member-kick").forEach(btn => {
        btn.addEventListener("click", async () => {
            const uid = btn.dataset.uid;
            const u = allPresenceUsers.find(p => p.uid === uid);
            if (!confirm(`Remove ${u?.name || uid} from group?`)) return;
            await kickMemberFromGroup(grp.id, uid);
            renderGroupMembersPanel(grp);
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// MORE MENU (3-dot)
// ═══════════════════════════════════════════════════════════════════════════
function openMoreDropdown() {
    moreDropdown.classList.remove("hidden");
    moreDropdownOpen = true;
    updatePinMenuLabel();
}

function closeMoreDropdown() {
    moreDropdown.classList.add("hidden");
    moreDropdownOpen = false;
}

moreMenuBtn.addEventListener("click", e => {
    e.stopPropagation();
    if (moreDropdownOpen) closeMoreDropdown();
    else { closeEmojiPanel(); closeAttachMenu(); openMoreDropdown(); }
});
moreDropdown.addEventListener("click", e => e.stopPropagation());

mdSearch.addEventListener("click", () => {
    closeMoreDropdown();
    chatSearchBar.classList.remove("hidden");
    chatSearchInput.focus();
});

mdPinChat.addEventListener("click", () => {
    closeMoreDropdown();
    if (!activeRoomId) return;
    const pinId = activeRoomId === ROOM_GENERAL
        ? ROOM_GENERAL
        : (activeRoomId.includes("__")
            ? activeRoomId.split("__").find(p => p !== ME.uid) || activeRoomId
            : activeRoomId);
    togglePin(pinId);
});

mdSelectMsg.addEventListener("click", () => { closeMoreDropdown(); enterSelectMode(); });

mdEditNick.addEventListener("click", () => {
    closeMoreDropdown();
    editNickModal.classList.remove("hidden");
    editNickInput.value = chName.textContent;
    editNickInput.focus();
});

mdClearChat.addEventListener("click", async () => {
    closeMoreDropdown();
    if (!activeRoomId) return;
    if (!confirm("Clear all messages in this chat?")) return;
    try {
        const snap = await getDocs(collection(db, "rooms", activeRoomId, "messages"));
        await Promise.all(snap.docs.map(d => updateDoc(d.ref, { text: "", deleted: true, fileData: null })));
        showToast("Chat cleared", "success");
    } catch { showToast("Failed to clear chat", "error"); }
});

mdDeleteChat.addEventListener("click", async () => {
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
        activeRoomId = null;
        chatView.classList.add("hidden");
        chatEmpty.style.display = "";
        mobileChatClose();
        renderContactsList();
        showToast("Chat deleted", "success");
    } catch { showToast("Failed to delete chat", "error"); }
});

mdBlock.addEventListener("click", () => { closeMoreDropdown(); showToast("Block feature coming soon!", "warning"); });

mdAddFav.addEventListener("click", () => {
    closeMoreDropdown();
    if (!activeRoomId) return;
    const favId = activeRoomId === ROOM_GENERAL
        ? ROOM_GENERAL
        : activeRoomId.split("__").find(p => p !== ME.uid) || activeRoomId;
    if (favouriteChats.has(favId)) {
        favouriteChats.delete(favId);
        showToast("Removed from favourites", "success");
        mdAddFav.innerHTML = `<i class="ri-star-line"></i> Add to Fav`;
    } else {
        favouriteChats.add(favId);
        showToast("Added to favourites ⭐", "success");
        mdAddFav.innerHTML = `<i class="ri-star-fill"></i> Remove from Fav`;
    }
});

// ─── Edit Nickname ────────────────────────────────────────────────────────
editNickClose?.addEventListener("click", () => editNickModal.classList.add("hidden"));
editNickCancel?.addEventListener("click", () => editNickModal.classList.add("hidden"));
editNickModal?.addEventListener("click", e => { if (e.target === editNickModal) editNickModal.classList.add("hidden"); });
editNickSave?.addEventListener("click", () => {
    const nick = editNickInput.value.trim();
    if (!nick) return;
    chName.textContent = nick;
    ipName.textContent = nick;
    editNickModal.classList.add("hidden");
    showToast(`Nickname set to "${nick}"`, "success");
});

// ═══════════════════════════════════════════════════════════════════════════
// SELECT MODE
// ═══════════════════════════════════════════════════════════════════════════
function enterSelectMode() {
    selectMode = true;
    selectedMsgIds.clear();
    messagesArea.classList.add("select-mode");
    selectBar.classList.remove("hidden");
    selectCount.textContent = "0 selected";
    messagesArea.querySelectorAll(".msg-row").forEach(row => {
        row.addEventListener("click", handleSelectClick);
    });
}

function exitSelectMode() {
    selectMode = false;
    selectedMsgIds.clear();
    messagesArea.classList.remove("select-mode");
    selectBar.classList.add("hidden");
    messagesArea.querySelectorAll(".msg-row").forEach(row => {
        row.classList.remove("msg-selected");
        row.removeEventListener("click", handleSelectClick);
    });
}

function handleSelectClick(e) {
    const row = e.currentTarget;
    const id = row.dataset.id;
    if (selectedMsgIds.has(id)) { selectedMsgIds.delete(id); row.classList.remove("msg-selected"); }
    else { selectedMsgIds.add(id); row.classList.add("msg-selected"); }
    selectCount.textContent = `${selectedMsgIds.size} selected`;
}

selectCancel.addEventListener("click", exitSelectMode);

selectDelete.addEventListener("click", async () => {
    if (!selectedMsgIds.size) return;
    if (!confirm(`Delete ${selectedMsgIds.size} message(s)?`)) return;
    for (const id of selectedMsgIds) {
        try { await updateDoc(doc(db, "rooms", activeRoomId, "messages", id), { text: "", deleted: true, fileData: null }); } catch (_) { }
    }
    showToast(`${selectedMsgIds.size} message(s) deleted`, "success");
    exitSelectMode();
});

selectForward.addEventListener("click", () => { showToast("Forward coming soon!", "warning"); exitSelectMode(); });

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGES — Listen / Render
// ═══════════════════════════════════════════════════════════════════════════
let lastRenderDate = null;

function listenMessages(roomId) {
    lastRenderDate = null;
    const q = query(collection(db, "rooms", roomId, "messages"), orderBy("createdAt", "asc"));
    msgUnsub = onSnapshot(q, snap => {
        snap.docChanges().forEach(change => {
            if (change.type === "added") renderMessage(change.doc.data(), change.doc.id);
            else if (change.type === "modified") updateRenderedMessage(change.doc.data(), change.doc.id);
            else if (change.type === "removed") removeRenderedMessage(change.doc.id);
        });
        scrollBottom();
    });
}

function renderMessage(data, id) {
    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const isMine = data.uid === ME?.uid;
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
        const row = document.createElement("div");
        row.className = `msg-row ${isMine ? "sent" : "received"}`;
        row.dataset.id = id;
        const color = colorFor(data.name || "?");
        const avHtml = data.avatar
            ? `<img src="${escHtml(data.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
            : (data.name || "?").charAt(0).toUpperCase();
        if (isMine) {
            row.innerHTML = `
            <div class="msg-col">
              <div class="msg-sticker">${escHtml(data.text)}</div>
              <div class="msg-meta" style="justify-content:flex-end;color:var(--text-grey);">${timeStr}</div>
            </div>`;
        } else {
            row.innerHTML = `
            <div class="msg-av" style="background:${color};">${avHtml}</div>
            <div class="msg-col">
              <div class="msg-sender-name">${escHtml(data.name || "")}</div>
              <div class="msg-sticker">${escHtml(data.text)}</div>
              <div class="msg-meta" style="color:var(--text-grey);">${timeStr}</div>
            </div>`;
        }
        messagesArea.appendChild(row);
        return;
    }

    const row = document.createElement("div");
    row.className = `msg-row ${isMine ? "sent" : "received"}`;
    row.dataset.id = id;

    const color = colorFor(data.name || "?");
    const avHtml = data.avatar
        ? `<img src="${escHtml(data.avatar)}" style="width:100%;height:100%;object-fit:cover;" />`
        : (data.name || "?").charAt(0).toUpperCase();

    const bubbleContent = buildBubbleContent(data, timeStr, isMine);
    const canEdit = isMine && data.type === "text" && !data.deleted && !data.edited;
    const actionsHtml = isMine && !data.deleted
        ? `<div class="msg-actions">
             ${canEdit ? `<button class="msg-act-btn" data-action="edit" data-id="${id}" title="Edit"><i class="ri-edit-line"></i></button>` : ""}
             <button class="msg-act-btn delete" data-action="delete" data-id="${id}" title="Delete"><i class="ri-delete-bin-line"></i></button>
           </div>`
        : "";

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
    if (data.deleted) {
        return `<span>🚫 This message was deleted</span><div class="msg-meta">${timeStr}</div>`;
    }
    const editedLabel = data.edited ? `<span class="msg-edited">(edited)</span>` : "";

    if (data.type === "image") {
        return `
        <div class="msg-img-wrap">
          <img class="msg-img" src="${escHtml(data.fileData)}" alt="${escHtml(data.fileName || "image")}" />
          <a class="msg-img-download" href="${escHtml(data.fileData)}" download="${escHtml(data.fileName || "image.png")}" title="Download" onclick="event.stopPropagation()">
            <i class="ri-download-2-line"></i>
          </a>
        </div>
        <div class="msg-meta">${timeStr}${editedLabel}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
    }

    if (data.type === "file") {
        const icon = getFileIcon(data.fileName || "");
        const sizeStr = formatFileSize(data.fileSize || 0);
        return `
        <a class="msg-file" href="${escHtml(data.fileData)}" download="${escHtml(data.fileName || "file")}" target="_blank">
          <i class="${icon}"></i>
          <div class="msg-file-info">
            <div class="msg-file-name">${escHtml(data.fileName || "File")}</div>
            <div class="msg-file-size">${sizeStr}</div>
          </div>
          <span class="msg-file-download" title="Download" onclick="event.stopPropagation()">
            <i class="ri-download-2-line"></i>
          </span>
        </a>
        <div class="msg-meta">${timeStr}${editedLabel}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
    }

    return `${escHtml(data.text)}${editedLabel}<div class="msg-meta">${timeStr}${isMine ? ` <i class="ri-check-double-line" style="font-size:11px;"></i>` : ""}</div>`;
}

function bindMsgActions(row, data, id) {
    row.querySelectorAll(".msg-act-btn").forEach(btn => {
        btn.addEventListener("click", e => {
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
    const row = messagesArea.querySelector(`.msg-row[data-id="${id}"]`);
    if (!row) return;
    const bubble = row.querySelector(".bubble");
    if (!bubble) return;
    const isMine = data.uid === ME?.uid;
    const ts = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();
    const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    bubble.innerHTML = buildBubbleContent(data, timeStr, isMine);
    if (data.deleted) bubble.classList.add("deleted-msg");
    else bubble.classList.remove("deleted-msg");
    if (data.edited || data.deleted) {
        row.querySelector('.msg-act-btn[data-action="edit"]')?.remove();
    }
}

function removeRenderedMessage(id) {
    messagesArea.querySelector(`.msg-row[data-id="${id}"]`)?.remove();
}

// ═══════════════════════════════════════════════════════════════════════════
// EDIT MODAL
// ═══════════════════════════════════════════════════════════════════════════
let editingMsgId = null;

function openEditModal(id, currentText) {
    editingMsgId = id;
    editMsgInput.value = currentText;
    editMsgModal.classList.remove("hidden");
    editMsgInput.focus();
}

function closeEditModal() { editMsgModal.classList.add("hidden"); editingMsgId = null; }

editMsgClose.addEventListener("click", closeEditModal);
editMsgCancel.addEventListener("click", closeEditModal);
editMsgSave.addEventListener("click", async () => {
    const newText = editMsgInput.value.trim();
    if (!newText || !editingMsgId || !activeRoomId) return;
    try {
        await updateDoc(doc(db, "rooms", activeRoomId, "messages", editingMsgId), { text: newText, edited: true });
        showToast("Message edited ✏️", "success");
    } catch { showToast("Edit failed", "error"); }
    closeEditModal();
});
editMsgModal.addEventListener("click", e => { if (e.target === editMsgModal) closeEditModal(); });

// ═══════════════════════════════════════════════════════════════════════════
// DELETE MESSAGE
// ═══════════════════════════════════════════════════════════════════════════
async function confirmDeleteMsg(id) {
    if (!confirm("Delete this message?")) return;
    try {
        await updateDoc(doc(db, "rooms", activeRoomId, "messages", id), { text: "", deleted: true, fileData: null });
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
    await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
        uid: ME.uid, name: ME.name, avatar: ME.avatar,
        text, type: "text", deleted: false, edited: false, createdAt: serverTimestamp()
    });
}

sendBtn.addEventListener("click", sendMessage);
msgInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } });

// ═══════════════════════════════════════════════════════════════════════════
// SEND FILE
// ═══════════════════════════════════════════════════════════════════════════
async function sendFile(file, msgType) {
    if (!ME || !activeRoomId || !file) return;
    if (file.size > 3 * 1024 * 1024) { showToast("File too large. Max 3 MB allowed.", "warning"); return; }
    showToast("Uploading…", "success");
    const reader = new FileReader();
    reader.onload = async e => {
        await addDoc(collection(db, "rooms", activeRoomId, "messages"), {
            uid: ME.uid, name: ME.name, avatar: ME.avatar,
            text: file.name, type: msgType === "image" ? "image" : "file",
            fileName: file.name, fileSize: file.size, fileData: e.target.result,
            deleted: false, edited: false, createdAt: serverTimestamp()
        });
    };
    reader.readAsDataURL(file);
}

imgFileInput.addEventListener("change", () => { if (imgFileInput.files[0]) sendFile(imgFileInput.files[0], "image"); imgFileInput.value = ""; closeAttachMenu(); });
docFileInput.addEventListener("change", () => { if (docFileInput.files[0]) sendFile(docFileInput.files[0], "file"); docFileInput.value = ""; closeAttachMenu(); });
anyFileInput.addEventListener("change", () => { if (anyFileInput.files[0]) sendFile(anyFileInput.files[0], "file"); anyFileInput.value = ""; closeAttachMenu(); });

// ═══════════════════════════════════════════════════════════════════════════
// ATTACH MENU
// ═══════════════════════════════════════════════════════════════════════════
attachBtn.addEventListener("click", e => { e.stopPropagation(); attachMenu.classList.toggle("hidden"); closeEmojiPanel(); closeMoreDropdown(); });
function closeAttachMenu() { attachMenu.classList.add("hidden"); }
document.addEventListener("click", closeAttachMenu);
attachMenu.addEventListener("click", e => e.stopPropagation());

// ═══════════════════════════════════════════════════════════════════════════
// TYPING
// ═══════════════════════════════════════════════════════════════════════════
msgInput.addEventListener("input", async () => {
    if (!ME || !activeRoomId) return;
    const now = Date.now();
    if (now - lastTypingSent > 1800) {
        lastTypingSent = now;
        await setDoc(doc(db, "rooms", activeRoomId, "typing", ME.uid), {
            uid: ME.uid, name: ME.name, avatar: ME.avatar, ts: serverTimestamp()
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
    typingUnsub = onSnapshot(collection(db, "rooms", roomId, "typing"), snap => {
        const others = snap.docs.filter(d => d.id !== ME?.uid).map(d => d.data());
        if (others.length) {
            const t = others[0];
            buildAvatarEl(typingAv, t.name, t.avatar || "");
            typingAv.style.background = colorFor(t.name);
            typingAv.style.width = "26px";
            typingAv.style.height = "26px";
            typingRow.classList.remove("hidden");
            chStatus.textContent = `${t.name} is typing…`;
            chStatus.className = "ch-status typing";
        } else {
            typingRow.classList.add("hidden");
            if (activeRoomMeta.isPublic) {
                chStatus.textContent = "Public Room · All users";
                chStatus.className = "ch-status";
            } else if (activeRoomMeta.isGroup) {
                const memberCount = activeRoomMeta.groupData?.members?.length || 0;
                chStatus.textContent = `${memberCount} members`;
                chStatus.className = "ch-status";
            } else {
                const other = allPresenceUsers.find(u => u.uid !== ME?.uid && getRoomId(ME.uid, u.uid) === activeRoomId);
                if (other) {
                    chStatus.textContent = other.online ? "Online" : "Offline";
                    chStatus.className = `ch-status ${other.online ? "online-status" : "offline-status"}`;
                }
            }
        }
        scrollBottom();
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// EMOJI / STICKER PANEL
// ═══════════════════════════════════════════════════════════════════════════
emojiToggleBtn.addEventListener("click", e => {
    e.stopPropagation();
    emojiPanel.classList.contains("hidden")
        ? (openEmojiPanel(), closeAttachMenu(), closeMoreDropdown())
        : closeEmojiPanel();
});
document.addEventListener("click", e => { if (!emojiPanel.contains(e.target) && e.target !== emojiToggleBtn) closeEmojiPanel(); });
function openEmojiPanel() { emojiPanel.classList.remove("hidden"); renderEmojiTab(currentEmojiTab); }
function closeEmojiPanel() { emojiPanel.classList.add("hidden"); }

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
            btn.className = "emoji-btn-item";
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
            item.className = "sticker-item";
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
        text: sticker, type: "sticker", deleted: false, createdAt: serverTimestamp()
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTACT LIST SEARCH
// ═══════════════════════════════════════════════════════════════════════════
searchInput.addEventListener("input", () => {
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

searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    searchResultsList.classList.add("hidden");
    normalChatLists.classList.remove("hidden");
    searchClearBtn.classList.add("hidden");
});

async function runContactSearch(q) {
    searchResultsList.innerHTML = `<li class="search-no-result">Searching…</li>`;
    const results = [];
    const roomsToSearch = [{ roomId: ROOM_GENERAL, name: "General Chat" }];
    allPresenceUsers.filter(u => u.uid !== ME.uid).forEach(u => {
        roomsToSearch.push({ roomId: getRoomId(ME.uid, u.uid), name: u.name });
    });
    allGroups.forEach(g => {
        roomsToSearch.push({ roomId: `group__${g.id}`, name: g.name });
    });

    for (const room of roomsToSearch) {
        try {
            const snap = await getDocs(query(collection(db, "rooms", room.roomId, "messages"), orderBy("createdAt", "desc")));
            snap.docs.forEach(d => {
                const data = d.data();
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

    searchResultsList.innerHTML = `<li class="search-result-label">Messages (${results.length})</li>` +
        results.slice(0, 40).map(r => {
            const highlighted = escHtml(r.text).replace(new RegExp(escHtml(q), "gi"), m => `<mark>${m}</mark>`);
            const timeStr = r.ts.toLocaleDateString([], { month: "short", day: "numeric" });
            return `<li class="search-result-msg" data-room="${r.roomId}" data-msg="${r.msgId}">
          <div class="srm-name">${escHtml(r.roomName)} · ${escHtml(r.senderName)}</div>
          <div class="srm-text">${highlighted}</div>
          <div class="srm-time">${timeStr}</div>
        </li>`;
        }).join("");

    const roomsMap = Object.fromEntries(roomsToSearch.map(r => [r.roomId, r]));
    searchResultsList.querySelectorAll(".search-result-msg").forEach(el => {
        el.addEventListener("click", () => {
            const roomId = el.dataset.room;
            const msgId = el.dataset.msg;
            const room = roomsMap[roomId];
            if (!room) return;
            const targetUser = allPresenceUsers.find(u => getRoomId(ME.uid, u.uid) === roomId);
            const isPublic = roomId === ROOM_GENERAL;
            const isGroup = roomId.startsWith("group__");
            const grpData = isGroup ? allGroups.find(g => `group__${g.id}` === roomId) : null;
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
chatSearchBtn.addEventListener("click", () => {
    chatSearchBar.classList.toggle("hidden");
    if (!chatSearchBar.classList.contains("hidden")) chatSearchInput.focus();
    else closeChatSearch();
});

chatSearchClose.addEventListener("click", closeChatSearch);

chatSearchInput.addEventListener("input", () => {
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

chatSearchNext.addEventListener("click", () => {
    if (!searchMatches.length) return;
    searchCurrentIdx = (searchCurrentIdx + 1) % searchMatches.length;
    jumpToSearchResult(searchCurrentIdx);
    chatSearchCount.textContent = `${searchCurrentIdx + 1}/${searchMatches.length}`;
});

chatSearchPrev.addEventListener("click", () => {
    if (!searchMatches.length) return;
    searchCurrentIdx = (searchCurrentIdx - 1 + searchMatches.length) % searchMatches.length;
    jumpToSearchResult(searchCurrentIdx);
    chatSearchCount.textContent = `${searchCurrentIdx + 1}/${searchMatches.length}`;
});

function closeChatSearch() {
    chatSearchBar.classList.add("hidden");
    chatSearchInput.value = "";
    chatSearchCount.textContent = "";
    clearSearchHighlights();
    searchMatches = [];
    searchCurrentIdx = -1;
}

function clearSearchHighlights() {
    messagesArea.querySelectorAll(".search-highlight, .search-current").forEach(el => {
        el.classList.remove("search-highlight", "search-current");
    });
}

function highlightSearchMatches() { searchMatches.forEach(row => row.classList.add("search-highlight")); }

function jumpToSearchResult(idx) {
    messagesArea.querySelectorAll(".search-current").forEach(el => el.classList.remove("search-current"));
    if (searchMatches[idx]) {
        searchMatches[idx].classList.add("search-current");
        searchMatches[idx].scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW CHAT MODAL
// ═══════════════════════════════════════════════════════════════════════════
newChatBtn.addEventListener("click", e => { e.stopPropagation(); openNewChatModal(); });
newChatModalClose.addEventListener("click", () => newChatModal.classList.add("hidden"));
newChatModal.addEventListener("click", e => { if (e.target === newChatModal) newChatModal.classList.add("hidden"); });

function openNewChatModal() {
    newChatModal.classList.remove("hidden");
    newChatSearch.value = "";
    renderNewChatList(allPresenceUsers.filter(u => u.uid !== ME?.uid));
    newChatSearch.focus();
}

newChatSearch.addEventListener("input", () => {
    const q = newChatSearch.value.toLowerCase();
    renderNewChatList(allPresenceUsers.filter(u => u.uid !== ME?.uid && u.name.toLowerCase().includes(q)));
});

function renderNewChatList(users) {
    if (!users.length) { newChatUserList.innerHTML = `<li class="modal-empty">No users found</li>`; return; }
    newChatUserList.innerHTML = users.map(u => {
        const color = colorFor(u.name);
        const av = u.avatar
            ? `<img src="${escHtml(u.avatar)}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;" />`
            : u.name.charAt(0).toUpperCase();
        return `
        <li class="modal-user-item" data-uid="${u.uid}">
          <div class="modal-user-av" style="background:${color};">
            ${av}
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
            const uid = el.dataset.uid;
            const user = allPresenceUsers.find(u => u.uid === uid);
            if (!user) return;
            const roomId = getRoomId(ME.uid, uid);
            openRoom(roomId, user.name, user.avatar, false, user, false);
            highlightContact(uid);
            mobileChatOpen();
            newChatModal.classList.add("hidden");
        });
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function getFileIcon(filename) {
    const ext = filename.split(".").pop().toLowerCase();
    if (ext === "pdf") return "ri-file-pdf-line";
    if (["doc", "docx"].includes(ext)) return "ri-file-word-line";
    if (["xls", "xlsx"].includes(ext)) return "ri-file-excel-line";
    if (["ppt", "pptx"].includes(ext)) return "ri-file-ppt-line";
    if (ext === "txt") return "ri-file-text-line";
    if (["zip", "rar", "7z"].includes(ext)) return "ri-file-zip-line";
    if (["mp4", "mov", "avi"].includes(ext)) return "ri-video-line";
    if (["mp3", "wav", "ogg"].includes(ext)) return "ri-music-line";
    return "ri-file-line";
}

function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function scrollBottom() { requestAnimationFrame(() => { messagesArea.scrollTop = messagesArea.scrollHeight; }); }

// ═══════════════════════════════════════════════════════════════════════════
// COPY ROOM LINK
// ═══════════════════════════════════════════════════════════════════════════
window.copyRoomLink = function () {
    navigator.clipboard.writeText(window.location.href).then(() => showToast("Room link copied!", "success"));
};

// Start presence heartbeat once auth is done (called from init)
startPresenceHeartbeat();
