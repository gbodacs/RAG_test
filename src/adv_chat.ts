import ollama from "ollama"
import { vectorLLM, mcpServiceUrl } from "./utils/config.js"
import { embedQuery, searchVectors, extractCandidates, rerank, buildContext, askLLM } from './vectorsearch.ts';
import { web_search } from './websearch.ts';

export const SYSTEM_PROMPT = `
You are an AI agent with access to tools.

You must decide whether to:
1. Call a tool
2. Or provide the final answer

AVAILABLE TOOLS:

1. mcp_search
- Use for internal/private data
- Input: natural language query

2. web_search
- Use for internet / up-to-date information
- Input: search query

RULES:

- You MUST respond in **EXACTLY** one of the following formats:

TOOL: <tool_name>
INPUT: <input>

**OR**

FINAL: <final answer>

- Do NOT include anything else
- Do NOT include multiple TOOL blocks
- Do NOT include BOTH TOOL and FINAL in the same response
- Do NOT explain your reasoning
- Do NOT output JSON
- Be concise

- If you do not have enough information → use a tool
- Prefer mcp_search for internal data
- Prefer web_search for current events

EXAMPLES:

TOOL: mcp_search
INPUT: latest orders from database

TOOL: web_search
INPUT: latest news about Nvidia

FINAL: The answer is 42`;

//---------------------------------------------
// Types for tool calls and final answers
//---------------------------------------------
type Message = 
{
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

type ToolCall =
  | { type: "tool"; name: string; input: string }
  | { type: "final"; output: string }
  | { type: "invalid"; raw: string };

type AgentCallbacks = 
{
  onStatus?: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (text: string) => void;
};

//---------------------------------------------
// A parser to extract tool calls or final answers from the response
//---------------------------------------------
type AgentResponse = 
{
  raw: string;
  visible: string;
};

const TOOL_CALL_REGEX = /^TOOL:\s*(\w+)\s*\r?\nINPUT:\s*([\s\S]*)$/i;

function parseToolCall(text: string): { name: string; input: string } | null {
  const match = text.match(TOOL_CALL_REGEX);
  return match
    ? { name: match[1].trim(), input: match[2].trim() }
    : null;
}

function countToolBlocks(text: string): number {
  return (text.match(/^\s*TOOL:/gim) || []).length;
}

function hasFinalToken(text: string): boolean {
  return /FINAL:/i.test(text);
}

function isInvalidToolFinalMix(text: string): boolean {
  return countToolBlocks(text) > 0 && hasFinalToken(text);
}

function extractFinalText(text: string): string {
  const parts = text.split(/FINAL:\s*/i);
  return parts.slice(1).join(" ").trimStart();
}

async function callOllama(messages: Message[], callbacks: AgentCallbacks = {}): Promise<AgentResponse> {
  callbacks.onStatus?.("AI válasz készül...")

  const response = await ollama.chat({
    model: vectorLLM,
    think: false,
    stream: true,
    messages
  })

  let raw = ""
  let visible = ""
  let lastChunk = ""
  let toolStatusSent = false
  let finalPhase = false

  if (typeof (response as any)[Symbol.asyncIterator] === "function") 
  {
    for await (const part of response as AsyncIterable<any>) 
    {
      const chunk = part?.message?.content ?? part?.response ?? ""
      if (!chunk) continue

      if (chunk.startsWith(raw)) {
        raw = chunk
      } else {
        raw += chunk
      }

      if (raw === lastChunk) continue
      lastChunk = raw

      const trimmed = raw.trimStart()
      const toolCall = parseToolCall(trimmed)
      const isToolOnly = toolCall !== null && !hasFinalToken(trimmed)
      const hasFinal = hasFinalToken(trimmed)
      const invalidMix = isInvalidToolFinalMix(trimmed)

      if (isToolOnly)
      {
        if (!toolStatusSent)
        {
          const toolName = toolCall!.name
          callbacks.onStatus?.( toolName === "web_search"
                                ? "AI a weben keres..."
                                : toolName === "mcp_search"
                                ? "AI MCP tool-t hív..."
                                : "AI tool-t hív...")
          toolStatusSent = true
        }
        continue
      }

      if (invalidMix)
      {
        // Mixed TOOL and FINAL is invalid; do not surface partial output.
        continue
      }

      if (hasFinal)
      {
        if (!finalPhase)
        {
          callbacks.onStatus?.("AI végső választ ír...")
          finalPhase = true
        }
        visible = extractFinalText(trimmed)
        callbacks.onPartial?.(visible)
      }
    }
  } else 
  {
    raw = (response as any).message?.content || (response as any).response || ""
    const invalidMix = isInvalidToolFinalMix(raw)
    if (!invalidMix && hasFinalToken(raw)) {
      visible = extractFinalText(raw.trimStart())
      callbacks.onPartial?.(visible)
    }
  }

  callbacks.onStatus?.("AI válasz kész")
  return { raw, visible }
}

//---------------------------------------------
// The tool implementations
//--------------------------------------------- 
const tools = {
  async mcp_search(input: string): Promise<string> {
    const res = await fetch(mcpServiceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: input })
    });
    console.log("-mcp_search response status:", res.status);
    return await res.text();
  },

  async web_search(input: string): Promise<string> 
  {
    return await web_search(input);
  }
};

//---------------------------------------------
// Example usage in an agent loop
//---------------------------------------------
function parseLLMResponse(text: string): ToolCall {
  const trimmed = text.trim();

  if (trimmed === "") {
    console.log("-Failed to parse LLM response: empty response");
    return { type: "invalid", raw: text };
  }

  if (countToolBlocks(trimmed) > 1 || isInvalidToolFinalMix(trimmed)) {
    console.log("-Invalid format: multiple TOOL blocks or TOOL+FINAL mixed", trimmed);
    return { type: "invalid", raw: text };
  }

  const toolCall = parseToolCall(trimmed);
  if (toolCall) {
    console.log("-Parsed TOOL call for tool");
    return {
      type: "tool",
      name: toolCall.name,
      input: toolCall.input
    };
  }

  if (trimmed.toUpperCase().startsWith("FINAL:")) {
    console.log("-Parsed FINAL answer.");

    return {
      type: "final",
      output: extractFinalText(trimmed)
    };
  }

  console.log("-Failed to parse LLM response:", text);
  return { type: "invalid", raw: text };
}

//---------------------------------------------
// The main agent function that runs the loop
//---------------------------------------------
export async function runAgent(userInput: string, callbacks: AgentCallbacks = {}) {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userInput }
  ];

  const MAX_STEPS = 6;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callOllama(messages, callbacks);

    const parsed = parseLLMResponse(response.raw);

    // INVALID → retry erősebb utasítással
    if (parsed.type === "invalid") {
      messages.push({
        role: "assistant",
        content: response.raw
      });

      messages.push({
        role: "system",
        content:
          "FORMAT ERROR. You must respond ONLY in TOOL or FINAL format."
      });
      continue;
    }

    // FINAL answer ready
    if (parsed.type === "final") {
      return parsed.output;
    }

    // TOOL CALL
    const toolFn = (tools as any)[parsed.name];

    if (!toolFn) {
      messages.push({
        role: "system",
        content: `ERROR: Unknown tool ${parsed.name}`
      });
      continue;
    }

    callbacks.onStatus?.(
      parsed.name === "web_search"
        ? "AI weben keres..."
        : "AI MCP tool-t hív..."
    );

    let toolResult: string;

    try {
      toolResult = await toolFn(parsed.input);
      callbacks.onStatus?.("Eszközválasz megérkezett.");
    } catch (e) {
      toolResult = `Tool error: ${e}`;
      callbacks.onError?.(toolResult);
    }

    messages.push({
      role: "assistant",
      content: response.raw
    });

    messages.push({
      role: "tool",
      content: toolResult
    });
  }

  return "Agent stopped: max steps reached";
}

export async function advancedQuery(question: string) 
{

  const embedding = await embedQuery(question)
console.log("0")
  const vectorResults = await searchVectors(embedding)
console.log("1")
  const candidates = extractCandidates(vectorResults)
console.log("2")
  const bestChunks = await rerank(question, candidates)
console.log("3")
  const context = buildContext(bestChunks)
console.log("4")
  const answer = await askLLM(question, context)

  return {
    answer,
    contracts: Array.from(new Set(bestChunks.map(c => c.contractId)))
  }
}