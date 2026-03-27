import { QdrantClient } from "@qdrant/js-client-rest"
import ollama from "ollama"
import pLimit from "p-limit"

const client = new QdrantClient({ url: "http://localhost:6333" })
const limit = pLimit(4)
const collName = "contracts"

async function embedTexts(texts: string[]) {
  const tasks = texts.map(text =>
    limit(() =>
      ollama.embeddings({
        model: "nomic-embed-text",
        prompt: text
      })
    )
  )

  const results = await Promise.all(tasks)

  return results.map(r => r.embedding)
}

async function ensureCollection() {
  const collections = await client.getCollections()

  const exists = collections.collections.some(
    c => c.name === collName
  )

  if (!exists) {
    await client.createCollection(collName, {
      vectors: {
        size: 768,
        distance: "Cosine"
      }
    })
  }
}

async function indexDocuments(docs: string[]) {

  // 1. batch embedding
  const vectors = await embedTexts(docs)

  // 2. pontok létrehozása
  const points = docs.map((doc, i) => ({
    id: Date.now() + i, // Unique id based on timestamp
    vector: vectors[i],
    payload: {text: doc}
  }))

  // 3. gyűjtemény létrehozása (ha még nem létezik)
  await ensureCollection()

  // 3. batch insert
  await client.upsert(collName, {points})
}

export async function upload_db(texts?: string[]) {
  const docs = texts || [
    "George Russell, a Mercedes brit versenyzője nyerte a Forumla–1-es Kínai Nagydíj szombati sprintfutamát. A 28 éves pilóta mögött a két Ferrari ért célba: a monacói Charles Leclerc végzett a második, a hétszeres világbajnok Lewis Hamilton pedig a harmadik helyen",
    "A 19 körös viadal rajtjánál a pole pozícióból startoló Russell ugyan jól jött el és megőrizte a vezetést, mögötte számos helycsere történt. Hamilton és a vb-címvédő Lando Norris (McLaren) egyaránt kiválóan indult, ők ketten értek oda közvetlenül Russell mögé az első kanyarban, de ott volt „a sűrűjében” Leclerc és Oscar Piastri (McLaren) is, írta beszámolójában a Magyar Távirati Iroda. Közben a startot nagyon elrontó Andrea Kimi Antonelli (Mercedes) túl rövidet fékezett és nekiment Isack Hadjarnak (Red Bull), amiért később 10 másodperces büntetést kapott",
  ];

  console.log("Indexing documents...");
  await indexDocuments(docs);
  console.log("Documents indexed successfully.");
}
