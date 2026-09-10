import type {
  AgentToolResult,
  AgentToolUpdateCallback,
  ExtensionContext,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import {
  createEditToolDefinition,
  type EditOperations,
  type EditToolDetails,
} from '@earendil-works/pi-coding-agent';
import { Type, type Static } from 'typebox';

// Live-only bypass-request tool; see ADR 0003 — never persisted, registered
// only by session_start (index.ts) when allowAgentBypassRequest + hasUI hold.

const requestCommentExceptionEditSchema = Type.Object({
  oldText: Type.String({
    description:
      'Exact text for one targeted replacement. It must be unique in the original file and must not overlap with any other edits[].oldText in the same call.',
  }),
  newText: Type.String({ description: 'Replacement text for this targeted edit.' }),
});

export const requestCommentExceptionSchema = Type.Object({
  path: Type.String({ description: 'Path to the file to edit (relative or absolute)' }),
  edits: Type.Array(requestCommentExceptionEditSchema, {
    description:
      'One or more targeted replacements, mirroring the edit tool. Each oldText must match a unique region of the current file.',
  }),
  reason: Type.String({
    description:
      'Why this comment should be allowed to exceed the gate threshold and land anyway. Must not be empty.',
  }),
});

export type RequestCommentExceptionInput = Static<typeof requestCommentExceptionSchema>;

export const REQUEST_COMMENT_EXCEPTION_CHOICES = {
  approve: 'Approve — let the comment land as written',
  deny: 'Deny — reject the request',
  requestChanges: 'Request changes — send feedback back to the agent',
} as const;

const {
  approve: APPROVE,
  deny: DENY,
  requestChanges: REQUEST_CHANGES,
} = REQUEST_COMMENT_EXCEPTION_CHOICES;

const CHOICES = [APPROVE, DENY, REQUEST_CHANGES];

function formatEditForReview(
  edit: RequestCommentExceptionInput['edits'][number],
  index: number,
): string {
  return [
    `Edit ${(index + 1).toFixed(0)}:`,
    '  Current text:',
    edit.oldText,
    '  Requested text:',
    edit.newText,
  ].join('\n');
}

function buildPromptTitle(input: RequestCommentExceptionInput): string {
  const edits = input.edits.map(formatEditForReview).join('\n\n');
  return [
    `The agent wants to keep a comment in ${input.path} that gate mode would otherwise strip.`,
    '',
    edits,
    '',
    `Reason given: ${input.reason}`,
  ].join('\n');
}

export interface RequestCommentExceptionToolOptions {
  operations?: EditOperations;
}

export function createRequestCommentExceptionTool(
  options: RequestCommentExceptionToolOptions = {},
): ToolDefinition<typeof requestCommentExceptionSchema, EditToolDetails | undefined> {
  return {
    name: 'request_comment_exception',
    label: 'Request comment exception',
    description:
      "Ask a human to let a comment gate mode would otherwise strip land anyway. Presents the comment's current/requested text and your reason as an approve/deny/request-changes choice. Approved edits are applied exactly like the edit tool, including its oldText staleness check. Nothing about the request is persisted — every call is resolved live, in the moment.",
    promptSnippet: 'Ask a human to approve a comment that exceeds the gate-mode threshold',
    promptGuidelines: [
      'Give a specific, concrete reason — vague justifications are easy to deny.',
      'If denied or asked for changes, shorten the comment or revise it instead of repeating the same request.',
    ],
    parameters: requestCommentExceptionSchema,

    async execute(
      toolCallId: string,
      params: RequestCommentExceptionInput,
      signal: AbortSignal | undefined,
      onUpdate: AgentToolUpdateCallback<EditToolDetails | undefined> | undefined,
      ctx: ExtensionContext,
    ): Promise<AgentToolResult<EditToolDetails | undefined>> {
      if (params.reason.trim() === '') {
        throw new Error('request_comment_exception requires a non-empty reason.');
      }

      const decision = await ctx.ui.select(buildPromptTitle(params), CHOICES);

      if (decision === APPROVE) {
        const editToolDefinition = createEditToolDefinition(
          ctx.cwd,
          options.operations ? { operations: options.operations } : undefined,
        );
        return editToolDefinition.execute(
          toolCallId,
          { path: params.path, edits: params.edits },
          signal,
          onUpdate,
          ctx,
        );
      }

      if (decision === REQUEST_CHANGES) {
        const feedback = await ctx.ui.input('What should change before this comment can land?');
        const trimmedFeedback = feedback?.trim();
        return {
          content: [
            {
              type: 'text',
              text: trimmedFeedback
                ? `The human requested changes instead of approving this comment: ${trimmedFeedback}`
                : 'The human requested changes but did not provide feedback text. Revise the comment (or shorten it) and try again.',
            },
          ],
          details: undefined,
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: 'The human denied this request. Shorten the comment to fit the gate-mode threshold instead.',
          },
        ],
        details: undefined,
      };
    },
  };
}
