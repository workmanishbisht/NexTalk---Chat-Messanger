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
    updateProfile
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

// ===== PERSISTENCE FIX — logout tak login yaad rahega =====
setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.error("Persistence error:", err);
});

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider("apple.com");

// ===== ELEMENTS =====
const tabs = document.querySelectorAll(".tab");
const signupForm = document.getElementById("signupForm");
const loginForm = document.getElementById("loginForm");
const resetForm = document.getElementById("resetForm");
const authImage = document.getElementById("authImage");
const forgotBtn = document.getElementById("forgotBtn");
const backToLogin = document.getElementById("backToLogin");
const signupBtn = document.getElementById("signupBtn");
const loginBtn = document.getElementById("loginBtn");
const resetBtn = document.getElementById("resetBtn");
const googleBtn = document.getElementById("googleBtn");
const appleBtn = document.getElementById("appleBtn");
const toastContainer = document.getElementById("toastContainer");

// ===== ALREADY LOGGED IN CHECK =====
// Agar user already logged in hai toh seedha dashboard pe bhejo
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

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

// ===== TAB SWITCHING =====
tabs.forEach(tab => {
    tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");

        const type = tab.getAttribute("data-tab");

        if (type === "signup") {
            signupForm.classList.remove("hidden");
            loginForm.classList.add("hidden");
            resetForm.classList.add("hidden");
            authImage.src = "../Assets/Auth/register.png";
        } else {
            signupForm.classList.add("hidden");
            loginForm.classList.remove("hidden");
            resetForm.classList.add("hidden");
            authImage.src = "../Assets/Auth/login.png";
        }
    });
});

// ===== FORGOT PASSWORD TOGGLE =====
forgotBtn.addEventListener("click", (e) => {
    e.preventDefault();
    loginForm.classList.add("hidden");
    resetForm.classList.remove("hidden");
    tabs.forEach(t => t.classList.remove("active"));
});

backToLogin.addEventListener("click", (e) => {
    e.preventDefault();
    resetForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
    tabs.forEach(t => {
        t.classList.toggle("active", t.getAttribute("data-tab") === "login");
    });
});

// ===== PASSWORD TOGGLE =====
document.querySelectorAll(".toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
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
});

// ===== SIGNUP =====
signupBtn.addEventListener("click", async () => {
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

    if (!name.value.trim()) {
        setError(name, nameErr, "Full name is required.");
        valid = false;
    }

    if (!email.value.trim()) {
        setError(email, emailErr, "Email is required.");
        valid = false;
    } else if (!isValidEmail(email.value.trim())) {
        setError(email, emailErr, "Enter a valid email address.");
        valid = false;
    }

    if (!password.value) {
        setError(password, passwordErr, "Password is required.");
        valid = false;
    } else if (password.value.length < 6) {
        setError(password, passwordErr, "Password must be at least 6 characters.");
        valid = false;
    }

    if (!confirm.value) {
        setError(confirm, confirmErr, "Please repeat your password.");
        valid = false;
    } else if (confirm.value !== password.value) {
        setError(confirm, confirmErr, "Passwords do not match.");
        valid = false;
    }

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
        signupBtn.textContent = "Create Account";
        showToast(getFirebaseError(err.code), "error");
    }
});

// ===== LOGIN =====
loginBtn.addEventListener("click", async () => {
    const email = document.getElementById("loginEmail");
    const password = document.getElementById("loginPassword");
    const emailErr = document.getElementById("loginEmailErr");
    const passwordErr = document.getElementById("loginPasswordErr");

    let valid = true;

    clearError(email, emailErr);
    clearError(password, passwordErr);

    if (!email.value.trim()) {
        setError(email, emailErr, "Email is required.");
        valid = false;
    } else if (!isValidEmail(email.value.trim())) {
        setError(email, emailErr, "Enter a valid email address.");
        valid = false;
    }

    if (!password.value) {
        setError(password, passwordErr, "Password is required.");
        valid = false;
    }

    if (!valid) return;

    loginBtn.disabled = true;
    loginBtn.textContent = "Logging in...";

    try {
        await signInWithEmailAndPassword(auth, email.value.trim(), password.value);
        showToast("Welcome back! Redirecting...", "success");
        setTimeout(() => {
            window.location.href = "./chatdashboard.html";
        }, 1200);
    } catch (err) {
        loginBtn.disabled = false;
        loginBtn.textContent = "Login";
        showToast(getFirebaseError(err.code), "error");
    }
});

// ===== RESET PASSWORD =====
resetBtn.addEventListener("click", async () => {
    const email = document.getElementById("resetEmail");
    const emailErr = document.getElementById("resetEmailErr");

    clearError(email, emailErr);

    if (!email.value.trim()) {
        setError(email, emailErr, "Email is required.");
        return;
    }

    if (!isValidEmail(email.value.trim())) {
        setError(email, emailErr, "Enter a valid email address.");
        return;
    }

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
        resetBtn.textContent = "Reset Password";
    }
});

// ===== GOOGLE LOGIN =====
googleBtn.addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, googleProvider);
        showToast("Signed in with Google!", "success");
        setTimeout(() => {
            window.location.href = "./chatdashboard.html";
        }, 1200);
    } catch (err) {
        if (err.code !== "auth/popup-closed-by-user") {
            showToast(getFirebaseError(err.code), "error");
        }
    }
});

// ===== APPLE LOGIN =====
appleBtn.addEventListener("click", async () => {
    try {
        await signInWithPopup(auth, appleProvider);
        showToast("Signed in with Apple!", "success");
        setTimeout(() => {
            window.location.href = "./chatdashboard.html";
        }, 1200);
    } catch (err) {
        if (err.code !== "auth/popup-closed-by-user") {
            showToast(getFirebaseError(err.code), "error");
        }
    }
});

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
