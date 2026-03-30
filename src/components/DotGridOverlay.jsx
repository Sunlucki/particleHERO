import { useEffect, useMemo, useRef } from 'react'

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '')
  const expanded = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized

  if (expanded.length !== 6) {
    return { r: 0, g: 0, b: 0 }
  }

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
  }
}

function blendRgb(base, target, amount) {
  const t = clamp01(amount)

  return {
    r: Math.round(base.r + (target.r - base.r) * t),
    g: Math.round(base.g + (target.g - base.g) * t),
    b: Math.round(base.b + (target.b - base.b) * t),
  }
}

export default function DotGridOverlay({
  active,
  intensity = 1,
  ambientVisibility = 0,
  pointer,
  shockToken = 0,
  dotSize = 4,
  gap = 14,
  baseColor = '#29323d',
  activeColor = '#ff6c79',
  proximity = 118,
  shockRadius = 210,
  shockStrength = 1.8,
  className = '',
}) {
  const wrapperRef = useRef(null)
  const canvasRef = useRef(null)
  const dotsRef = useRef([])
  const sizeRef = useRef({ width: 0, height: 0 })
  const lastPointerRef = useRef({ x: 0, y: 0 })
  const lastShockTokenRef = useRef(shockToken)
  const motionEnergyRef = useRef(0)
  const baseRgb = useMemo(() => hexToRgb(baseColor), [baseColor])
  const activeRgb = useMemo(() => hexToRgb(activeColor), [activeColor])

  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas = canvasRef.current
    if (!wrapper || !canvas) return undefined

    const buildGrid = () => {
      const rect = wrapper.getBoundingClientRect()
      const width = Math.max(1, Math.floor(rect.width))
      const height = Math.max(1, Math.floor(rect.height))
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const context = canvas.getContext('2d')
      if (!context) return

      canvas.width = Math.max(1, Math.floor(width * dpr))
      canvas.height = Math.max(1, Math.floor(height * dpr))
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)

      const step = dotSize + gap
      const cols = Math.max(1, Math.floor((width + gap) / step))
      const rows = Math.max(1, Math.floor((height + gap) / step))
      const gridWidth = cols * step - gap
      const gridHeight = rows * step - gap
      const startX = (width - gridWidth) * 0.5 + dotSize * 0.5
      const startY = (height - gridHeight) * 0.5 + dotSize * 0.5
      const dots = []

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          dots.push({
            baseX: startX + col * step,
            baseY: startY + row * step,
            offsetX: 0,
            offsetY: 0,
            velocityX: 0,
            velocityY: 0,
            activation: 0,
            noiseSeed: Math.random() * 100,
          })
        }
      }

      dotsRef.current = dots
      sizeRef.current = { width, height }
      lastPointerRef.current = { x: width * 0.5, y: height * 0.5 }
    }

    buildGrid()

    const observer = new ResizeObserver(buildGrid)
    observer.observe(wrapper)

    return () => {
      observer.disconnect()
    }
  }, [dotSize, gap])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const context = canvas.getContext('2d')
    if (!context) return undefined

    if (!active) {
      if (wrapperRef.current) wrapperRef.current.style.opacity = '0'
      context.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height)
      return undefined
    }

    let frameId = 0
    let lastTime = performance.now()

    const applyShock = (originX, originY) => {
      dotsRef.current.forEach((dot) => {
        const dx = dot.baseX - originX
        const dy = dot.baseY - originY
        const distance = Math.hypot(dx, dy) || 1
        if (distance > shockRadius) return

        const falloff = 1 - distance / shockRadius
        const force = falloff * shockStrength * 22 * intensity
        dot.velocityX += (dx / distance) * force
        dot.velocityY += (dy / distance) * force
        dot.activation = Math.max(dot.activation, falloff)
      })

      motionEnergyRef.current = Math.max(motionEnergyRef.current, 1)
    }

    const tick = (now) => {
      const wrapper = wrapperRef.current
      const width = sizeRef.current.width
      const height = sizeRef.current.height
      const dt = Math.min(0.033, (now - lastTime) / 1000 || 0.016)
      const ambientEnergy = clamp01(ambientVisibility)
      lastTime = now

      const targetX = pointer?.visible ? pointer.x * width : width * 0.5
      const targetY = pointer?.visible ? pointer.y * height : height * 0.5
      const pointerDX = targetX - lastPointerRef.current.x
      const pointerDY = targetY - lastPointerRef.current.y
      const pointerSpeed = pointer?.visible ? Math.hypot(pointerDX, pointerDY) / Math.max(dt, 0.016) : 0
      const motionBoost = clamp01(pointerSpeed / 260)

      lastPointerRef.current = { x: targetX, y: targetY }
      motionEnergyRef.current = THREE_MOTION_DAMP(motionEnergyRef.current, motionBoost, dt)
      const displayEnergy = ambientEnergy + (1 - ambientEnergy) * motionEnergyRef.current

      if (shockToken !== lastShockTokenRef.current) {
        lastShockTokenRef.current = shockToken
        applyShock(targetX || width * 0.5, targetY || height * 0.5)
      }

      if (wrapper) {
        wrapper.style.opacity = `${clamp01(intensity * displayEnergy)}`
      }

      context.clearRect(0, 0, width, height)

      dotsRef.current.forEach((dot) => {
        const dotX = dot.baseX + dot.offsetX
        const dotY = dot.baseY + dot.offsetY
        const dx = dotX - targetX
        const dy = dotY - targetY
        const distance = Math.hypot(dx, dy) || 1
        const proximityMix = clamp01(1 - distance / proximity)

        if (proximityMix > 0.001) {
          const push = proximityMix * proximityMix * (10 + Math.min(pointerSpeed * 0.03, 26)) * intensity
          dot.velocityX += (dx / distance) * push
          dot.velocityY += (dy / distance) * push
          dot.activation = Math.max(dot.activation, proximityMix * 0.95)
        }

        const drift = Math.sin(now * 0.0009 + dot.noiseSeed) * 0.028 * displayEnergy
        dot.velocityX += (-dot.offsetX * 14 - dot.velocityX * 6.2 + drift) * dt
        dot.velocityY += (-dot.offsetY * 14 - dot.velocityY * 6.2 - drift * 0.7) * dt
        dot.offsetX += dot.velocityX * dt
        dot.offsetY += dot.velocityY * dt
        dot.activation += (0 - dot.activation) * dt * 2.6

        const colorMix = clamp01((ambientEnergy * 0.22 + Math.max(dot.activation, proximityMix * 0.82) * displayEnergy) * intensity)
        const color = blendRgb(baseRgb, activeRgb, colorMix)
        const radius = dotSize * (0.92 + colorMix * 0.68)
        const alpha = clamp01((0.12 + ambientEnergy * 0.18 + colorMix * 0.46) * intensity)

        context.beginPath()
        context.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`
        context.arc(dot.baseX + dot.offsetX, dot.baseY + dot.offsetY, radius, 0, Math.PI * 2)
        context.fill()
      })

      frameId = window.requestAnimationFrame(tick)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [active, activeRgb, ambientVisibility, baseRgb, dotSize, intensity, pointer, proximity, shockRadius, shockStrength, shockToken])

  return (
    <div
      ref={wrapperRef}
      className={`dot-grid-overlay${active ? ' dot-grid-overlay--active' : ''}${className ? ` ${className}` : ''}`}
      style={{ opacity: 0 }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="dot-grid-overlay__canvas" />
    </div>
  )
}

function THREE_MOTION_DAMP(current, target, dt) {
  return current + (target - current) * Math.min(1, dt * (target > current ? 11 : 4.4))
}