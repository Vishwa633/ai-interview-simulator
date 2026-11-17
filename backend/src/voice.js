import { HttpError } from './http-error.js'

const origin = 'https://api.elevenlabs.io/v1'
export const audioFormats = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }
export const maxRecordingBytes = 4 * 1024 * 1024

export function createVoiceService({ apiKey, voiceId = 'OZ0L6eISlOejga3XjDFt', fetchVoice = fetch }) {
  const recent = []
  const enabled = Boolean(apiKey)

  async function request(path, userId, options) {
    if (!enabled) throw new HttpError(503, 'Voice requires ElevenLabs to be configured.')
    const now = Date.now()
    while (recent[0]?.time <= now - 60_000) recent.shift()
    if (recent.length >= 30 || recent.filter(entry => entry.userId === userId).length >= 6) {
      throw new HttpError(429, 'Too many voice requests. Wait a minute and try again.')
    }
    recent.push({ userId, time: now })

    let response
    try {
      response = await fetchVoice(origin + path, {
        ...options,
        method: 'POST',
        headers: { 'xi-api-key': apiKey, ...options.headers },
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      })
    } catch (error) {
      console.warn('ElevenLabs connection failed:', error.cause?.code ?? error.name)
      throw new HttpError(502, 'Could not reach the voice service. Please try again.')
    }
    if (response.ok) return response
    await response.body?.cancel()
    if ([402, 429].includes(response.status)) {
      throw new HttpError(429, 'The voice service has reached its usage limit. Please try again later.')
    }
    if (path === '/speech-to-text' && [400, 415, 422].includes(response.status)) {
      throw new HttpError(422, 'The recording could not be transcribed. Try recording again.')
    }
    console.warn('ElevenLabs rejected the voice request:', response.status)
    throw new HttpError(502, 'The voice service is unavailable. Please try again.')
  }

  return {
    enabled,
    async speak(question, userId) {
      if (!/^[a-z\d_-]{1,100}$/i.test(voiceId)) throw new HttpError(503, 'The interviewer voice is not configured correctly.')
      const response = await request(`/text-to-speech/${voiceId}?output_format=mp3_44100_128`, userId, {
        headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({ text: question, model_id: 'eleven_multilingual_v2' }),
      })
      if (!response.headers.get('content-type')?.startsWith('audio/mpeg')) {
        await response.body?.cancel()
        throw new HttpError(502, 'The voice service returned invalid audio.')
      }
      const audio = await response.arrayBuffer().catch(() => null)
      if (!audio?.byteLength) throw new HttpError(502, 'Could not load the question audio.')
      return Buffer.from(audio)
    },
    async transcribe(audio, mimeType, userId) {
      const form = new FormData()
      form.set('file', new Blob([audio], { type: mimeType }), 'answer.' + audioFormats[mimeType])
      form.set('model_id', 'scribe_v2')
      form.set('language_code', 'eng')
      form.set('tag_audio_events', 'false')
      const response = await request('/speech-to-text', userId, { body: form })
      const transcript = await response.json().catch(() => null)
      if (!transcript || typeof transcript.text !== 'string') throw new HttpError(502, 'Could not load the transcript.')
      const text = transcript.text.trim()
      if (!text) throw new HttpError(422, 'No speech was detected. Try recording again.')
      return text
    },
  }
}
