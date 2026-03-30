import ollama from "ollama"
import { QdrantClient } from "@qdrant/js-client-rest"

type QueryCallbacks = {
  onStatus?: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (text: string) => void;
}

export async function embedQuery(query: string) {
  const res = await ollama.embeddings({
    model: "nomic-embed-text",
    prompt: query
  })

  return res.embedding
}

const client = new QdrantClient({ url: "http://localhost:6333" })

export async function searchVectors(queryEmbedding: number[]) {
  const results = await client.search("contracts", {
    vector: queryEmbedding,
    limit: 20
  })

  return results
}

export function extractCandidates(results: any[]) {
  return results.map(r => ({
    text: r.payload.text,
    contractId: r.payload.contract_id,
    page: r.payload.page,
    score: r.score
  }))
}

export async function rerank(query: string, docs: any[]) {

  const scored = await Promise.all(
    docs.map(async d => {

      const res = await ollama.generate({
        model: "qwen3.5:9b",
        think: false,
        prompt: `
Rate relevance from 0 to 10.

Query:
${query}

Document:
${d.text}

Score:
`
      })

      const score = parseFloat(res.response) || 0

      return { ...d, rerankScore: score }
    })
  )

  scored.sort((a, b) => b.rerankScore - a.rerankScore)

  return scored.slice(0, 3)
}

export function buildContext(chunks: any[]) {
  return chunks.map(c => c.text).join("\n")
}

export async function askLLM(question: string, context: string, callbacks: QueryCallbacks = {}) {
  callbacks.onStatus?.("AI válasz készül...")

  const messages = [
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

  const response = await ollama.chat({
    model: "qwen3.5:9b",
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

export async function query(question: string, callbacks: QueryCallbacks = {}) {
  callbacks.onStatus?.("MCP adatbázisban keresek...")
  const embedding = await embedQuery(question)
  const vectorResults = await searchVectors(embedding)
  const candidates = extractCandidates(vectorResults)
  callbacks.onStatus?.("Legrelevánsabb dokumentumokat választom ki...")
  const bestChunks = await rerank(question, candidates)
  const context = buildContext(bestChunks)
  callbacks.onStatus?.("Választ készítek a talált tartalom alapján...")
  const answer = await askLLM(question, context, callbacks)

  return {
    answer,
    contracts: Array.from(new Set(bestChunks.map(c => c.contractId)))
  }
}
