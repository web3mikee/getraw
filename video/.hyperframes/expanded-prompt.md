# getraw — Product Video Expansion

## Style Block

- **BG:** #0c0c0f (near-black, blue undertone)
- **FG:** #e8e8ec (off-white)
- **Accent:** #00ff88 (terminal green)
- **Surface:** #161620
- **Muted:** #6b6b80
- **Headline:** Space Grotesk 700, -0.03em tracking
- **Code:** JetBrains Mono 400
- **Labels:** JetBrains Mono 500 uppercase, 0.08em tracking

## Rhythm Declaration

`hook-PUNCH-breathe-BUILD-PEAK-CTA`

6 scenes, ~30 seconds total. Fast hook, slam the name, breathe with the problem, build features, peak with the stats, close with install command.

## Global Rules

- Primary transition: glitch (0.3s) — 60% of transitions
- Accent transition: staggered blocks (0.25s) — topic changes
- All decoratives have ambient motion (scan-line drift, grid pulse, cursor blink)
- Terminal green (#00ff88) used ONLY for: commands, active highlights, key stats
- Everything else in off-white or muted

---

## Scene 1: Hook (0s–5s)

**Concept:** A terminal cursor blinks on black. A command types out character by character: `$ getraw "https://youtube.com/watch?v=..."`. The moment Enter is hit, the screen EXPLODES with data — format listings cascading down like a matrix waterfall. The viewer's reaction: "what is this tool?"

**Mood:** Cinematic hacker. The opening frame of a tech thriller.

**Depth layers:**
- BG: #0c0c0f solid + subtle scan-line overlay at 8% opacity drifting upward + faint grid dots at 5% pulsing
- MG: Terminal text, typing animation, cursor blink
- FG: Faint terminal frame border (1px #2a2a3a), timestamp label top-right "v0.1.0"

**Animation choreography:**
- Cursor BLINKS twice (0.5s interval) at t=0.2
- Command TYPES character-by-character at 40ms/char starting t=0.8
- On "enter" at t=3.0: format data CASCADES in from top, staggered 30ms per line
- Scan-lines drift upward continuously

**Transition out:** Glitch, 0.3s, power3.inOut

---

## Scene 2: Name Drop (5s–10s)

**Concept:** The word "getraw" SLAMS into frame at massive scale — 160px, terminal green, filling 70% of the width. Below it, a subtitle types on: "yt-dlp replacement. Built in Bun." The green glows softly, casting light on the dark surface. This is the brand moment.

**Mood:** Impact. Like a logo sting but for a CLI tool.

**Depth layers:**
- BG: Radial glow from center (#00ff88 at 12% opacity, scale breathing 1.0→1.05) + ghost text "MEDIA DOWNLOADER" at 4% opacity, 200px, behind the title
- MG: "getraw" headline + subtitle line
- FG: Two horizontal rules (top and bottom of frame, #2a2a3a, scaleX from 0), version badge "v0.1.0" bottom-right

**Animation choreography:**
- "getraw" SLAMS from y:80 with scale overshoot (1.05→1.0), expo.out, 0.5s at t=0.3
- Subtitle TYPES on character-by-character at t=1.2, JetBrains Mono, muted color
- Horizontal rules DRAW from center outward (scaleX: 0→1) at t=0.5, 0.6s
- Radial glow BREATHES continuously (scale 1.0↔1.05, 3s loop)

**Transition out:** Staggered blocks, 0.25s — signals topic change

---

## Scene 3: The Problem (10s–15s)

**Concept:** Split frame. Left side: "yt-dlp" with a list of pain points stacking up — "Python dependency", "External JS runtime", "36K line interpreter", "Slow startup". Each appears with a red-ish muted strike. Right side: blank, waiting. The viewer feels the weight of the problem before the solution appears.

**Mood:** Tension. Editorial comparison. The "before" that makes the "after" land.

**Depth layers:**
- BG: Subtle vertical divider line at center (1px #2a2a3a) + grid dots left half at 5%
- MG: "yt-dlp" label top-left + stacking pain points + right side empty space
- FG: Small "THE PROBLEM" label top-center in muted, monospace uppercase

**Animation choreography:**
- "THE PROBLEM" label FADES in at t=0.2, subtle
- "yt-dlp" SLIDES in from left at t=0.4
- Pain points STACK one by one, each DROPPING from y:-20 with stagger 0.3s starting t=0.8
- Each pain point gets a subtle strikethrough line that DRAWS across after landing
- Right side stays intentionally empty — tension

**Transition out:** Glitch, 0.3s

---

## Scene 4: The Solution (15s–21s)

**Concept:** The empty right side from scene 3 is now the full frame. "getraw" in green, and below it, three feature cards STAGGER in: "Native JS execution", "30+ site extractors", "Bun-powered CLI". Each card has a small icon-like label and a one-liner. Clean, confident, no clutter. The solution is elegant.

**Mood:** Confidence. Clean resolve after tension.

**Depth layers:**
- BG: Radial glow bottom-left (#00ff88 at 10%) + faint circuit-board pattern at 3% opacity
- MG: "getraw" label + three feature cards in surface color (#161620) with border
- FG: Small arrow indicators (→) next to each card, accent green, appearing with stagger

**Animation choreography:**
- "getraw" SLIDES in from left at t=0.2, accent green, smaller (64px)
- Feature cards CASCADE from right, stagger 0.15s, each from x:40 + opacity:0, expo.out
- Arrow indicators POP in with scale overshoot 0.15s after their card lands
- Circuit pattern DRIFTS slowly rightward

**Transition out:** Glitch, 0.3s

---

## Scene 5: Stats (21s–26s)

**Concept:** Three big numbers SLAM in simultaneously: "30+" sites, "386" tests, "50ms" startup. Each in massive type (120px), terminal green. Below each number, a label in muted monospace. This is the proof. Numbers don't lie.

**Mood:** Peak energy. Data as spectacle.

**Depth layers:**
- BG: Three vertical accent lines (#00ff88 at 8%) behind each stat, full height, subtle pulse
- MG: Three stat columns with numbers + labels
- FG: "BENCHMARKS" label top-center, monospace uppercase muted + scan-line overlay intensified to 12%

**Animation choreography:**
- "BENCHMARKS" label FADES in at t=0.1
- All three numbers SLAM simultaneously from y:60, scale:1.1→1.0, expo.out, 0.4s at t=0.3
- Labels TYPE on below each number, stagger 0.1s starting t=0.8
- Accent lines PULSE once on number impact (opacity 8%→15%→8%, 0.6s)

**Transition out:** Staggered blocks, 0.3s — wind down

---

## Scene 6: CTA / Install (26s–30s)

**Concept:** Back to terminal. A clean command prompt: `$ bun install -g getraw`. Below it, the npm badge and GitHub link. The cursor blinks at the end. Simple. The viewer knows exactly what to do next.

**Mood:** Resolution. Clear call to action. The cursor blink is the mic drop.

**Depth layers:**
- BG: Subtle scan-lines returning + faint radial glow center (#00ff88 at 6%)
- MG: Install command + npm/GitHub info
- FG: Terminal frame border, "getraw.dev" bottom-center (aspirational), cursor blinking

**Animation choreography:**
- Terminal frame DRAWS in (border animation, 0.4s) at t=0.1
- Command TYPES on at t=0.5, 50ms/char, green text
- npm line FADES in at t=2.0, muted
- GitHub URL FADES in at t=2.3, muted
- Cursor BLINKS indefinitely (well, 4 blinks with calculated repeat count)

**Transition out:** Final scene — elements fade to black over 0.8s. Last thing visible: the blinking cursor.

---

## Recurring Motifs

- Terminal cursor blink (scenes 1, 6)
- Scan-line overlay (all scenes, varying intensity)
- Character-by-character typing (scenes 1, 2, 6)
- Accent green used only for active/important elements

## Negative Prompt

- No gradient text
- No cyan or purple — green only
- No rounded corners > 8px
- No web-UI card shadows
- No centered-everything layouts
- No Inter, Roboto, or banned fonts
- No pure #000 or #fff
