import ollama from "ollama"
import { chatLLM } from "./utils/config.js"
import { QdrantClient } from "@qdrant/js-client-rest"

type QueryCallbacks = {
  onStatus?: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (text: string) => void;
}

export async function askLLM(question: string, context: string, callbacks: QueryCallbacks = {}) {
  callbacks.onStatus?.("AI válasz készül...")

  const messages = [
    {
      role: "user",
      content: `Question:${question}`
    }
  ]

  const response = await ollama.chat({
    model: chatLLM,
    think: false,
    stream: true,
    messages
  })

  let answer = ""
  let lastText = ""

  if (typeof (response as any)[Symbol.asyncIterator] === "function") {
    for await (const part of response as AsyncIterable<any>) {
      const chunk = part?.message?.content ?? ""
      if (!chunk || chunk === lastText) continue
      lastText = chunk
      answer = chunk
      callbacks.onPartial?.(answer)
    }
  } else {
    answer = (response as any).message?.content || ""
    callbacks.onPartial?.(answer)
  }

  callbacks.onStatus?.("AI válasz kész")
  return answer
}
