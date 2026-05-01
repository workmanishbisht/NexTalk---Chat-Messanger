import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// ===== FIREBASE INIT =====
const firebaseConfig = {
    apiKey: "AIzaSyCJea9IVCNXyeUKCpO_Jhbg-s-PeGoWyDc",
    authDomain: "nextalk-34dad.firebaseapp.com",
    projectId: "nextalk-34dad",
    storageBucket: "nextalk-34dad.firebasestorage.app",
    messagingSenderId: "730298460453",
    appId: "1:730298460453:web:c69d16bd96e14876a4d2cc",
    measurementId: "G-BB9C36NGVM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ===== ELEMENTS =====
const fullNameInput = document.getElementById("fullName");
const statusInput = document.getElementById("statusText");
const avatarInput = document.getElementById("avatarInput");
const avatarPreview = document.getElementById("avatarPreview");
const avatarPlaceholder = document.getElementById("avatarPlaceholder");
const continueBtn = document.getElementById("continueBtn");
const skipBtn = document.getElementById("skipBtn");
const nameErr = document.getElementById("nameErr");
const toastContainer = document.getElementById("toastContainer");

// ===== TOAST =====
function showToast(message, type = "success") {
    const icons = {
        success: "ri-checkbox-circle-line",
        error: "ri-error-warning-line",
        warning: "ri-alert-line"
    };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="${icons[type]}"></i><span>${message}</span>`;
    toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.classList.add("hide");
        toast.addEventListener("animationend", () => toast.remove());
    }, 3500);
}

// ===== LOCALSTORAGE HELPERS =====
function getProfileKey(uid) {
    return `nextalk_profile_${uid}`;
}

function saveProfile(uid, data) {
    localStorage.setItem(getProfileKey(uid), JSON.stringify(data));
}

function loadProfile(uid) {
    const raw = localStorage.getItem(getProfileKey(uid));
    return raw ? JSON.parse(raw) : null;
}

function isProfileComplete(uid) {
    const profile = loadProfile(uid);
    return profile && profile.setupDone === true;
}

// ===== AVATAR PREVIEW =====
function setAvatarPreview(src) {
    if (src) {
        avatarPreview.src = src;
        avatarPreview.classList.add("visible");
        avatarPlaceholder.classList.add("hidden");
    } else {
        avatarPreview.classList.remove("visible");
        avatarPlaceholder.classList.remove("hidden");
    }
}

avatarInput.addEventListener("change", () => {
    const file = avatarInput.files[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
        showToast("Please select a valid image file.", "error");
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target.result);
    reader.readAsDataURL(file);
});

// ===== AUTH STATE CHECK =====
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "./authentication.html";
        return;
    }

if (isProfileComplete(user.uid)) {
    window.location.href = "./chatdashboard.html";
    return;
}

    prefillFromFirebase(user);
});

// ===== PREFILL FROM FIREBASE (Google login) =====
function prefillFromFirebase(user) {
    if (user.displayName) {
        fullNameInput.value = user.displayName;
    }

    if (user.photoURL) {
        setAvatarPreview(user.photoURL);
    }
}

// ===== VALIDATION =====
function validateName() {
    const val = fullNameInput.value.trim();
    if (!val) {
        fullNameInput.classList.add("invalid");
        nameErr.textContent = "Full name is required.";
        return false;
    }
    fullNameInput.classList.remove("invalid");
    nameErr.textContent = "";
    return true;
}

fullNameInput.addEventListener("input", () => {
    if (fullNameInput.value.trim()) {
        fullNameInput.classList.remove("invalid");
        nameErr.textContent = "";
    }
});

// ===== SAVE & CONTINUE =====
continueBtn.addEventListener("click", () => {
    if (!validateName()) return;

    const user = auth.currentUser;
    if (!user) return;

    continueBtn.disabled = true;
    continueBtn.textContent = "Saving...";

    const profile = {
        uid: user.uid,
        name: fullNameInput.value.trim(),
        status: statusInput.value.trim() || "Hey there! I'm using NexTalk",
        avatar: avatarPreview.src && avatarPreview.classList.contains("visible")
            ? avatarPreview.src
            : (user.photoURL || ""),
        email: user.email,
        setupDone: true,
        createdAt: Date.now()
    };

    saveProfile(user.uid, profile);
    showToast("Profile saved! Taking you in", "success");

    setTimeout(() => {
        window.location.href = "./chatdashboard.html";
    }, 1300);
});

// ===== SKIP =====
skipBtn.addEventListener("click", () => {
    const user = auth.currentUser;
    if (!user) return;

    const profile = {
        uid: user.uid,
        name: user.displayName || fullNameInput.value.trim() || "NexTalk User",
        status: "Hey there! I'm using NexTalk",
        avatar: user.photoURL || "",
        email: user.email,
        setupDone: true,
        createdAt: Date.now()
    };

    saveProfile(user.uid, profile);
    showToast("Skipped! You can update your profile later.", "warning");

    setTimeout(() => {
        window.location.href = "./chatdashboard.html";
    }, 1300);
});
