import { useEffect, useRef, useState } from 'react'

function formatTime(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0')
  const remainder = String(seconds % 60).padStart(2, '0')
  return minutes + ':' + remainder
}

export function RecordingMeter({ stream, startedAt, maxSeconds }) {
  const [seconds, setSeconds] = useState(0)
  const fill = useRef(null)

  useEffect(() => {
    const clock = window.setInterval(() => {
      setSeconds(Math.min(maxSeconds, Math.floor((performance.now() - startedAt) / 1000)))
    }, 200)
    return () => window.clearInterval(clock)
  }, [maxSeconds, startedAt])

  useEffect(() => {
    const indicator = fill.current
    if (!window.AudioContext || !indicator) return
    let context
    let frameTimer
    try {
      context = new window.AudioContext()
      const source = context.createMediaStreamSource(stream)
      const analyser = context.createAnalyser()
      analyser.fftSize = 1024
      source.connect(analyser)
      if (context.state === 'suspended') void context.resume().catch(() => {})

      const samples = new Float32Array(analyser.fftSize)
      let smoothed = 0
      frameTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples)
        const power = samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length
        const level = Math.min(1, Math.max(0, (Math.sqrt(power) - 0.008) * 8))
        smoothed += (level - smoothed) * (level > smoothed ? 0.65 : 0.25)
        indicator.style.setProperty('--mic-level', smoothed.toFixed(3))
      }, 50)
    } catch {
      // Recording and timing still work if audio analysis cannot start.
    }
    return () => {
      window.clearInterval(frameTimer)
      if (context && context.state !== 'closed') void context.close().catch(() => {})
    }
  }, [stream])

  return (
    <div className="recording-meter">
      <div className="recording-meter-header">
        <span className="recording-meter-label" role="status"><i aria-hidden="true" />Recording</span>
        <span className="recording-meter-time" role="timer" aria-label="Recording duration">
          {formatTime(seconds)} <span>/ {formatTime(maxSeconds)}</span>
        </span>
      </div>
      <div className="recording-level" aria-hidden="true">
        <span>Mic level</span>
        <div className="recording-level-track"><div className="recording-level-fill" ref={fill} /></div>
      </div>
    </div>
  )
}
