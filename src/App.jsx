import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import ProtectDentHeroCanvas from './components/ProtectDentHeroCanvas'

function App() {
  const copyRef = useRef(null)

  useEffect(() => {
    const el = copyRef.current
    if (!el) return

    gsap.set(el.children, { opacity: 0, y: 30 })

    const tl = gsap.timeline({ delay: 1.2 })

    tl.to(el.querySelector('.hero-kicker'), {
      y: 0,
      opacity: 1,
      duration: 0.8,
      ease: 'power3.out',
    })
      .to(
        el.querySelector('h1'),
        {
          y: 0,
          opacity: 1,
          duration: 1,
          ease: 'power3.out',
        },
        '-=0.4',
      )
      .to(
        el.querySelector('.hero-desc'),
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
        },
        '-=0.5',
      )

    return () => tl.kill()
  }, [])

  return (
    <main className="hero-layout" aria-label="ProtectDent Hero Section">
      <div className="hero-background" aria-hidden="true">
        <ProtectDentHeroCanvas />
      </div>

      <section className="hero-copy" ref={copyRef} aria-label="Hero copy">
        <p className="hero-kicker">PROTECTDENT / SECURITY CORE</p>
        <h1>Particle Shield System</h1>
        <p className="hero-desc">
          Shield fill is rendered fully from SVG-colored particles, glass outline stays transparent,
          and the checkmark emits a brighter energetic glow.
        </p>
      </section>
    </main>
  )
}

export default App
