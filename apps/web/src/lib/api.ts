const DEFAULT_LOCAL_API_URL = "http://localhost:8000";

function inferApiBaseUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window === "undefined") {
    return DEFAULT_LOCAL_API_URL;
  }

  const hostname = window.location.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.endsWith(".local")
  ) {
    return DEFAULT_LOCAL_API_URL;
  }

  return "";
}

export const API_BASE_URL = inferApiBaseUrl();

export async function readApiError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  const detail = body?.detail;

  if (typeof detail === "string") {
    return detail;
  }

  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => (typeof item?.msg === "string" ? item.msg : null))
      .filter(Boolean);
    if (messages.length > 0) {
      return messages.join("\n");
    }
  }

  return fallback;
}
