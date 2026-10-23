import { readFileSync, statSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

export type Win = { used: number | null; resetsAtMs: number | null }
export type Windows = { five: Win; week: Win; updatedAtMs: number | null }

export const CLAUDE_CACHE = join(tmpdir(), "claude", "statusline-usage-cache.json")
export const CODEX_FILE = join(homedir(), ".cache", "opencode", "usage-bars-cx.json")
export const CLAUDE_STATUS = join(tmpdir(), "claude", "usage-bars-cc-status.json")
export const CODEX_STATUS = join(homedir(), ".cache", "opencode", "usage-bars-cx-status.json")
export const COPILOT_FILE = join(homedir(), ".cache", "opencode", "usage-bars-gh.json")
export const COPILOT_STATUS = join(homedir(), ".cache", "opencode", "usage-bars-gh-status.json")
export const CONFIG_FILE = fileURLToPath(new URL("./usage-bars.config.json", import.meta.url))
export const STALE_MS = 30 * 60_000

export type ErrorKind = "rate_limited" | "auth" | "token" | "unreachable" | "bad_response"
export type FetchStatus = { at: number; kind: ErrorKind; httpStatus: number | null; retryAt: number }

const ERROR_KINDS: ErrorKind[] = ["rate_limited", "auth", "token", "unreachable", "bad_response"]

const pad = (n: number) => String(n).padStart(2, "0")

export function relative(ms: number): string {
  const m = Math.round(Math.max(0, ms) / 60_000)
  if (m < 1) return "<1m"
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h${pad(m % 60)}m`
  return `${Math.floor(h / 24)}d ${h % 24}h`
}

export function ago(ms: number): string {
  const m = Math.floor(ms / 60_000)
  if (m < 60) return `${Math.max(1, m)}m`
  const h = Math.floor(m / 60)
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const isoMs = (v: unknown): number | null => {
  if (typeof v !== "string") return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}
const secToMs = (v: unknown): number | null => {
  const n = num(v)
  return n === null ? null : n * 1000
}

export function claudeWindows(raw: any, updatedAtMs: number | null): Windows | null {
  if (!raw || typeof raw !== "object") return null
  return {
    five: { used: num(raw.five_hour?.utilization), resetsAtMs: isoMs(raw.five_hour?.resets_at) },
    week: { used: num(raw.seven_day?.utilization), resetsAtMs: isoMs(raw.seven_day?.resets_at) },
    updatedAtMs,
  }
}

export function codexWindows(raw: any): Windows | null {
  if (!raw || typeof raw !== "object") return null
  return {
    five: { used: num(raw.fiveHour?.usedPercent), resetsAtMs: secToMs(raw.fiveHour?.resetsAt) },
    week: { used: num(raw.weekly?.usedPercent), resetsAtMs: secToMs(raw.weekly?.resetsAt) },
    updatedAtMs: num(raw.fetchedAt),
  }
}

export function copilotWindows(raw: any): Windows | null {
  if (!raw || typeof raw !== "object") return null
  return {
    five: { used: num(raw.usedPercent), resetsAtMs: isoMs(raw.resetsAt) },
    week: { used: null, resetsAtMs: null },
    updatedAtMs: num(raw.fetchedAt),
  }
}

export function copilotDetail(raw: any): string | null {
  if (!raw || typeof raw !== "object") return null
  if (raw.unlimited === true) return "unlimited"
  if (num(raw.usedPercent) === null && typeof raw.plan === "string" && raw.plan) return raw.plan
  return null
}

export function errorLabel(status: FetchStatus, now = Date.now()): string {
  switch (status.kind) {
    case "rate_limited":
      return status.retryAt > now ? `rate limited · retry ${relative(status.retryAt - now)}` : "rate limited"
    case "auth":
      return "auth failed"
    case "token":
      return "login needed"
    case "unreachable":
      return "unreachable"
    default:
      return "bad response"
  }
}

export function readStatus(path: string): FetchStatus | null {
  const raw = readJson(path)
  if (!raw || !ERROR_KINDS.includes(raw.kind)) return null
  return {
    at: num(raw.at) ?? 0,
    kind: raw.kind,
    httpStatus: num(raw.httpStatus),
    retryAt: num(raw.retryAt) ?? 0,
  }
}

export type Seg = { label: string; pct: number | null; reset: string }
export type Provider = {
  name: string
  five: Seg | null
  week: Seg | null
  stale: string | null
  error: string | null
  detail: string | null
}
export type ProviderOptions = { fiveLabel?: string; weekLabel?: string | null; detail?: string | null }
export type Level = "none" | "success" | "warning" | "error"

function seg(label: string, win: Win, now: number): Seg {
  if (win.used === null || (win.resetsAtMs !== null && win.resetsAtMs < now)) return { label, pct: null, reset: "" }
  const pct = Math.min(100, Math.max(0, Math.floor(win.used)))
  if (win.resetsAtMs === null) return { label, pct, reset: "" }
  return { label, pct, reset: `in ${relative(win.resetsAtMs - now)}` }
}

export function provider(
  name: string,
  windows: Windows | null,
  status: FetchStatus | null = null,
  now = Date.now(),
  options: ProviderOptions = {},
): Provider {
  const error = status ? errorLabel(status, now) : null
  if (!windows) return { name, five: null, week: null, stale: null, error, detail: null }
  const age = windows.updatedAtMs === null ? null : now - windows.updatedAtMs
  const weekLabel = options.weekLabel === undefined ? "7d" : options.weekLabel
  return {
    name,
    five: seg(options.fiveLabel ?? "5h", windows.five, now),
    week: weekLabel === null ? null : seg(weekLabel, windows.week, now),
    stale: age !== null && age > STALE_MS ? ago(age) : null,
    error,
    detail: options.detail ?? null,
  }
}

export type ProviderId = "cc" | "cx" | "gh"
export type View = Record<ProviderId, Provider | null>

const CONFIG_KEYS: Record<ProviderId, string> = { cc: "claude", cx: "codex", gh: "copilot" }

// Only an explicit `false` disables a provider; a missing or unreadable file keeps everything on.
export function enabledProviders(path = CONFIG_FILE): Record<ProviderId, boolean> {
  const flags = readJson(path)?.providers
  const on = (id: ProviderId) => flags?.[CONFIG_KEYS[id]] !== false
  return { cc: on("cc"), cx: on("cx"), gh: on("gh") }
}

export function summary(view: View): string {
  const part = (p: Provider) => {
    const flag = p.error ? " !" : ""
    if (!p.five) return `${p.name} n/a${flag}`
    const pct = p.five.pct === null ? "--" : `${p.five.pct}%`
    return `${p.name} ${p.stale ? "~" : ""}${pct}${flag}`
  }
  return [view.cc, view.cx, view.gh]
    .filter((p): p is Provider => p !== null)
    .map(part)
    .join(" · ")
}

export const BAR_WIDTH = 8

export function bar(pct: number | null, width = BAR_WIDTH) {
  let filled = pct === null ? 0 : Math.round((pct / 100) * width)
  if (pct !== null && pct > 0 && filled === 0) filled = 1
  return { full: "━".repeat(filled), empty: "─".repeat(width - filled) }
}

export const level = (pct: number | null): Level =>
  pct === null ? "none" : pct >= 85 ? "error" : pct >= 50 ? "warning" : "success"

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return null
  }
}

function mtimeMs(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  } catch {
    return null
  }
}

// An error older than the cache is obsolete: the data was refreshed after it (e.g. by Claude Code's own statusline).
function currentStatus(statusPath: string, cachePath: string): FetchStatus | null {
  const status = readStatus(statusPath)
  const cached = mtimeMs(cachePath)
  return status && (cached === null || status.at >= cached) ? status : null
}

export function usageView(now = Date.now(), enabled = enabledProviders()): View {
  const copilot = enabled.gh ? readJson(COPILOT_FILE) : null
  return {
    cc: enabled.cc
      ? provider("cc", claudeWindows(readJson(CLAUDE_CACHE), mtimeMs(CLAUDE_CACHE)), currentStatus(CLAUDE_STATUS, CLAUDE_CACHE), now)
      : null,
    cx: enabled.cx
      ? provider("cx", codexWindows(readJson(CODEX_FILE)), currentStatus(CODEX_STATUS, CODEX_FILE), now)
      : null,
    gh: enabled.gh
      ? provider("gh", copilotWindows(copilot), currentStatus(COPILOT_STATUS, COPILOT_FILE), now, {
          fiveLabel: "mo",
          weekLabel: null,
          detail: copilotDetail(copilot),
        })
      : null,
  }
}

export function parseCopilotUser(data: any) {
  if (!data || typeof data !== "object") return null
  const plan = typeof data.copilot_plan === "string" ? data.copilot_plan.trim().slice(0, 32) : ""
  const resetRaw = data.quota_reset_date_utc ?? data.quota_reset_date
  const resetMs = isoMs(resetRaw)
  const resetsAt = resetMs === null ? null : new Date(resetMs).toISOString()
  const snapshot = data.quota_snapshots?.premium_interactions
  const entitlement = num(snapshot?.entitlement)
  const remaining = num(snapshot?.quota_remaining ?? snapshot?.remaining)

  if (snapshot?.unlimited === true) return { usedPercent: null, resetsAt, plan, unlimited: true }
  if (entitlement !== null && entitlement > 0 && remaining !== null) {
    const used = ((entitlement - remaining) / entitlement) * 100
    return { usedPercent: Math.min(100, Math.max(0, used)), resetsAt, plan, unlimited: false }
  }
  // Business/Enterprise seats and token-based billing report the plan but no usable per-user snapshot.
  if (data.token_based_billing === true || plan) return { usedPercent: null, resetsAt, plan, unlimited: false }
  return null
}

export function parseWham(data: any, now = Date.now()) {
  const out: Record<string, { usedPercent: number; resetsAt: number | null }> = {}
  for (const w of [data?.rate_limit?.primary_window, data?.rate_limit?.secondary_window]) {
    if (!w || typeof w.used_percent !== "number") continue
    const kind = w.limit_window_seconds === 18000 ? "fiveHour" : w.limit_window_seconds === 604800 ? "weekly" : null
    if (!kind) continue
    const resetsAt =
      typeof w.reset_at === "number"
        ? w.reset_at
        : typeof w.reset_after_seconds === "number"
          ? Math.round(now / 1000 + w.reset_after_seconds)
          : null
    out[kind] = { usedPercent: w.used_percent, resetsAt }
  }
  return out
}

export function accountIdFromJwt(token: string): string | undefined {
  try {
    const payload = token.split(".")[1]
    const claims = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
    return claims?.["https://api.openai.com/auth"]?.chatgpt_account_id ?? undefined
  } catch {
    return undefined
  }
}
