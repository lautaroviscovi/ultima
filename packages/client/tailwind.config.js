/**
 * Tailwind es el MAPEO, no la fuente de verdad.
 *
 * Los valores viven en `src/design/tokens.css` como custom properties. Acá
 * sólo se les da nombre de utilidad. El beneficio concreto: cambiar un color
 * es tocar una línea de CSS, sin rebuild de la config ni reinicio del dev
 * server, y el mismo token es legible desde JS (getComputedStyle) y desde SVG.
 *
 * `<alpha-value>` es lo que hace que `bg-uno-red/40` funcione contra un token
 * declarado como canales sueltos.
 */

/** @param {string} v */
const channel = (v) => `rgb(var(${v}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // PIGMENTO: sólo la cara de la carta, el swatch, el halo, el glifo wild.
        uno: {
          red: channel('--uno-red'),
          yellow: channel('--uno-yellow'),
          green: channel('--uno-green'),
          blue: channel('--uno-blue'),
        },
        // INTENCIÓN: lo que el color significa. Nunca para pintar una carta.
        intent: {
          ok: channel('--intent-ok'),
          warn: channel('--intent-warn'),
          danger: channel('--intent-danger'),
          focus: channel('--intent-focus'),
          urgent: channel('--intent-urgent'),
        },
        brand: {
          accent: channel('--brand-accent'),
          ink: channel('--brand-ink'),
        },
        felt: {
          DEFAULT: channel('--felt'),
          dark: channel('--felt-dark'),
        },
      },

      // Superficies: ya llevan su alpha horneada, por eso van como backgroundColor
      // y no como `colors` — no admiten `/40` y está bien que no lo admitan.
      backgroundColor: {
        sunken: 'var(--surface-sunken)',
        raised: 'var(--surface-raised)',
        'raised-hover': 'var(--surface-raised-hover)',
        active: 'var(--surface-active)',
        scrim: 'var(--surface-scrim)',
        overlay: 'var(--surface-overlay)',
      },

      borderColor: {
        subtle: 'var(--border-subtle)',
        strong: 'var(--border-strong)',
      },

      boxShadow: {
        card: 'var(--shadow-card)',
        'card-lift': 'var(--shadow-card-lift)',
        seat: 'var(--shadow-seat)',
        modal: 'var(--shadow-modal)',
        // Paramétrico: el componente setea --glow-color inline.
        glow: 'var(--shadow-glow)',
      },

      fontFamily: {
        sans: ['Inter Variable', 'Inter Fallback', 'system-ui', 'sans-serif'],
        // Cifras de carta y títulos. Contadores abiertos y `1` con bandera.
        display: ['Outfit Variable', 'Outfit Fallback', 'system-ui', 'sans-serif'],
      },

      /**
       * Escala con nombre SEMÁNTICO, no numérico.
       *
       * Los `figure-*` son categoría aparte a propósito: no son texto, son
       * CIFRAS. Van con line-height 1 (el número se centra en su caja, que es
       * lo que hace falta dentro de un óvalo) y tabular-nums (un "10" y un
       * "11" ocupan lo mismo, así el abanico no tiembla). Nunca para prosa.
       */
      fontSize: {
        micro: ['0.625rem', { lineHeight: '0.875rem', letterSpacing: '0.04em' }],
        mini: ['0.6875rem', { lineHeight: '1rem' }],
        body: ['0.8125rem', { lineHeight: '1.25rem' }],
        lead: ['1rem', { lineHeight: '1.5rem' }],

        'figure-sm': ['1.25rem', { lineHeight: '1', fontWeight: '800' }],
        'figure-md': ['2rem', { lineHeight: '1', fontWeight: '800' }],
        'figure-lg': ['3rem', { lineHeight: '1', fontWeight: '800' }],

        'display-sm': ['1.375rem', { lineHeight: '1.75rem', letterSpacing: '-0.01em' }],
        display: ['2rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
        'display-xl': ['3.5rem', { lineHeight: '1', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [],
};
