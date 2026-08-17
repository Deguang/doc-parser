---
name: anti-ai-design-system
description: Design principles and execution standards for eliminating generic "AI taste" (purple glow, scan beams, sci-fi cyber tropes) and crafting human-grade, precision-crafted product interfaces inspired by Linear, Raycast, Vercel, and Apple.
---

# Anti-AI Design System & Human-Grade UI Craft

## 1. The "AI Vibe" Anti-Patterns (Forbidden Tropes)
Generic AI tools often default to the same cliches:
- ❌ **The "Cyber Dark" Palette**: Loud neon purples, magenta, and saturated cyan glows.
- ❌ **Sci-Fi Gimmicks**: Laser scan beams, pulsating radar rings, rotating magic sparkle icons.
- ❌ **Over-dramatic Gradients**: Blurry multi-color gradient text on main headlines.
- ❌ **Noisy Aurora/Particle Mesh**: Distracting dynamic background blobs moving behind active working tools.
- ❌ **Glow-in-the-dark Borders**: Neon glowing colored outlines that distract from reading content.

## 2. The Human-Grade Product Aesthetic (The Linear / Raycast / Vercel Standard)
- ✅ **Precision Neutrals**: Deep slate, obsidian, and obsidian-zinc surfaces (`#0B0D11`, `#131720`, `#1A202C`, `#242C3D`).
- ✅ **Crisp 1px Boundaries**: Subtle border dividers using `border-white/[0.06]` to `border-white/[0.12]`.
- ✅ **Purposeful Accent Color**: Restrained monochromatic base with a single crisp accent (e.g., Apple Electric Blue `#2563EB` / `#3B82F6` or Titanium `#E2E8F0`) used strictly for active states, key CTAs, and semantic badges.
- ✅ **Typography Craft**:
  - Tight tracking on headings (`tracking-tight` / `-0.02em`).
  - High legibility hierarchy: Pure white (`#F8FAFC`) for titles, Slate-300 (`#CBD5E1`) for body, Slate-500 (`#64748B`) for metadata.
- ✅ **Tactile Micro-Interactions**:
  - 150ms ease-out transitions.
  - Subtle brightness shift (`hover:bg-white/[0.04]`).
  - Crisp active feedback (`active:scale-[0.98]`).
- ✅ **Focus on Content**: In an interactive parser tool, 95% of visual focus should be on the document canvas and code typography, not the framing decorations.
