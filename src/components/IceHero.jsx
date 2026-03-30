import IceHeroCanvas from './IceHeroCanvas'
import './IceHero.css'

export default function IceHero({ className, sceneConfig }) {
  return (
    <section className={`hero-section${className ? ` ${className}` : ''}`} aria-label="Ice Hero Scene">
      <div className="hero-canvas-bg" aria-hidden="true">
        <IceHeroCanvas sceneConfig={sceneConfig} />
      </div>
    </section>
  )
}
