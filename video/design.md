---
name: getraw
colors:
  primary: "#0c0c0f"
  on-primary: "#e8e8ec"
  accent: "#00ff88"
  accent-dim: "#00cc6a"
  surface: "#161620"
  surface-border: "#2a2a3a"
  muted: "#6b6b80"
typography:
  headline:
    fontFamily: Space Grotesk
    fontSize: 5rem
    fontWeight: 700
    letterSpacing: -0.03em
  body:
    fontFamily: JetBrains Mono
    fontSize: 1.5rem
    fontWeight: 400
  label:
    fontFamily: JetBrains Mono
    fontSize: 0.875rem
    fontWeight: 500
    textTransform: uppercase
    letterSpacing: 0.08em
rounded:
  none: 0px
  sm: 4px
  md: 8px
spacing:
  sm: 8px
  md: 16px
  lg: 40px
motion:
  energy: high
  easing:
    entry: "expo.out"
    exit: "power3.in"
    ambient: "sine.inOut"
  duration:
    entrance: 0.4
    hold: 1.8
    transition: 0.4
  atmosphere:
    - terminal-cursor
    - scan-lines
    - grid-dots
  transition: glitch
---

## Overview

getraw is a fast media downloader CLI built in Bun/TypeScript — a yt-dlp replacement with native JS execution. The visual identity is terminal-native: dark background, green accent (terminal green), monospace type for code, and sharp geometric motion. Feels like watching a hacker tool come alive.

## Colors

- **Primary (#0c0c0f):** Near-black background with slight blue undertone
- **On-primary (#e8e8ec):** Off-white text, not pure white
- **Accent (#00ff88):** Terminal green — the signature color. Used for highlights, commands, active states
- **Surface (#161620):** Slightly elevated panels, code blocks
- **Muted (#6b6b80):** Comments, secondary info

## Typography

- **Headlines:** Space Grotesk 700 — geometric, techy, not generic
- **Code/Body:** JetBrains Mono 400 — the developer's monospace
- **Labels:** JetBrains Mono 500 uppercase — structural metadata

## Do's and Don'ts

### Do
- Use terminal-style animations (typing effect, cursor blink, line-by-line reveal)
- Show real CLI commands and output
- Use the green accent sparingly but boldly
- Let the dark background breathe

### Don't
- Use gradients on text
- Use rounded corners larger than 8px
- Use decorative serif fonts
- Use bright colors other than the accent green
