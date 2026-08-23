/**
 * The readout behind the numbers.
 *
 * ThreeUI's data-pixel arc — the renderer its own documentation leads with — driven directly
 * rather than through its React wrapper. It is framework-free canvas 2D, so the only cost is
 * the renderer itself: about 3 kB before compression.
 *
 * Placed behind the cost panel because it reads as instrumentation rather than decoration,
 * which is what that section is about. Like the hero it is purely visual: every number is real
 * HTML in front of it.
 */
import {
  createDataPixelArcRenderer,
  DATA_PIXEL_ARC_DEFAULTS,
} from './vendor/data-pixel-arc.js'

const OPTIONS = {
  ...DATA_PIXEL_ARC_DEFAULTS,
  speed: 0.8,
  pixelSize: 7,
  brightness: 0.62,
  // Warm, to sit with the page's ember accent rather than ThreeUI's default cool readout.
  hue: 24,
  saturation: 0.7,
}

export function Cost(element) {
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'display:block;width:100%;height:100%'
  element.appendChild(canvas)

  const renderer = createDataPixelArcRenderer(canvas, () => OPTIONS)
  // The factory returns null when a 2D context cannot be had. Nothing here is load-bearing, so
  // the right answer is to leave the panel plain.
  if (renderer === null) {
    canvas.remove()
    return () => {}
  }

  // `resize` takes CSS pixels and does its own device-pixel-ratio maths — setting canvas.width
  // here as well left it drawing into a 1×1 buffer.
  const setSize = () => {
    const rect = element.getBoundingClientRect()
    renderer.resize(rect.width, rect.height)
  }

  const resizeObserver = new ResizeObserver(setSize)
  resizeObserver.observe(element)
  setSize()

  // Same discipline as the hero: nothing runs while it is offscreen or the tab is hidden.
  let frame = 0
  let onScreen = false
  let pageVisible = !document.hidden

  const loop = () => {
    renderer.render()
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

  return () => {
    pause()
    resizeObserver.disconnect()
    intersectionObserver.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    canvas.remove()
  }
}
