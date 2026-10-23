import { Plugin } from "@opencode/plugin"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { canRefresh, isUsable, readClaudeCreds, refreshViaClaude, RENEW_BACKOFF_MS } from "./claude-refresh.ts"
import type { ClaudeCreds } from "./claude-refresh.ts"
import {
  accountIdFromJwt,
  CLAUDE_CACHE,
  CLAUDE_STATUS,
  CODEX_FILE,
  CODEX_STATUS,
  COPILOT_FILE,
  COPILOT_STATUS,
  enabledProviders,
  parseCopilotUser,
  parseWham,
} from "./lib.ts"
import { refreshSource, writeAtomic } from "./refresh.ts"
import type { Outcome } from "./refresh.ts"

const CODEX_URL = "https://chatgpt.com/backend-api/wham/usage"
const CLAUDE_URL = "https://api.anthropic.com/api/oauth/usage"
const COPILOT_PROVIDER = "github-copilot"
const REFRESH_MS = 3 * 60_000
const MIN_AGE_MS = 150_000
const CLAUDE_LOCK = join(tmpdir(), "claude", "usage-bars-cc.lock")
const CODEX_LOCK = join(homedir(), ".cache", "opencode", "usage-bars-cx.lock")
const COPILOT_LOCK = join(homedir(), ".cache", "opencode", "usage-bars-gh.lock")

function copilotApiBase(enterpriseUrl: unknown): string | null {
  if (typeof enterpriseUrl !== "string" || !enterpriseUrl.trim()) return "https://api.github.com"
  try {
    const raw = enterpriseUrl.trim()
    const host = new URL(raw.includes("://") ? raw : `https://${raw}`).hostname.toLowerCase()
    return host.endsWith(".ghe.com") && !host.startsWith("api.") ? `https://api.${host}` : null
  } catch {
    return null
  }
}

function retryAfterMs(response: Response): number | null {
  const seconds = Number(response.headers.get("retry-after"))
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 60 * 60_000) : null
}

function failed(response: Response): Outcome {
  const httpStatus = response.status
  if (httpStatus === 429) return { ok: false, kind: "rate_limited", httpStatus, retryAfterMs: retryAfterMs(response) }
  if (httpStatus === 401 || httpStatus === 403) return { ok: false, kind: "auth", httpStatus }
  return { ok: false, kind: "unreachable", httpStatus }
}

// Asks Claude Code to refresh its own token. Null means a real login is needed or the refresh did not complete.
async function renewClaude(creds: ClaudeCreds): Promise<ClaudeCreds | null> {
  if (!canRefresh(creds)) return null
  return refreshViaClaude({ stale: creds.accessToken })
}

async function fetchClaude(): Promise<Outcome> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return requestClaude(process.env.CLAUDE_CODE_OAUTH_TOKEN)

  let creds = await readClaudeCreds()
  if (!creds) return { ok: false, kind: "token" }
  if (!isUsable(creds)) {
    creds = await renewClaude(creds)
    if (!creds) return { ok: false, kind: "token", retryAfterMs: RENEW_BACKOFF_MS }
  }

  const outcome = await requestClaude(creds.accessToken)
  if (outcome.ok || outcome.kind !== "auth" || outcome.httpStatus !== 401) return outcome

  const renewed = await renewClaude(creds)
  if (!renewed) return { ...outcome, retryAfterMs: RENEW_BACKOFF_MS }
  const retried = await requestClaude(renewed.accessToken)
  return retried.ok ? retried : { ...retried, retryAfterMs: RENEW_BACKOFF_MS }
}

async function requestClaude(token: string): Promise<Outcome> {
  let response: Response
  try {
    response = await fetch(CLAUDE_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "anthropic-beta": "oauth-2025-04-20",
        "User-Agent": "claude-code/2.1.34",
      },
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    return { ok: false, kind: "unreachable" }
  }
  if (!response.ok) return failed(response)

  const body = await response.text()
  let data: any
  try {
    data = JSON.parse(body)
  } catch {
    return { ok: false, kind: "bad_response", httpStatus: response.status }
  }
  if (!data?.five_hour && !data?.seven_day) return { ok: false, kind: "bad_response", httpStatus: response.status }
  return { ok: true, write: () => writeAtomic(CLAUDE_CACHE, body) }
}

export default Plugin.define({
  id: "usage-bars",
  setup(ctx) {
    async function fetchCodex(): Promise<Outcome> {
      let flat: any
      try {
        const connection = await ctx.integration.connection.active("openai")
        if (!connection || connection.type !== "credential") return { ok: false, kind: "token" }
        const value: any = await ctx.integration.connection.resolve(connection)
        flat = { ...value?.metadata, ...value }
      } catch {
        return { ok: false, kind: "auth" }
      }
      const token = typeof flat.access === "string" ? flat.access : ""
      if (!token) return { ok: false, kind: "token" }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "User-Agent": "opencode-usage-bars/1.0",
      }
      const accountId = accountIdFromJwt(token) ?? flat.accountId
      if (accountId) headers["ChatGPT-Account-Id"] = accountId

      let response: Response
      try {
        response = await fetch(CODEX_URL, { headers, signal: AbortSignal.timeout(10_000) })
      } catch {
        return { ok: false, kind: "unreachable" }
      }
      if (!response.ok) return failed(response)

      let windows: ReturnType<typeof parseWham>
      try {
        windows = parseWham(await response.json())
      } catch {
        return { ok: false, kind: "bad_response", httpStatus: response.status }
      }
      if (!windows.fiveHour && !windows.weekly) return { ok: false, kind: "bad_response", httpStatus: response.status }
      return {
        ok: true,
        write: () => writeAtomic(CODEX_FILE, JSON.stringify({ fetchedAt: Date.now(), ...windows })),
      }
    }

    async function fetchCopilot(): Promise<Outcome> {
      let flat: any
      try {
        const connection = await ctx.integration.connection.active(COPILOT_PROVIDER)
        if (!connection || connection.type !== "credential") return { ok: false, kind: "token" }
        const value: any = await ctx.integration.connection.resolve(connection)
        flat = { ...value?.metadata, ...value }
      } catch {
        return { ok: false, kind: "auth" }
      }
      const token = [flat.access, flat.refresh].find((v) => typeof v === "string" && v.trim())?.trim()
      if (!token) return { ok: false, kind: "token" }
      const base = copilotApiBase(flat.enterpriseUrl)
      if (!base) return { ok: false, kind: "bad_response" }

      // If a plugin reroutes Copilot traffic (e.g. through a proxy), it does so by wrapping the global fetch used here.
      let response: Response
      try {
        response = await fetch(`${base}/copilot_internal/user`, {
          headers: {
            Accept: "application/json",
            Authorization: `token ${token}`,
            "Editor-Version": "vscode/1.96.2",
            "Editor-Plugin-Version": "copilot-chat/0.26.7",
            "User-Agent": "GitHubCopilotChat/0.26.7",
            "X-GitHub-Api-Version": "2025-04-01",
          },
          signal: AbortSignal.timeout(10_000),
        })
      } catch {
        return { ok: false, kind: "unreachable" }
      }
      if (!response.ok) return failed(response)

      let parsed: ReturnType<typeof parseCopilotUser>
      try {
        parsed = parseCopilotUser(await response.json())
      } catch {
        return { ok: false, kind: "bad_response", httpStatus: response.status }
      }
      if (!parsed) return { ok: false, kind: "bad_response", httpStatus: response.status }
      return {
        ok: true,
        write: () => writeAtomic(COPILOT_FILE, JSON.stringify({ fetchedAt: Date.now(), ...parsed })),
      }
    }

    const tick = () => {
      const enabled = enabledProviders()
      if (enabled.cc)
        void refreshSource({
          cache: CLAUDE_CACHE,
          status: CLAUDE_STATUS,
          lock: CLAUDE_LOCK,
          minAgeMs: MIN_AGE_MS,
          fetch: fetchClaude,
        })
      if (enabled.cx)
        void refreshSource({
          cache: CODEX_FILE,
          status: CODEX_STATUS,
          lock: CODEX_LOCK,
          minAgeMs: MIN_AGE_MS,
          fetch: fetchCodex,
        })
      if (enabled.gh)
        void refreshSource({
          cache: COPILOT_FILE,
          status: COPILOT_STATUS,
          lock: COPILOT_LOCK,
          minAgeMs: MIN_AGE_MS,
          fetch: fetchCopilot,
        })
    }

    tick()
    const timer = setInterval(tick, REFRESH_MS)
    return () => clearInterval(timer)
  },
})
