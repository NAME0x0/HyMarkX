/**
 * The gradient field behind the hero.
 *
 * Ported from React Bits' `Grainient` (MIT, © React Bits) to a plain module on `ogl`. The
 * shaders are theirs, unchanged; the React component around them is replaced by this.
 *
 * The port is the point. The original pulls React, and the shader it replaced pulled three.js:
 * together that was 186 kB gzipped to draw a decorative rectangle, on a page whose argument is
 * that output should be proportional to what a document uses. `ogl` unpacks to 423 kB against
 * three's 23 MB, and dropping React removes 60 kB that existed only to render one element.
 *
 * Exported as a mount function rather than a component: an HMX island names a module and an
 * export, and the host decides how to mount it (ADR-0016). Nothing here requires a framework,
 * so nothing here ships one.
 */
import { Renderer, Program, Mesh, Triangle } from 'ogl'

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
uniform vec2 iResolution;
uniform float iTime;
uniform float uTimeSpeed;
uniform float uColorBalance;
uniform float uWarpStrength;
uniform float uWarpFrequency;
uniform float uWarpSpeed;
uniform float uWarpAmplitude;
uniform float uBlendAngle;
uniform float uBlendSoftness;
uniform float uRotationAmount;
uniform float uNoiseScale;
uniform float uGrainAmount;
uniform float uGrainScale;
uniform float uContrast;
uniform float uGamma;
uniform float uSaturation;
uniform vec2 uCenterOffset;
uniform float uZoom;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
out vec4 fragColor;
#define S(a,b,t) smoothstep(a,b,t)
mat2 Rot(float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c);}
vec2 hash(vec2 p){p=vec2(dot(p,vec2(2127.1,81.17)),dot(p,vec2(1269.5,283.37)));return fract(sin(p)*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);float n=mix(mix(dot(-1.0+2.0*hash(i+vec2(0.0,0.0)),f-vec2(0.0,0.0)),dot(-1.0+2.0*hash(i+vec2(1.0,0.0)),f-vec2(1.0,0.0)),u.x),mix(dot(-1.0+2.0*hash(i+vec2(0.0,1.0)),f-vec2(0.0,1.0)),dot(-1.0+2.0*hash(i+vec2(1.0,1.0)),f-vec2(1.0,1.0)),u.x),u.y);return 0.5+0.5*n;}
void mainImage(out vec4 o, vec2 C){
  float t=iTime*uTimeSpeed;
  vec2 uv=C/iResolution.xy;
  float ratio=iResolution.x/iResolution.y;
  vec2 tuv=uv-0.5+uCenterOffset;
  tuv/=max(uZoom,0.001);

  float degree=noise(vec2(t*0.1,tuv.x*tuv.y)*uNoiseScale);
  tuv.y*=1.0/ratio;
  tuv*=Rot(radians((degree-0.5)*uRotationAmount+180.0));
  tuv.y*=ratio;

  float frequency=uWarpFrequency;
  float ws=max(uWarpStrength,0.001);
  float amplitude=uWarpAmplitude/ws;
  float warpTime=t*uWarpSpeed;
  tuv.x+=sin(tuv.y*frequency+warpTime)/amplitude;
  tuv.y+=sin(tuv.x*(frequency*1.5)+warpTime)/(amplitude*0.5);

  vec3 colLav=uColor1;
  vec3 colOrg=uColor2;
  vec3 colDark=uColor3;
  float b=uColorBalance;
  float s=max(uBlendSoftness,0.0);
  mat2 blendRot=Rot(radians(uBlendAngle));
  float blendX=(tuv*blendRot).x;
  float edge0=-0.3-b-s;
  float edge1=0.2-b+s;
  float v0=0.5-b+s;
  float v1=-0.3-b-s;
  vec3 layer1=mix(colDark,colOrg,S(edge0,edge1,blendX));
  vec3 layer2=mix(colOrg,colLav,S(edge0,edge1,blendX));
  vec3 col=mix(layer1,layer2,S(v0,v1,tuv.y));

  vec2 grainUv=uv*max(uGrainScale,0.001);
  float grain=fract(sin(dot(grainUv,vec2(12.9898,78.233)))*43758.5453);
  col+=(grain-0.5)*uGrainAmount;

  col=(col-0.5)*uContrast+0.5;
  float luma=dot(col,vec3(0.2126,0.7152,0.0722));
  col=mix(vec3(luma),col,uSaturation);
  col=pow(max(col,0.0),vec3(1.0/max(uGamma,0.001)));
  col=clamp(col,0.0,1.0);

  o=vec4(col,1.0);
}
void main(){
  vec4 o=vec4(0.0);
  mainImage(o,gl_FragCoord.xy);
  fragColor=o;
}
`

function hexToRgb(hex) {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (match === null) {
    return new Float32Array([1, 1, 1])
  }
  return new Float32Array([
    Number.parseInt(match[1], 16) / 255,
    Number.parseInt(match[2], 16) / 255,
    Number.parseInt(match[3], 16) / 255,
  ])
}

/**
 * The palette, tuned to the page rather than to the component's defaults.
 *
 * All three sit dark enough that the headline above keeps its contrast without the gradient
 * being masked into invisibility — the previous shader had to be covered by a heavy scrim to
 * stay readable, which wasted most of what it drew.
 */
const DEFAULTS = {
  color1: '#3f6fe0',
  color2: '#14224a',
  color3: '#070b14',
  timeSpeed: 0.14,
  colorBalance: 0.1,
  warpStrength: 1,
  warpFrequency: 4,
  warpSpeed: 1.4,
  warpAmplitude: 60,
  blendAngle: 18,
  blendSoftness: 0.16,
  rotationAmount: 260,
  noiseScale: 1.6,
  grainAmount: 0.06,
  grainScale: 2.4,
  contrast: 1.12,
  gamma: 1,
  saturation: 0.92,
  centerX: -0.06,
  centerY: 0,
  zoom: 0.92,
}

/** Mounts the field into `element`. Returns a teardown. */
export function Hero(element, props = {}) {
  const options = { ...DEFAULTS, ...props }
  const renderer = new Renderer({
    webgl: 2,
    alpha: true,
    antialias: false,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  })
  const gl = renderer.gl
  const canvas = gl.canvas
  canvas.style.width = '100%'
  canvas.style.height = '100%'
  canvas.style.display = 'block'
  element.appendChild(canvas)

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      iTime: { value: 0 },
      iResolution: { value: new Float32Array([1, 1]) },
      uTimeSpeed: { value: options.timeSpeed },
      uColorBalance: { value: options.colorBalance },
      uWarpStrength: { value: options.warpStrength },
      uWarpFrequency: { value: options.warpFrequency },
      uWarpSpeed: { value: options.warpSpeed },
      uWarpAmplitude: { value: options.warpAmplitude },
      uBlendAngle: { value: options.blendAngle },
      uBlendSoftness: { value: options.blendSoftness },
      uRotationAmount: { value: options.rotationAmount },
      uNoiseScale: { value: options.noiseScale },
      uGrainAmount: { value: options.grainAmount },
      uGrainScale: { value: options.grainScale },
      uContrast: { value: options.contrast },
      uGamma: { value: options.gamma },
      uSaturation: { value: options.saturation },
      uCenterOffset: { value: new Float32Array([options.centerX, options.centerY]) },
      uZoom: { value: options.zoom },
      uColor1: { value: hexToRgb(options.color1) },
      uColor2: { value: hexToRgb(options.color2) },
      uColor3: { value: hexToRgb(options.color3) },
    },
  })
  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program })

  const setSize = () => {
    const rect = element.getBoundingClientRect()
    renderer.setSize(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)))
    const resolution = program.uniforms.iResolution.value
    resolution[0] = gl.drawingBufferWidth
    resolution[1] = gl.drawingBufferHeight
    renderer.render({ scene: mesh })
  }

  const resizeObserver = new ResizeObserver(setSize)
  resizeObserver.observe(element)
  setSize()

  // Nothing animates while it is scrolled out of view or the tab is in the background. A
  // decorative gradient should never be the reason a laptop fan spins up.
  let frame = 0
  let onScreen = true
  let pageVisible = !document.hidden
  const start = performance.now()

  const loop = (now) => {
    program.uniforms.iTime.value = (now - start) * 0.001
    renderer.render({ scene: mesh })
    frame = requestAnimationFrame(loop)
  }
  const play = () => {
    if (onScreen && pageVisible && frame === 0) {
      frame = requestAnimationFrame(loop)
    }
  }
  const pause = () => {
    if (frame !== 0) {
      cancelAnimationFrame(frame)
      frame = 0
    }
  }

  const intersectionObserver = new IntersectionObserver(
    ([entry]) => {
      onScreen = entry.isIntersecting
      onScreen ? play() : pause()
    },
    { threshold: 0 },
  )
  intersectionObserver.observe(element)

  const onVisibility = () => {
    pageVisible = !document.hidden
    pageVisible ? play() : pause()
  }
  document.addEventListener('visibilitychange', onVisibility)
  play()

  return () => {
    pause()
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.remove()
  }
}
