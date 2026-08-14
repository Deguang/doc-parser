/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      "colors": {
        "on-tertiary-fixed-variant": "#85145a",
        "on-secondary-fixed-variant": "#004e5c",
        "on-tertiary-fixed": "#3d0026",
        "on-primary": "#3c0091",
        "on-error-container": "#ffdad6",
        "on-error": "#690005",
        "primary-fixed": "#e9ddff",
        "primary-fixed-dim": "#d0bcff",
        "on-tertiary-container": "#560038",
        "surface-container-highest": "#2d3449",
        "on-secondary-fixed": "#001f26",
        "background": "#0b1326",
        "on-surface": "#dae2fd",
        "tertiary-container": "#e364a7",
        "surface-bright": "#31394d",
        "on-primary-container": "#340080",
        "on-surface-variant": "#cbc3d7",
        "outline": "#958ea0",
        "on-background": "#dae2fd",
        "secondary": "#4cd7f6",
        "tertiary-fixed": "#ffd8e7",
        "primary": "#d0bcff",
        "surface": "#0b1326",
        "surface-container-low": "#131b2e",
        "error": "#ffb4ab",
        "on-secondary": "#003640",
        "secondary-container": "#03b5d3",
        "on-tertiary": "#620040",
        "on-secondary-container": "#00424e",
        "inverse-surface": "#dae2fd",
        "inverse-primary": "#6d3bd7",
        "secondary-fixed-dim": "#4cd7f6",
        "on-primary-fixed-variant": "#5516be",
        "surface-tint": "#d0bcff",
        "surface-variant": "#2d3449",
        "surface-dim": "#0b1326",
        "surface-container": "#171f33",
        "tertiary": "#ffafd3",
        "surface-container-high": "#222a3d",
        "surface-container-lowest": "#060e20",
        "error-container": "#93000a",
        "tertiary-fixed-dim": "#ffafd3",
        "on-primary-fixed": "#23005c",
        "outline-variant": "#494454",
        "primary-container": "#a078ff",
        "secondary-fixed": "#acedff",
        "inverse-on-surface": "#283044"
      },
      "borderRadius": {
        "DEFAULT": "0.25rem",
        "lg": "0.5rem",
        "xl": "0.75rem",
        "full": "9999px"
      },
      "spacing": {
        "margin-page": "64px",
        "container-max": "1440px",
        "gutter": "24px",
        "unit": "8px",
        "editor-gap": "32px"
      },
      "fontFamily": {
        "code-md": ["JetBrains Mono"],
        "display-lg": ["Inter"],
        "label-caps": ["JetBrains Mono"],
        "headline-md": ["Inter"],
        "body-rt": ["Inter"]
      },
      "fontSize": {
        "code-md": ["14px", { "lineHeight": "1.7", "fontWeight": "450" }],
        "display-lg": ["48px", { "lineHeight": "1.1", "letterSpacing": "-0.02em", "fontWeight": "700" }],
        "label-caps": ["12px", { "lineHeight": "1", "letterSpacing": "0.1em", "fontWeight": "600" }],
        "headline-md": ["24px", { "lineHeight": "1.3", "letterSpacing": "-0.01em", "fontWeight": "600" }],
        "body-rt": ["16px", { "lineHeight": "1.6", "letterSpacing": "0em", "fontWeight": "400" }]
      }
    },
  },
  plugins: [],
}
