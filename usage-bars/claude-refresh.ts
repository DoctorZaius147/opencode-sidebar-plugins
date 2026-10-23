import { spawn } from "node:child_process"
import { existsSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"

export type ClaudeCreds = {
  accessToken: string
  expiresAt: number | null
  hasRefresh: boolean
  refreshExpiresAt: number | null
}

export const EXPIRY_SKEW_MS = 60_000
export const RENEW_TIMEOUT_MS = 40_000
export const RENEW_BACKOFF_MS = 15 * 60_000

const CLAUDE_ARGS = [
  "-p",
  "Reply with the single word ok.",
  "--model",
  "haiku",
  "--no-session-persistence",
  "--disable-slash-commands",
]

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)

export const claudeConfigDir = () => process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude")

function claudeCommand() {
  const local = join(homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude")
  return existsSync(local) ? local : "claude"
}

// Claude Code rewrites this file in place when it refreshes, so a read can see a half-written file.
export async function readClaudeCreds(dir = claudeConfigDir()): Promise<ClaudeCreds | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const oauth = JSON.parse(await readFile(join(dir, ".credentials.json"), "utf8"))?.claudeAiOauth
      if (!oauth || typeof oauth !== "object") return null
      return {
        accessToken: typeof oauth.accessToken === "string" ? oauth.accessToken : "",
        expiresAt: num(oauth.expiresAt),
        hasRefresh: typeof oauth.refreshToken === "string" && oauth.refreshToken !== "",
        refreshExpiresAt: num(oauth.refreshTokenExpiresAt),
      }
    } catch (error: any) {
      if (error?.code === "ENOENT") return null
      await sleep(300)
    }
  }
  return null
}

export function isUsable(creds: ClaudeCreds, now = Date.now()) {
  return creds.accessToken !== "" && (creds.expiresAt === null || creds.expiresAt - EXPIRY_SKEW_MS > now)
}

export function canRefresh(creds: ClaudeCreds, now = Date.now()) {
  return creds.hasRefresh && (creds.refreshExpiresAt === null || creds.refreshExpiresAt > now)
}

function stop(child: ReturnType<typeof spawn>) {
  if (child.pid === undefined) return
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true }).on("error", () => {})
  } else {
    child.kill("SIGTERM")
  }
}

// Starts a minimal headless Claude Code run so it refreshes its own OAuth token, waits until a new
// token is written to the credentials file, then stops the process.
export async function refreshViaClaude(
  opts: {
    stale?: string
    dir?: string
    command?: string
    args?: string[]
    timeoutMs?: number
    pollMs?: number
  } = {},
): Promise<ClaudeCreds | null> {
  const dir = opts.dir ?? claudeConfigDir()
  const pollMs = opts.pollMs ?? 1000
  let exited = false
  const child = spawn(opts.command ?? claudeCommand(), opts.args ?? CLAUDE_ARGS, {
    cwd: tmpdir(),
    stdio: "ignore",
    windowsHide: true,
  })
  child.on("exit", () => (exited = true))
  child.on("error", () => (exited = true))

  const deadline = Date.now() + (opts.timeoutMs ?? RENEW_TIMEOUT_MS)
  try {
    while (Date.now() < deadline) {
      const finished = exited
      const creds = await readClaudeCreds(dir)
      if (creds && isUsable(creds) && creds.accessToken !== opts.stale) return creds
      if (finished) return null
      await sleep(pollMs)
    }
    return null
  } finally {
    if (!exited) stop(child)
  }
}
