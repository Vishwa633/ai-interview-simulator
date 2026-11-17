import { HttpError } from './http-error.js'

const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash-lite-tts:generateContent'
const sampleRate = 24_000

function asWav(pcm) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVEfmt ', 8)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(sampleRate * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

export function createQuestionVoice({ apiKey, fetchSpeech = fetch }) {
  if (!apiKey) return null
  const generating = new Map()
  const recent = []
  const cache = new Map()

  async function generate(question) {
    let response
    try {
      response = await fetchSpeech(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: question }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Leda' } } },
          },
        }),
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      throw new HttpError(503, 'Could not reach the interviewer voice.')
    }

    if (!response.ok) {
      await response.body?.cancel()
      if (response.status === 429) throw new HttpError(429, 'The interviewer voice has reached its Gemini usage limit.')
      console.warn('Gemini rejected the question voice request:', response.status)
      throw new HttpError(503, 'The interviewer voice is temporarily unavailable.')
    }

    const result = await response.json().catch(() => null)
    const audio = result?.candidates?.[0]?.content?.parts?.find(part => part.inlineData?.data)?.inlineData
    if (typeof audio?.data !== 'string') throw new HttpError(502, 'The interviewer voice returned invalid audio.')

    const data = Buffer.from(audio.data, 'base64')
    const mime = audio.mimeType?.toLowerCase()
    if (mime === 'audio/wav' && data.length > 44 && data.toString('ascii', 0, 4) === 'RIFF' &&
      data.toString('ascii', 8, 12) === 'WAVE' && data.readUInt32LE(4) + 8 <= data.length) return data
    if (mime === 'audio/l16;codec=pcm;rate=24000' && data.length && data.length % 2 === 0) return asWav(data)
    throw new HttpError(502, 'The interviewer voice returned empty or invalid audio.')
  }

  return async function speak(question, userId) {
    if (cache.has(question)) return cache.get(question)
    if (generating.has(question)) return generating.get(question)
    const now = Date.now()
    while (recent[0]?.time <= now - 60_000) recent.shift()
    if (generating.size >= 2 || recent.length >= 12 || recent.filter(entry => entry.userId === userId).length >= 4) {
      throw new HttpError(429, 'The interviewer voice is busy. Try again in a moment.')
    }

    recent.push({ userId, time: now })
    const task = generate(question).then(audio => {
      if (cache.size >= 12) cache.delete(cache.keys().next().value)
      cache.set(question, audio)
      return audio
    }).finally(() => generating.delete(question))
    generating.set(question, task)
    return task
  }
}
