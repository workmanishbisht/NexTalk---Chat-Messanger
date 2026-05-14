import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
    getAuth,
    setPersistence,
    browserLocalPersistence,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup,
    updateProfile,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error("Persistence error:", err);
});

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");

// ===== ELEMENTS =====
const signupView = document.getElementById("signupView");
const loginView = document.getElementById("loginView");
const resetView = document.getElementById("resetView");
const toastContainer = document.getElementById("toastContainer");

// Buttons
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const resetBtn = document.getElementById("resetBtn");

const forgotBtn = document.getElementById("forgotBtn");
const backToLogin = document.getElementById("backToLogin");

// Google / Apple — two sets (signup view + login view)
const googleBtn = document.getElementById("googleBtn");
const appleBtn = document.getElementById("appleBtn");
const googleBtn2 = document.getElementById("googleBtn2");
const appleBtn2 = document.getElementById("appleBtn2");

// Switch links
const switchToLoginFromSignup = document.getElementById("switchToLoginFromSignup");
const switchToSignup = document.getElementById("switchToSignup");

// ===== VIEW HELPERS =====
function showView(view) {
    [signupView, loginView, resetView].forEach(v => v.classList.add("hidden"));
    view.classList.remove("hidden");
}

// ===== TAB SWITCHING (each view has its own tab bar) =====
document.addEventListener("click", (e) => {
    const tab = e.target.closest(".tab");
    if (!tab) return;

    const type = tab.getAttribute("data-tab");
    if (type === "signup") showView(signupView);
    else if (type === "login") showView(loginView);
});

// Switch links
switchToLoginFromSignup?.addEventListener("click", (e) => { e.preventDefault(); showView(loginView); });
switchToSignup?.addEventListener("click", (e) => { e.preventDefault(); showView(signupView); });

// ===== ALREADY LOGGED IN CHECK =====
onAuthStateChanged(auth, (user) => {
    if (user) {
        const profile = loadMyProfile(user.uid);
        if (profile && profile.setupDone) {
            window.location.href = "./chatdashboard.html";
        } else {
            window.location.href = "./profilesetup.html";
        }
    }
});

function loadMyProfile(uid) {
    const raw = localStorage.getItem(`nextalk_profile_${uid}`);
    return raw ? JSON.parse(raw) : null;
}

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

// ===== VALIDATION HELPERS =====
function setError(inputEl, errEl, message) {
    inputEl.classList.add("invalid");
    errEl.textContent = message;
}
function clearError(inputEl, errEl) {
    inputEl.classList.remove("invalid");
    errEl.textContent = "";
}
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ===== REDIRECT =====
function redirectToRoom() {
    window.location.href = "./profilesetup.html";
}

// ===== FORGOT PASSWORD =====
forgotBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    showView(resetView);
});

backToLogin?.addEventListener("click", (e) => {
    e.preventDefault();
    showView(loginView);
});

// ===== PASSWORD TOGGLE =====
document.addEventListener("click", (e) => {
    const toggle = e.target.closest(".toggle");
    if (!toggle) return;
    const input = toggle.closest(".input-box").querySelector("input");
    const icon = toggle.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.classList.replace("ri-eye-line", "ri-eye-off-line");
    } else {
        input.type = "password";
        icon.classList.replace("ri-eye-off-line", "ri-eye-line");
    }
});

// ===== SIGNUP =====
signupBtn?.addEventListener("click", async () => {
    const name = document.getElementById("signupName");
    const email = document.getElementById("signupEmail");
    const password = document.getElementById("signupPassword");
    const confirm = document.getElementById("signupConfirm");

    const nameErr = document.getElementById("signupNameErr");
    const emailErr = document.getElementById("signupEmailErr");
    const passwordErr = document.getElementById("signupPasswordErr");
    const confirmErr = document.getElementById("signupConfirmErr");

    let valid = true;
    clearError(name, nameErr);
    clearError(email, emailErr);
    clearError(password, passwordErr);
    clearError(confirm, confirmErr);

    if (!name.value.trim()) { setError(name, nameErr, "Full name is required."); valid = false; }
    if (!email.value.trim()) { setError(email, emailErr, "Email is required."); valid = false; }
    else if (!isValidEmail(email.value.trim())) { setError(email, emailErr, "Enter a valid email address."); valid = false; }
    if (!password.value) { setError(password, passwordErr, "Password is required."); valid = false; }
    else if (password.value.length < 6) { setError(password, passwordErr, "Password must be at least 6 characters."); valid = false; }
    if (!confirm.value) { setError(confirm, confirmErr, "Please repeat your password."); valid = false; }
    else if (confirm.value !== password.value) { setError(confirm, confirmErr, "Passwords do not match."); valid = false; }

    if (!valid) return;

    signupBtn.disabled = true;
    signupBtn.textContent = "Creating account...";

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email.value.trim(), password.value);
        await updateProfile(userCredential.user, { displayName: name.value.trim() });
        showToast("Account created! Welcome to NexTalk 🎉", "success");
        setTimeout(redirectToRoom, 1200);
    } catch (err) {
        signupBtn.disabled = false;
        signupBtn.textContent = "Sign Up";
        showToast(getFirebaseError(err.code), "error");
    }
});

// ===== LOGIN =====
loginBtn?.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail");
    const password = document.getElementById("loginPassword");
    const emailErr = document.getElementById("loginEmailErr");
    const passwordErr = document.getElementById("loginPasswordErr");

    let valid = true;
    clearError(email, emailErr);
    clearError(password, passwordErr);

    if (!email.value.trim()) { setError(email, emailErr, "Email is required."); valid = false; }
    else if (!isValidEmail(email.value.trim())) { setError(email, emailErr, "Enter a valid email address."); valid = false; }
    if (!password.value) { setError(password, passwordErr, "Password is required."); valid = false; }

    if (!valid) return;

    loginBtn.disabled = true;
    loginBtn.textContent = "Signing in...";

    try {
        await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
        showToast("Welcome back! Redirecting...", "success");
        setTimeout(() => { window.location.href = "./chatdashboard.html"; }, 1200);
    } catch (err) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Sign In";
        showToast(getFirebaseError(err.code), "error");
    }
});

// ===== RESET PASSWORD =====
resetBtn?.addEventListener("click", async () => {
    const email = document.getElementById("resetEmail");
    const emailErr = document.getElementById("resetEmailErr");

    clearError(email, emailErr);
    if (!email.value.trim()) { setError(email, emailErr, "Email is required."); return; }
    if (!isValidEmail(email.value.trim())) { setError(email, emailErr, "Enter a valid email address."); return; }

    resetBtn.disabled = true;
    resetBtn.textContent = "Sending...";

    try {
        await sendPasswordResetEmail(auth, email.value.trim());
        showToast("Reset link sent! Check your inbox.", "success");
        email.value = "";
    } catch (err) {
        showToast(getFirebaseError(err.code), "error");
    } finally {
        resetBtn.disabled = false;
        resetBtn.textContent = "Send Reset Link";
    }
});

// ===== GOOGLE LOGIN =====
async function handleGoogle() {
    try {
        await signInWithPopup(auth, googleProvider);
        showToast("Signed in with Google!", "success");
        setTimeout(() => { window.location.href = "./chatdashboard.html"; }, 1200);
    } catch (err) {
        if (err.code !== "auth/popup-closed-by-user") showToast(getFirebaseError(err.code), "error");
    }
}
googleBtn?.addEventListener("click", handleGoogle);
googleBtn2?.addEventListener("click", handleGoogle);

// ===== APPLE LOGIN =====
async function handleApple() {
    try {
        await signInWithPopup(auth, appleProvider);
        showToast("Signed in with Apple!", "success");
        setTimeout(() => { window.location.href = "./chatdashboard.html"; }, 1200);
    } catch (err) {
        if (err.code !== "auth/popup-closed-by-user") showToast(getFirebaseError(err.code), "error");
    }
}
appleBtn?.addEventListener("click", handleApple);
appleBtn2?.addEventListener("click", handleApple);

// ===== FIREBASE ERROR MESSAGES =====
function getFirebaseError(code) {
    const errors = {
        "auth/email-already-in-use": "This email is already registered.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password should be at least 6 characters.",
        "auth/user-not-found": "No account found with this email.",
        "auth/wrong-password": "Incorrect password. Try again.",
        "auth/invalid-credential": "Invalid credentials. Please try again.",
        "auth/too-many-requests": "Too many attempts. Please try again later.",
        "auth/network-request-failed": "Network error. Check your connection.",
        "auth/popup-blocked": "Popup was blocked. Allow popups and try again.",
        "auth/account-exists-with-different-credential": "Account exists with a different sign-in method."
    };
    return errors[code] || "Something went wrong. Please try again.";
}
