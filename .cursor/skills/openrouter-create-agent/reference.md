# OpenRouter Create-Agent — Full Reference

Full code and API details. Use when implementing the agent core, TUI, or model discovery.

## agent.ts (full)

```typescript
import { OpenRouter, tool, stepCountIs } from '@openrouter/sdk';
import type { Tool, StreamableOutputItem } from '@openrouter/sdk';
import { EventEmitter } from 'eventemitter3';
import { z } from 'zod';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AgentEvents {
  'message:user': (message: Message) => void;
  'message:assistant': (message: Message) => void;
  'item:update': (item: StreamableOutputItem) => void;
  'stream:start': () => void;
  'stream:delta': (delta: string, accumulated: string) => void;
  'stream:end': (fullText: string) => void;
  'tool:call': (name: string, args: unknown) => void;
  'tool:result': (name: string, result: unknown) => void;
  'reasoning:update': (text: string) => void;
  'error': (error: Error) => void;
  'thinking:start': () => void;
  'thinking:end': () => void;
}

export interface AgentConfig {
  apiKey: string;
  model?: string;
  instructions?: string;
  tools?: Tool<z.ZodTypeAny, z.ZodTypeAny>[];
  maxSteps?: number;
}

export class Agent extends EventEmitter<AgentEvents> {
  private client: OpenRouter;
  private messages: Message[] = [];
  private config: Required<Omit<AgentConfig, 'apiKey'>> & { apiKey: string };

  constructor(config: AgentConfig) {
    super();
    this.client = new OpenRouter({ apiKey: config.apiKey });
    this.config = {
      apiKey: config.apiKey,
      model: config.model ?? 'openrouter/auto',
      instructions: config.instructions ?? 'You are a helpful assistant.',
      tools: config.tools ?? [],
      maxSteps: config.maxSteps ?? 5,
    };
  }

  getMessages(): Message[] { return [...this.messages]; }
  clearHistory(): void { this.messages = []; }
  setInstructions(instructions: string): void { this.config.instructions = instructions; }
  addTool(newTool: Tool<z.ZodTypeAny, z.ZodTypeAny>): void { this.config.tools.push(newTool); }

  async send(content: string): Promise<string> {
    const userMessage: Message = { role: 'user', content };
    this.messages.push(userMessage);
    this.emit('message:user', userMessage);
    this.emit('thinking:start');

    try {
      const result = this.client.callModel({
        model: this.config.model,
        instructions: this.config.instructions,
        input: this.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        stopWhen: [stepCountIs(this.config.maxSteps)],
      });

      this.emit('stream:start');
      let fullText = '';

      for await (const item of result.getItemsStream()) {
        this.emit('item:update', item);
        switch (item.type) {
          case 'message': {
            const textContent = item.content?.find((c: { type: string }) => c.type === 'output_text');
            if (textContent && 'text' in textContent) {
              const newText = textContent.text;
              if (newText !== fullText) {
                const delta = newText.slice(fullText.length);
                fullText = newText;
                this.emit('stream:delta', delta, fullText);
              }
            }
            break;
          }
          case 'function_call':
            if (item.status === 'completed') {
              this.emit('tool:call', item.name, JSON.parse(item.arguments || '{}'));
            }
            break;
          case 'function_call_output':
            this.emit('tool:result', item.callId, item.output);
            break;
          case 'reasoning': {
            const reasoningText = item.content?.find((c: { type: string }) => c.type === 'reasoning_text');
            if (reasoningText && 'text' in reasoningText) {
              this.emit('reasoning:update', reasoningText.text);
            }
            break;
          }
        }
      }

      if (!fullText) fullText = await result.getText();
      this.emit('stream:end', fullText);

      const assistantMessage: Message = { role: 'assistant', content: fullText };
      this.messages.push(assistantMessage);
      this.emit('message:assistant', assistantMessage);
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    } finally {
      this.emit('thinking:end');
    }
  }

  async sendSync(content: string): Promise<string> {
    const userMessage: Message = { role: 'user', content };
    this.messages.push(userMessage);
    this.emit('message:user', userMessage);
    try {
      const result = this.client.callModel({
        model: this.config.model,
        instructions: this.config.instructions,
        input: this.messages.map((m) => ({ role: m.role, content: m.content })),
        tools: this.config.tools.length > 0 ? this.config.tools : undefined,
        stopWhen: [stepCountIs(this.config.maxSteps)],
      });
      const fullText = await result.getText();
      const assistantMessage: Message = { role: 'assistant', content: fullText };
      this.messages.push(assistantMessage);
      this.emit('message:assistant', assistantMessage);
      return fullText;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.emit('error', error);
      throw error;
    }
  }
}

export function createAgent(config: AgentConfig): Agent {
  return new Agent(config);
}
```

## tools.ts (full)

```typescript
import { tool } from '@openrouter/sdk';
import { z } from 'zod';

export const timeTool = tool({
  name: 'get_current_time',
  description: 'Get the current date and time',
  inputSchema: z.object({
    timezone: z.string().optional().describe('Timezone (e.g., "UTC", "America/New_York")'),
  }),
  execute: async ({ timezone }) => ({
    time: new Date().toLocaleString('en-US', { timeZone: timezone || 'UTC' }),
    timezone: timezone || 'UTC',
  }),
});

export const calculatorTool = tool({
  name: 'calculate',
  description: 'Perform mathematical calculations',
  inputSchema: z.object({
    expression: z.string().describe('Math expression (e.g., "2 + 2", "sqrt(16)")'),
  }),
  execute: async ({ expression }) => {
    const sanitized = expression.replace(/[^0-9+\-*/().\s]/g, '');
    const result = Function(`"use strict"; return (${sanitized})`)();
    return { expression, result };
  },
});

export const defaultTools = [timeTool, calculatorTool];
```

## headless.ts (full)

```typescript
import { createAgent } from './agent.js';
import { defaultTools } from './tools.js';

async function main() {
  const agent = createAgent({
    apiKey: process.env.OPENROUTER_API_KEY!,
    model: 'openrouter/auto',
    instructions: 'You are a helpful assistant with access to tools.',
    tools: defaultTools,
  });

  agent.on('thinking:start', () => console.log('\n🤔 Thinking...'));
  agent.on('tool:call', (name, args) => console.log(`🔧 Using ${name}:`, args));
  agent.on('stream:delta', (delta) => process.stdout.write(delta));
  agent.on('stream:end', () => console.log('\n'));
  agent.on('error', (err) => console.error('❌ Error:', err.message));

  const readline = await import('readline');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Agent ready. Type your message (Ctrl+C to exit):\n');

  const prompt = () => {
    rl.question('You: ', async (input) => {
      if (!input.trim()) { prompt(); return; }
      await agent.send(input);
      prompt();
    });
  };
  prompt();
}

main().catch(console.error);
```

## Model discovery

```typescript
interface OpenRouterModel {
  id: string;
  name: string;
  description?: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
  top_provider?: { is_moderated: boolean };
}

async function fetchModels(): Promise<OpenRouterModel[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models');
  const data = await res.json();
  return data.data;
}

async function findModels(filter: {
  author?: string;
  minContext?: number;
  maxPromptPrice?: number;
}): Promise<OpenRouterModel[]> {
  const models = await fetchModels();
  return models.filter((m) => {
    if (filter.author && !m.id.startsWith(filter.author + '/')) return false;
    if (filter.minContext && m.context_length < filter.minContext) return false;
    if (filter.maxPromptPrice && parseFloat(m.pricing.prompt) > filter.maxPromptPrice) return false;
    return true;
  });
}

// Usage: findModels({ author: 'anthropic' }), findModels({ minContext: 100000 })
```

## Item types (getItemsStream)

| Type                  | Purpose                        |
|-----------------------|--------------------------------|
| message               | Assistant text                 |
| function_call         | Tool calls (streaming args)    |
| function_call_output  | Tool results                   |
| reasoning             | Extended thinking              |
| web_search_call       | Web search                     |
| file_search_call      | File search                    |
| image_generation_call | Image generation               |

## Ink TUI (cli.tsx) — pattern

- State: `messages`, `input`, `isLoading`, `items: Map<string, StreamableOutputItem>`.
- On `item:update`: `setItems(prev => new Map(prev).set(item.id, item))`.
- On `message:assistant`: `setMessages(agent.getMessages())`, `setItems(new Map())`, `setIsLoading(false)`.
- Render: completed messages + `Array.from(items.values()).map(item => <ItemRenderer key={item.id} item={item} />)`.
- ItemRenderer: for `message` show output_text and cursor if not completed; for `function_call` show name/status; for `reasoning` show reasoning_text.
- Input: `useInput` for key handling; on Enter call `sendMessage()` with current input.
- Full React/Ink implementation: https://openrouter.ai/skills/create-agent/SKILL.md (Step 4: Ink TUI).

## Run commands

- TUI: `OPENROUTER_API_KEY=sk-or-... npm start`
- Headless: `OPENROUTER_API_KEY=sk-or-... npm run start:headless`
