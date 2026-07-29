import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#1B2430',
        paper: '#F7F7F5',
        line: '#DDD9D0',
        accent: '#3F6C51',
        accentSoft: '#E6EEE7',
        amber: '#B8862B',
        rust: '#A63D30',
        slate: '#5B6472',
      },
      fontFamily: {
        display: ['"IBM Plex Serif"', 'Georgia', 'serif'],
        body: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        sm: '3px',
        DEFAULT: '4px',
      },
    },
  },
  plugins: [],
};
export default config;
