document.addEventListener("DOMContentLoaded", () => {
  // ================= CONFIGURATION =================
  const CORRECT_PIN = "3071"; // Change this to your desired 4-digit PIN
  const SESSION_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour
  const MAX_ATTEMPTS = 3;

  // LocalStorage Keys
  const STORAGE_KEYS = {
    SESSION_EXPIRY: "voter_dir_session_expiry",
    FAILED_ATTEMPTS: "voter_dir_failed_attempts",
    LOCKOUT_UNTIL: "voter_dir_lockout_until",
  };

  // ================= DOM ELEMENTS =================
  const authOverlay = document.getElementById("authOverlay");
  const mainAppContainer = document.getElementById("mainAppContainer");
  const otpInputs = Array.from(document.querySelectorAll(".otp-box"));
  const verifyPinBtn = document.getElementById("verifyPinBtn");
  const authMessage = document.getElementById("authMessage");
  const lockoutTimerEl = document.getElementById("lockoutTimer");
  const sessionCountdownEl = document.getElementById("sessionCountdown");
  const manualLockBtn = document.getElementById("manualLockBtn");

  let sessionInterval = null;
  let lockoutInterval = null;

  // ================= INITIALIZATION =================
  checkAuthState();

  function checkAuthState() {
    const now = Date.now();
    const lockoutUntil = Number(localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL) || 0);
    const sessionExpiry = Number(localStorage.getItem(STORAGE_KEYS.SESSION_EXPIRY) || 0);

    // 1. Check if user is currently locked out (1-hour block)
    if (lockoutUntil > now) {
      lockApp();
      startLockoutCountdown(lockoutUntil);
      return;
    } else if (lockoutUntil !== 0) {
      // Lockout expired, reset counters
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
      localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
    }

    // 2. Check if user has an active 5-minute session
    if (sessionExpiry > now) {
      unlockApp(sessionExpiry);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SESSION_EXPIRY);
      lockApp();
    }
  }

  // ================= OTP INPUT HANDLING =================
  otpInputs.forEach((input, index) => {
    // Auto-advance on typing
    input.addEventListener("input", (e) => {
      const value = e.target.value.replace(/[^0-9]/g, "");
      e.target.value = value;

      if (value && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      }

      // Auto-submit when all 4 digits are entered
      if (getEnteredPin().length === otpInputs.length) {
        validatePin();
      }
    });

    // Handle Backspace & Arrow keys
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !e.target.value && index > 0) {
        otpInputs[index - 1].focus();
      } else if (e.key === "ArrowLeft" && index > 0) {
        otpInputs[index - 1].focus();
      } else if (e.key === "ArrowRight" && index < otpInputs.length - 1) {
        otpInputs[index + 1].focus();
      } else if (e.key === "Enter") {
        validatePin();
      }
    });

    // Support pasting full 4-digit PIN
    input.addEventListener("paste", (e) => {
      e.preventDefault();
      const pastedData = (e.clipboardData || window.clipboardData)
        .getData("text")
        .replace(/[^0-9]/g, "")
        .slice(0, otpInputs.length);

      pastedData.split("").forEach((char, i) => {
        if (otpInputs[i]) otpInputs[i].value = char;
      });

      if (pastedData.length === otpInputs.length) {
        validatePin();
      } else if (otpInputs[pastedData.length]) {
        otpInputs[pastedData.length].focus();
      }
    });
  });

  verifyPinBtn.addEventListener("click", validatePin);

  manualLockBtn?.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION_EXPIRY);
    clearInterval(sessionInterval);
    lockApp();
  });

  // ================= VALIDATION LOGIC =================
  function getEnteredPin() {
    return otpInputs.map((input) => input.value).join("");
  }

  function clearInputs() {
    otpInputs.forEach((input) => (input.value = ""));
    otpInputs[0].focus();
  }

  function validatePin() {
    const lockoutUntil = Number(localStorage.getItem(STORAGE_KEYS.LOCKOUT_UNTIL) || 0);
    if (lockoutUntil > Date.now()) return;

    const enteredPin = getEnteredPin();

    if (enteredPin.length < otpInputs.length) {
      showError("Please enter all 4 digits.");
      return;
    }

    if (enteredPin === CORRECT_PIN) {
      // Success: Clear attempts & set 5-minute session
      localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
      localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);

      const expiryTime = Date.now() + SESSION_DURATION_MS;
      localStorage.setItem(STORAGE_KEYS.SESSION_EXPIRY, expiryTime.toString());

      authMessage.textContent = "";
      clearInputs();
      unlockApp(expiryTime);
    } else {
      // Failed Attempt
      let attempts = Number(localStorage.getItem(STORAGE_KEYS.FAILED_ATTEMPTS) || 0) + 1;
      localStorage.setItem(STORAGE_KEYS.FAILED_ATTEMPTS, attempts.toString());

      triggerShake();
      clearInputs();

      if (attempts >= MAX_ATTEMPTS) {
        // Block user for 1 hour
        const blockUntil = Date.now() + LOCKOUT_DURATION_MS;
        localStorage.setItem(STORAGE_KEYS.LOCKOUT_UNTIL, blockUntil.toString());
        startLockoutCountdown(blockUntil);
      } else {
        const remaining = MAX_ATTEMPTS - attempts;
        showError(`Incorrect PIN. ${remaining} attempt${remaining > 1 ? "s" : ""} remaining.`);
      }
    }
  }

  // ================= STATE & TIMERS =================
  function unlockApp(expiryTime) {
    authOverlay.classList.add("hidden");
    mainAppContainer.classList.remove("app-locked");

    clearInterval(sessionInterval);
    updateSessionDisplay(expiryTime);

    sessionInterval = setInterval(() => {
      const remaining = expiryTime - Date.now();
      if (remaining <= 0) {
        clearInterval(sessionInterval);
        localStorage.removeItem(STORAGE_KEYS.SESSION_EXPIRY);
        lockApp();
        showError("Your 5-minute session has expired. Please re-enter PIN.");
      } else {
        updateSessionDisplay(expiryTime);
      }
    }, 1000);
  }

  function lockApp() {
    authOverlay.classList.remove("hidden");
    mainAppContainer.classList.add("app-locked");
    setInputsDisabled(false);
    lockoutTimerEl.hidden = true;
    setTimeout(() => otpInputs[0]?.focus(), 100);
  }

  function startLockoutCountdown(lockoutUntil) {
    setInputsDisabled(true);
    authMessage.textContent = "Too many failed attempts. Access blocked for 1 hour.";
    lockoutTimerEl.hidden = false;

    clearInterval(lockoutInterval);
    updateLockoutDisplay(lockoutUntil);

    lockoutInterval = setInterval(() => {
      const remaining = lockoutUntil - Date.now();
      if (remaining <= 0) {
        clearInterval(lockoutInterval);
        localStorage.removeItem(STORAGE_KEYS.LOCKOUT_UNTIL);
        localStorage.removeItem(STORAGE_KEYS.FAILED_ATTEMPTS);
        lockoutTimerEl.hidden = true;
        authMessage.textContent = "";
        setInputsDisabled(false);
        otpInputs[0].focus();
      } else {
        updateLockoutDisplay(lockoutUntil);
      }
    }, 1000);
  }

  function updateSessionDisplay(expiryTime) {
    if (!sessionCountdownEl) return;
    const totalSeconds = Math.max(0, Math.floor((expiryTime - Date.now()) / 1000));
    const mins = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const secs = String(totalSeconds % 60).padStart(2, "0");
    sessionCountdownEl.textContent = `${mins}:${secs}`;
  }

  function updateLockoutDisplay(lockoutUntil) {
    const totalSeconds = Math.max(0, Math.floor((lockoutUntil - Date.now()) / 1000));
    const hrs = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mins = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const secs = String(totalSeconds % 60).padStart(2, "0");
    lockoutTimerEl.textContent = `Try again in ${hrs}:${mins}:${secs}`;
  }

  function setInputsDisabled(disabled) {
    otpInputs.forEach((input) => (input.disabled = disabled));
    verifyPinBtn.disabled = disabled;
  }

  function showError(msg) {
    authMessage.textContent = msg;
  }

  function triggerShake() {
    const card = document.querySelector(".auth-card");
    card.classList.remove("shake");
    void card.offsetWidth; // trigger reflow
    card.classList.add("shake");
  }
});