import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/**
 * Stub handler that registers for bash tool calls but doesn't block anything yet.
 * Future iterations will parse bash commands and check against disallowed patterns.
 */
export default function (pi: ExtensionAPI): void {
  pi.on('tool_call', (event) => {
    if (event.toolName === 'bash') {
      // Currently returns undefined (doesn't block anything)
      return undefined;
    }
    return undefined;
  });
}
