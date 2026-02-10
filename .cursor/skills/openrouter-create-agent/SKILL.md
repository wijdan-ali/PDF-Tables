---
name: openrouter-create-agent
description: Bootstraps a modular AI agent with OpenRouter SDK, extensible hooks, and optional Ink TUI. Use when building an AI agent with OpenRouter, when the user asks about OpenRouter SDK or create-agent workflow, or when creating agentic applications with unified access to multiple models.
---

# Build a Modular AI Agent with OpenRouter

This skill helps create a **modular AI agent** with:

- **Standalone Agent Core** – Runs independently, extensible via hooks
- **OpenRouter SDK** – Unified access to 300+ language models
- **Optional Ink TUI** – Terminal UI separate from agent logic

## When to Use

Apply this skill when the user:

- Wants to build an AI agent with OpenRouter
- Asks about OpenRouter SDK, `create-agent`, or agentic loops
- Needs a headless agent (CLI, HTTP API, Discord, etc.) with streaming and tools

## Prerequisites

- Get an API key: https://openrouter.ai/settings/keys
- **Never commit API keys.** Use `OPENROUTER_API_KEY` in the environment.

## Architecture

```
Application (Ink TUI | HTTP API | Discord | …)
         │
         ▼
   Agent Core (hooks & lifecycle)
         │
         ▼
   OpenRouter SDK
```

## Project Setup

### 1. Init and dependencies

```bash
mkdir my-agent && cd my-agent
npm init -y
npm pkg set type="module"
npm install @openrouter/sdk zod eventemitter3
npm install ink react  # Optional: only for TUI
npm install -D typescript @types/react tsx
```

### 2. TypeScript config

`tsconfig.json`: `target: ES2022`, `module: NodeNext`, `moduleResolution: NodeNext`, `jsx: react-jsx`, `strict: true`, `outDir: dist`, `include: ["src"]`.

### 3. Scripts

In `package.json`: `"start": "tsx src/cli.tsx"`, `"start:headless": "tsx src/headless.ts"`, `"dev": "tsx watch src/cli.tsx"`.

## File Structure

```
src/
├── agent.ts      # Standalone agent core with hooks
├── tools.ts      # Tool definitions
├── cli.tsx       # Ink TUI (optional)
└── headless.ts   # Headless usage
```

## Agent Core

- Use **EventEmitter** for lifecycle: `message:user`, `message:assistant`, `item:update`, `stream:start`, `stream:delta`, `stream:end`, `tool:call`, `tool:result`, `reasoning:update`, `thinking:start`, `thinking:end`, `error`.
- **OpenRouter client**: `new OpenRouter({ apiKey })`. Call `client.callModel({ model, instructions, input, tools?, stopWhen: [stepCountIs(maxSteps)] })`.
- **Streaming**: Prefer `result.getItemsStream()` (items-based). Emit `item:update` for each item; replace by `item.id` in UI state (Map), do not accumulate chunks.
- **Messages**: Maintain `messages: { role, content }[]`; append user message, then assistant message after stream ends. Expose `getMessages()`, `clearHistory()`, `setInstructions()`.
- **Tools**: Pass `tools` array to `callModel`; support `addTool()` at runtime.

For full `agent.ts` implementation (Message types, AgentConfig, send/sendSync, item handling), see [reference.md](reference.md).

## Tools

Define tools with `tool()` from `@openrouter/sdk`: `name`, `description`, `inputSchema` (zod), `execute` async function. Example:

```typescript
import { tool } from '@openrouter/sdk';
import { z } from 'zod';

export const timeTool = tool({
  name: 'get_current_time',
  description: 'Get the current date and time',
  inputSchema: z.object({ timezone: z.string().optional() }),
  execute: async ({ timezone }) => ({
    time: new Date().toLocaleString('en-US', { timeZone: timezone || 'UTC' }),
    timezone: timezone || 'UTC',
  }),
});
```

Export an array (e.g. `defaultTools`) and pass to the agent config. More examples in [reference.md](reference.md).

## Headless Usage

- Create agent with `createAgent({ apiKey, model?, instructions?, tools?, maxSteps? })`.
- Subscribe to events: `thinking:start`, `tool:call`, `stream:delta`, `stream:end`, `error`.
- Call `agent.send(input)` in a readline or request handler loop. Use `sendSync()` when streaming is not needed.

## Optional Ink TUI

- Use the same agent instance; no agent logic in UI.
- State: `messages`, `input`, `isLoading`, and **Map<id, StreamableOutputItem>** for streaming items.
- On `item:update`, `setItems(prev => new Map(prev).set(item.id, item))` (replace by ID).
- On `message:assistant`, refresh messages from `agent.getMessages()` and clear the items Map.
- Render completed messages plus `Array.from(items.values())` with a small `ItemRenderer` (message, function_call, reasoning). Full `cli.tsx` in [reference.md](reference.md).

## Items-Based Streaming (Important)

OpenRouter SDK uses **items-based streaming**: the same item can be emitted multiple times with the same `id` and updated content. **Replace by ID; do not concatenate chunks.**

- `getItemsStream()` yields full items. Store in a `Map<string, StreamableOutputItem>` keyed by `item.id`.
- Item types: `message` (output_text), `function_call` (streaming arguments, use when `status === 'completed'` for tool:call), `function_call_output`, `reasoning` (reasoning_text).
- Benefits: no manual chunk accumulation, concurrent message/tool/reasoning streams, good fit for React/Map state.

## Extending the Agent

- **Hooks**: Use `agent.on('message:user' | 'message:assistant' | 'tool:call' | 'error', ...)` for logging, analytics, webhooks, DB persistence.
- **HTTP**: One agent per session (e.g. in-memory or Redis). `POST /chat` with `sessionId` and `message`; create agent if missing; call `sendSync(message)` or `send()` and stream via events.
- **Discord**: One agent per channel; on `messageCreate`, get or create agent, then `sendSync(content)` and `msg.reply(response)`.

## Discovering Models

- **Do not hardcode model IDs.** Fetch list: `GET https://openrouter.ai/api/v1/models` → `data` array.
- Filter by `author`, `context_length`, `pricing.prompt` as needed. Use `openrouter/auto` for automatic model selection.
- See [reference.md](reference.md) for `fetchModels` / `findModels` and dynamic model selection.

## API Quick Reference

| Config       | Default               | Description        |
|-------------|------------------------|--------------------|
| model       | `'openrouter/auto'`   | Model id or auto   |
| instructions| `'You are...'`        | System prompt      |
| tools       | `[]`                  | Tool array         |
| maxSteps    | `5`                   | Max agentic steps  |

| Method           | Returns        | Description              |
|------------------|----------------|--------------------------|
| send(content)    | Promise<string>| Stream response          |
| sendSync(content)| Promise<string>| Non-streaming            |
| getMessages()    | Message[]      | Conversation history     |
| clearHistory()   | void           | Clear messages           |
| setInstructions()| void           | Update system prompt     |
| addTool(tool)    | void           | Register tool at runtime |

## Resources

- OpenRouter docs: https://openrouter.ai/docs
- Models API: https://openrouter.ai/api/v1/models
- Source skill (full code): https://openrouter.ai/skills/create-agent/SKILL.md
- Full agent/tools/headless/TUI code and model discovery: [reference.md](reference.md)
