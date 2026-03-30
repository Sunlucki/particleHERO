# WebGL Ice Hero

Interactive 3D hero scene with an ice shell, inner core transition, and diagnostic HUD overlays.

## Stack

- React + Vite
- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@react-three/postprocessing`
- `maath`

## Run

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Key files

- `src/components/IceHeroCanvas.jsx` - main WebGL hero canvas component
- `src/components/IceHero.jsx` - section wrapper component
- `src/components/DotGridOverlay.jsx` - animated diagnostic grid overlay
- `public/models` and `public/textures` - scene assets

## Embed into your existing React hero

1. Copy `src/components/IceHeroCanvas.jsx` and any required assets from `public/models` and `public/textures`.
2. Install dependencies:

```bash
npm i three @react-three/fiber @react-three/drei @react-three/postprocessing maath
```

3. Use in your hero section:

```jsx
import IceHeroCanvas from './components/IceHeroCanvas'

export default function Hero() {
  return (
    <section style={{ minHeight: '70vh' }}>
      <IceHeroCanvas />
    </section>
  )
}
```
