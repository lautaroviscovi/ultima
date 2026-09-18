/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Los cuatro colores de UNO, como tokens. Se usan en cartas, asientos
        // y el indicador de color activo: una sola fuente para los tres.
        uno: {
          red: '#D72600',
          yellow: '#E8B000',
          green: '#00A651',
          blue: '#0082CE',
        },
        felt: { DEFAULT: '#14532d', dark: '#0b3a20' },
      },
    },
  },
  plugins: [],
};
