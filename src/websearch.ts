import { JSDOM } from "jsdom";
import { Readability } from "@mozilla/readability";
import { searchAPI } from "./utils/searchapi.js";

async function fetchAndExtract(url: string): Promise<string> 
{
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
      },
      signal: AbortSignal.timeout(8000)
    });

    const html = await res.text();

    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);

    const article = reader.parse();

    return article?.textContent || "";
  } catch {
    return "";
  }
}

function chunkText(text: string, size = 1000): string[] 
{
  const chunks: string[] = [];

  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }

  return chunks;
}

function scoreChunk(chunk: string, query: string): number 
{
  const q = query.toLowerCase();
  const c = chunk.toLowerCase();

  const words = q.split(/\s+/);

  let score = 0;

  for (const w of words) 
  {
    if (c.includes(w)) score++;
  }

  return score;
}

function selectRelevantChunks(chunks: string[], query: string, maxChunks = 5): string[] 
{
  return chunks
    .map(c => ({ c, score: scoreChunk(c, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map(x => x.c);
}

export async function web_search(query: string): Promise<string> 
{
  // 🔍 1. keresés
  const results = await searchAPI(query);

  if (results.length === 0) {
    return "No results found";
  }

  // 🌐 2. top URL-ek
  const topResults = results.slice(0, 3);

  const allChunks: string[] = [];

  // ⚡ párhuzamos fetch
  await Promise.all(
    topResults.map(async (r) => {
      const text = await fetchAndExtract(r.url);

      if (!text) return;

      const chunks = chunkText(text, 1200);

      const relevant = selectRelevantChunks(chunks, query, 3);

      // forrás jelölése (nagyon fontos!)
      const tagged = relevant.map(
        c => `[SOURCE: ${r.url}]\n${c}`
      );

      allChunks.push(...tagged);
    })
  );

  if (allChunks.length === 0) {
    return "No readable content found";
  }

  // 🧠 3. limit (token control)
  const finalChunks = allChunks.slice(0, 8);

  return finalChunks.join("\n\n---\n\n");
}