/**
 * Pixeer LiveKit voice agent — production entry for the Arc sample app.
 *
 * Run with:
 *   node --experimental-vm-modules node_modules/.bin/livekit-agents start src/main.ts
 *
 * Required env vars:
 *   LIVEKIT_URL        wss://your-project.livekit.cloud
 *   LIVEKIT_API_KEY    api key from LiveKit Cloud project settings
 *   LIVEKIT_API_SECRET api secret from LiveKit Cloud project settings
 *
 * The browser tab must connect to the same LiveKit room and register Pixeer
 * RPC handlers so the agent can read and control the page. See the browser
 * integration guide in the package README.
 *
 * Models used (all via LiveKit Inference — no separate API keys needed):
 *   STT  deepgram/nova-3
 *   LLM  google/gemma-4-31b-it
 *   TTS  deepgram/aura-2 (Athena voice)
 *   VAD  @livekit/agents-plugin-silero (install separately)
 */

import { defineAgent, voice, inference, llm, type JobContext } from '@livekit/agents';
import { withPixeerTools } from './index.js';

// Silero VAD is an optional peer dependency — install with:
//   pnpm add @livekit/agents-plugin-silero
let silero: { VAD: { load: () => Promise<unknown> } } | null = null;
try {
  silero = await import('@livekit/agents-plugin-silero' as string);
} catch {
  // VAD plugin not installed — session will run without explicit VAD
  // (LiveKit Cloud may provide server-side turn detection)
}

export default defineAgent({
  prewarm: async (proc) => {
    if (silero) {
      proc.userData.vad = await (silero.VAD as { load: () => Promise<unknown> }).load();
    }
  },

  entry: withPixeerTools(
    {
      discoveryQuestions: [
        {
          id: 'role',
          question: "Welcome to Arc! I'm Pixeer, your voice assistant. Are you a developer exploring the demo, or evaluating it for your team?",
          contextHint: 'More technical details for developers, feature overview for evaluators.',
        },
      ],
    },
    async ({ ctx, tools, systemPrompt }) => {
      const proc = (ctx as unknown as { proc: { userData: Record<string, unknown> } }).proc;
      const vad = proc?.userData?.vad as Parameters<typeof voice.AgentSession>[0]['vad'] | undefined;

      // Convert Pixeer tool definitions to the LiveKit llm.tool() format
      const lkTools = Object.fromEntries(
        Object.entries(tools).map(([k, v]) => [
          k,
          llm.tool({ description: v.description, parameters: v.parameters, execute: v.execute }),
        ]),
      );

      const session = new voice.AgentSession({
        ...(vad ? { vad } : {}),
        stt: 'deepgram/nova-3:en',
        llm: new inference.LLM({ model: 'google/gemma-4-31b-it' }),
        tts: 'deepgram/aura-2:athena',
      });

      await session.start({
        agent: new voice.Agent({
          instructions: systemPrompt,
          tools: lkTools,
        }),
        room: ctx.room,
      });

      session.generateReply({
        instructions:
          'Greet the user, ask your discovery question, and let them know they can ' +
          'ask you to navigate or explain anything in the app using voice.',
      });

      if (ctx.waitForDisconnect) await ctx.waitForDisconnect();
    },
  ),
});
