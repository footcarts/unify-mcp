import axios, { AxiosRequestConfig } from "axios";
import { APP_API, APP_DOMAIN } from "../config.js";
import { forceReauth, getAccessToken } from "../auth/session.js";

export interface AppApiRequest {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export async function appApi<T = unknown>(req: AppApiRequest): Promise<T> {
  return await call<T>(req, false);
}

async function call<T>(req: AppApiRequest, retried: boolean): Promise<T> {
  const token = retried ? await forceReauth() : await getAccessToken();
  const url = buildUrl(req);
  const config: AxiosRequestConfig = {
    method: req.method,
    url,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      origin: `https://${APP_DOMAIN}`,
      referer: `https://${APP_DOMAIN}/`,
    },
    data: req.body,
    validateStatus: () => true,
  };
  const res = await axios(config);
  if (res.status === 401 && !retried) return call<T>(req, true);
  if (res.status < 200 || res.status >= 300) {
    throw new Error(
      `Unify app-api ${req.method} ${req.path} → ${res.status}: ${redact(res.data)}`
    );
  }
  return res.data as T;
}

const SENSITIVE_KEYS = ["access_token", "id_token", "refresh_token", "code", "password"];

function redact(data: unknown): string {
  try {
    return JSON.stringify(data, (k, v) =>
      SENSITIVE_KEYS.includes(k) ? "[redacted]" : v
    ).slice(0, 500);
  } catch {
    return "[unserializable]";
  }
}

function buildUrl(req: AppApiRequest): string {
  const base = `${APP_API}${req.path}`;
  if (!req.query) return base;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    if (v !== undefined) params.append(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
