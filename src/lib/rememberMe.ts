const REMEMBER_FLAG_KEY = "portal_remember_me";
const REMEMBERED_EMAIL_KEY = "portal_remembered_email";

export function getRememberMe(): boolean {
  return localStorage.getItem(REMEMBER_FLAG_KEY) !== "0";
}

export function setRememberMe(remember: boolean): void {
  localStorage.setItem(REMEMBER_FLAG_KEY, remember ? "1" : "0");
}

export function getRememberedEmail(): string {
  return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
}

export function saveRememberedEmail(email: string | null): void {
  if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}
