# Freeze default persistence via `SettingsManager.prototype` patching

`pi`'s built-in behavior writes `defaultModel`, `defaultProvider`, and
`defaultThinkingLevel` to global `settings.json` on every model/thinking-level
change during a session, then reads them back as the starting point for the
next session. We want these three fields to behave as static configuration —
changed only by hand-editing `settings.json`, never as a side effect of using
`pi`.

There's no supported extension hook for this: the writes happen inside
`SettingsManager`'s own methods, called directly by `pi`'s core session code.
The only way to intercept them from an extension is to replace
`setDefaultModel`, `setDefaultProvider`, `setDefaultModelAndProvider`, and
`setDefaultThinkingLevel` on `SettingsManager.prototype` with no-ops at load
time. This works because `pi`'s extension loader aliases
`@earendil-works/pi-coding-agent` to the exact same module instance the CLI
itself uses, so the patched prototype is the live class, not a copy.

This is monkey-patching a private/undocumented surface of the host
application, which is normally something to avoid. We're accepting it here
because this is the approach the `pi` maintainer explicitly recommended for
this use case until "frozen defaults" behavior lands upstream. The
compatibility risk is bounded by that same fact: if a future `pi` release
changes these method names/signatures, it's overwhelmingly likely to be
_because_ this behavior was implemented natively — at which point this
package becomes unnecessary rather than broken. A load-time guard checks that
all four methods still exist before patching, and throws loudly if they
don't, so an incompatible `pi` upgrade fails fast and visibly instead of
silently reverting to unfrozen defaults.
