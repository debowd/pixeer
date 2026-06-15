import type { LlmOptions } from './types.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TOKENS = 2048;
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a UI element analyst. Given React component source code for a route, extract all interactive elements (buttons, links, inputs, dialogs, menus) visible to users.

Respond with ONLY a JSON object where:
- Keys are accessible names (what a screen reader or user would call the element)
- Values are one-sentence descriptions of what the element does

Example:
{
  "New Project": "Creates a new project and opens the project setup wizard",
  "Notifications bell": "Opens the notifications panel showing recent activity",
  "Search": "Searches across all projects and documents"
}

Rules:
- Include only interactive elements (skip purely decorative or structural elements)
- Use the element's visible label, aria-label, or placeholder as the key
- Descriptions should say WHAT the element does, not what it is
- Skip layout/navigation wrappers that are not directly actionable
- If an element reveals other elements (dropdown, modal), mention what it reveals`;

function isOpenAiCompatible(url: string): boolean {
  return (
    url.includes('openrouter.ai') ||
    url.includes('chat/completions') ||
    url.includes('ollama') ||
    (!url.includes('anthropic.com') && !url.includes('/messages'))
  );
}

async function callAnthropic(
  url: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  userMessage: string,
): Promise<string> {
  const body = {
    model,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM request failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { content: { type: string; text: string }[] };
  return data.content?.find(b => b.type === 'text')?.text ?? '';
}

async function callOpenAi(
  baseUrl: string,
  apiKey: string,
  model: string,
  maxTokens: number,
  userMessage: string,
): Promise<string> {
  const url = baseUrl.replace(/\/$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';

  const body = {
    model,
    max_tokens: maxTokens,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`LLM request failed ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices?.[0]?.message?.content ?? '';
}

function parseJsonResponse(text: string): Record<string, string> {
  try {
    const clean = text.replace(/^```[a-z]*\n?/m, '').replace(/\n?```$/m, '').trim();
    return JSON.parse(clean) as Record<string, string>;
  } catch {
    return {};
  }
}

export async function callLlm(
  source: string,
  routePath: string,
  options: LlmOptions,
): Promise<Record<string, string>> {
  const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) return {};

  const model = options.model ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const baseUrl = options.baseUrl ?? ANTHROPIC_API_URL;

  const userMessage = `Route: ${routePath}\n\nSource code:\n\`\`\`tsx\n${source}\n\`\`\`\n\nReturn ONLY the JSON object, no markdown fences, no explanation.`;

  let text: string;
  if (isOpenAiCompatible(baseUrl)) {
    text = await callOpenAi(baseUrl, apiKey, model, maxTokens, userMessage);
  } else {
    const url = baseUrl.endsWith('/messages') ? baseUrl : `${baseUrl.replace(/\/$/, '')}/messages`;
    text = await callAnthropic(url, apiKey, model, maxTokens, userMessage);
  }

  return parseJsonResponse(text);
}
