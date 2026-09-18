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
};

export default preview;
