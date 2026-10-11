
const $ = (id) => document.getElementById(id);

const authCard = $("authCard");
const dashboard = $("dashboard");
const authForm = $("authForm");
const nameField = $("nameField");
const confirmField = $("confirmField");
const strengthBox = $("strengthBox");
const loginTab = $("loginTab");
const registerTab = $("registerTab");
const submitButton = $("submitButton");
const submitText = $("submitText");
const formMessage = $("formMessage");
const passwordInput = $("password");
let mode = "login";
let toastTimer;

function setMessage(message, type = "") {
  formMessage.textContent = message;
  formMessage.className = "form-message" + (type ? " " + type : "");
}

function toast(message) {
  const element = $("toast");
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("show"), 3200);
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Something went wrong. Please try again.");
  }
  return result;
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";

  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));

  nameField.classList.toggle("hidden", !registering);
  confirmField.classList.toggle("hidden", !registering);
  strengthBox.classList.toggle("hidden", !registering);
  $("loginExtras").classList.toggle("hidden", registering);

  $("formHeading").innerHTML = registering
    ? "<h2>Create your space<span class='accent'>.</span></h2><p>Your secure space starts with a few details.</p>"
    : "<h2>Welcome back<span class='accent'>.</span></h2><p>Enter your details to access your space.</p>";

  $("name").required = registering;
  $("confirmPassword").required = registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  passwordInput.placeholder = registering ? "Create a strong password" : "Enter your password";
  $("passwordHint").textContent = registering ? "10+ characters" : "Keep it private";
  submitText.textContent = registering ? "Create secure account" : "Sign in securely";
  setMessage("");
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

$("togglePassword").addEventListener("click", () => {
  const show = passwordInput.type === "password";
  passwordInput.type = show ? "text" : "password";
  $("togglePassword").textContent = show ? "Hide" : "Show";
  $("togglePassword").setAttribute("aria-label", show ? "Hide password" : "Show password");
});

passwordInput.addEventListener("input", () => {
  if (mode !== "register") return;

  const value = passwordInput.value;
  let score = 0;
  if (value.length >= 10) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;

  const labels = ["Add a password", "Needs improvement", "Getting stronger", "Strong password", "Excellent password"];
  const colors = ["#77758f", "#fb7185", "#fbbf24", "#34d399", "#a78bfa"];
  $("strengthFill").style.width = (score * 25) + "%";
  $("strengthFill").style.background = colors[score];
  $("strengthText").textContent = labels[score];
});

function showDashboard(user) {
  authCard.classList.add("hidden");
  dashboard.classList.remove("hidden");
  $("userName").textContent = user.name.split(" ")[0];
  $("profileName").textContent = user.name;
  $("profileEmail").textContent = user.email;
  $("profileAvatar").textContent = user.name.trim().charAt(0).toUpperCase();
  $("dashboardMessage").textContent = "";
}

function showAuth() {
  dashboard.classList.add("hidden");
  authCard.classList.remove("hidden");
  authForm.reset();
  $("togglePassword").textContent = "Show";
  passwordInput.type = "password";
  setMode("login");
}

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage("");

  const email = $("email").value.trim();
  const password = passwordInput.value;

  if (!email || !password) {
    setMessage("Please fill in all required fields.", "error");
    return;
  }

  const body = { email, password };

  if (mode === "register") {
    body.name = $("name").value.trim();
    if (password !== $("confirmPassword").value) {
      setMessage("Your passwords do not match.", "error");
      return;
    }
    if (password.length < 10) {
      setMessage("Use at least 10 characters for your password.", "error");
      return;
    }
  }

  submitButton.disabled = true;
  submitText.textContent = mode === "register" ? "Creating your account..." : "Verifying securely...";

  try {
    const endpoint = mode === "register" ? "/api/auth/register" : "/api/auth/login";
    const result = await api(endpoint, {
      method: "POST",
      body: JSON.stringify(body)
    });

    showDashboard(result.data.user);
    toast(result.message || "Authentication successful!");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitText.textContent = mode === "register" ? "Create secure account" : "Sign in securely";
  }
});

$("logoutButton").addEventListener("click", async () => {
  const button = $("logoutButton");
  button.disabled = true;

  try {
    const result = await api("/api/auth/logout", { method: "POST", body: "{}" });
    showAuth();
    toast(result.message || "You have signed out.");
  } catch (error) {
    $("dashboardMessage").textContent = error.message;
    $("dashboardMessage").className = "form-message error";
  } finally {
    button.disabled = false;
  }
});

$("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("light");
  $("themeToggle").textContent = document.body.classList.contains("light") ? "☾" : "☼";
});

// Restore the session by asking the server to verify the HTTP-only cookie.
async function restoreSession() {
  try {
    const result = await api("/api/auth/me");
    showDashboard(result.data.user);
  } catch {
    showAuth();
  }
}

// Lightweight animated particles; pause animation for reduced-motion preference.
(function createParticles() {
  const canvas = $("particles");
  const context = canvas.getContext("2d");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion || !context) return;

  let width = 0;
  let height = 0;
  let particles = [];
  let animationId;

  function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    particles = Array.from({ length: Math.min(65, Math.floor(width / 18)) }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.4,
      speed: Math.random() * 0.25 + 0.08,
      alpha: Math.random() * 0.45 + 0.12
    }));
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    for (const particle of particles) {
      particle.y -= particle.speed;
      if (particle.y < -5) {
        particle.y = height + 5;
        particle.x = Math.random() * width;
      }
      context.beginPath();
      context.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
      context.fillStyle = `rgba(190, 170, 255, ${particle.alpha})`;
      context.fill();
    }
    animationId = requestAnimationFrame(draw);
  }

  resize();
  draw();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
    } else {
      cancelAnimationFrame(animationId);
      draw();
    }
  });
})();

setMode("login");
restoreSession();
