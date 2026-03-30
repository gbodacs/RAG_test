import ollama from "ollama"

type TranslateCallbacks = {
  onStatus?: (text: string) => void;
  onPartial?: (text: string) => void;
  onError?: (text: string) => void;
}

export async function translateText(text: string, sourceLanguage: string, targetLanguage: string, callbacks: TranslateCallbacks = {}) {
  callbacks.onStatus?.("AI fordítás készül...")

  const messages = [
    {
      role: "user",
      content: `You are a professional ${sourceLanguage} to ${targetLanguage} translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLanguage} text while adhering to ${targetLanguage} grammar, vocabulary, and cultural sensitivities. Produce only the ${targetLanguage} translation, without any additional explanations or commentary. Please translate the following ${sourceLanguage} text into ${targetLanguage}:
${text}`
    }
  ]

  const response = await ollama.chat({
    model: "translategemma:27b",
    think: false,
    stream: true,
    messages
  })

  let translated = ""
  let lastText = ""

  if (typeof (response as any)[Symbol.asyncIterator] === "function") {
    for await (const part of response as AsyncIterable<any>) {
      const chunk = part?.message?.content ?? ""
      if (!chunk) continue

      if (chunk.startsWith(translated)) {
        translated = chunk
      } else {
        translated += chunk
      }

      if (translated === lastText) continue
      lastText = translated
      callbacks.onPartial?.(translated)
    }
  } else {
    translated = (response as any).message?.content || ""
    callbacks.onPartial?.(translated)
  }

  callbacks.onStatus?.("Fordítás kész")
  return translated
}
