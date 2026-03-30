/* eslint-disable react-hooks/immutability */
import { Suspense, startTransition, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Billboard, Environment, Line, PerspectiveCamera, Text, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { easing } from 'maath'
import DotGridOverlay from './DotGridOverlay'

const INNER_ENTRY_SWITCH_PROGRESS = 0.72
const INNER_EXIT_SWITCH_PROGRESS = 0.34

const IS_MOBILE =
  typeof window !== 'undefined' && (window.innerWidth < 768 || navigator.maxTouchPoints > 1)

const DESKTOP_CALLOUTS = [
  {
    id: 'shell',
    title: 'SHELL_01',
    value: 'CRACK DENSITY 72%',
    align: 'right',
    anchor: [-0.54, 0.98, 0.18],
    elbow: [-1.08, 1.42, 0.42],
    label: [-1.86, 1.6, 0.58],
    delayMs: 180,
  },
  {
    id: 'scan',
    title: 'SCAN_02',
    value: 'SURFACE READOUT',
    align: 'right',
    anchor: [-0.78, -0.06, 0.28],
    elbow: [-1.34, 0.16, 0.5],
    label: [-2.02, 0.22, 0.68],
    delayMs: 520,
  },
  {
    id: 'core',
    title: 'CORE_03',
    value: 'RED SIGNAL ACTIVE',
    align: 'left',
    anchor: [0.74, 0.2, 0.18],
    elbow: [1.28, 0.56, 0.42],
    label: [1.98, 0.68, 0.58],
    delayMs: 860,
  },
  {
    id: 'edge',
    title: 'EDGE_04',
    value: 'FROST EDGE 31%',
    align: 'left',
    anchor: [0.18, 1.08, -0.08],
    elbow: [0.88, 1.46, 0.12],
    label: [1.62, 1.58, 0.24],
    delayMs: 1200,
  },
  {
    id: 'thermal',
    title: 'TEMP_05',
    value: 'THERMAL SHIFT -04.6',
    align: 'right',
    anchor: [-0.18, -0.86, -0.08],
    elbow: [-0.88, -1.18, 0.16],
    label: [-1.7, -1.32, 0.28],
    delayMs: 1540,
  },
  {
    id: 'axis',
    title: 'AXIS_06',
    value: 'ROTATION LIVE 0.16',
    align: 'left',
    anchor: [0.26, -1.02, -0.04],
    elbow: [0.98, -1.34, 0.14],
    label: [1.82, -1.48, 0.24],
    delayMs: 1880,
  },
]

const MOBILE_CALLOUTS = [
  {
    id: 'shell-mobile',
    title: 'SHELL_01',
    value: 'CRACK 72%',
    align: 'right',
    anchor: [-0.42, 0.82, 0.16],
    elbow: [-0.82, 1.08, 0.28],
    label: [-1.2, 1.12, 0.36],
    delayMs: 180,
  },
  {
    id: 'core-mobile',
    title: 'CORE_03',
    value: 'RED ACTIVE',
    align: 'left',
    anchor: [0.5, 0.14, 0.18],
    elbow: [0.88, 0.36, 0.34],
    label: [1.12, 0.42, 0.42],
    delayMs: 560,
  },
  {
    id: 'temp-mobile',
    title: 'TEMP_05',
    value: 'SHIFT -04.6',
    align: 'right',
    anchor: [-0.16, -0.76, -0.06],
    elbow: [-0.66, -0.94, 0.12],
    label: [-1.02, -0.98, 0.18],
    delayMs: 940,
  },
  {
    id: 'axis-mobile',
    title: 'AXIS_06',
    value: 'LIVE 0.16',
    align: 'left',
    anchor: [0.24, -0.88, -0.04],
    elbow: [0.74, -1.02, 0.08],
    label: [1.02, -1.06, 0.12],
    delayMs: 1320,
  },
]

const DESKTOP_NETWORK_LINES = [
  { id: 'n1', points: [[-1.12, 1.46, 0.42], [-0.34, 1.84, 0.72], [0.28, 1.28, 0.18]] },
  { id: 'n2', points: [[1.28, 0.56, 0.42], [1.74, 0.94, 0.74], [1.5, 0.02, 0.32]] },
  { id: 'n3', points: [[-1.34, 0.16, 0.5], [-1.84, -0.2, 0.72], [-1.24, -0.78, 0.26]] },
  { id: 'n4', points: [[0.98, -1.34, 0.14], [1.54, -1.08, 0.56], [1.88, -0.34, 0.28]] },
  { id: 'n5', points: [[-0.88, -1.18, 0.16], [-0.34, -1.6, 0.42], [0.32, -1.26, 0.08]] },
  { id: 'n6', points: [[0.88, 1.46, 0.12], [1.36, 1.88, 0.44], [1.92, 1.28, 0.18]] },
]

const MOBILE_NETWORK_LINES = [
  { id: 'mn1', points: [[-0.82, 1.08, 0.28], [-0.26, 1.32, 0.48], [0.22, 0.96, 0.18]] },
  { id: 'mn2', points: [[0.88, 0.36, 0.34], [1.08, 0.8, 0.52], [0.94, -0.02, 0.18]] },
  { id: 'mn3', points: [[-0.66, -0.94, 0.12], [-0.18, -1.22, 0.32], [0.38, -0.96, 0.08]] },
  { id: 'mn4', points: [[0.74, -1.02, 0.08], [1.02, -0.64, 0.32], [1.14, 0.04, 0.14]] },
]

export const DEFAULT_SCENE_CONFIG = Object.freeze({
  ice: {
    modelPath: '/models/ICE CRYSTAL.glb',
    fitSize: 3.35,
    scaleMultiplier: 1,
    position: [0, 0, 0],
    rotation: [0.18, 0.62, 0],
    textures: {
      map: '/textures/cracked_ice/Albedo.jpg',
      normalMap: '/textures/cracked_ice/Normal.jpg',
      roughnessMap: '/textures/cracked_ice/Roughness.jpg',
      bumpMap: '/textures/cracked_ice/Height.jpg',
      thicknessMap: '/textures/cracked_ice/Translucency.jpg',
    },
    material: {
      color: '#e3f3ff',
      roughness: 0.3,
      metalness: 0.02,
      transmission: 0.62,
      opacity: 0.96,
      thickness: 1.1,
      ior: 1.28,
      envMapIntensity: 0.8,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
      attenuationColor: '#73b3ea',
      attenuationDistance: 1.15,
      bumpScale: 0.03,
      normalScale: [1.1, 1.1],
    },
  },
  innerCore: {
    type: 'box',
    modelPath: null,
    fitSize: 0.78,
    scaleMultiplier: 1,
    position: [0.03, 0.05, -0.02],
    rotation: [0.22, 0.38, 0.12],
    size: [0.52, 0.52, 0.52],
    material: {
      color: '#ff6868',
      emissive: '#ff2c2c',
      emissiveIntensity: 1.8,
      roughness: 0.16,
      metalness: 0.04,
      opacity: 0.96,
    },
    light: {
      color: '#ff4545',
      intensity: 1.8,
      distance: 1.25,
      decay: 2.8,
    },
  },
  callouts: DESKTOP_CALLOUTS,
  mobileCallouts: MOBILE_CALLOUTS,
  networkLines: DESKTOP_NETWORK_LINES,
  mobileNetworkLines: MOBILE_NETWORK_LINES,
})

const MAX_CURSOR_WAVES = 7

function encodeAssetPath(path) {
  return path ? path.replaceAll(' ', '%20') : path
}

function mergeSceneConfig(sceneConfig) {
  return {
    ...DEFAULT_SCENE_CONFIG,
    ...sceneConfig,
    ice: {
      ...DEFAULT_SCENE_CONFIG.ice,
      ...sceneConfig?.ice,
      textures: {
        ...DEFAULT_SCENE_CONFIG.ice.textures,
        ...sceneConfig?.ice?.textures,
      },
      material: {
        ...DEFAULT_SCENE_CONFIG.ice.material,
        ...sceneConfig?.ice?.material,
      },
    },
    innerCore: {
      ...DEFAULT_SCENE_CONFIG.innerCore,
      ...sceneConfig?.innerCore,
      material: {
        ...DEFAULT_SCENE_CONFIG.innerCore.material,
        ...sceneConfig?.innerCore?.material,
      },
      light: {
        ...DEFAULT_SCENE_CONFIG.innerCore.light,
        ...sceneConfig?.innerCore?.light,
      },
    },
  }
}

function centerAndFitObject(object, targetSize, scaleMultiplier = 1) {
  const bounds = new THREE.Box3().setFromObject(object)
  const center = bounds.getCenter(new THREE.Vector3())
  const size = bounds.getSize(new THREE.Vector3())
  const maxAxis = Math.max(size.x, size.y, size.z) || 1
  const fitScale = (targetSize / maxAxis) * scaleMultiplier

  object.position.sub(center)
  object.scale.multiplyScalar(fitScale)
}

function prepareTexture(texture, { color = false } = {}) {
  if (!texture) return null

  texture.flipY = false
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  if (color) texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function createCirclePoints(radius, segments, z = 0) {
  const points = []

  for (let index = 0; index <= segments; index++) {
    const angle = (index / segments) * Math.PI * 2
    points.push([Math.cos(angle) * radius, Math.sin(angle) * radius, z])
  }

  return points
}

function generateBoxUVs(geometry) {
  const positions = geometry.attributes.position
  const normals = geometry.attributes.normal
  if (!positions || !normals) return geometry

  geometry.computeBoundingBox()
  const bbox = geometry.boundingBox
  const size = bbox.getSize(new THREE.Vector3())
  const min = bbox.min
  const uv = new Float32Array(positions.count * 2)

  for (let index = 0; index < positions.count; index++) {
    const px = positions.getX(index)
    const py = positions.getY(index)
    const pz = positions.getZ(index)
    const nx = Math.abs(normals.getX(index))
    const ny = Math.abs(normals.getY(index))
    const nz = Math.abs(normals.getZ(index))

    let u = 0
    let v = 0

    if (ny >= nx && ny >= nz) {
      u = size.x > 0 ? (px - min.x) / size.x : 0
      v = size.z > 0 ? (pz - min.z) / size.z : 0
    } else if (nx >= ny && nx >= nz) {
      u = size.z > 0 ? (pz - min.z) / size.z : 0
      v = size.y > 0 ? (py - min.y) / size.y : 0
    } else {
      u = size.x > 0 ? (px - min.x) / size.x : 0
      v = size.y > 0 ? (py - min.y) / size.y : 0
    }

    uv[index * 2] = u
    uv[index * 2 + 1] = v
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return geometry
}

function prepareMeshGeometry(geometry) {
  const prepared = geometry.clone()

  if (!prepared.attributes.normal) {
    prepared.computeVertexNormals()
  }

  if (!prepared.attributes.uv) {
    generateBoxUVs(prepared)
  }

  prepared.computeBoundingBox()
  prepared.computeBoundingSphere()
  return prepared
}

function IceCrystal({
  config,
  hovered,
  transitionProgress,
  active = true,
  onHoverChange,
  onActivate,
}) {
  const gltf = useGLTF(encodeAssetPath(config.modelPath))
  const wrapperRef = useRef(null)
  const elapsedRef = useRef(0)
  const cursorTargetRef = useRef(new THREE.Vector3(999, 999, 999))
  const cursorCurrentRef = useRef(new THREE.Vector3(999, 999, 999))
  const cursorLagRef = useRef(new THREE.Vector3(999, 999, 999))
  const cursorVelocityRef = useRef(new THREE.Vector3())
  const lastLocalPointRef = useRef(new THREE.Vector3(999, 999, 999))
  const lastLocalTimeRef = useRef(0)
  const lastWaveEmitRef = useRef(0)
  const waveCursorRef = useRef(0)
  const wavesRef = useRef(
    Array.from({ length: MAX_CURSOR_WAVES }, () => ({
      origin: new THREE.Vector3(999, 999, 999),
      direction: new THREE.Vector3(1, 0, 0),
      startedAt: -10,
      strength: 0,
    })),
  )
  const texturePaths = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(config.textures)
          .filter(([, path]) => Boolean(path))
          .map(([key, path]) => [key, encodeAssetPath(path)]),
      ),
    [config.textures],
  )
  const rawTextures = useTexture(texturePaths)
  const rippleUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uHover: { value: 0 },
      uProgress: { value: 0 },
      uCursor: { value: new THREE.Vector3(999, 999, 999) },
      uCursorLag: { value: new THREE.Vector3(999, 999, 999) },
      uVelocity: { value: new THREE.Vector3(0, 0, 0) },
      uWaveOrigins: { value: Array.from({ length: MAX_CURSOR_WAVES }, () => new THREE.Vector3(999, 999, 999)) },
      uWaveDirections: { value: Array.from({ length: MAX_CURSOR_WAVES }, () => new THREE.Vector3(1, 0, 0)) },
      uWaveStrengths: { value: Array.from({ length: MAX_CURSOR_WAVES }, () => 0) },
      uWaveAges: { value: Array.from({ length: MAX_CURSOR_WAVES }, () => 99) },
    }),
    [],
  )

  const material = useMemo(() => {
    const map = prepareTexture(rawTextures.map, { color: true })
    const normalMap = prepareTexture(rawTextures.normalMap)
    const roughnessMap = prepareTexture(rawTextures.roughnessMap)
    const bumpMap = prepareTexture(rawTextures.bumpMap)
    const thicknessMap = prepareTexture(rawTextures.thicknessMap)

    return new THREE.MeshPhysicalMaterial({
      color: config.material.color,
      map,
      normalMap,
      normalScale: new THREE.Vector2(...config.material.normalScale),
      roughnessMap,
      bumpMap,
      bumpScale: config.material.bumpScale,
      thicknessMap,
      roughness: config.material.roughness,
      metalness: config.material.metalness,
      transmission: config.material.transmission,
      transparent: true,
      opacity: config.material.opacity,
      thickness: config.material.thickness,
      ior: config.material.ior,
      envMapIntensity: config.material.envMapIntensity,
      clearcoat: config.material.clearcoat,
      clearcoatRoughness: config.material.clearcoatRoughness,
      attenuationColor: new THREE.Color(config.material.attenuationColor),
      attenuationDistance: config.material.attenuationDistance,
      side: THREE.DoubleSide,
      depthWrite: true,
    })
  }, [config, rawTextures])

  const rippleMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: rippleUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        wireframe: true,
        toneMapped: false,
        vertexShader: `
          varying vec3 vSurfacePosition;

          void main() {
            vSurfacePosition = (modelMatrix * vec4(position, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          #define MAX_CURSOR_WAVES ${MAX_CURSOR_WAVES}

          uniform float uTime;
          uniform float uHover;
          uniform float uProgress;
          uniform vec3 uCursor;
          uniform vec3 uCursorLag;
          uniform vec3 uVelocity;
          uniform vec3 uWaveOrigins[MAX_CURSOR_WAVES];
          uniform vec3 uWaveDirections[MAX_CURSOR_WAVES];
          uniform float uWaveStrengths[MAX_CURSOR_WAVES];
          uniform float uWaveAges[MAX_CURSOR_WAVES];

          varying vec3 vSurfacePosition;

          float distanceToSegment(vec3 point, vec3 start, vec3 end) {
            vec3 segment = end - start;
            float segmentLength = max(dot(segment, segment), 0.0001);
            float t = clamp(dot(point - start, segment) / segmentLength, 0.0, 1.0);
            vec3 projection = mix(start, end, t);
            return distance(point, projection);
          }

          float kineticWaveField(vec3 point) {
            float field = 0.0;

            for (int index = 0; index < MAX_CURSOR_WAVES; index++) {
              float strength = uWaveStrengths[index];
              if (strength <= 0.001) {
                continue;
              }

              vec3 direction = normalize(uWaveDirections[index]);
              vec3 relative = point - uWaveOrigins[index];
              float forward = dot(relative, direction);
              vec3 lateralVector = relative - direction * forward;
              float lateral = length(lateralVector);
              float age = uWaveAges[index];
              float travel = age * mix(0.34, 2.45, strength);
              float tailSpan = mix(0.035, 0.94, strength);
              float crest = exp(-pow((forward - travel) * mix(36.0, 4.8, strength), 2.0));
              float wake = exp(-pow((forward - max(travel - tailSpan, 0.0)) * mix(22.0, 2.2, strength), 2.0));
              float lateralMask = exp(-lateral * mix(34.0, 13.5, strength));
              float directionalMask = smoothstep(-0.02, 0.14, forward + 0.015);
              float fade = 1.0 - smoothstep(0.08, mix(0.44, 1.72, strength), age);

              field += (crest * 1.16 + wake * 0.54) * lateralMask * directionalMask * fade * strength;
            }

            return field;
          }

          void main() {
            vec3 leadCursor = uCursor + uVelocity * 0.08;
            float velocityLength = clamp(length(uVelocity) * 1.7, 0.0, 1.0);
            float cursorDistance = distance(vSurfacePosition, leadCursor);
            float trailDistance = distanceToSegment(vSurfacePosition, uCursorLag, leadCursor);
            float cursorField = exp(-cursorDistance * 22.0) * velocityLength * 0.065;
            float trail = exp(-trailDistance * mix(38.0, 16.0, velocityLength)) * velocityLength * 0.12;
            float kineticField = kineticWaveField(vSurfacePosition);
            float hoverLift = uProgress * velocityLength * 0.02;
            float motionGate = smoothstep(0.025, 0.16, velocityLength);
            float field = kineticField * 1.34 + trail + cursorField + hoverLift;
            float alpha = clamp(field * motionGate * (0.18 + velocityLength * 0.76 + uProgress * 0.24), 0.0, 0.82);
            vec3 color = mix(
              vec3(0.74, 0.88, 1.0),
              vec3(1.0, 0.42, 0.46),
              clamp(kineticField * 1.05 + velocityLength * 0.22 + uProgress * 0.18, 0.0, 1.0)
            );

            gl_FragColor = vec4(color, alpha);
          }
        `,
      }),
    [rippleUniforms],
  )

  const emitKineticWave = (origin, direction, strength) => {
    if (strength <= 0.08 || direction.lengthSq() <= 0.0001) return

    const slot = waveCursorRef.current % MAX_CURSOR_WAVES
    waveCursorRef.current += 1

    const wave = wavesRef.current[slot]
    wave.origin.copy(origin)
    wave.direction.copy(direction).normalize()
    wave.startedAt = elapsedRef.current
    wave.strength = strength
  }

  const crystalScene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    centerAndFitObject(clone, config.fitSize, config.scaleMultiplier)

    clone.traverse((child) => {
      if (!child.isMesh) return
      child.geometry = prepareMeshGeometry(child.geometry)
      child.castShadow = true
      child.receiveShadow = true
      child.material = material
    })

    return clone
  }, [config.fitSize, config.scaleMultiplier, gltf.scene, material])

  const rippleScene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    centerAndFitObject(clone, config.fitSize, config.scaleMultiplier)

    clone.traverse((child) => {
      if (!child.isMesh) return
      child.geometry = prepareMeshGeometry(child.geometry)
      child.material = rippleMaterial
      child.renderOrder = 9
      child.raycast = () => null
    })

    return clone
  }, [config.fitSize, config.scaleMultiplier, gltf.scene, rippleMaterial])

  useEffect(() => () => {
    material.dispose()
    rippleMaterial.dispose()
  }, [material, rippleMaterial])

  useFrame((state, delta) => {
    if (!active) return

    const dt = Math.min(0.033, delta)
    elapsedRef.current = state.clock.elapsedTime
    const currentCursor = cursorCurrentRef.current
    const targetCursor = cursorTargetRef.current
    const lagCursor = cursorLagRef.current
    const cursorVelocity = cursorVelocityRef.current
    const previousX = currentCursor.x
    const previousY = currentCursor.y
    const previousZ = currentCursor.z

    rippleUniforms.uTime.value = elapsedRef.current
    rippleUniforms.uHover.value = THREE.MathUtils.damp(rippleUniforms.uHover.value, hovered ? 1 : 0, 4.6, dt)
    rippleUniforms.uProgress.value = THREE.MathUtils.damp(rippleUniforms.uProgress.value, transitionProgress, 3.6, dt)

    if (hovered && targetCursor.x < 900) {
      currentCursor.x = THREE.MathUtils.damp(currentCursor.x, targetCursor.x, 10.5, dt)
      currentCursor.y = THREE.MathUtils.damp(currentCursor.y, targetCursor.y, 10.5, dt)
      currentCursor.z = THREE.MathUtils.damp(currentCursor.z, targetCursor.z, 10.5, dt)
      lagCursor.x = THREE.MathUtils.damp(lagCursor.x, currentCursor.x, 5.2, dt)
      lagCursor.y = THREE.MathUtils.damp(lagCursor.y, currentCursor.y, 5.2, dt)
      lagCursor.z = THREE.MathUtils.damp(lagCursor.z, currentCursor.z, 5.2, dt)
    }

    const nextVelocityX = (currentCursor.x - previousX) / Math.max(dt, 0.016)
    const nextVelocityY = (currentCursor.y - previousY) / Math.max(dt, 0.016)
    const nextVelocityZ = (currentCursor.z - previousZ) / Math.max(dt, 0.016)
    cursorVelocity.x = THREE.MathUtils.damp(cursorVelocity.x, hovered ? nextVelocityX : 0, 7.4, dt)
    cursorVelocity.y = THREE.MathUtils.damp(cursorVelocity.y, hovered ? nextVelocityY : 0, 7.4, dt)
    cursorVelocity.z = THREE.MathUtils.damp(cursorVelocity.z, hovered ? nextVelocityZ : 0, 7.4, dt)

    rippleUniforms.uCursor.value.copy(currentCursor)
    rippleUniforms.uCursorLag.value.copy(lagCursor)
    rippleUniforms.uVelocity.value.copy(cursorVelocity)

    wavesRef.current.forEach((wave, index) => {
      const age = wave.strength > 0 ? elapsedRef.current - wave.startedAt : 99
      const maxAge = THREE.MathUtils.lerp(0.28, 1.68, wave.strength)
      const activeWave = wave.strength > 0.001 && age < maxAge

      if (activeWave) {
        rippleUniforms.uWaveOrigins.value[index].copy(wave.origin)
        rippleUniforms.uWaveDirections.value[index].copy(wave.direction)
        rippleUniforms.uWaveStrengths.value[index] = wave.strength
        rippleUniforms.uWaveAges.value[index] = age
        return
      }

      rippleUniforms.uWaveOrigins.value[index].set(999, 999, 999)
      rippleUniforms.uWaveDirections.value[index].set(1, 0, 0)
      rippleUniforms.uWaveStrengths.value[index] = 0
      rippleUniforms.uWaveAges.value[index] = 99

      if (wave.strength > 0.001) {
        wave.strength = 0
      }
    })

    material.envMapIntensity = THREE.MathUtils.damp(
      material.envMapIntensity,
      config.material.envMapIntensity + (hovered ? 0.26 : 0) + transitionProgress * 0.44,
      4,
      dt,
    )
    material.opacity = THREE.MathUtils.damp(
      material.opacity,
      config.material.opacity - transitionProgress * 0.18,
      4,
      dt,
    )
    material.transmission = THREE.MathUtils.damp(
      material.transmission,
      config.material.transmission + (hovered ? 0.06 : 0) - transitionProgress * 0.14,
      4,
      dt,
    )
    material.thickness = THREE.MathUtils.damp(
      material.thickness,
      config.material.thickness + (hovered ? 0.15 : 0.02) + transitionProgress * 0.32,
      4.5,
      dt,
    )
    material.roughness = THREE.MathUtils.damp(
      material.roughness,
      config.material.roughness + transitionProgress * 0.12,
      4,
      dt,
    )
  })

  return (
    <group
      ref={wrapperRef}
      position={config.position}
      rotation={config.rotation}
      visible={active}
    >
      <primitive
        object={crystalScene}
        onPointerOver={(event) => {
          event.stopPropagation()
          onHoverChange?.(true)
        }}
        onPointerOut={() => {
          cursorVelocityRef.current.set(0, 0, 0)
          cursorTargetRef.current.set(999, 999, 999)
          cursorCurrentRef.current.set(999, 999, 999)
          cursorLagRef.current.set(999, 999, 999)
          lastLocalPointRef.current.set(999, 999, 999)
          lastLocalTimeRef.current = 0
          lastWaveEmitRef.current = 0
          wavesRef.current.forEach((wave) => {
            wave.origin.set(999, 999, 999)
            wave.direction.set(1, 0, 0)
            wave.startedAt = -10
            wave.strength = 0
          })
          onHoverChange?.(false)
        }}
        onPointerMove={(event) => {
          event.stopPropagation()
          const surfacePoint = event.point.clone()
          const surfaceNormal = event.face?.normal?.clone()

          if (surfaceNormal && event.object?.matrixWorld) {
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(event.object.matrixWorld)
            surfaceNormal.applyMatrix3(normalMatrix).normalize()
            surfacePoint.addScaledVector(surfaceNormal, config.fitSize * 0.004)
          }

          cursorTargetRef.current.copy(surfacePoint)

          if (cursorCurrentRef.current.x > 900) {
            cursorCurrentRef.current.copy(surfacePoint)
            cursorLagRef.current.copy(surfacePoint)
          }

           const now = performance.now()
           const lastTime = lastLocalTimeRef.current
           const lastPoint = lastLocalPointRef.current

           if (lastTime > 0 && lastPoint.x < 900) {
             const deltaSeconds = Math.max((now - lastTime) / 1000, 0.008)
             const direction = surfacePoint.clone().sub(lastPoint)
             const localSpeed = direction.length() / deltaSeconds
             const normalizedSpeed = Math.pow(clamp01((localSpeed - 0.16) / 2.4), 0.82)

             if (normalizedSpeed > 0.04 && now - lastWaveEmitRef.current >= (IS_MOBILE ? 68 : 32)) {
               emitKineticWave(surfacePoint, direction, normalizedSpeed)
               lastWaveEmitRef.current = now
             }
           }

           lastLocalPointRef.current.copy(surfacePoint)
           lastLocalTimeRef.current = now
        }}
        onClick={(event) => {
          event.stopPropagation()
          onActivate?.()
        }}
      />
      <group scale={1.004}>
        <primitive object={rippleScene} />
      </group>
    </group>
  )
}

function InnerCoreModel({ config, glowMultiplier = 1, active = true }) {
  const gltf = useGLTF(encodeAssetPath(config.modelPath))

  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: config.material.color,
        emissive: new THREE.Color(config.material.emissive),
        emissiveIntensity: config.material.emissiveIntensity,
        roughness: config.material.roughness,
        metalness: config.material.metalness,
        transparent: true,
        opacity: config.material.opacity,
        toneMapped: false,
      }),
    [config.material],
  )

  const innerScene = useMemo(() => {
    const clone = gltf.scene.clone(true)
    centerAndFitObject(clone, config.fitSize, config.scaleMultiplier)

    clone.traverse((child) => {
      if (!child.isMesh) return
      child.castShadow = true
      child.receiveShadow = true
      child.material = material
    })

    return clone
  }, [config.fitSize, config.scaleMultiplier, gltf.scene, material])

  useFrame((_, delta) => {
    if (!active) return

    const dt = Math.min(0.033, delta)
    material.emissiveIntensity = THREE.MathUtils.damp(
      material.emissiveIntensity,
      config.material.emissiveIntensity * glowMultiplier,
      5.4,
      dt,
    )
  })

  useEffect(() => () => material.dispose(), [material])

  return <primitive object={innerScene} />
}

function InnerCore({ config, glowMultiplier = 1, active = true }) {
  const materialRef = useRef(null)

  useFrame((_, delta) => {
    if (!active || !materialRef.current) return
    const dt = Math.min(0.033, delta)

    materialRef.current.emissiveIntensity = THREE.MathUtils.damp(
      materialRef.current.emissiveIntensity,
      config.material.emissiveIntensity * glowMultiplier,
      5.2,
      dt,
    )
  })

  if (config.type === 'model' && config.modelPath) {
    return <InnerCoreModel config={config} glowMultiplier={glowMultiplier} active={active} />
  }

  return (
    <mesh castShadow receiveShadow>
      <boxGeometry args={config.size} />
      <meshStandardMaterial
        ref={materialRef}
        color={config.material.color}
        emissive={config.material.emissive}
        emissiveIntensity={config.material.emissiveIntensity}
        roughness={config.material.roughness}
        metalness={config.material.metalness}
        transparent
        opacity={config.material.opacity}
        toneMapped={false}
      />
    </mesh>
  )
}

function useTypewriterText(text, delayMs, speedMs) {
  const [typedText, setTypedText] = useState('')

  useEffect(() => {
    let timeoutId
    let intervalId
    let cursor = 0

    setTypedText('')

    timeoutId = window.setTimeout(() => {
      intervalId = window.setInterval(() => {
        cursor += 1
        setTypedText(text.slice(0, cursor))

        if (cursor >= text.length) {
          window.clearInterval(intervalId)
        }
      }, speedMs)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
      window.clearInterval(intervalId)
    }
  }, [delayMs, speedMs, text])

  return typedText
}

function useRevealProgress(delayMs, durationMs) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    let timeoutId
    let frameId
    let startTime = 0

    setProgress(0)

    timeoutId = window.setTimeout(() => {
      const tick = (timestamp) => {
        if (!startTime) startTime = timestamp
        const nextProgress = Math.min((timestamp - startTime) / durationMs, 1)
        setProgress(nextProgress)

        if (nextProgress < 1) {
          frameId = window.requestAnimationFrame(tick)
        }
      }

      frameId = window.requestAnimationFrame(tick)
    }, delayMs)

    return () => {
      window.clearTimeout(timeoutId)
      window.cancelAnimationFrame(frameId)
    }
  }, [delayMs, durationMs])

  return progress
}

function lerpPoint(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ]
}

function measurePolylineLength(points) {
  if (!points || points.length < 2) return 0

  let totalLength = 0
  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const dz = end[2] - start[2]
    totalLength += Math.sqrt(dx * dx + dy * dy + dz * dz)
  }

  return totalLength
}

function getRevealDuration(points, { msPerUnit, minDuration, maxDuration }) {
  const totalLength = measurePolylineLength(points)
  return Math.min(maxDuration, Math.max(minDuration, Math.round(totalLength * msPerUnit)))
}

function easeOutCubic(progress) {
  return 1 - Math.pow(1 - progress, 3)
}

function buildPartialPolyline(points, progress) {
  if (!points || points.length < 2 || progress <= 0) return null

  const segmentLengths = []
  const totalLength = measurePolylineLength(points)

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]
    const dx = end[0] - start[0]
    const dy = end[1] - start[1]
    const dz = end[2] - start[2]
    segmentLengths.push(Math.sqrt(dx * dx + dy * dy + dz * dz))
  }

  if (totalLength <= 0) return [points[0], points[0]]

  let remainingLength = totalLength * progress
  const partialPoints = [points[0]]

  for (let index = 0; index < points.length - 1; index++) {
    const start = points[index]
    const end = points[index + 1]
    const segmentLength = segmentLengths[index]

    if (remainingLength >= segmentLength) {
      partialPoints.push(end)
      remainingLength -= segmentLength
      continue
    }

    const localProgress = segmentLength > 0 ? remainingLength / segmentLength : 0
    partialPoints.push(lerpPoint(start, end, localProgress))
    break
  }

  return partialPoints.length > 1 ? partialPoints : [points[0], points[0]]
}

function AnimatedLine({
  points,
  delayMs = 0,
  durationMs,
  opacity = 0.3,
  lineWidth = 0.5,
  color = '#f7fbff',
  pulseAmplitude = 0.08,
  pulseSpeed = 1.8,
}) {
  const resolvedDuration = useMemo(
    () => durationMs ?? getRevealDuration(points, { msPerUnit: 220, minDuration: 220, maxDuration: 920 }),
    [durationMs, points],
  )
  const progress = useRevealProgress(delayMs, resolvedDuration)
  const partialPoints = useMemo(() => buildPartialPolyline(points, progress), [points, progress])
  const lineRef = useRef(null)

  useFrame((state) => {
    const material = lineRef.current?.material
    if (!material) return

    if (progress >= 1) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * pulseSpeed + delayMs * 0.01) * pulseAmplitude
      material.opacity = opacity * pulse
    } else {
      material.opacity = opacity * Math.max(progress, 0.16)
    }
  })

  if (!partialPoints) return null

  return (
    <Line
      ref={lineRef}
      points={partialPoints}
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={opacity * Math.max(progress, 0.16)}
      toneMapped={false}
      depthWrite={false}
    />
  )
}

function AnimatedDashedLine({
  points,
  delayMs = 0,
  durationMs,
  opacity = 0.2,
  lineWidth = 0.4,
  color = '#f8fbff',
  dashSize = 0.12,
  gapSize = 0.08,
  dashSpeed = 0.45,
  pulseAmplitude = 0.04,
  pulseSpeed = 1.3,
}) {
  const resolvedDuration = useMemo(
    () => durationMs ?? getRevealDuration(points, { msPerUnit: 220, minDuration: 220, maxDuration: 920 }),
    [durationMs, points],
  )
  const progress = useRevealProgress(delayMs, resolvedDuration)
  const partialPoints = useMemo(() => buildPartialPolyline(points, progress), [points, progress])
  const lineRef = useRef(null)

  useFrame((state) => {
    const material = lineRef.current?.material
    if (!material) return

    material.dashOffset = -state.clock.elapsedTime * dashSpeed
    if (progress >= 1) {
      const pulse = 1 + Math.sin(state.clock.elapsedTime * pulseSpeed + delayMs * 0.01) * pulseAmplitude
      material.opacity = opacity * pulse
    } else {
      material.opacity = opacity * Math.max(progress, 0.16)
    }
  })

  if (!partialPoints) return null

  return (
    <Line
      ref={lineRef}
      points={partialPoints}
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={opacity * Math.max(progress, 0.16)}
      dashed
      dashSize={dashSize}
      gapSize={gapSize}
      toneMapped={false}
      depthWrite={false}
    />
  )
}

function StaticCrossMarker({ position, size, opacity }) {
  return (
    <Billboard position={position} follow>
      <group>
        <Line
          points={[
            [-size, -size, 0],
            [size, size, 0],
          ]}
          color="#f8fbff"
          lineWidth={0.32}
          transparent
          opacity={opacity}
          toneMapped={false}
          depthWrite={false}
        />
        <Line
          points={[
            [-size, size, 0],
            [size, -size, 0],
          ]}
          color="#f8fbff"
          lineWidth={0.32}
          transparent
          opacity={opacity}
          toneMapped={false}
          depthWrite={false}
        />
      </group>
    </Billboard>
  )
}

function AnimatedDataNetwork({ segments }) {
  return (
    <group>
      {segments.map((segment, index) => {
        const delayMs = segment.delayMs ?? index * 150
        const durationMs = getRevealDuration(segment.points, { msPerUnit: 200, minDuration: 200, maxDuration: 760 })
        const progressStart = delayMs + durationMs * 0.72

        return (
          <group key={segment.id}>
            <AnimatedDashedLine
              points={segment.points}
              color="#f8fbff"
              lineWidth={0.45}
              opacity={0.18}
              delayMs={delayMs}
              durationMs={durationMs}
              dashSize={0.12}
              gapSize={0.09}
              dashSpeed={0.36}
              pulseAmplitude={0.06}
              pulseSpeed={1.35}
            />
            {segment.points.map((point, pointIndex) => (
              <AnimatedCrossMarker
                key={`${segment.id}-${pointIndex}`}
                position={point}
                size={pointIndex === 0 ? 0.038 : 0.026}
                opacity={pointIndex === 0 ? 0.46 : 0.28}
                delayMs={progressStart + pointIndex * 80}
              />
            ))}
          </group>
        )
      })}
    </group>
  )
}

function StaticDataNetwork({ segments }) {
  return (
    <group>
      {segments.map((segment) => (
        <group key={segment.id}>
          <Line
            points={segment.points}
            color="#f8fbff"
            lineWidth={0.45}
            transparent
            opacity={0.18}
            dashed
            dashSize={0.12}
            gapSize={0.09}
            toneMapped={false}
            depthWrite={false}
          />
          {segment.points.map((point, pointIndex) => (
            <StaticCrossMarker
              key={`${segment.id}-${pointIndex}`}
              position={point}
              size={pointIndex === 0 ? 0.038 : 0.026}
              opacity={pointIndex === 0 ? 0.46 : 0.28}
            />
          ))}
        </group>
      ))}
    </group>
  )
}

function DataNetwork({ segments, visible = true, staticDisplay = false }) {
  if (!visible) return null

  return staticDisplay ? <StaticDataNetwork segments={segments} /> : <AnimatedDataNetwork segments={segments} />
}

function AnimatedCrossMarker({ position, size, opacity, delayMs }) {
  const progress = useRevealProgress(delayMs, 220)
  const lineOpacity = opacity * progress

  return (
    <Billboard position={position} follow>
      <group scale={Math.max(progress, 0.001)}>
        <Line
          points={[
            [-size, -size, 0],
            [size, size, 0],
          ]}
          color="#f8fbff"
          lineWidth={0.32}
          transparent
          opacity={lineOpacity}
          toneMapped={false}
          depthWrite={false}
        />
        <Line
          points={[
            [-size, size, 0],
            [size, -size, 0],
          ]}
          color="#f8fbff"
          lineWidth={0.32}
          transparent
          opacity={lineOpacity}
          toneMapped={false}
          depthWrite={false}
        />
      </group>
    </Billboard>
  )
}

function StaticDataCallout({ title, value, anchor, elbow, label, align = 'left', isMobile = false }) {
  const calloutPoints = useMemo(() => [anchor, elbow, label], [anchor, elbow, label])
  const titleFontSize = isMobile ? 0.03 : 0.038
  const valueFontSize = isMobile ? 0.052 : 0.068
  const dividerY = isMobile ? -0.055 : -0.07
  const valueY = isMobile ? -0.088 : -0.114
  const dividerLength = isMobile ? 0.28 : 0.42
  const dividerPoints = align === 'right'
    ? [[0, dividerY, 0], [-dividerLength, dividerY, 0]]
    : [[0, dividerY, 0], [dividerLength, dividerY, 0]]

  return (
    <group>
      <Line
        points={calloutPoints}
        color="#f7fbff"
        lineWidth={0.55}
        transparent
        opacity={0.36}
        toneMapped={false}
        depthWrite={false}
      />

      <mesh position={anchor}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial color="#f7fbff" transparent opacity={0.7} toneMapped={false} depthWrite={false} />
      </mesh>

      <mesh position={elbow}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color="#f7fbff" transparent opacity={0.42} toneMapped={false} depthWrite={false} />
      </mesh>

      <Billboard position={label} follow>
        <group>
          <Text
            anchorX={align === 'right' ? 'right' : 'left'}
            anchorY="top"
            fontSize={titleFontSize}
            lineHeight={1}
            letterSpacing={0.08}
            color="#f4f8ff"
            fillOpacity={0.56}
            material-toneMapped={false}
          >
            {title}
          </Text>

          <Line
            points={dividerPoints}
            color="#f4f8ff"
            lineWidth={0.35}
            transparent
            opacity={0.22}
            toneMapped={false}
            depthWrite={false}
          />

          <Text
            position={[0, valueY, 0]}
            anchorX={align === 'right' ? 'right' : 'left'}
            anchorY="top"
            fontSize={valueFontSize}
            lineHeight={1}
            letterSpacing={0.05}
            color="#f8fbff"
            fillOpacity={0.92}
            material-toneMapped={false}
          >
            {value}
          </Text>
        </group>
      </Billboard>
    </group>
  )
}

function AnimatedDataCallout({ title, value, anchor, elbow, label, align = 'left', delayMs = 0, isMobile = false }) {
  const calloutPoints = useMemo(() => [anchor, elbow, label], [anchor, elbow, label])
  const lineDuration = useMemo(
    () => getRevealDuration(calloutPoints, { msPerUnit: 240, minDuration: 260, maxDuration: 860 }),
    [calloutPoints],
  )
  const lineEndDelay = delayMs + lineDuration
  const anchorProgress = useRevealProgress(delayMs + lineDuration * 0.68, 180)
  const elbowProgress = useRevealProgress(delayMs + lineDuration * 0.82, 180)
  const titleReveal = easeOutCubic(useRevealProgress(lineEndDelay + 30, 280))
  const valueReveal = easeOutCubic(useRevealProgress(lineEndDelay + 110, 340))
  const typedTitle = useTypewriterText(title, lineEndDelay + 30, 18)
  const typedValue = useTypewriterText(value, lineEndDelay + 110 + title.length * 18, 22)
  const direction = align === 'right' ? 1 : -1
  const titleFontSize = isMobile ? 0.03 : 0.038
  const valueFontSize = isMobile ? 0.052 : 0.068
  const blockOffsetX = direction * (1 - titleReveal) * 0.12
  const blockOffsetY = (1 - titleReveal) * 0.05
  const blockOffsetZ = (1 - titleReveal) * 0.08
  const blockScale = 0.9 + titleReveal * 0.1
  const dividerY = isMobile ? -0.055 : -0.07
  const valueY = isMobile ? -0.088 : -0.114
  const dividerLength = isMobile ? 0.28 : 0.42
  const dividerPoints = align === 'right'
    ? [[0, dividerY, 0], [-dividerLength, dividerY, 0]]
    : [[0, dividerY, 0], [dividerLength, dividerY, 0]]

  return (
    <group>
      <AnimatedLine
        points={calloutPoints}
        color="#f7fbff"
        lineWidth={0.55}
        opacity={0.36}
        delayMs={delayMs}
        durationMs={lineDuration}
        pulseAmplitude={0.09}
        pulseSpeed={1.65}
      />

      <mesh position={anchor} scale={Math.max(anchorProgress, 0.001)}>
        <sphereGeometry args={[0.014, 8, 8]} />
        <meshBasicMaterial color="#f7fbff" transparent opacity={0.7 * anchorProgress} toneMapped={false} depthWrite={false} />
      </mesh>

      <mesh position={elbow} scale={Math.max(elbowProgress, 0.001)}>
        <sphereGeometry args={[0.008, 8, 8]} />
        <meshBasicMaterial color="#f7fbff" transparent opacity={0.42 * elbowProgress} toneMapped={false} depthWrite={false} />
      </mesh>

      <Billboard position={label} follow>
        <group position={[blockOffsetX, blockOffsetY, blockOffsetZ]} scale={blockScale}>
          <Text
            anchorX={align === 'right' ? 'right' : 'left'}
            anchorY="top"
            fontSize={titleFontSize}
            lineHeight={1}
            letterSpacing={0.08}
            color="#f4f8ff"
            fillOpacity={0.56 * titleReveal}
            material-toneMapped={false}
          >
            {typedTitle}
          </Text>

          <AnimatedLine
            points={dividerPoints}
            color="#f4f8ff"
            lineWidth={0.35}
            opacity={0.22}
            delayMs={lineEndDelay + 26}
            durationMs={180}
            pulseAmplitude={0.04}
            pulseSpeed={1.2}
          />

          <Text
            position={[0, valueY, 0]}
            anchorX={align === 'right' ? 'right' : 'left'}
            anchorY="top"
            fontSize={valueFontSize}
            lineHeight={1}
            letterSpacing={0.05}
            color="#f8fbff"
            fillOpacity={0.92 * valueReveal}
            material-toneMapped={false}
          >
            {typedValue}
          </Text>
        </group>
      </Billboard>
    </group>
  )
}

function DataCallout(props) {
  return props.staticDisplay ? <StaticDataCallout {...props} /> : <AnimatedDataCallout {...props} />
}

function InnerSceneAura({ position, progress, isMobile }) {
  const reveal = easeOutCubic(clamp01((progress - 0.2) / 0.8))
  const auraRef = useRef(null)
  const particleRef = useRef(null)
  const ringPointsPrimary = useMemo(() => createCirclePoints(isMobile ? 0.58 : 0.76, 64), [isMobile])
  const ringPointsSecondary = useMemo(() => createCirclePoints(isMobile ? 0.8 : 1.02, 64), [isMobile])
  const particles = useMemo(() => {
    const count = isMobile ? 72 : 140
    const positions = new Float32Array(count * 3)

    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2
      const radius = 0.48 + Math.random() * (isMobile ? 0.54 : 0.9)
      const height = (Math.random() - 0.5) * (isMobile ? 0.9 : 1.4)
      positions[index * 3] = Math.cos(angle) * radius
      positions[index * 3 + 1] = height
      positions[index * 3 + 2] = Math.sin(angle) * radius * 0.4
    }

    return positions
  }, [isMobile])

  useFrame((state, delta) => {
    const dt = Math.min(0.033, delta)
    if (auraRef.current) {
      auraRef.current.rotation.y += dt * (0.16 + reveal * 0.22)
      auraRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 0.28) * 0.07
    }

    if (particleRef.current?.material) {
      particleRef.current.rotation.y += dt * 0.08
      particleRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.18) * 0.18
      particleRef.current.material.opacity = THREE.MathUtils.damp(
        particleRef.current.material.opacity,
        reveal * 0.42,
        4.4,
        dt,
      )
    }
  })

  if (reveal <= 0.001) return null

  return (
    <group ref={auraRef} position={position} scale={0.92 + reveal * 0.18}>
      <Line
        points={ringPointsPrimary}
        color="#ff8888"
        lineWidth={0.34}
        transparent
        opacity={0.18 * reveal}
        toneMapped={false}
        depthWrite={false}
      />
      <Line
        points={ringPointsSecondary}
        color="#ffd8d8"
        lineWidth={0.18}
        transparent
        dashed
        dashSize={0.08}
        gapSize={0.06}
        opacity={0.11 * reveal}
        toneMapped={false}
        depthWrite={false}
      />

      <points ref={particleRef}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" count={particles.length / 3} array={particles} itemSize={3} />
        </bufferGeometry>
        <pointsMaterial
          size={isMobile ? 0.018 : 0.024}
          color="#ffd5d5"
          transparent
          opacity={0.26 * reveal}
          depthWrite={false}
          toneMapped={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}

function OuterSceneContent({ config, hovered, onHoverChange, onActivate, transitionAmount, isMobileLayout, active = true, showDecorations = true, staticDecorations = false }) {
  const cameraRigRef = useRef(null)
  const crystalRigRef = useRef(null)
  const innerCoreRef = useRef(null)
  const innerCoreShellRef = useRef(null)
  const innerCoreLightRef = useRef(null)
  const camera = useThree((state) => state.camera)
  const activeCallouts = isMobileLayout ? config.mobileCallouts : config.callouts
  const activeNetworkLines = isMobileLayout ? config.mobileNetworkLines : config.networkLines
  const glowMultiplier = 1 + (hovered ? 0.42 : 0)

  useFrame((state, delta) => {
    if (!active) return

    const dt = Math.min(0.033, delta)
    const floatY = Math.sin(state.clock.elapsedTime * 0.9) * 0.05
    const transitionPunch = Math.pow(clamp01(transitionAmount), 0.62)
    const impactPulse = Math.pow(Math.sin(Math.PI * clamp01(transitionAmount)), 0.82)
    const centerLock = 1 - transitionPunch * 0.92
    const parallaxX = state.pointer.x * 0.18 * (1 - transitionAmount * 0.35)
    const parallaxY = state.pointer.y * 0.12 * (1 - transitionAmount * 0.35)

    if (crystalRigRef.current) {
      crystalRigRef.current.position.x = THREE.MathUtils.damp(crystalRigRef.current.position.x, parallaxX, 3.8, dt)
      crystalRigRef.current.position.y = THREE.MathUtils.damp(crystalRigRef.current.position.y, floatY + parallaxY, 3.8, dt)
      crystalRigRef.current.position.z = THREE.MathUtils.damp(crystalRigRef.current.position.z, -transitionPunch * 0.18 - impactPulse * 0.08, 4.1, dt)
      crystalRigRef.current.rotation.y += dt * (0.16 + (hovered ? 0.05 : 0))
      crystalRigRef.current.rotation.x = THREE.MathUtils.damp(crystalRigRef.current.rotation.x, state.pointer.y * 0.045 * centerLock, 3, dt)
      crystalRigRef.current.rotation.z = THREE.MathUtils.damp(crystalRigRef.current.rotation.z, -state.pointer.x * 0.055 * centerLock, 3, dt)

      const crystalScale = 1 - (hovered ? 0.045 : 0) - transitionPunch * 0.06
      easing.damp3(crystalRigRef.current.scale, [crystalScale, crystalScale, crystalScale], 0.18, dt)
    }

    if (innerCoreRef.current) {
      innerCoreRef.current.rotation.x += dt * 0.46
      innerCoreRef.current.rotation.y += dt * 0.74
    }

    if (innerCoreShellRef.current) {
      const shellScale = 1 + (hovered ? 0.05 : 0)
      easing.damp3(innerCoreShellRef.current.scale, [shellScale, shellScale, shellScale], 0.18, dt)
    }

    if (innerCoreLightRef.current) {
      innerCoreLightRef.current.intensity = THREE.MathUtils.damp(
        innerCoreLightRef.current.intensity,
        config.innerCore.light.intensity * glowMultiplier * (1 + transitionPunch * 0.6 + impactPulse * 0.35),
        4.8,
        dt,
      )
    }

    if (cameraRigRef.current) {
      easing.damp3(cameraRigRef.current.rotation, [-state.pointer.y * 0.05 * centerLock, state.pointer.x * 0.08 * centerLock, 0], 0.22, dt)
    }

    camera.position.x = THREE.MathUtils.damp(camera.position.x, state.pointer.x * 0.14 * centerLock, 3.6, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, state.pointer.y * 0.09 * centerLock, 3.6, dt)
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      THREE.MathUtils.lerp(isMobileLayout ? 7.5 : 7.2, isMobileLayout ? 1.22 : 0.86, transitionPunch) - impactPulse * 0.12,
      3.8,
      dt,
    )
    camera.fov = THREE.MathUtils.damp(camera.fov, THREE.MathUtils.lerp(42, isMobileLayout ? 56 : 52, transitionPunch), 3.8, dt)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  })

  return (
    <>
      {active ? <fog attach="fog" args={['#040913', 8, 18]} /> : null}
      {active ? <Environment preset="city" background={false} /> : null}

      <group ref={cameraRigRef} visible={active}>
        <ambientLight intensity={0.68} />
        <hemisphereLight intensity={0.95} color="#f5fbff" groundColor="#111822" />
        <directionalLight position={[4, 5, 3]} intensity={2.05} color="#dff3ff" />
        <directionalLight position={[-4, -1, 2]} intensity={0.55} color="#86b6d7" />

        <group ref={crystalRigRef}>
        <group position={config.innerCore.position} rotation={config.innerCore.rotation}>
          <group ref={innerCoreShellRef}>
            <group ref={innerCoreRef}>
              <InnerCore config={config.innerCore} glowMultiplier={glowMultiplier} active={active} />
            </group>
          </group>
          <pointLight
            ref={innerCoreLightRef}
            color={config.innerCore.light.color}
            intensity={config.innerCore.light.intensity}
            distance={config.innerCore.light.distance}
            decay={config.innerCore.light.decay}
          />
        </group>

        <IceCrystal
          config={config.ice}
          hovered={hovered}
          transitionProgress={transitionAmount * 0.18}
          active={active}
          onHoverChange={onHoverChange}
          onActivate={onActivate}
        />

          {showDecorations ? (
            <group
              scale={(isMobileLayout ? 0.76 : 1) * (1 - transitionAmount * 0.06)}
              visible={transitionAmount < 0.86}
            >
              <DataNetwork segments={activeNetworkLines} visible={transitionAmount < 0.46} staticDisplay={staticDecorations} />
              {transitionAmount < 0.62
                ? activeCallouts.map((callout) => (
                    <DataCallout
                      key={callout.id}
                      title={callout.title}
                      value={callout.value}
                      align={callout.align}
                      anchor={callout.anchor}
                      elbow={callout.elbow}
                      label={callout.label}
                      delayMs={callout.delayMs}
                      isMobile={isMobileLayout}
                      staticDisplay={staticDecorations}
                    />
                  ))
                : null}
            </group>
          ) : null}
        </group>
      </group>
    </>
  )
}

function InnerSceneContent({ config, sceneProgress, pointer, isMobileLayout }) {
  const cameraRigRef = useRef(null)
  const coreRigRef = useRef(null)
  const innerCoreRef = useRef(null)
  const camera = useThree((state) => state.camera)
  const normalizedPointerX = pointer.visible ? (pointer.x - 0.5) * 2 : 0
  const normalizedPointerY = pointer.visible ? (0.5 - pointer.y) * 2 : 0
  const reveal = sceneProgress > 0 ? sceneProgress : 1

  useFrame((state, delta) => {
    const dt = Math.min(0.033, delta)
    const px = pointer.visible ? normalizedPointerX : state.pointer.x
    const py = pointer.visible ? normalizedPointerY : state.pointer.y
    const entryPunch = Math.pow(1 - clamp01(reveal), 0.72)

    if (coreRigRef.current) {
      coreRigRef.current.position.x = THREE.MathUtils.damp(coreRigRef.current.position.x, px * 0.18, 3.2, dt)
      coreRigRef.current.position.y = THREE.MathUtils.damp(coreRigRef.current.position.y, py * 0.12, 3.2, dt)
      coreRigRef.current.rotation.z = THREE.MathUtils.damp(coreRigRef.current.rotation.z, -px * 0.12, 2.6, dt)
      coreRigRef.current.position.z = THREE.MathUtils.damp(coreRigRef.current.position.z, -entryPunch * 0.4, 3.8, dt)
      coreRigRef.current.scale.setScalar(0.96 + reveal * 0.04 + entryPunch * 0.14)
    }

    if (innerCoreRef.current) {
      innerCoreRef.current.rotation.x += dt * 0.58
      innerCoreRef.current.rotation.y += dt * 0.88
      innerCoreRef.current.rotation.z += dt * 0.16
    }

    if (cameraRigRef.current) {
      easing.damp3(cameraRigRef.current.rotation, [-py * 0.05, px * 0.08, 0], 0.18, dt)
    }

    camera.position.x = THREE.MathUtils.damp(camera.position.x, px * (isMobileLayout ? 0.14 : 0.22), 3.2, dt)
    camera.position.y = THREE.MathUtils.damp(camera.position.y, py * (isMobileLayout ? 0.11 : 0.18), 3.2, dt)
    camera.position.z = THREE.MathUtils.damp(
      camera.position.z,
      THREE.MathUtils.lerp(isMobileLayout ? 1.48 : 1.08, isMobileLayout ? 4.85 : 4.35, reveal),
      3.6,
      dt,
    )
    camera.fov = THREE.MathUtils.damp(
      camera.fov,
      THREE.MathUtils.lerp(isMobileLayout ? 58 : 54, isMobileLayout ? 37 : 34, reveal),
      3.4,
      dt,
    )
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  })

  return (
    <group ref={cameraRigRef}>
      <fog attach="fog" args={['#06080e', 4.2, 10.8]} />

      <ambientLight intensity={0.2} color="#ffd6dc" />
      <hemisphereLight intensity={0.3} color="#ffd7df" groundColor="#080b10" />
      <directionalLight position={[0, 1.8, 3.2]} intensity={0.86} color="#fff4f5" />
      <pointLight position={[0, 0, 0.5]} intensity={config.innerCore.light.intensity * 1.08} distance={config.innerCore.light.distance + 1.1} color="#ff4a52" />
      <pointLight position={[0, 0.9, 2.1]} intensity={0.56} distance={5.8} color="#ffffff" />

      <group ref={coreRigRef}>
        <InnerSceneAura position={[0, 0, 0]} progress={reveal} isMobile={isMobileLayout} />
        <group ref={innerCoreRef}>
          <InnerCore
            config={{
              ...config.innerCore,
              position: [0, 0, 0],
              rotation: [0, 0, 0],
            }}
            glowMultiplier={1.95}
          />
        </group>
      </group>
    </group>
  )
}

function SceneViewport({
  sceneConfig,
  activeScene,
  transitionInfo,
  transitionProgress,
  hovered,
  onHoverChange,
  onActivate,
  pointer,
  outerDecorationsStatic = false,
}) {
  const mergedConfig = useMemo(() => mergeSceneConfig(sceneConfig), [sceneConfig])
  const viewport = useThree((state) => state.viewport)
  const isMobileLayout = viewport.width < 6.5
  const sceneSwitchProgress = transitionInfo?.targetScene === 'inner' ? INNER_ENTRY_SWITCH_PROGRESS : INNER_EXIT_SWITCH_PROGRESS
  const visibleScene = transitionInfo
    ? (transitionProgress < sceneSwitchProgress ? transitionInfo.sourceScene : transitionInfo.targetScene)
    : activeScene
  const sceneReveal = transitionInfo
    ? visibleScene === transitionInfo.sourceScene
      ? clamp01(1 - transitionProgress / sceneSwitchProgress)
      : clamp01((transitionProgress - sceneSwitchProgress) / (1 - sceneSwitchProgress))
    : 1
  const outerActive = visibleScene === 'outer'
  const showOuterDecorations = outerActive && !transitionInfo

  return (
    <>
      <OuterSceneContent
        config={mergedConfig}
        hovered={hovered}
        onHoverChange={onHoverChange}
        onActivate={onActivate}
        transitionAmount={outerActive ? 1 - sceneReveal : 1}
        isMobileLayout={isMobileLayout}
        active={outerActive}
        showDecorations={showOuterDecorations}
        staticDecorations={showOuterDecorations && outerDecorationsStatic}
      />

      {visibleScene === 'inner' ? (
        <InnerSceneContent
          config={mergedConfig}
          sceneProgress={sceneReveal}
          pointer={pointer}
          isMobileLayout={isMobileLayout}
        />
      ) : null}
    </>
  )
}

function SceneFallback() {
  return null
}

function FilmNoiseOverlay({ active, intensity = 0 }) {
  if (!active && intensity <= 0.001) return null

  return (
    <div
      className={`film-noise-overlay${active ? ' film-noise-overlay--active' : ''}`}
      style={{ '--film-noise-opacity': clamp01(intensity).toFixed(3) }}
      aria-hidden="true"
    >
      <div className="film-noise-overlay__layer film-noise-overlay__layer--fine" />
      <div className="film-noise-overlay__layer film-noise-overlay__layer--coarse" />
    </div>
  )
}

function SceneTransitionVeil({ active, progress, targetScene }) {
  if (!active) return null

  const pulse = Math.pow(Math.sin(Math.PI * clamp01(progress)), 0.44)

  return (
    <div
      className={`scene-transition-veil scene-transition-veil--${targetScene}`}
      style={{ '--transition-strength': pulse.toFixed(3), '--transition-progress': clamp01(progress).toFixed(3), opacity: 0.16 + pulse * 0.9 }}
      aria-hidden="true"
    >
      <div className="scene-transition-veil__wash" />
      <div className="scene-transition-veil__band" />
    </div>
  )
}

function InnerSceneHud({ active, onClose, progress }) {
  const visibleProgress = clamp01(progress)

  return (
    <div
      className={`scene-hud${active ? ' scene-hud--visible' : ''}`}
      style={{ '--scene-progress': visibleProgress.toFixed(3) }}
    >
      <div className="scene-hud__logo">ICE HERO</div>
      <button type="button" className="scene-hud__close" onClick={onClose}>
        <span>Close</span>
      </button>
    </div>
  )
}

export function IceHeroCanvas({ sceneConfig }) {
  const [hovered, setHovered] = useState(false)
  const [activeScene, setActiveScene] = useState('outer')
  const [transitionInfo, setTransitionInfo] = useState(null)
  const [transitionProgress, setTransitionProgress] = useState(0)
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5, visible: false })
  const [gridShockToken, setGridShockToken] = useState(0)
  const hasVisitedInnerRef = useRef(false)
  const switchedSceneRef = useRef(false)

  useEffect(() => {
    if (!transitionInfo) return undefined

    let frameId
    let startTime = 0
    const duration = transitionInfo.targetScene === 'inner' ? 680 : 460
    const sceneSwitchProgress = transitionInfo.targetScene === 'inner' ? INNER_ENTRY_SWITCH_PROGRESS : INNER_EXIT_SWITCH_PROGRESS

    const tick = (timestamp) => {
      if (!startTime) startTime = timestamp
      const rawProgress = clamp01((timestamp - startTime) / duration)
      const nextProgress = transitionInfo.targetScene === 'inner'
        ? 1 - Math.pow(1 - rawProgress, 2.4)
        : easeOutCubic(rawProgress)

      if (nextProgress >= sceneSwitchProgress && !switchedSceneRef.current) {
        setActiveScene(transitionInfo.targetScene)
        switchedSceneRef.current = true
      }

      setTransitionProgress(nextProgress)

      if (nextProgress < 1) {
        frameId = window.requestAnimationFrame(tick)
        return
      }

      switchedSceneRef.current = false
      setTransitionInfo(null)
      setTransitionProgress(0)
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.cancelAnimationFrame(frameId)
    }
  }, [transitionInfo])

  useEffect(() => {
    if (activeScene !== 'inner' || transitionInfo) {
      setPointer((current) => ({ ...current, visible: false }))
      return undefined
    }
  }, [activeScene, transitionInfo])

  useEffect(() => {
    if (activeScene === 'inner' && !transitionInfo) {
      setGridShockToken((value) => value + 1)
    }
  }, [activeScene, transitionInfo])

  const beginSceneTransition = (targetScene) => {
    if (transitionInfo || activeScene === targetScene) return

    if (targetScene === 'inner') {
      hasVisitedInnerRef.current = true
    }

    setHovered(false)
    setPointer((current) => ({ ...current, visible: false }))
    setTransitionProgress(0)
    switchedSceneRef.current = false
    setTransitionInfo({ sourceScene: activeScene, targetScene })
  }

  const handlePointerWave = (event) => {
    if (activeScene !== 'inner' || transitionInfo) return

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp01((event.clientX - bounds.left) / bounds.width)
    const y = clamp01((event.clientY - bounds.top) / bounds.height)

    startTransition(() => {
      setPointer({ x, y, visible: true })
    })
  }

  const innerUiVisible = transitionInfo
    ? transitionInfo.targetScene === 'inner'
      ? transitionProgress > INNER_ENTRY_SWITCH_PROGRESS + 0.04
      : transitionInfo.sourceScene === 'inner' && transitionProgress < 0.26
    : activeScene === 'inner'
  const innerUiProgress = transitionInfo
    ? transitionInfo.targetScene === 'inner'
      ? clamp01((transitionProgress - INNER_ENTRY_SWITCH_PROGRESS) / (1 - INNER_ENTRY_SWITCH_PROGRESS))
      : transitionInfo.sourceScene === 'inner'
        ? clamp01((INNER_EXIT_SWITCH_PROGRESS - transitionProgress) / INNER_EXIT_SWITCH_PROGRESS)
        : 0
    : activeScene === 'inner'
      ? 1
      : 0
  const noiseIntensity = transitionInfo
    ? 0.02 + Math.sin(Math.PI * clamp01(transitionProgress)) * 0.03
    : 0
  const transitionPulse = transitionInfo ? Math.pow(Math.sin(Math.PI * clamp01(transitionProgress)), 0.44) : 0
  const canvasBlur = transitionInfo ? (IS_MOBILE ? 0.45 : 0.7) + transitionPulse * (IS_MOBILE ? 4.2 : 6.1) : 0
  const canvasScale = transitionInfo ? 1 + transitionPulse * 0.016 : 1
  const canvasSaturate = transitionInfo ? 103 + transitionPulse * 14 : 100
  const canvasBrightness = transitionInfo ? 98 + transitionPulse * 5 : 100

  return (
    <div
      className={`shield-canvas-wrap${innerUiVisible ? ' shield-canvas-wrap--inner' : ''}${transitionInfo ? ' shield-canvas-wrap--transition' : ''}`}
      style={{
        '--scene-blur': `${canvasBlur.toFixed(2)}px`,
        '--scene-scale': canvasScale.toFixed(3),
        '--scene-saturate': `${canvasSaturate.toFixed(1)}%`,
        '--scene-brightness': `${canvasBrightness.toFixed(1)}%`,
      }}
      onPointerMove={handlePointerWave}
      onPointerDown={handlePointerWave}
      onPointerLeave={() => {
        setPointer((current) => ({ ...current, visible: false }))
      }}
    >
      <DotGridOverlay
        active={activeScene === 'inner' || transitionInfo?.targetScene === 'inner'}
        intensity={transitionInfo
          ? transitionInfo.targetScene === 'inner'
            ? clamp01(transitionProgress * 1.15)
            : clamp01(1 - transitionProgress * 1.1)
          : activeScene === 'inner'
            ? 1
            : 0}
        ambientVisibility={transitionInfo
          ? transitionInfo.targetScene === 'inner'
            ? 0.14 + clamp01(transitionProgress) * 0.24
            : 0.1 + clamp01(1 - transitionProgress) * 0.18
          : activeScene === 'inner'
            ? 0.38
            : 0}
        pointer={pointer}
        shockToken={gridShockToken}
      />

      <Canvas dpr={[1, IS_MOBILE ? 1 : 1.25]} gl={{ antialias: false, alpha: true, powerPreference: 'high-performance', stencil: false }}>
        <PerspectiveCamera makeDefault position={[0, 0, 7.2]} fov={42} />
        <Suspense fallback={<SceneFallback />}>
          <SceneViewport
            sceneConfig={sceneConfig}
            activeScene={activeScene}
            transitionInfo={transitionInfo}
            transitionProgress={transitionProgress}
            hovered={hovered}
            onHoverChange={setHovered}
            onActivate={() => beginSceneTransition('inner')}
            pointer={pointer}
            outerDecorationsStatic={hasVisitedInnerRef.current}
          />
        </Suspense>
      </Canvas>
      <FilmNoiseOverlay active={Boolean(transitionInfo)} intensity={noiseIntensity} />
      <SceneTransitionVeil active={Boolean(transitionInfo)} progress={transitionProgress} targetScene={transitionInfo?.targetScene ?? 'inner'} />
      <InnerSceneHud active={innerUiVisible} progress={innerUiProgress} onClose={() => beginSceneTransition('outer')} />
    </div>
  )
}

useGLTF.preload(encodeAssetPath(DEFAULT_SCENE_CONFIG.ice.modelPath))
useTexture.preload(
  Object.values(DEFAULT_SCENE_CONFIG.ice.textures).map((path) => encodeAssetPath(path)),
)

export default IceHeroCanvas