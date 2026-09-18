import { MotionConfig } from 'framer-motion';
import type { Preview } from '@storybook/react';
import '../src/index.css';

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    backgrounds: {
      default: 'felt',
      values: [
        { name: 'felt', value: '#0b3a20' },
        { name: 'dark', value: '#111827' },
      ],
    },
  },
  globalTypes: {
    // Sin esto hay que pelear con stories que nunca se "asientan" y con
    // snapshots inestables: el toggle permite congelar las animaciones.
    motion: {
      description: 'Animaciones',
      defaultValue: 'full',
      toolbar: {
        title: 'Movimiento',
        icon: 'play',
        items: [
          { value: 'full', title: 'Animaciones completas' },
          { value: 'reduced', title: 'Movimiento reducido' },
        ],
      },
    },
  },
  decorators: [
    (Story, context) => (
      <MotionConfig reducedMotion={context.globals['motion'] === 'reduced' ? 'always' : 'never'}>
        <Story />
      </MotionConfig>
    ),
  ],
};

export default preview;
