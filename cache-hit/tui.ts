import { Plugin } from "@opencode/plugin/tui"
import { createElement, effect, insertNode, insert, setProp } from "@opentui/solid"
import { BUILTIN_ID, ensureBuiltinDisabled } from "./disable-builtin.ts"

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, v) : 0)
const int = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n))

const parts = (m: any) => ({
  input: num(m.tokens?.input),
  output: num(m.tokens?.output),
  reasoning: num(m.tokens?.reasoning),
  read: num(m.tokens?.cache?.read),
  write: num(m.tokens?.cache?.write),
})

const hasUsage = (m: any) => m?.type === "assistant" && m.tokens != null

function boundary(messages: readonly any[], id?: string) {
  return id ? messages.findIndex((m) => m?.id === id) : messages.length
}

function currentUsage(messages: readonly any[], revertID?: string) {
  const end = boundary(messages, revertID)
  if (end < 0) return undefined
  const compaction = messages.findLastIndex((m, i) => i < end && m?.type === "compaction" && m.status === "completed")
  const last = messages.findLast((m, i) => i > compaction && i < end && hasUsage(m))
  if (!last) return { tokens: 0, model: undefined }
  const p = parts(last)
  return { tokens: p.input + p.output + p.reasoning + p.read + p.write, model: last.model }
}

function sessionTotals(messages: readonly any[], revertID?: string) {
  const totals = { input: 0, output: 0, read: 0, write: 0 }
  const end = boundary(messages, revertID)
  if (end < 0) return totals
  messages.forEach((m, i) => {
    if (i >= end || !hasUsage(m)) return
    const p = parts(m)
    totals.input += p.input
    totals.output += p.output
    totals.read += p.read
    totals.write += p.write
  })
  return totals
}

function ContextSection(props: { context: any; sessionID: string }) {
  const { context, sessionID } = props
  const theme = context.theme
  const muted = () => theme.text.muted

  void Promise.resolve(context.data.session.message.sync(sessionID)).catch(() => {})

  const session = () => context.data.session.get(sessionID)
  const messages = () =>
    [...(context.data.session.message.list(sessionID) ?? [])].sort(
      (a: any, b: any) => num(a?.time?.created) - num(b?.time?.created),
    )
  const usage = () => currentUsage(messages(), session()?.revert?.messageID)
  const limit = () => {
    const u = usage()
    const ref = u?.model ?? session()?.model
    const models = context.data.location.model.list(session()?.location) ?? []
    const model = ref ? models.find((m: any) => m.providerID === ref.providerID && m.id === ref.id) : undefined
    return num(model?.limit?.context)
  }
  const percent = () => (limit() > 0 ? Math.round(((usage()?.tokens ?? 0) / limit()) * 100) : 0)
  const totals = () => {
    const s = session()
    if (s?.tokens && !s.revert?.messageID) {
      return {
        input: num(s.tokens.input),
        output: num(s.tokens.output),
        read: num(s.tokens.cache?.read),
        write: num(s.tokens.cache?.write),
      }
    }
    return sessionTotals(messages(), s?.revert?.messageID)
  }
  const hit = () => {
    const t = totals()
    const all = t.input + t.read + t.write
    return all > 0 ? Math.round((t.read / all) * 100) : undefined
  }

  const text = (get: () => string, fg: () => unknown) => {
    const el = createElement("text")
    insert(el, get)
    effect((prev: unknown) => setProp(el, "fg", fg(), prev))
    return el
  }
  const row = (...children: any[]) => {
    const el = createElement("box")
    setProp(el, "flexDirection", "row")
    setProp(el, "gap", 1)
    children.forEach((c) => insertNode(el, c))
    return el
  }

  const root = createElement("box")
  setProp(root, "flexDirection", "column")
  insertNode(root, text(() => "Context", () => theme.text.base))
  insertNode(
    root,
    row(
      text(() => `${int(usage()?.tokens ?? 0)} (${percent()}%)`, muted),
      text(() => {
        const cost = num(context.data.session.cost(sessionID))
        return cost > 0 ? `$${cost.toFixed(2)} spent` : ""
      }, muted),
    ),
  )
  insertNode(
    root,
    text(() => {
      const t = totals()
      const cache = `cache ${hit() === undefined ? "--" : `${hit()}%`} (${int(t.read)})`
      return `↑${int(t.input + t.read + t.write)} ↓${int(t.output)} · ${cache}`
    }, muted),
  )
  return root
}

export default Plugin.define({
  id: "cache-hit",
  setup(context: any) {
    if (context.options?.replaceBuiltin !== false && ensureBuiltinDisabled() === "failed") {
      context.ui.toast.show({
        title: "cache-hit",
        message: `Could not edit cli.json. Add "-${BUILTIN_ID}" to its "plugins" to hide the built-in Context section.`,
        variant: "warning",
        duration: 8000,
      })
    }
    return context.ui.slot({
      prepend: "sidebar.content",
      render: ({ sessionID }: { sessionID: string }) => ContextSection({ context, sessionID }),
    })
  },
})
