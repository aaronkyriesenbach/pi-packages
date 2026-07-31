# pi-frozen-defaults

A `pi` coding-agent extension package that makes `defaultModel`, `defaultProvider`,
and `defaultThinkingLevel` behave as static configuration: they only change when a
user hand-edits `settings.json`, never as a side effect of using `pi`.

## Language

**Frozen Default**:
One of `defaultModel`, `defaultProvider`, or `defaultThinkingLevel` in `settings.json`. Read at session startup to choose the initial model/thinking level, but never written by anything this package touches — only a direct edit to `settings.json` changes it.
_Avoid_: Sticky default, persisted default, saved default (these describe pi's stock behavior, which this package overrides)

**Session-Scoped Switch**:
A model or thinking-level change made during a running session — via `/model`, `Ctrl+P` cycling, or `pi.setModel()`/`pi.setThinkingLevel()`. Affects only the current session's in-memory state and is never written back to a Frozen Default.
_Avoid_: Temporary override (implies it reverts within the same session, which isn't the mechanism — it simply never persists in the first place)

**Freeze**:
The act of replacing `SettingsManager.prototype`'s default-writing methods (`setDefaultModel`, `setDefaultProvider`, `setDefaultModelAndProvider`, `setDefaultThinkingLevel`) with no-ops, performed once when this extension loads.
