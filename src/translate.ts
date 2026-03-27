import ollama from "ollama"

export async function translateText(text: string, sourceLanguage: string, targetLanguage: string) {
  const res = await ollama.chat({
    model: "translategemma:27b",
    think: false,
    messages: [
      {
        role: "user",
        content: `You are a professional ${sourceLanguage} to ${targetLanguage} translator. Your goal is to accurately convey the meaning and nuances of the original ${sourceLanguage} text while adhering to ${targetLanguage} grammar, vocabulary, and cultural sensitivities. Produce only the ${targetLanguage} translation, without any additional explanations or commentary. Please translate the following ${sourceLanguage} text into ${targetLanguage}:
${text}`
      }
    ]
  })

  return res.message.content
}
