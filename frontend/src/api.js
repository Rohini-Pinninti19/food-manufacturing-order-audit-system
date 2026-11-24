const API_URL = import.meta.env.VITE_API_URL || "";

export async function api(path, options = {}) {
  const token = localStorage.getItem("erp-token");
  const response = await fetch(`${API_URL}/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (response.status === 401 && path !== "/auth/login") {
    localStorage.removeItem("erp-token");
    window.dispatchEvent(new Event("erp-session-expired"));
  }
  if (!response.ok) {
    let message = `Request failed (${response.status}).`;
    try {
      const payload = await response.json();
      if (payload.error) message = payload.error;
    } catch {
      // The response may be an empty or non-JSON error.
    }
    throw new Error(message);
  }
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/csv") || contentType.includes("application/pdf")) return response.blob();
  return response.status === 204 ? null : response.json();
}

export const money = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
}).format(Number(amount || 0));

export const quantity = (amount, digits = 1) => new Intl.NumberFormat("en-IN", {
  maximumFractionDigits: digits,
}).format(Number(amount || 0));

export const date = (value) => new Intl.DateTimeFormat("en-IN", {
  day: "2-digit",
  month: "short",
  year: "numeric",
}).format(new Date(value));
