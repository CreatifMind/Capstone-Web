"use client";

import { useEffect, useState } from "react";

export default function LoginFormBridge({ inactive = false, error }: { inactive?: boolean; error?: string }) {
  const messages: Record<string, string> = {
    config: "Sign in is not configured. Contact an administrator.",
    credentials: "Invalid email or password.",
    profile: "This account is not linked to a workspace profile.",
    role: "This account does not have an authorized workspace role.",
    database: "Workspace profile lookup failed. Please try again.",
    server: "Sign in is temporarily unavailable. Please try again."
  };
  const [message] = useState(inactive ? "This account is inactive. Contact an administrator." : error ? messages[error] || "Sign in is temporarily unavailable. Please try again." : "");

  useEffect(() => {
    const form = document.getElementById("loginForm") as HTMLFormElement | null;
    const password = document.getElementById("password") as HTMLInputElement | null;
    const passwordToggle = document.querySelector<HTMLButtonElement>("[data-login-password-toggle]");
    if (!form) return;
    const togglePassword = () => {
      if (!password || !passwordToggle) return;
      const visible = password.type === "password";
      password.type = visible ? "text" : "password";
      passwordToggle.setAttribute("aria-pressed", String(visible));
      passwordToggle.setAttribute("aria-label", visible ? "Hide password" : "Show password");
      const icon = passwordToggle.querySelector("i");
      if (icon) icon.className = visible ? "fa-solid fa-eye-slash" : "fa-solid fa-eye";
    };
    passwordToggle?.addEventListener("click", togglePassword);
    return () => { passwordToggle?.removeEventListener("click", togglePassword); };
  }, []);

  return <p id="loginError" className="login-auth-error" role="alert" aria-live="polite">{message}</p>;
}
