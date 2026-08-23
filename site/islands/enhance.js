/**
 * Progressive enhancement the language deliberately cannot provide.
 *
 * A copy button needs `navigator.clipboard`, and an HMX event handler cannot reach any host
 * object — that is ADR-0004's restricted expression language, and it is the boundary `document`
 * trust mode rests on. So this is host code, added by the host, exactly like the island mount.
 *
 * Everything here is additive: the page is complete and correct before it runs.
 */

const COPY = 'Copy'
const COPIED = 'Copied'

/**
 * Two paths, because the good one is not always available.
 *
 * `navigator.clipboard` needs a secure context and, in several browsers, a permission the user
 * may never have been asked for. The selection fallback is deprecated but works without either,
 * so a reader on an older browser or a plain-HTTP preview still gets the button rather than an
 * apology.
 */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fall through.
  }

  const staging = document.createElement('textarea')
  staging.value = text
  staging.setAttribute('readonly', '')
  staging.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0'
  document.body.append(staging)
  staging.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    staging.remove()
  }
}

function addCopyButton(pre) {
  const code = pre.querySelector('code')
  if (code === null) {
    return
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'copy'
  button.textContent = COPY
  // The label already says what it does, so the accessible name only needs the target.
  button.setAttribute('aria-label', 'Copy code to clipboard')

  let reset
  button.addEventListener('click', async () => {
    if (await copy(code.textContent ?? '')) {
      button.textContent = COPIED
      button.dataset.state = 'copied'
    } else {
      // A denied permission is not worth a broken-looking button; tell them what to press.
      button.textContent = 'Press Ctrl+C'
      button.dataset.state = 'failed'
    }
    clearTimeout(reset)
    reset = setTimeout(() => {
      button.textContent = COPY
      delete button.dataset.state
    }, 1600)
  })

  pre.append(button)
  pre.classList.add('has-copy')
}

/**
 * Reveals sections as they enter the viewport.
 *
 * CSS does this natively now with `animation-timeline: view()`, and where that is supported no
 * JavaScript runs at all — the stylesheet handles it and this function never touches the
 * element. This is the fallback for browsers without it, and it only ever *adds* the class that
 * makes content visible, so a failure here cannot hide anything.
 */
function revealOnScroll() {
  const targets = document.querySelectorAll('.reveal')
  if (CSS.supports('animation-timeline: view()')) {
    return
  }
  if (!('IntersectionObserver' in window)) {
    for (const target of targets) {
      target.dataset.revealed = 'true'
    }
    return
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.dataset.revealed = 'true'
          observer.unobserve(entry.target)
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  )
  for (const target of targets) {
    observer.observe(target)
  }
}

/**
 * Marks the nav link for whichever chapter the reader is in.
 *
 * Chosen by which section is nearest the top of the viewport rather than by whichever crossed
 * an observer threshold last — with sections of very different heights, the latter leaves the
 * highlight on a section that has already scrolled past.
 */
function scrollSpy() {
  const links = [...document.querySelectorAll('.site-nav a[href^="#"]')]
  const sections = links
    .map((link) => ({ link, section: document.querySelector(link.getAttribute('href')) }))
    .filter((entry) => entry.section !== null)
  if (sections.length === 0) {
    return
  }

  let queued = false
  const update = () => {
    queued = false
    let current
    for (const entry of sections) {
      if (entry.section.getBoundingClientRect().top <= window.innerHeight * 0.35) {
        current = entry
      }
    }
    for (const entry of sections) {
      if (entry === current) {
        entry.link.dataset.active = 'true'
        entry.link.setAttribute('aria-current', 'true')
      } else {
        delete entry.link.dataset.active
        entry.link.removeAttribute('aria-current')
      }
    }
  }

  addEventListener(
    'scroll',
    () => {
      if (!queued) {
        queued = true
        requestAnimationFrame(update)
      }
    },
    { passive: true },
  )
  update()
}

/** Marks the nav once the page has scrolled, so it can earn a background only when over content. */
function stickyNav() {
  const nav = document.querySelector('.site-nav')
  if (nav === null) {
    return
  }
  const sentinel = document.createElement('div')
  sentinel.setAttribute('aria-hidden', 'true')
  sentinel.className = 'nav-sentinel'
  nav.before(sentinel)

  new IntersectionObserver(([entry]) => {
    nav.dataset.stuck = String(!entry.isIntersecting)
  }).observe(sentinel)
}

export function enhance() {
  for (const pre of document.querySelectorAll('pre')) {
    addCopyButton(pre)
  }
  revealOnScroll()
  stickyNav()
  scrollSpy()
}
