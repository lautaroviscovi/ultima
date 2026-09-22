import type { Transition } from 'framer-motion';

/**
 * Springs con intencion, no con numeros sueltos.
 *
 * Framer Motion anima valores JS, asi que estos no pueden vivir en CSS con el
 * resto de los tokens. El criterio para elegir entre ellos es QUE esta pasando,
 * no como se ve: dos cosas que significan lo mismo tienen que moverse igual.
 */
export const SPRING = {
  /** La carta bajo el dedo. Casi sin rebote: responde, no juega. */
  snap: { type: 'spring', stiffness: 520, damping: 34 },

  /** Un asiento acomodandose, el abanico reflowing. Se asienta y se queda. */
  settle: { type: 'spring', stiffness: 400, damping: 30 },

  /** Algo que VIAJA por la mesa: mazo a mano, mano a descarte. */
  travel: { type: 'spring', stiffness: 260, damping: 30 },

  /** Celebracion. Es el unico con rebote visible, y por eso se nota. */
  pop: { type: 'spring', stiffness: 300, damping: 18 },
} as const satisfies Record<string, Transition>;

/**
 * Duraciones para lo que NO es spring (fades, cambios de color).
 *
 * Un fade con spring no tiene sentido fisico: la opacidad no tiene masa.
 */
export const DURATION = {
  /** Feedback inmediato: hover, foco. */
  instant: 0.12,
  /** Aparecer/desaparecer. */
  quick: 0.2,
  /** El halo cambiando de color tras un wild. Tiene que LEERSE como un cambio. */
  color: 0.5,
} as const;
