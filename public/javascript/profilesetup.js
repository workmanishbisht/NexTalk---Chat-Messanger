// profilesetup.js — 

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    getFirestore,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const db = getFirestore(app);

// ─── Elements ─────────────────────────────────────────────────────────────
const fullNameInput = document.getElementById("fullName");
const statusInput = document.getElementById("statusText");
const avatarInput = document.getElementById("avatarInput");
const avatarPreview = document.getElementById("avatarPreview");
const avatarPlaceholder = document.getElementById("avatarPlaceholder");
const continueBtn = document.getElementById("continueBtn");
const skipBtn = document.getElementById("skipBtn");
const nameErr = document.getElementById("nameErr");
const phoneErr = document.getElementById("phoneErr");
const emailErr = document.getElementById("emailErr");
const dobErr = document.getElementById("dobErr");
const locationErr = document.getElementById("locationErr");
const toastContainer = document.getElementById("toastContainer");
const phoneInput = document.getElementById("phoneNumber");
const countryCode = document.getElementById("countryCode");
const emailInput = document.getElementById("emailInput");
const dobInput = document.getElementById("dobInput");

// Interests
const interestsWrap = document.getElementById("interestsWrap");
const interestsDropdown = document.getElementById("interestsDropdown");
const interestsChevron = document.getElementById("interestsChevron");
const interestsPlaceholder = document.getElementById("interestsPlaceholder");

// Location
const detectLocationBtn = document.getElementById("detectLocationBtn");
const manualLocationBtn = document.getElementById("manualLocationBtn");
const locationResult = document.getElementById("locationResult");
const locationDisplay = document.getElementById("locationDisplay");
const locationOptions = document.getElementById("locationOptions");
const changeLocationBtn = document.getElementById("changeLocationBtn");
const locationManualWrap = document.getElementById("locationManualWrap");
const locationManualInput = document.getElementById("locationManualInput");
const locManualConfirmBtn = document.getElementById("locManualConfirmBtn");
const locationDetecting = document.getElementById("locationDetecting");

// Modal
const locationPermModal = document.getElementById("locationPermModal");
const modalAllowBtn = document.getElementById("modalAllowBtn");
const modalDenyBtn = document.getElementById("modalDenyBtn");

// ─── State ────────────────────────────────────────────────────────────────
let selectedGender = "";
let selectedInterests = [];
let selectedLocation = {
    city: "",
    country: "",
    display: "",
    lat: null,
    lng: null
};

// ─── Toast ────────────────────────────────────────────────────────────────
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

// ─── Avatar ───────────────────────────────────────────────────────────────
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
    if (file.size > 5 * 1024 * 1024) {
        showToast("Image must be smaller than 5MB.", "error");
        return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setAvatarPreview(e.target.result);
    reader.readAsDataURL(file);
});

// ─── Gender ───────────────────────────────────────────────────────────────
document.querySelectorAll(".gender-btn").forEach(btn => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".gender-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        selectedGender = btn.dataset.gender;
    });
});

// ─── Interests ────────────────────────────────────────────────────────────
interestsWrap.addEventListener("click", (e) => {
    if (e.target.classList.contains("remove-tag") || e.target.closest(".remove-tag")) return;
    interestsDropdown.classList.toggle("open");
    interestsChevron.classList.toggle("rotated", interestsDropdown.classList.contains("open"));
});

document.addEventListener("click", (e) => {
    if (!interestsWrap.contains(e.target)) {
        interestsDropdown.classList.remove("open");
        interestsChevron.classList.remove("rotated");
    }
});

document.querySelectorAll(".interest-option").forEach(opt => {
    opt.addEventListener("click", (e) => {
        e.stopPropagation();
        const val = opt.dataset.val;
        if (selectedInterests.includes(val)) {
            selectedInterests = selectedInterests.filter(i => i !== val);
            opt.classList.remove("selected");
        } else if (selectedInterests.length < 6) {
            selectedInterests.push(val);
            opt.classList.add("selected");
        } else {
            showToast("Max 6 interests allowed", "warning");
            return;
        }
        renderInterestTags();
    });
});

function renderInterestTags() {
    interestsWrap.querySelectorAll(".interest-tag").forEach(t => t.remove());
    if (selectedInterests.length) {
        interestsPlaceholder.style.display = "none";
        selectedInterests.forEach(val => {
            const tag = document.createElement("div");
            tag.className = "interest-tag";
            tag.innerHTML = `${val} <span class="remove-tag" data-val="${val}">×</span>`;
            tag.querySelector(".remove-tag").addEventListener("click", (e) => {
                e.stopPropagation();
                selectedInterests = selectedInterests.filter(i => i !== val);
                document.querySelector(`.interest-option[data-val="${val}"]`)?.classList.remove("selected");
                renderInterestTags();
            });
            interestsWrap.insertBefore(tag, interestsChevron);
        });
    } else {
        interestsPlaceholder.style.display = "";
    }
}

// ─── Location: Helpers ────────────────────────────────────────────────────
function showLocationResult(displayText) {
    selectedLocation.display = displayText;
    locationDisplay.textContent = displayText;
    locationOptions.style.display = "none";
    locationManualWrap.style.display = "none";
    locationDetecting.style.display = "none";
    locationResult.style.display = "flex";
}

function resetLocationUI() {
    selectedLocation = { city: "", country: "", display: "", lat: null, lng: null };
    locationResult.style.display = "none";
    locationManualWrap.style.display = "none";
    locationDetecting.style.display = "none";
    locationOptions.style.display = "flex";
    locationManualInput.value = "";
    clearError(locationErr);
}

// ─── Location: Reverse geocode using Open Nominatim (free, no key) ────────
async function reverseGeocode(lat, lng) {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { "Accept-Language": "en" } }
        );
        const data = await res.json();
        const addr = data.address || {};
        const city = addr.city || addr.town || addr.village || addr.county || "";
        const state = addr.state || "";
        const country = addr.country || "";
        const parts = [city, state !== city ? state : "", country].filter(Boolean);
        return { city, country, display: parts.join(", ") || data.display_name || `${lat}, ${lng}` };
    } catch {
        return { city: "", country: "", display: `${lat.toFixed(4)}, ${lng.toFixed(4)}` };
    }
}

// ─── Location: Permission Modal flow ─────────────────────────────────────
function openPermissionModal() {
    locationPermModal.style.display = "flex";
}
function closePermissionModal() {
    locationPermModal.style.display = "none";
}

detectLocationBtn.addEventListener("click", () => {
    openPermissionModal();
});

modalDenyBtn.addEventListener("click", () => {
    closePermissionModal();
    showToast("Location access denied.", "warning");
});

modalAllowBtn.addEventListener("click", () => {
    closePermissionModal();
    if (!navigator.geolocation) {
        showToast("Geolocation is not supported by your browser.", "error");
        return;
    }

    // Show spinner
    locationOptions.style.display = "none";
    locationDetecting.style.display = "flex";

    navigator.geolocation.getCurrentPosition(
        async (pos) => {
            const { latitude, longitude } = pos.coords;
            selectedLocation.lat = latitude;
            selectedLocation.lng = longitude;

            const geo = await reverseGeocode(latitude, longitude);
            selectedLocation.city = geo.city;
            selectedLocation.country = geo.country;

            showLocationResult(geo.display);
            showToast("Location detected successfully!", "success");
        },
        (err) => {
            locationDetecting.style.display = "none";
            locationOptions.style.display = "flex";

            const msgs = {
                1: "Location permission was denied by the browser.",
                2: "Unable to determine your position.",
                3: "Location request timed out."
            };
            showToast(msgs[err.code] || "Could not detect location.", "error");
        },
        { timeout: 12000, enableHighAccuracy: true }
    );
});

// Manual location
manualLocationBtn.addEventListener("click", () => {
    locationOptions.style.display = "none";
    locationManualWrap.style.display = "flex";
    locationManualInput.focus();
});

function confirmManualLocation() {
    const val = locationManualInput.value.trim();
    if (!val) {
        setError(locationErr, "Please enter your location.");
        return;
    }
    clearError(locationErr);
    selectedLocation = { city: "", country: "", display: val, lat: null, lng: null };
    showLocationResult(val);
    showToast("Location saved!", "success");
}

locManualConfirmBtn.addEventListener("click", confirmManualLocation);
locationManualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") confirmManualLocation();
});

changeLocationBtn.addEventListener("click", () => {
    resetLocationUI();
});

// ─── Validation helpers ───────────────────────────────────────────────────
function setError(el, msg) {
    if (!el) return;
    el.textContent = msg;
}
function clearError(el) {
    if (!el) return;
    el.textContent = "";
}

function validateName() {
    const val = fullNameInput.value.trim();
    if (!val) {
        fullNameInput.classList.add("invalid");
        setError(nameErr, "Full name is required.");
        return false;
    }
    if (val.length < 2) {
        fullNameInput.classList.add("invalid");
        setError(nameErr, "Name must be at least 2 characters.");
        return false;
    }
    if (!/^[a-zA-Z\s'.'-]+$/.test(val)) {
        fullNameInput.classList.add("invalid");
        setError(nameErr, "Name contains invalid characters.");
        return false;
    }
    fullNameInput.classList.remove("invalid");
    clearError(nameErr);
    return true;
}

function validatePhone() {
    const val = phoneInput.value.trim();
    if (!val) { clearError(phoneErr); return true; } // optional
    if (!/^\d{6,15}$/.test(val.replace(/\s/g, ""))) {
        phoneInput.classList.add("invalid");
        setError(phoneErr, "Enter a valid phone number (6–15 digits).");
        return false;
    }
    phoneInput.classList.remove("invalid");
    clearError(phoneErr);
    return true;
}

function validateEmail() {
    const val = emailInput.value.trim();
    if (!val) { clearError(emailErr); return true; } // optional
    const emailReg = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailReg.test(val)) {
        emailInput.classList.add("invalid");
        setError(emailErr, "Enter a valid email address.");
        return false;
    }
    emailInput.classList.remove("invalid");
    clearError(emailErr);
    return true;
}

function validateDOB() {
    const val = dobInput.value;
    if (!val) { clearError(dobErr); return true; } // optional
    const dob = new Date(val);
    const now = new Date();
    const age = now.getFullYear() - dob.getFullYear();
    if (dob > now) {
        dobInput.classList.add("invalid");
        setError(dobErr, "Date of birth cannot be in the future.");
        return false;
    }
    if (age > 120) {
        dobInput.classList.add("invalid");
        setError(dobErr, "Please enter a valid date of birth.");
        return false;
    }
    dobInput.classList.remove("invalid");
    clearError(dobErr);
    return true;
}

function validateAll() {
    const n = validateName();
    const p = validatePhone();
    const e = validateEmail();
    const d = validateDOB();
    return n && p && e && d;
}

// Live validation
fullNameInput.addEventListener("input", () => { if (fullNameInput.value.trim()) validateName(); });
phoneInput.addEventListener("input", () => { if (phoneInput.value.trim()) validatePhone(); else { phoneInput.classList.remove("invalid"); clearError(phoneErr); } });
emailInput.addEventListener("input", () => { if (emailInput.value.trim()) validateEmail(); else { emailInput.classList.remove("invalid"); clearError(emailErr); } });
dobInput.addEventListener("change", () => validateDOB());

// ─── Profile helpers ──────────────────────────────────────────────────────
function getProfileKey(uid) { return `nextalk_profile_${uid}`; }
function saveProfileLocally(uid, d) { localStorage.setItem(getProfileKey(uid), JSON.stringify(d)); }
function loadProfile(uid) { const r = localStorage.getItem(getProfileKey(uid)); return r ? JSON.parse(r) : null; }
function isProfileComplete(uid) { const p = loadProfile(uid); return p && p.setupDone === true; }

async function saveProfileToFirestore(uid, data) {
    try {
        const firestoreData = {
            uid: data.uid,
            name: data.name,
            status: data.status,
            email: data.email,
            phone: data.phone,
            dob: data.dob,
            gender: data.gender,
            interests: data.interests,
            location: data.location,         // ← location object saved to Firestore
            setupDone: data.setupDone,
            createdAt: serverTimestamp(),
            avatar: data.avatar && data.avatar.startsWith("http") ? data.avatar : "",
        };
        await setDoc(doc(db, "users", uid), firestoreData);
    } catch (err) {
        console.warn("Firestore profile save failed (non-critical):", err);
    }
}

// ─── Auth ─────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
    if (!user) { window.location.href = "./authentication.html"; return; }
    if (isProfileComplete(user.uid)) { window.location.href = "./chatdashboard.html"; return; }
    prefillFromFirebase(user);
});

function prefillFromFirebase(user) {
    if (user.displayName) fullNameInput.value = user.displayName;
    if (user.photoURL) setAvatarPreview(user.photoURL);
    if (user.email) emailInput.value = user.email;
}

// ─── Build profile data ───────────────────────────────────────────────────
function buildProfileData(user) {
    const phone = phoneInput.value.trim();
    const fullPhone = phone ? `${countryCode.value} ${phone}` : "";
    return {
        uid: user.uid,
        name: fullNameInput.value.trim(),
        status: statusInput.value.trim() || "Hey there! I'm using NexTalk",
        avatar: avatarPreview.src && avatarPreview.classList.contains("visible")
            ? avatarPreview.src
            : (user.photoURL || ""),
        email: emailInput.value.trim() || user.email || "",
        phone: fullPhone,
        dob: dobInput.value || "",
        gender: selectedGender || "",
        interests: selectedInterests,
        location: {
            display: selectedLocation.display || "",
            city: selectedLocation.city || "",
            country: selectedLocation.country || "",
            lat: selectedLocation.lat,
            lng: selectedLocation.lng,
        },
        setupDone: true,
        createdAt: Date.now()
    };
}

// ─── Continue ─────────────────────────────────────────────────────────────
continueBtn.addEventListener("click", async () => {
    if (!validateAll()) {
        showToast("Please fix the errors before continuing.", "error");
        return;
    }

    const user = auth.currentUser;
    if (!user) return;

    continueBtn.disabled = true;
    continueBtn.textContent = "Saving…";

    const profileData = buildProfileData(user);

    saveProfileLocally(user.uid, profileData);
    await saveProfileToFirestore(user.uid, profileData);

    showToast("Profile saved! Taking you in 🎉", "success");
    setTimeout(() => { window.location.href = "./chatdashboard.html"; }, 1300);
});

// ─── Skip ─────────────────────────────────────────────────────────────────
skipBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) return;

    const profile = {
        uid: user.uid,
        name: user.displayName || fullNameInput.value.trim() || "NexTalk User",
        status: "Hey there! I'm using NexTalk",
        avatar: user.photoURL || "",
        email: user.email || "",
        phone: "",
        dob: "",
        gender: "",
        interests: [],
        location: { display: "", city: "", country: "", lat: null, lng: null },
        setupDone: true,
        createdAt: Date.now()
    };

    saveProfileLocally(user.uid, profile);
    await saveProfileToFirestore(user.uid, profile);

    showToast("Skipped! You can update your profile later.", "warning");
    setTimeout(() => { window.location.href = "./chatdashboard.html"; }, 1300);
});
