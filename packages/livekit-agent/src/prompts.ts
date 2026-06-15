import { formatStaticAppContext } from 'pixeer';
import type { PixeerVoiceAgentOptions, DiscoveryQuestion } from './types.js';

export const DEFAULT_SYSTEM_PROMPT = `You are a voice-controlled browser assistant powered by Pixeer.
You help users navigate and interact with the current web application using voice commands.

Behaviour:
- Always call get_page_context first to understand what is on screen before acting.
- The get_page_context response includes an "## App Context" section — read it to understand the full app, all routes, and what every element does before deciding your next steps.
- After each action, narrate what you did and what the user sees now — one or two sentences maximum.
- When asked to click something, find the closest accessible name in the element list and use the click tool.
- For form inputs, use the type tool with the input's accessible label.
- If an action fails, explain briefly and suggest an alternative.

Safety:
- Before any form submission, payment, or destructive action, confirm with the user first:
  "Are you sure you want to [action]?" and wait for a "yes" or "confirm" before proceeding.
- Never submit forms or trigger irreversible actions without explicit confirmation.

Keep responses short and conversational — this is a voice interface.`;

/**
 * Build the full system prompt for the Pixeer voice agent.
 *
 * If `appContext` is provided, its static parts (app description, route map,
 * schemas) are prepended so the agent has a mental model of the whole app from
 * the very first turn — before any dom.getContext call.
 *
 * Dynamic context (current view, element hints) is injected per-call by the
 * bridge at runtime; no need to duplicate it here.
 */
export function buildSystemPrompt(
  options: Pick<PixeerVoiceAgentOptions, 'systemPrompt' | 'discoveryQuestions' | 'appContext'>,
): string {
  const basePrompt = options.systemPrompt ?? DEFAULT_SYSTEM_PROMPT;

  const parts: string[] = [];

  // Static app knowledge baked in at session start
  if (options.appContext) {
    parts.push(formatStaticAppContext(options.appContext));
  }

  parts.push(basePrompt);

  if (options.discoveryQuestions?.length) {
    parts.push(buildDiscoveryInstructions(options.discoveryQuestions));
  }

  return parts.join('\n\n');
}

function buildDiscoveryInstructions(questions: DiscoveryQuestion[]): string {
  const list = questions
    .map((q, i) => {
      const hint = q.contextHint ? ` (${q.contextHint})` : '';
      return `${i + 1}. ${q.question}${hint}`;
    })
    .join('\n');

  return `At the very start of this session, greet the user warmly and ask these onboarding questions one at a time — wait for each answer before asking the next:

${list}

Use the answers to personalise your guidance throughout the session. Adapt which features you highlight and how technical your explanations are based on the user's stated role and goals.`;
}
