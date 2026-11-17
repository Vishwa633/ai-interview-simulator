import { useEffect, useRef, useState } from 'react'
import interviewerImage from './assets/ai-interviewer.jpeg'
import { RecordingMeter } from './RecordingMeter.jsx'

const recordingTypes = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']
const micStates = ['requesting', 'recording', 'transcribing']
const maxRecordingSeconds = 90

const femaleVoiceName = /\b(?:female|aria|ava|emma|jenny|karen|libby|michelle|moira|samantha|sonia|tessa|zira)\b/i
const enhancedVoiceName = /\b(?:natural|neural|premium|enhanced)\b/i

function pickInterviewerVoice(voices) {
  const english = voices.filter(voice => /^en(?:[-_]|$)/i.test(voice.lang))
  const female = english.filter(voice => femaleVoiceName.test(voice.name))
  return female.find(voice => /^en[-_]us$/i.test(voice.lang) && enhancedVoiceName.test(voice.name))
    ?? female.find(voice => enhancedVoiceName.test(voice.name))
    ?? english.find(voice => voice.name === 'Google US English')
    ?? female.find(voice => /^en[-_]us$/i.test(voice.lang))
    ?? female[0]
}

function stopTracks(stream) {
  stream?.getTracks().forEach(track => track.stop())
}

async function voiceRequest(path, accessToken, body, contentType, signal) {
  const response = await fetch('/api/interviews/' + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': contentType },
    body,
    signal,
  })
  if (!response.ok) {
    const error = await response.json().catch(() => null)
    throw new Error(error?.detail || 'The voice request failed. Please try again.')
  }
  return response
}

export function VoicePractice({ sessionId, turn, question, accessToken, voiceEnabled, questionVoiceEnabled, disabled, canRecord, onRecordingChange, onTranscript, progress, children }) {
  const [status, setStatus] = useState('')
  const [notice, setNotice] = useState('')
  const [activeRecording, setActiveRecording] = useState(null)
  const [playbackNotice, setPlaybackNotice] = useState('')
  const job = useRef(null)
  const recording = useRef(null)
  const player = useRef(null)
  const utterance = useRef(null)
  const speakingInBrowser = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window
  const canUseMic = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)

  function updateStatus(value) {
    setStatus(value)
    onRecordingChange(micStates.includes(value))
  }

  useEffect(() => {
    if (speakingInBrowser) window.speechSynthesis.getVoices()
  }, [speakingInBrowser])

  useEffect(() => () => {
    job.current?.abort()
    const capture = recording.current
    if (capture) {
      clearTimeout(capture.timeout)
      capture.recorder.ondataavailable = null
      capture.recorder.onstop = null
      capture.recorder.onerror = null
      if (capture.recorder.state !== 'inactive') capture.recorder.stop()
      stopTracks(capture.stream)
      recording.current = null
    }
    if (player.current) {
      player.current.audio.onended = null
      player.current.audio.pause()
      URL.revokeObjectURL(player.current.url)
      player.current = null
    }
    if (utterance.current) {
      utterance.current.onstart = null
      utterance.current.onend = null
      utterance.current.onerror = null
      utterance.current = null
      window.speechSynthesis.cancel()
    }
  }, [])

  function stopPlayback() {
    job.current?.abort()
    job.current = null
    if (player.current) {
      player.current.audio.pause()
      player.current.audio.currentTime = 0
    }
    if (utterance.current) {
      utterance.current.onstart = null
      utterance.current.onend = null
      utterance.current.onerror = null
      utterance.current = null
      window.speechSynthesis.cancel()
    }
    updateStatus('')
  }

  function speakInBrowser() {
    const speech = new SpeechSynthesisUtterance(question)
    const preferredVoice = pickInterviewerVoice(window.speechSynthesis.getVoices())
    if (preferredVoice) speech.voice = preferredVoice
    speech.lang = preferredVoice?.lang ?? 'en-US'
    speech.rate = 0.93
    speech.onstart = () => updateStatus('playing')
    speech.onend = () => {
      utterance.current = null
      updateStatus('')
    }
    speech.onerror = () => {
      utterance.current = null
      updateStatus('')
      setPlaybackNotice('The browser could not read this question aloud.')
    }
    utterance.current = speech
    updateStatus('loading')
    window.speechSynthesis.speak(speech)
  }

  async function listen() {
    if (status === 'loading' || status === 'playing') {
      stopPlayback()
      return
    }
    setPlaybackNotice('')
    if (!questionVoiceEnabled && speakingInBrowser) {
      speakInBrowser()
      return
    }

    const controller = new AbortController()
    job.current = controller
    updateStatus('loading')
    try {
      if (!player.current) {
        const response = await voiceRequest(sessionId + '/voice/question', accessToken, JSON.stringify({ turn }),
          'application/json', AbortSignal.any([controller.signal, AbortSignal.timeout(45_000)]))
        const blob = await response.blob()
        if (controller.signal.aborted) return
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => updateStatus('')
        player.current = { audio, url }
      }
      await player.current.audio.play()
      if (!controller.signal.aborted) updateStatus('playing')
    } catch (error) {
      if (!controller.signal.aborted) {
        if (!player.current && speakingInBrowser) {
          setPlaybackNotice('Using your browser voice. The interviewer voice is currently unavailable.')
          speakInBrowser()
          return
        }
        setPlaybackNotice(player.current && error.name === 'NotAllowedError'
          ? 'Audio is ready. Select Listen to question again to play it.'
          : error.message || 'The question could not be played.')
        updateStatus('')
      }
    } finally {
      if (job.current === controller) job.current = null
    }
  }

  async function transcribe(blob) {
    if (!blob.size || blob.size > 4 * 1024 * 1024) {
      updateStatus('')
      setNotice(blob.size ? 'The recording is too large. Try a shorter answer.' : 'No audio was recorded.')
      return
    }
    const controller = new AbortController()
    job.current = controller
    updateStatus('transcribing')
    try {
      const response = await voiceRequest(sessionId + '/voice/transcribe?turn=' + turn, accessToken,
        blob, blob.type, controller.signal)
      const result = await response.json()
      if (controller.signal.aborted) return
      onTranscript(result.text)
      setNotice('Transcript added. Review it before submitting.')
    } catch (error) {
      if (!controller.signal.aborted) setNotice(error.message || 'Could not transcribe your answer.')
    } finally {
      if (job.current === controller) job.current = null
      if (!controller.signal.aborted) updateStatus('')
    }
  }

  async function startRecording() {
    stopPlayback()
    setNotice('')
    const controller = new AbortController()
    job.current = controller
    updateStatus('requesting')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (controller.signal.aborted) {
        stopTracks(stream)
        return
      }
      const mimeType = recordingTypes.find(type => MediaRecorder.isTypeSupported(type))
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      const chunks = []
      const capture = { recorder, stream, cancelled: false, timeout: undefined }
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        setActiveRecording(null)
        clearTimeout(capture.timeout)
        stopTracks(stream)
        if (recording.current === capture) recording.current = null
        if (capture.cancelled) {
          updateStatus('')
          return
        }
        const type = (recorder.mimeType || chunks[0]?.type || '').split(';')[0]
        transcribe(new Blob(chunks, { type }))
      }
      recorder.onerror = () => {
        setActiveRecording(null)
        capture.cancelled = true
        clearTimeout(capture.timeout)
        recorder.onstop = null
        if (recorder.state !== 'inactive') recorder.stop()
        stopTracks(stream)
        if (recording.current === capture) recording.current = null
        updateStatus('')
        setNotice('Recording failed. Try using the microphone again.')
      }
      recorder.start(250)
      setActiveRecording({ stream, startedAt: performance.now() })
      recording.current = capture
      capture.timeout = setTimeout(() => {
        if (recorder.state !== 'inactive') recorder.stop()
      }, maxRecordingSeconds * 1000)
      updateStatus('recording')
    } catch (error) {
      stopTracks(stream)
      if (!controller.signal.aborted) {
        updateStatus('')
        setNotice(error.name === 'NotAllowedError'
          ? 'Allow microphone access in your browser to record an answer.'
          : 'Could not start the microphone. Check that it is connected and try again.')
      }
    } finally {
      if (job.current === controller) job.current = null
    }
  }

  function endRecording(cancelled = false) {
    const capture = recording.current
    if (!capture || capture.recorder.state === 'inactive') return
    capture.cancelled = cancelled
    capture.recorder.stop()
  }

  const listening = status === 'playing' || status === 'loading'
  const microphoneActive = micStates.includes(status)
  const microphone = canRecord && (
    <div className="practice-voice">
      {status === 'recording' && activeRecording && (
        <RecordingMeter stream={activeRecording.stream} startedAt={activeRecording.startedAt} maxSeconds={maxRecordingSeconds} />
      )}
      <div className="practice-voice-actions">
        {status === 'recording' ? (
          <>
            <button className="button button-outline" type="button" onClick={() => endRecording()}>Stop & transcribe</button>
            <button className="button button-outline" type="button" onClick={() => endRecording(true)}>Cancel recording</button>
          </>
        ) : <button className="button button-outline" type="button" disabled={disabled || microphoneActive || !voiceEnabled || !canUseMic}
          onClick={startRecording}>Record answer</button>}
      </div>
      {status === 'requesting' && <p role="status">Waiting for microphone access…</p>}
      {status === 'transcribing' && <p role="status">Transcribing your answer…</p>}
      {notice && <p role="status">{notice}</p>}
      {!voiceEnabled && <p>Microphone transcription needs ElevenLabs to be configured.</p>}
      {voiceEnabled && !canUseMic && <p>Microphone recording isn’t available in this browser.</p>}
      {voiceEnabled && canUseMic && !microphoneActive && <p>Audio is sent to ElevenLabs to make a transcript.</p>}
    </div>
  )

  return (
    <div className="practice-stage voice-stage">
      <aside className={status === 'playing' ? 'practice-interviewer is-speaking' : 'practice-interviewer'} aria-label="AI interviewer">
        <div className="practice-robot">
          <img src={interviewerImage} alt="AI interviewer robot" width="2752" height="1536" />
          {status === 'playing' && <div className="practice-robot-mouth" aria-hidden="true" />}
        </div>
        <div className="practice-listen">
          <div className="practice-interviewer-label"><i aria-hidden="true" />AI interviewer</div>
          <button className="button button-outline practice-listen-button" type="button"
            disabled={disabled || microphoneActive || (!questionVoiceEnabled && !speakingInBrowser)} onClick={listen}>
            <i className={listening ? 'practice-stop-icon' : 'practice-play-icon'} aria-hidden="true" />
            {listening ? 'Stop audio' : 'Listen to question'}
          </button>
          <div className="practice-listen-status" role="status">
            {status === 'loading' && <p>Loading question audio…</p>}
            {status === 'playing' && <p>Reading the question aloud…</p>}
            {playbackNotice && <p>{playbackNotice}</p>}
          </div>
        </div>
      </aside>
      <div className="practice-conversation">{children(microphone)}</div>
      {progress}
    </div>
  )
}
