/* eslint-disable react-hooks/immutability */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, PerspectiveCamera, useGLTF } from '@react-three/drei'
import {
  ChromaticAberration,
  EffectComposer,
  Vignette,
} from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js'
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import { easing } from 'maath'

const IS_MOBILE =
  typeof window !== 'undefined' && (window.innerWidth < 768 || navigator.maxTouchPoints > 1)
const SIM_SIZE = IS_MOBILE ? 64 : 128
const GLTF_MODEL_PATH = '/models/LOGO.glb'
const TEETH_MODEL_PATH = '/models/teeth.glb'

/* ═══════════════════════════════════════════
   Shaders
   ═══════════════════════════════════════════ */

const PARTICLE_VERTEX_SHADER = `
attribute vec2 aReference;
attribute float aSeed;

uniform sampler2D uPositionTexture;
uniform sampler2D uVelocityTexture;
uniform sampler2D uColorTexture;
uniform sampler2D uColorToothTexture;
uniform float uParticleSize;
uniform float uHover;
uniform float uMorph;
uniform vec3 uPointer;

varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorldPos;

void main() {
  vec3 instancePos = texture2D(uPositionTexture, aReference).xyz;
  vec3 vel = texture2D(uVelocityTexture, aReference).xyz;
  vec3 baseColor = mix(texture2D(uColorTexture, aReference).rgb, texture2D(uColorToothTexture, aReference).rgb, uMorph);

  float speed = length(vel);
  float energy = smoothstep(0.05, 1.8, speed);

  float pointerProximity = exp(-pow(distance(instancePos, uPointer) * 2.0, 2.0));

  float scale = uParticleSize * (0.7 + aSeed * 0.6);
  vec3 localPos = position * scale + instancePos;

  vNormal = normalize(mat3(modelMatrix) * normal);
  vColor = mix(baseColor, baseColor * 1.25, energy * 0.3) * (1.0 + pointerProximity * uHover * 0.8);

  vec4 worldPos4 = modelMatrix * vec4(localPos, 1.0);
  vWorldPos = worldPos4.xyz;

  vec4 mvPos = modelViewMatrix * vec4(localPos, 1.0);
  gl_Position = projectionMatrix * mvPos;
}
`

const PARTICLE_FRAGMENT_SHADER = `
varying vec3 vNormal;
varying vec3 vColor;
varying vec3 vWorldPos;

void main() {
  vec3 N = normalize(vNormal);
  vec3 V = normalize(cameraPosition - vWorldPos);

  vec3 L1 = normalize(vec3(0.5, 0.8, 0.6));
  float diff1 = max(dot(N, L1), 0.0) * 0.65;

  vec3 L2 = normalize(vec3(-0.5, 0.2, 0.5));
  float diff2 = max(dot(N, L2), 0.0) * 0.25;

  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.5) * 0.12;

  vec3 H = normalize(L1 + V);
  float spec = pow(max(dot(N, H), 0.0), 64.0) * 0.2;

  vec3 ambient = vColor * 0.28;
  vec3 diffuse = vColor * (diff1 + diff2);
  vec3 specular = vec3(0.45, 0.6, 0.75) * spec;
  vec3 rimCol = vec3(0.3, 0.5, 0.65) * rim;

  vec3 final = ambient + diffuse + specular + rimCol;
  gl_FragColor = vec4(final, 1.0);
}
`

const POSITION_COMPUTE_SHADER = `
uniform float uDelta;
uniform vec3 uBounds;

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  // NaN guard: if velocity or position corrupted, reset (WebGL1/2 compatible)
  if (vel.x != vel.x || vel.y != vel.y || vel.z != vel.z) vel = vec3(0.0);
  if (pos.x != pos.x || pos.y != pos.y || pos.z != pos.z) pos = vec3(0.0);

  pos += vel * uDelta;

  float outer = max(max(uBounds.x, uBounds.y), uBounds.z) * 7.0;
  float lenP = length(pos);
  if (lenP > outer) {
    pos = (pos / max(lenP, 0.0001)) * (outer * 0.45);
  }

  gl_FragColor = vec4(pos, 1.0);
}
`

const VELOCITY_COMPUTE_SHADER = `
uniform float uTime;
uniform float uDelta;
uniform float uHover;
uniform float uMorph;
uniform float uShockTime;
uniform float uShockDirection;
uniform float uPointerSpeed;
uniform vec3 uPointer;
uniform vec3 uBounds;
uniform sampler2D uTargetShield;
uniform sampler2D uTargetTooth;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

vec3 safeNormalize(vec3 v) {
  float len = length(v);
  return len > 0.0001 ? v / len : vec3(0.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec3 pos = texture2D(texturePosition, uv).xyz;
  vec3 vel = texture2D(textureVelocity, uv).xyz;

  vec3 shieldTarget = texture2D(uTargetShield, uv).xyz;
  vec3 toothTarget = texture2D(uTargetTooth, uv).xyz;
  vec3 target = mix(shieldTarget, toothTarget, uMorph);

  vec3 toTarget = target - pos;
  float dist = length(toTarget) + 0.0001;

  float tf = 2.2;
  vec3 turbulence = vec3(
    sin(pos.y * tf + uTime * 0.8) * cos(pos.z * tf * 1.3 + uTime * 0.6),
    cos(pos.x * tf + uTime * 0.7) * sin(pos.z * tf * 1.1 + uTime * 0.5),
    sin(pos.x * tf * 0.9 + uTime * 0.6) * cos(pos.y * tf + uTime * 0.8)
  ) * 0.2;

  float attractStrength = mix(3.4, 4.0, uMorph);
  vec3 attract = safeNormalize(toTarget) * min(dist, 2.5) * attractStrength;

  vec3 fromPointer = pos - uPointer;
  float pointerDist = length(fromPointer) + 0.0001;

  float pointerField = exp(-pow(pointerDist * 2.0, 2.0)) * (0.5 + uHover * 3.5);

  float speedMul = 1.0 + uPointerSpeed * 14.0;
  float hoverBoost = 1.0 + uHover * 4.5;

  float seedRand = rand(uv + vec2(uTime * 0.3, sin(uTime * 0.5)));
  vec3 randomDir = safeNormalize(vec3(
    rand(uv + vec2(seedRand, uTime * 0.2)) - 0.5,
    rand(uv + vec2(seedRand * 0.7, uTime * 0.15)) - 0.5,
    rand(uv + vec2(seedRand * 1.3, uTime * 0.25)) - 0.5
  ));

  float chaos = sin(pos.x * 3.2 + uTime * 2.1) * cos(pos.y * 2.8 + uTime * 1.9) * uHover;
  vec3 chaosDir = safeNormalize(vec3(chaos, sin(pos.z * 2.5 + uTime * 1.7) * uHover, cos(pos.x * 3.1 + uTime * 2.3) * uHover));

  vec3 pointerPush = safeNormalize(fromPointer) * pointerField * 2.2 * speedMul * hoverBoost +
                     (chaosDir + randomDir * 0.7) * pointerField * 2.5 * uHover;
  vec3 pointerSwirl = safeNormalize(cross(vec3(0.0, 0.0, 1.0), fromPointer))
                      * pointerField * (0.65 + uPointerSpeed * 1.8) * hoverBoost;

  float nearCursor = exp(-pow(pointerDist * 0.65, 2.0));
  float returnDelay = 1.0 - nearCursor * min(uPointerSpeed * 0.2, 0.27);
  attract *= returnDelay;

  vec3 swirlAxis = normalize(vec3(0.0, 1.0, 0.35));
  vec3 swirl = cross(swirlAxis, pos + target * 0.16) * (0.72 + uMorph * 0.42);

  vec3 acceleration = attract + swirl + turbulence + pointerPush + pointerSwirl;

  float shockAge = uTime - uShockTime;
  if (shockAge >= 0.0 && shockAge <= 1.35) {
    float maxR = max(uBounds.x, uBounds.y);
    float radial = length(pos.xy) / max(maxR, 0.0001);
    float front = uShockDirection > 0.0 ? shockAge * 3.8 : (1.35 - shockAge) * 3.8;
    float shell = exp(-pow((radial - front) * 7.4, 2.0));

    vec3 outward = safeNormalize(vec3(pos.xy, pos.z * 0.65) + vec3(0.0001));
    float dir = uShockDirection > 0.0 ? 1.0 : -1.0;
    acceleration += outward * shell * 21.0 * dir;
  }

  vel += acceleration * uDelta;
  vel *= 0.938;

  float maxSpeed = 5.0;
  float speed = length(vel);
  if (speed > maxSpeed) {
    vel = vel / speed * maxSpeed;
  }

  gl_FragColor = vec4(vel, 1.0);
}
`

/* ═══════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════ */

function seeded(index, offset = 0) {
  const x = Math.sin(index * 12.9898 + offset * 78.233) * 43758.5453
  return x - Math.floor(x)
}

function smoothstepJS(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

function useToothGeometry() {
  const gltf = useGLTF(TEETH_MODEL_PATH)

  return useMemo(() => {
    const scene = gltf.scene.clone(true)
    scene.updateWorldMatrix(true, true)

    const geometries = []
    scene.traverse((child) => {
      if (!child.isMesh) return
      const geom = child.geometry.clone()
      geom.applyMatrix4(child.matrixWorld)
      const processed = mergeVertices(geom, 1e-4)
      geom.dispose()
      processed.computeVertexNormals()
      geometries.push(processed)
    })

    if (geometries.length === 0) return { toothGeometries: [] }

    // Keep only the largest mesh (outer surface)
    geometries.sort((a, b) => b.attributes.position.count - a.attributes.position.count)
    const outerGeometries = [geometries[0]]

    // Center and scale to match shield size (~2.8 units)
    const union = new THREE.Box3()
    outerGeometries.forEach((g) => {
      g.computeBoundingBox()
      union.union(g.boundingBox)
    })

    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    union.getCenter(center)
    union.getSize(size)

    const maxDim = Math.max(size.x, size.y, size.z)
    const scaleFactor = maxDim > 0 ? 2.8 / maxDim : 1

    outerGeometries.forEach((g) => {
      g.translate(-center.x, -center.y, -center.z)
      g.scale(scaleFactor, scaleFactor, scaleFactor)
      g.computeBoundingBox()
      g.computeBoundingSphere()
    })

    // Dispose unused geometries
    for (let i = 1; i < geometries.length; i++) geometries[i].dispose()

    return { toothGeometries: outerGeometries }
  }, [gltf])
}

function useShieldGeometry() {
  const gltf = useGLTF(GLTF_MODEL_PATH)

  return useMemo(() => {
    const scene = gltf.scene.clone(true)
    scene.updateWorldMatrix(true, true)

    let arrowGeometry = null
    let backGeometry = null
    let frontGeometry = null

    scene.traverse((child) => {
      if (!child.isMesh) return
      const name = child.name
      const geom = child.geometry.clone()
      geom.applyMatrix4(child.matrixWorld)
      const processed = mergeVertices(geom, 1e-4)
      geom.dispose()
      processed.computeVertexNormals()

      if (name === 'ARROW') arrowGeometry = processed
      else if (name === 'Boolean') backGeometry = processed
      else if (name === 'INSIDE 2') frontGeometry = processed
    })

    const union = new THREE.Box3()
    ;[backGeometry, frontGeometry, arrowGeometry].forEach((g) => {
      if (!g) return
      g.computeBoundingBox()
      union.union(g.boundingBox)
    })

    const center = new THREE.Vector3()
    const size = new THREE.Vector3()
    union.getCenter(center)
    union.getSize(size)

    const maxDim = Math.max(size.x, size.y, size.z)
    const scaleFactor = maxDim > 0 ? 2.8 / maxDim : 1

    ;[backGeometry, frontGeometry, arrowGeometry].forEach((g) => {
      if (!g) return
      g.translate(-center.x, -center.y, -center.z)
      g.scale(scaleFactor, scaleFactor, scaleFactor)
      g.computeBoundingBox()
      g.computeBoundingSphere()
    })

    size.multiplyScalar(scaleFactor)

    let contourPoints = []
    if (backGeometry) {
      const posArr = backGeometry.attributes.position.array
      const count = backGeometry.attributes.position.count
      const BUCKETS = 96
      const radii = new Array(BUCKETS).fill(0)
      const pts = new Array(BUCKETS).fill(null)

      for (let i = 0; i < count; i++) {
        const x = posArr[i * 3]
        const y = posArr[i * 3 + 1]
        const angle = Math.atan2(y, x)
        const bucket = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * BUCKETS) % BUCKETS
        const r = Math.sqrt(x * x + y * y)
        if (r > radii[bucket]) {
          radii[bucket] = r
          pts[bucket] = new THREE.Vector3(x, y, 0)
        }
      }
      contourPoints = pts.filter((p) => p !== null)
    }

    return {
      backGeometry,
      frontGeometry,
      arrowGeometry,
      contourPoints,
      bounds: {
        rx: Math.max(0.82, size.x * 0.48),
        ry: Math.max(0.92, size.y * 0.46),
        rz: Math.max(0.44, size.z * 0.54),
      },
    }
  }, [gltf])
}

function makeFloatTexture(size, data) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType)
  texture.needsUpdate = true
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.wrapS = THREE.ClampToEdgeWrapping
  texture.wrapT = THREE.ClampToEdgeWrapping
  return texture
}

function makeSampler(geometry) {
  if (!geometry) return null
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial())
  return new MeshSurfaceSampler(mesh).build()
}

function buildAtlas(bounds, backGeometry, frontGeometry, arrowGeometry, toothGeometries) {
  const total = SIM_SIZE * SIM_SIZE

  const initialPositionData = new Float32Array(total * 4)
  const initialVelocityData = new Float32Array(total * 4)
  const targetShieldData = new Float32Array(total * 4)
  const targetToothData = new Float32Array(total * 4)
  const colorData = new Float32Array(total * 4)
  const colorToothData = new Float32Array(total * 4)

  const tempPoint = new THREE.Vector3()
  const tempNormal = new THREE.Vector3(0, 0, 1)

  const samplers = {
    back: makeSampler(backGeometry),
    front: makeSampler(frontGeometry),
    arrow: makeSampler(arrowGeometry),
  }

  const layerColor = {
    back: new THREE.Color('#2d5a72'),
    front: new THREE.Color('#3e86a8'),
    arrow: new THREE.Color('#5cb0d4'),
  }

  const maxR = Math.max(bounds.rx, bounds.ry, bounds.rz)

  // Build tooth samplers
  const toothSamplers = toothGeometries.map((g) => makeSampler(g)).filter(Boolean)
  const toothColorBase = new THREE.Color('#a8d8f0')
  const toothColorBright = new THREE.Color('#e4f4ff')

  for (let i = 0; i < total; i += 1) {
    const i4 = i * 4
    const r1 = seeded(i, 0.11)
    const r2 = seeded(i, 0.27)
    const r3 = seeded(i, 0.49)
    const r4 = seeded(i, 0.73)

    let layer = 'back'
    if (r1 < 0.18 && samplers.arrow) layer = 'arrow'
    else if (r1 < 0.64 && samplers.front) layer = 'front'

    const sampler = samplers[layer] ?? samplers.front ?? samplers.back ?? samplers.arrow

    if (sampler) {
      sampler.sample(tempPoint, tempNormal)
    } else {
      const phi = r2 * Math.PI * 2
      const y = (r3 * 2 - 1) * bounds.ry
      tempPoint.set(Math.cos(phi) * bounds.rx * 0.7, y, Math.sin(phi) * bounds.rz * 0.9)
      tempNormal.copy(tempPoint).normalize()
    }

    targetShieldData[i4] = tempPoint.x
    targetShieldData[i4 + 1] = tempPoint.y
    targetShieldData[i4 + 2] = tempPoint.z
    targetShieldData[i4 + 3] = 1

    // Tooth target — sample only outer surface
    if (toothSamplers.length > 0) {
      toothSamplers[0].sample(tempPoint, tempNormal)
    } else {
      tempPoint.set((r2 - 0.5) * 1.2, (r3 - 0.5) * 2.0, (r4 - 0.5) * 1.2)
    }
    targetToothData[i4] = tempPoint.x
    targetToothData[i4 + 1] = tempPoint.y
    targetToothData[i4 + 2] = tempPoint.z
    targetToothData[i4 + 3] = 1

    // Tooth color: blue-white gradient based on height
    const toothMix = smoothstepJS(0.2, 0.8, (tempPoint.y + 1.4) * 0.36)
    const tc = toothColorBright.clone().lerp(toothColorBase, toothMix)
    colorToothData[i4] = tc.r
    colorToothData[i4 + 1] = tc.g
    colorToothData[i4 + 2] = tc.b
    colorToothData[i4 + 3] = 1

    initialPositionData[i4] = targetShieldData[i4] + (r1 - 0.5) * bounds.rx * 1.6
    initialPositionData[i4 + 1] = targetShieldData[i4 + 1] + (r2 - 0.5) * bounds.ry * 1.1
    initialPositionData[i4 + 2] = targetShieldData[i4 + 2] + (r3 - 0.5) * bounds.rz * 1.2
    initialPositionData[i4 + 3] = 1

    initialVelocityData[i4] = (r2 - 0.5) * 0.28
    initialVelocityData[i4 + 1] = (r3 - 0.5) * 0.28
    initialVelocityData[i4 + 2] = (r4 - 0.5) * 0.28
    initialVelocityData[i4 + 3] = 1

    const c = layerColor[layer] ?? layerColor.front
    colorData[i4] = c.r
    colorData[i4 + 1] = c.g
    colorData[i4 + 2] = c.b
    colorData[i4 + 3] = 1
  }

  return {
    initialPositionData,
    initialVelocityData,
    targetShieldTexture: makeFloatTexture(SIM_SIZE, targetShieldData),
    targetToothTexture: makeFloatTexture(SIM_SIZE, targetToothData),
    colorTexture: makeFloatTexture(SIM_SIZE, colorData),
    colorToothTexture: makeFloatTexture(SIM_SIZE, colorToothData),
  }
}

/* SVG path for the shield outline (BACK_SHIELD from protectdent-logo.svg, viewBox 2048×2048) */
const SHIELD_SVG_PATH = 'M1026.54,1977.44c-.84.22-1.68.42-2.54.63-.85-.2-1.71-.41-2.55-.63C100.52,1747.3,212.02,678.45,231.96,413.43c1.9-25.25,22.39-45.11,47.68-46.18,356.33-14.95,625.48-202.32,713.51-271.71,18.12-14.28,43.65-14.28,61.8-.03,88.34,69.35,358.34,256.73,713.43,271.73,25.29,1.07,45.77,20.93,47.67,46.17,19.93,265.01,131.45,1333.87-789.51,1564.02Z'

function parseSVGShieldContour() {
  const paths = new SVGLoader().parse(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2048 2048"><path d="${SHIELD_SVG_PATH}"/></svg>`
  ).paths
  if (!paths.length) return []

  const shapes = paths[0].toShapes(true)
  if (!shapes.length) return []

  const raw = shapes[0].getPoints(200)

  // Center and normalize to roughly ±1.4 range (matching model bounds)
  const cx = 1024, cy = 1024, scale = 2048
  return raw.map((p) => new THREE.Vector3(
    (p.x - cx) / scale * 2.8,
    -(p.y - cy) / scale * 2.8,  // flip Y (SVG Y is down)
    0
  ))
}

function buildInstancedGeometry() {
  const total = SIM_SIZE * SIM_SIZE
  const sphere = new THREE.IcosahedronGeometry(1, 1)

  const geometry = new THREE.InstancedBufferGeometry()
  geometry.index = sphere.index
  geometry.attributes.position = sphere.attributes.position
  geometry.attributes.normal = sphere.attributes.normal

  const references = new Float32Array(total * 2)
  const seeds = new Float32Array(total)
  let ptr = 0
  for (let y = 0; y < SIM_SIZE; y++) {
    for (let x = 0; x < SIM_SIZE; x++) {
      references[ptr * 2] = (x + 0.5) / SIM_SIZE
      references[ptr * 2 + 1] = (y + 0.5) / SIM_SIZE
      seeds[ptr] = seeded(ptr, 0.91)
      ptr++
    }
  }

  geometry.setAttribute('aReference', new THREE.InstancedBufferAttribute(references, 2))
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))
  geometry.instanceCount = total
  sphere.dispose()
  return geometry
}

/* ═══════════════════════════════════════════
   Scene — GPU resources in refs, created in useEffect,
   rendered via <primitive> to avoid R3F reconciler issues
   ═══════════════════════════════════════════ */

function SceneContent() {
  const gl = useThree((s) => s.gl)
  const viewport = useThree((s) => s.viewport)

  const modelRef = useRef(null)
  const shieldRef = useRef(null)
  const particleRigRef = useRef(null)
  const waveRef = useRef(null)

  const waveMatCoreRef = useRef(null)
  const waveMatRedRef = useRef(null)
  const waveMatBlueRef = useRef(null)

  const pointerRef = useRef(new THREE.Vector3())
  const lastPointerRef = useRef(new THREE.Vector2())
  const pointerNowRef = useRef(new THREE.Vector2())
  const shockTimeRef = useRef(-100)
  const waveTimeRef = useRef(-100)
  const clickTimeRef = useRef(-100)

  const morphTargetRef = useRef(1)
  const morphValueRef = useRef(1)
  const clockRef = useRef(0)

  const chromaOffset = useMemo(() => new THREE.Vector2(0, 0), [])
  const hoveredRef = useRef(false)
  const hoverValueRef = useRef(0)
  const waveDirectionRef = useRef(1)

  // GPU resources stored in a single ref
  const gpuResRef = useRef(null)

  // Persistent Three.js objects created once via useState lazy initializer
  const [particleMesh] = useState(() => {
    const m = new THREE.Mesh()
    m.frustumCulled = false
    return m
  })
  const { backGeometry, frontGeometry, arrowGeometry, contourPoints, bounds } = useShieldGeometry()
  const { toothGeometries } = useToothGeometry()

  // Initialize all GPU resources imperatively — runs once
  useEffect(() => {
    const atlas = buildAtlas(bounds, backGeometry, frontGeometry, arrowGeometry, toothGeometries)

    const particleGeometry = buildInstancedGeometry()
    // GPGPU simulation
    const gpuCompute = new GPUComputationRenderer(SIM_SIZE, SIM_SIZE, gl)
    if (!gl.capabilities.isWebGL2) {
      gpuCompute.setDataType(THREE.HalfFloatType)
    }

    const posTex = gpuCompute.createTexture()
    const velTex = gpuCompute.createTexture()
    posTex.image.data.set(atlas.initialPositionData)
    velTex.image.data.set(atlas.initialVelocityData)

    const posVar = gpuCompute.addVariable('texturePosition', POSITION_COMPUTE_SHADER, posTex)
    const velVar = gpuCompute.addVariable('textureVelocity', VELOCITY_COMPUTE_SHADER, velTex)

    gpuCompute.setVariableDependencies(posVar, [posVar, velVar])
    gpuCompute.setVariableDependencies(velVar, [posVar, velVar])

    posVar.material.uniforms.uDelta = { value: 0 }
    posVar.material.uniforms.uBounds = { value: new THREE.Vector3(bounds.rx, bounds.ry, bounds.rz) }

    velVar.material.uniforms.uTime = { value: 0 }
    velVar.material.uniforms.uDelta = { value: 0 }
    velVar.material.uniforms.uHover = { value: 0 }
    velVar.material.uniforms.uMorph = { value: 0 }
    velVar.material.uniforms.uShockTime = { value: -100 }
    velVar.material.uniforms.uShockDirection = { value: 1 }
    velVar.material.uniforms.uPointer = { value: new THREE.Vector3() }
    velVar.material.uniforms.uPointerSpeed = { value: 0 }
    velVar.material.uniforms.uBounds = { value: new THREE.Vector3(bounds.rx, bounds.ry, bounds.rz) }
    velVar.material.uniforms.uTargetShield = { value: atlas.targetShieldTexture }
    velVar.material.uniforms.uTargetTooth = { value: atlas.targetToothTexture }

    const initErr = gpuCompute.init()
    if (initErr) {
      console.error('GPGPU init error:', initErr)
      return
    }

    // Materials
    const particleMaterial = new THREE.ShaderMaterial({
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
      vertexShader: PARTICLE_VERTEX_SHADER,
      fragmentShader: PARTICLE_FRAGMENT_SHADER,
      uniforms: {
        uPositionTexture: { value: null },
        uVelocityTexture: { value: null },
        uColorTexture: { value: atlas.colorTexture },
        uColorToothTexture: { value: atlas.colorToothTexture },
        uParticleSize: { value: IS_MOBILE ? 0.022 : 0.016 },
        uHover: { value: 0 },
        uMorph: { value: 0 },
        uPointer: { value: new THREE.Vector3() },
      },
    })

    // Attach to persistent mesh objects
    particleMesh.geometry = particleGeometry
    particleMesh.material = particleMaterial

    gpuResRef.current = {
      gpuCompute,
      posVar,
      velVar,
      particleGeometry,
      particleMaterial,
      atlas,
    }

    // Start morph animation
    morphTargetRef.current = 1
    const morphTimer = setTimeout(() => {
      morphTargetRef.current = 0
    }, 800)

    return () => {
      clearTimeout(morphTimer)
      gpuResRef.current = null

      // Detach from persistent mesh before disposing
      particleMesh.geometry = new THREE.BufferGeometry()
      particleMesh.material = new THREE.MeshBasicMaterial()

      particleGeometry.dispose()
      particleMaterial.dispose()
      atlas.targetShieldTexture.dispose()
      atlas.targetToothTexture.dispose()
      atlas.colorTexture.dispose()
      atlas.colorToothTexture.dispose()

      gpuCompute.variables?.forEach((v) => {
        v.renderTargets?.forEach((rt) => rt.dispose())
        v.material?.dispose()
      })
    }
  }, [gl, bounds, backGeometry, frontGeometry, arrowGeometry, toothGeometries, particleMesh])

  const waveGeometry = useMemo(() => {
    const svgPoints = parseSVGShieldContour()

    let points = svgPoints.length >= 12 ? svgPoints : contourPoints

    if (!points || points.length < 12) {
      const fallback = [
        new THREE.Vector3(0, 1.18, 0),
        new THREE.Vector3(0.84, 0.92, 0),
        new THREE.Vector3(0.98, 0.24, 0),
        new THREE.Vector3(0.62, -1.02, 0),
        new THREE.Vector3(0, -1.34, 0),
        new THREE.Vector3(-0.62, -1.02, 0),
        new THREE.Vector3(-0.98, 0.24, 0),
        new THREE.Vector3(-0.84, 0.92, 0),
      ]
      const fallbackCurve = new THREE.CatmullRomCurve3(fallback, true, 'catmullrom', 0.45)
      points = fallbackCurve.getPoints(120)
    }

    const curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.35)
    return new THREE.TubeGeometry(curve, 200, 0.016, 8, true)
  }, [contourPoints])

  const waveSurfaceZ = useMemo(() => {
    if (frontGeometry?.boundingBox) return frontGeometry.boundingBox.max.z + 0.01
    return bounds.rz * 0.8
  }, [bounds.rz, frontGeometry])

  const fitBaseScale = useMemo(() => {
    const fitX = 1.16 / Math.max(bounds.rx, 0.001)
    const fitY = 1.36 / Math.max(bounds.ry, 0.001)
    return Math.min(1, fitX, fitY)
  }, [bounds.rx, bounds.ry])

  const onShockwave = () => {
    const now = clockRef.current
    waveTimeRef.current = now
    clickTimeRef.current = now
    shockTimeRef.current = now
    const nextMorph = morphTargetRef.current > 0.5 ? 0 : 1
    waveDirectionRef.current = nextMorph === 1 ? 1 : -1
    morphTargetRef.current = nextMorph
  }

  useFrame((state, delta) => {
    const res = gpuResRef.current
    if (!res) return

    const { gpuCompute, posVar, velVar, particleMaterial } = res
    const dt = Math.min(0.033, delta)

    // Pointer
    const isMobileLayout = viewport.width < 6.5
    const worldX = state.pointer.x * viewport.width / 2
    const worldY = state.pointer.y * viewport.height / 2
    const modelOffsetX = isMobileLayout ? 0 : viewport.width * 0.22
    const modelOffsetY = isMobileLayout ? viewport.height * 0.18 : 0
    pointerRef.current.set(worldX - modelOffsetX, worldY - modelOffsetY, 0)

    const pointerNow = pointerNowRef.current.set(state.pointer.x, state.pointer.y)
    const pointerSpeed = pointerNow.distanceTo(lastPointerRef.current) / Math.max(0.0001, dt)
    lastPointerRef.current.copy(pointerNow)

    if (modelRef.current) {
      modelRef.current.position.x = modelOffsetX
      modelRef.current.position.y = modelOffsetY
    }

    const now = state.clock.elapsedTime
    clockRef.current = now
    morphValueRef.current = THREE.MathUtils.damp(morphValueRef.current, morphTargetRef.current, 2.6, dt)
    hoverValueRef.current = THREE.MathUtils.damp(hoverValueRef.current, hoveredRef.current ? 1 : 0, 4, dt)

    const clickAge = now - clickTimeRef.current
    let clickPulse = 0
    if (clickAge >= 0 && clickAge <= 1.0) {
      clickPulse = Math.exp(-Math.pow((clickAge - 0.28) / 0.14, 2))
    }

    if (shieldRef.current) {
      const breathe = 1 + Math.sin(now * 1.25) * 0.008
      const clickScale = 1 - clickPulse * 0.08 + clickPulse * 0.18
      const hoverScale = 1 + hoverValueRef.current * 0.03
      const scale = fitBaseScale * breathe * clickScale * hoverScale
      easing.damp3(shieldRef.current.scale, [scale, scale, scale], 0.16, dt)
    }

    const chromaStrength = clickPulse * 0.003 + hoverValueRef.current * 0.0003
    chromaOffset.set(chromaStrength, chromaStrength * 0.65)

    // GPGPU compute step
    posVar.material.uniforms.uDelta.value = dt
    velVar.material.uniforms.uTime.value = now
    velVar.material.uniforms.uDelta.value = dt
    velVar.material.uniforms.uHover.value = hoverValueRef.current
    velVar.material.uniforms.uMorph.value = morphValueRef.current
    velVar.material.uniforms.uShockTime.value = shockTimeRef.current
    velVar.material.uniforms.uPointer.value.copy(pointerRef.current)
    velVar.material.uniforms.uPointerSpeed.value = Math.min(pointerSpeed * 0.08, 1.0)
    velVar.material.uniforms.uShockDirection.value = waveDirectionRef.current

    gpuCompute.compute()

    const posTex = gpuCompute.getCurrentRenderTarget(posVar).texture
    const velTex = gpuCompute.getCurrentRenderTarget(velVar).texture

    particleMaterial.uniforms.uPositionTexture.value = posTex
    particleMaterial.uniforms.uVelocityTexture.value = velTex
    particleMaterial.uniforms.uHover.value = hoverValueRef.current
    particleMaterial.uniforms.uMorph.value = morphValueRef.current
    particleMaterial.uniforms.uPointer.value.copy(pointerRef.current)
    const sizeHover = IS_MOBILE ? 0.024 : 0.018
    const sizeIdle = IS_MOBILE ? 0.022 : 0.016
    particleMaterial.uniforms.uParticleSize.value = THREE.MathUtils.lerp(sizeIdle, sizeHover, hoverValueRef.current)

    if (particleRigRef.current) {
      const particleScale = fitBaseScale
      easing.damp3(particleRigRef.current.scale, [particleScale, particleScale, particleScale], 0.14, dt)
    }

    if (waveRef.current) {
      const age = now - waveTimeRef.current
      const alive = age >= 0 && age <= 1.28
      waveRef.current.visible = alive

      if (alive) {
        const t = age / 1.28
        const expanding = waveDirectionRef.current > 0
        const xyScale = expanding ? 1 + t * 2.35 : 1 + (1 - t) * 2.35
        waveRef.current.scale.set(xyScale, xyScale, 1)
        waveRef.current.position.z = expanding
          ? waveSurfaceZ + t * (bounds.rz * 2.25)
          : waveSurfaceZ + (1 - t) * (bounds.rz * 2.25)

        const core = Math.min(1, Math.pow(1 - t, 0.46) * 1.35)
        const red = Math.min(1, Math.pow(Math.max(0, 1 - t * 1.1), 0.52) * 1.22)
        const blue = Math.min(1, Math.pow(Math.max(0, 1 - t * 1.14), 0.6) * 1.12)

        if (waveMatCoreRef.current) waveMatCoreRef.current.opacity = core
        if (waveMatRedRef.current) waveMatRedRef.current.opacity = red
        if (waveMatBlueRef.current) waveMatBlueRef.current.opacity = blue
      }
    }
  })

  return (
    <>
      <fog attach="fog" args={['#030912', 7.5, 16]} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 6, 4]} intensity={1.3} color="#e0f0ff" />
      <directionalLight position={[-3, -1, 3]} intensity={0.45} color="#8ab4d4" />

      <Environment preset="city" background={false} />

      <group ref={modelRef}>
        <mesh
          onPointerOver={(e) => { e.stopPropagation(); hoveredRef.current = true }}
          onPointerOut={(e) => { e.stopPropagation(); hoveredRef.current = false }}
          onClick={(e) => { e.stopPropagation(); onShockwave() }}
        >
          <sphereGeometry args={[Math.max(bounds.rx, bounds.ry) * 1.1, 20, 20]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <group ref={shieldRef}>
          <group ref={waveRef} visible={false} renderOrder={14}>
            <mesh geometry={waveGeometry} scale={[1.08, 1.08, 1]}>
              <meshBasicMaterial
                ref={waveMatRedRef}
                color="#2a6fa8"
                transparent opacity={0}
                blending={THREE.AdditiveBlending}
                depthTest={false} depthWrite={false} toneMapped={false}
              />
            </mesh>
            <mesh geometry={waveGeometry} scale={[1, 1, 1]}>
              <meshBasicMaterial
                ref={waveMatCoreRef}
                color="#d8fdff"
                transparent opacity={0}
                blending={THREE.AdditiveBlending}
                depthTest={false} depthWrite={false} toneMapped={false}
              />
            </mesh>
            <mesh geometry={waveGeometry} scale={[0.92, 0.92, 1]}>
              <meshBasicMaterial
                ref={waveMatBlueRef}
                color="#1a4a7a"
                transparent opacity={0}
                blending={THREE.AdditiveBlending}
                depthTest={false} depthWrite={false} toneMapped={false}
              />
            </mesh>
          </group>
        </group>

        <group ref={particleRigRef}>
          <primitive object={particleMesh} />
        </group>
      </group>

      <EffectComposer multisampling={0}>
        <ChromaticAberration offset={chromaOffset} />
        <Vignette offset={0.3} darkness={0.6} blendFunction={BlendFunction.NORMAL} />
      </EffectComposer>
    </>
  )
}

function SceneFallback() {
  return null
}

export function ProtectDentHeroCanvas() {
  return (
    <div className="shield-canvas-wrap">
      <Canvas
        dpr={[1, IS_MOBILE ? 1.2 : 1.6]}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: true }}
      >
        <PerspectiveCamera makeDefault position={[0, 0, 7.1]} fov={42} />
        <Suspense fallback={<SceneFallback />}>
          <SceneContent />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(GLTF_MODEL_PATH)
useGLTF.preload(TEETH_MODEL_PATH)

export default ProtectDentHeroCanvas
