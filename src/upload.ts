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
    "Az élen Hamilton és Russell között alakult ki körökön át tartó oda-vissza előzgetés, Leclerc közben szorosan követte a duót a harmadik helyen, de nem próbálkozott előzéssel. A hatodik körben Russellnek sikerült eltávolodnia Hamiltontól, akit aztán némi látványos küzdelmet követően Leclerc is lehagyott. Hét körrel a leintés előtt a pályára hajtott a biztonsági autó Nico Hülkenberg (Audi) műszaki hiba miatt megállt autójának mentése idejére, a versenyzők jelentős része pedig a boxba hajtott kerékcserére. Az utolsó három kör az összesűrűsödött mezőny és a friss abroncsok miatt még ígért izgalmakat, végül azonban maradt a Russell, Leclerc, Hamilton dobogó",
    "Az idei szezonban a kínai volt az első a sprintfutamok sorában. Az idény során hat ilyen állomás lesz, a következő a május elején sorra kerülő Miami Nagydíjon. Világbajnoki pontokat az első nyolc helyezett szerzett 8, 7, 6, 5, 4, 3, 2, 1 sorrendben.",
    "Andrea Kimi Antonelli, a Mercedes olasz versenyzője szerezte meg az első rajtkockát a Formula–1-es Kínai Nagydíj szombati időmérő edzésén, így a vasárnapi futamon ő startolhat majd az élről. A 19 éves pilótának ez pályafutása első pole-pozíciója, amellyel az F1 történetének legfiatalabb időmérős győztese lett.",
    "Az eddigi rekordot a négyszeres világbajnok német Sebastian Vettel tartotta.",
    "Antonelli mögött csapattársa, az idénynyitó Ausztrál Nagydíjon és a szombaton rendezett kínai sprintfutamon is győztes brit George Russell végzett a második helyen, a harmadik rajtkockát pedig a hétszeres vb-győztes Lewis Hamilton, a Ferrari brit pilótája szerezte meg.",
    "Russellnek műszaki gondja volt a pole pozícióról döntő harmadik szakaszban, így riválisaival ellentétben csak egy gyors kört tudott teljesíteni.",
    "Hamilton mellől a másik Ferrarival a monacói Charles Leclerc rajtolhat, a harmadik sort pedig a vb-címvédő McLaren foglalja el: az ausztrál Oscar Piastri ötödik, a világbajnok brit Lando Norris pedig hatodik lett az időmérőn. A négyszeres vb-győztes Max Verstappen, a Red Bull holland versenyzője a nyolcadik pozícióból startolhat",
    "Az 56 körös Kínai Nagydíj vasárnap 8 órakor kezdődik Sanghajban."
  ];

  console.log("Indexing documents...");
  await indexDocuments(docs);
  console.log("Documents indexed successfully.");
}
