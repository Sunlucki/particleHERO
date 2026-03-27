# ProtectDent WebGL Hero

Interactive 3D hero scene generated from the SVG logo layers:
- `BACK_SHIELD` (back shield)
- `FRONT_SHIELD` (front shield)
- `ARROW` (checkmark)

Included effects:
- Cursor-driven 3D shield + arrow rotation
- Internal particle cloud moving inside shield volume and following cursor
- Red incoming energy particles from multiple sides
- Impact bursts when energy particles hit the shield
- Hover mode: stronger particle attraction and glow

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

- `src/components/ProtectDentHeroCanvas.jsx` - ready WebGL hero component for reuse
- `src/assets/protectdent-logo.svg` - source logo used to build 3D geometry

## Embed into your existing React hero

1. Copy `src/components/ProtectDentHeroCanvas.jsx` and `src/assets/protectdent-logo.svg` to your project.
2. Install dependencies:

```bash
npm i three @react-three/fiber @react-three/drei @react-three/postprocessing maath
```

3. Use in your hero section:

```jsx
import ProtectDentHeroCanvas from './components/ProtectDentHeroCanvas'

export default function Hero() {
  return (
    <section style={{ minHeight: '70vh' }}>
      <ProtectDentHeroCanvas />
    </section>
  )
}
```

## Installed agent skills during setup

Installed globally via `npx skills add`:
- `freshtechbro/claudedesignskills@react-three-fiber`
- `bbeierle12/skill-mcp-claude@particles-gpu`

If you want these skills available in a new Codex session, restart Codex.
