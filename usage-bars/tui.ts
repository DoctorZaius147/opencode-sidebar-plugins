import { Plugin } from "@opencode/plugin/tui"
import { createElement, effect, insertNode, insert, setProp } from "@opentui/solid"
import { createSignal, onCleanup } from "solid-js"
import { BAR_WIDTH, bar, summary, usageView } from "./lib.ts"
import type { Provider, Seg } from "./lib.ts"

const REFRESH_MS = 30_000
const EMPTY: Seg = { label: "", pct: null, reset: "" }
const STORE_KEY = "usage-bars"

const color = (value: any) => (value && typeof value === "object" && "base" in value ? value.base : value)

function box(direction: "row" | "column") {
  const el = createElement("box")
  setProp(el, "flexDirection", direction)
  return el
}

function Text(text: () => string, fg: () => unknown) {
  const el = createElement("text")
  insert(el, text)
  effect((prev: unknown) => setProp(el, "fg", fg(), prev))
  effect((prev: unknown) => setProp(el, "visible", text() !== "", prev))
  return el
}

function SegRow(theme: any, get: () => Seg | null, stale: () => boolean) {
  const row = box("row")
  setProp(row, "gap", 1)
  setProp(row, "paddingLeft", 2)
  effect((prev: unknown) => setProp(row, "visible", get() !== null, prev))

  const seg = () => get() ?? EMPTY
  const muted = () => theme.text.muted
  const tinted = () => muted()

  const meter = box("row")
  setProp(meter, "width", BAR_WIDTH)
  setProp(meter, "flexShrink", 0)
  insertNode(meter, Text(() => bar(seg().pct).full, tinted))
  insertNode(meter, Text(() => bar(seg().pct).empty, muted))

  insertNode(row, Text(() => seg().label, muted))
  insertNode(row, meter)
  insertNode(row, Text(() => (seg().pct === null ? "--" : `${seg().pct}%`).padStart(4), tinted))
  insertNode(row, Text(() => seg().reset, muted))
  return row
}

const NO_PROVIDER: Provider = { name: "", five: null, week: null, stale: null, error: null, detail: null }

function ProviderBlock(theme: any, current: () => Provider | null) {
  const get = () => current() ?? NO_PROVIDER
  const block = box("column")
  effect((prev: unknown) => setProp(block, "visible", current() !== null, prev))
  const head = box("row")
  setProp(head, "gap", 1)
  const note = () =>
    !get().five ? "n/a" : [get().stale ? `~${get().stale} ago` : "", get().detail ?? ""].filter(Boolean).join(" ")
  insertNode(head, Text(() => get().name, () => theme.text.action?.primary?.selected ?? theme.text.base))
  insertNode(head, Text(note, () => theme.text.muted))
  insertNode(head, Text(() => get().error ?? "", () => color(theme.text.feedback?.error) ?? theme.text.base))
  insertNode(block, head)
  insertNode(block, SegRow(theme, () => get().five, () => get().stale !== null))
  insertNode(block, SegRow(theme, () => get().week, () => get().stale !== null))
  return block
}

function UsageBars(props: { context: any }) {
  const { context } = props
  const theme = context.theme

  let stored: any
  try {
    stored = context.storage.store(STORE_KEY, { initial: { collapsed: false } })
  } catch {}
  const readStored = () => {
    const value = typeof stored?.[0] === "function" ? stored[0]() : stored?.[0]
    return value?.collapsed === true
  }

  const [view, setView] = createSignal(usageView())
  const [collapsed, setCollapsed] = createSignal(readStored())
  const timer = setInterval(() => setView(usageView()), REFRESH_MS)
  onCleanup(() => clearInterval(timer))

  const toggle = () => {
    const next = !collapsed()
    setCollapsed(next)
    try {
      void Promise.resolve(
        stored?.[1]?.((draft: any) => {
          draft.collapsed = next
        }),
      ).catch(() => {})
    } catch {}
  }

  const title = box("row")
  setProp(title, "gap", 1)
  setProp(title, "onMouseUp", toggle)
  insertNode(title, Text(() => (collapsed() ? "▸ Usage" : "▾ Usage"), () => theme.text.muted))
  insertNode(title, Text(() => (collapsed() ? summary(view()) : ""), () => theme.text.muted))

  const body = box("column")
  effect((prev: unknown) => setProp(body, "visible", !collapsed(), prev))
  insertNode(body, ProviderBlock(theme, () => view().cc))
  insertNode(body, ProviderBlock(theme, () => view().cx))
  insertNode(body, ProviderBlock(theme, () => view().gh))

  const root = box("column")
  effect((prev: unknown) => setProp(root, "visible", Object.values(view()).some((p) => p !== null), prev))
  insertNode(root, title)
  insertNode(root, body)
  return root
}

export default Plugin.define({
  id: "usage-bars",
  setup(context: any) {
    return context.ui.slot({
      append: "sidebar.content",
      render: () => UsageBars({ context }),
    })
  },
})
