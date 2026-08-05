import { isToolCallEventType, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { findBlockableInvocations, type BlockableInvocation } from './detect.js';

/**
 * Builds the block reason naming every distinct disallowed command found and
 * its recommended replacement.
 */
export function buildBlockReason(invocations: BlockableInvocation[]): string {
  const parts = invocations.map((i) => `\`${i.command}\` (use \`${i.replacement}\` instead)`);
  return `Blocked: this command uses disallowed command(s): ${parts.join(', ')}.`;
}

/**
 * Hard-blocks agent-issued `bash` tool calls containing a Blockable
 * Invocation of a disallowed command. Never mutates `event.input` — only
 * ever returns `{ block: true, reason }` or `undefined`.
 */
export default function (pi: ExtensionAPI): void {
  pi.on('tool_call', (event) => {
    if (!isToolCallEventType('bash', event)) return undefined;

    const invocations = findBlockableInvocations(event.input.command);
    if (invocations.length === 0) return undefined;

    return { block: true, reason: buildBlockReason(invocations) };
  });
}
