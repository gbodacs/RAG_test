import ollama from "ollama"
import { embedQuery, searchVectors, extractCandidates, rerank, buildContext, askLLM } from './search.js';

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

- You MUST respond in EXACTLY one of the following formats:

TOOL: <tool_name>
INPUT: <input>

OR

FINAL: <final answer>

- Do NOT include anything else
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
type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

type ToolCall =
  | { type: "tool"; name: string; input: string }
  | { type: "final"; output: string }
  | { type: "invalid"; raw: string };

//---------------------------------------------
// A parser to extract tool calls or final answers from the response
//---------------------------------------------
async function callOllama(messages: Message[]) {
  const res = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "qwen3.5:9b",
      messages,
      stream: false
    })
  });

  const json = await res.json();
  return json.message.content as string;
}

//---------------------------------------------
// The tool implementations
//--------------------------------------------- 
const tools = {
  async mcp_search(input: string): Promise<string> {
    const res = await fetch("http://localhost:3001/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query: input })
    });
    console.log("-mcp_search response status:", res.status);
    return await res.text();
  },

  async web_search(input: string): Promise<string> {
    // Minimal példa – cseréld saját megoldásra
    const res = await fetch(
      `https://duckduckgo.com/?q=${encodeURIComponent(input)}`
    );
    console.log("-web_search response status:", res.status);
    return await res.text();
  }
};

//---------------------------------------------
// Example usage in an agent loop
//---------------------------------------------
function parseLLMResponse(text: string): ToolCall {
  const trimmed = text.trim();

  if (trimmed.startsWith("FINAL:")) {
    console.log("-Parsed FINAL answer.");

    return {
      type: "final",
      output: trimmed.replace("FINAL:", "").trim()
    };
  }

  const toolMatch = trimmed.match(/TOOL:\s*(\w+)[\s\S]*INPUT:\s*([\s\S]*)/);

  if (toolMatch) {
    return {
      type: "tool",
      name: toolMatch[1].trim(),
      input: toolMatch[2].trim()
    };
  }

  console.log("-Failed to parse LLM response:", text);
  return { type: "invalid", raw: text };
}

//---------------------------------------------
// The main agent function that runs the loop
//---------------------------------------------
export async function runAgent(userInput: string) {
  const messages: Message[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userInput }
  ];

  const MAX_STEPS = 6;

  for (let step = 0; step < MAX_STEPS; step++) {
    const response = await callOllama(messages);

    const parsed = parseLLMResponse(response);

    // 🧨 INVALID → retry erősebb utasítással
    if (parsed.type === "invalid") {
      messages.push({
        role: "assistant",
        content: response
      });

      messages.push({
        role: "system",
        content:
          "FORMAT ERROR. You must respond ONLY in TOOL or FINAL format."
      });
      console.log("-LLM response could not be parsed as TOOL or FINAL.");
      continue;
    }

    // FINAL answer ready
    if (parsed.type === "final") {
      console.log("-LLM provided FINAL answer.");
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

    let toolResult: string;

    try {
      toolResult = await toolFn(parsed.input);
    } catch (e) {
      toolResult = `Tool error: ${e}`;
    }

    messages.push({
      role: "assistant",
      content: response
    });

    messages.push({
      role: "tool",
      content: toolResult
    });
  }

  return "Agent stopped: max steps reached";
}

/*async function askLLM(question: string, context: string) {
  const res = await ollama.chat({
    model: "qwen3.5:9b",
    think:false,
    messages: [
      {
        role: "user",
        content: `
Use the context to answer.

Context:
${context}

Question:
${question}
`
      }
    ]
  })

  return res.message.content
}*/

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
    contracts: [...new Set(bestChunks.map(c => c.contractId))]
  }
}