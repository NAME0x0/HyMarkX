import { DotMatrixBackground } from '@designcodeio/threeui'

/**
 * The decorative field behind the hero.
 *
 * Deliberately decorative and nothing else. An island is empty until JavaScript mounts it
 * (ADR-0016 has no server rendering), so anything a reader needs — the headline, the install
 * command, the links — is real HTML sitting on top of this, not inside it.
 */
export function Hero() {
  return <DotMatrixBackground gridScale={72} opacity={0.5} radius={0.13} speed={0.6} />
}
