import ollama from "ollama"
import { QdrantClient } from "@qdrant/js-client-rest"

async function embedQuery(query: string) {
  const res = await ollama.embeddings({
    model: "nomic-embed-text",
    prompt: query
  })

  return res.embedding
}

const client = new QdrantClient( {url: "http://localhost:6333"} )

async function searchVectors(queryEmbedding: number[]) {
  const results = await client.search("contracts", {
    vector: queryEmbedding,
    limit: 20
  })

  return results
}

function extractCandidates(results: any[]) {
  return results.map(r => ({
    text: r.payload.text,
    contractId: r.payload.contract_id,
    page: r.payload.page,
    score: r.score
  }))
}

async function rerank(query: string, docs: any[]) {

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

function buildContext(chunks: any[]) {
  return chunks.map(c => c.text).join("\n")
}

async function askLLM(question: string, context: string) {
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
}

export async function query(question: string) 
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