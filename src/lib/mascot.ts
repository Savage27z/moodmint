/**
 * Moodmint mascot renderer.
 *
 * The artwork is not stored anywhere. It is drawn from market + network state
 * every time it is requested, so the same NFT looks different as conditions
 * change. Pure function: same inputs always produce the same SVG.
 *
 * Pixel maps are hand-authored on a 16x16 grid. Legend:
 *   .  transparent      o  outline        b  body
 *   l  belly / light    e  eye highlight  m  mouth
 *   f  foot             a  accent (blush, sparkle)
 */

export type Mood = "euphoric" | "happy" | "calm" | "nervous" | "wrecked";

export interface MascotState {
  mood: Mood;
  /** 24h price change, percent. */
  changePct: number;
  /** Spot price in USD. */
  price: number;
  /** Solana slot the render was keyed to. */
  slot: number;
  /** Minutes since mint. Drives the age badge. */
  ageMinutes: number;
  /** Stable per-mint seed so two mascots in the same mood still differ. */
  seed: number;
}

const BASE: string[] = [
  "................",
  "...oo......oo...",
  "..obbo....obbo..",
  "..obbbbbbbbbbo..",
  ".obbbbbbbbbbbbo.",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  "obbbbbbbbbbbbbbo",
  ".obbbbbbbbbbbbo.",
  ".obbbbbbbbbbbbo.",
  "..obbbbbbbbbbo..",
  "...obbbbbbbbo...",
  "....ff....ff....",
];

/** Rows 7 and 8 are the eyes, rows 9 and 10 the mouth. */
const FACES: Record<Mood, { r7: string; r8: string; r9: string; r10: string }> = {
  euphoric: {
    r7: "obbbbbbbbbbbbbbo",
    r8: "obbboobbbboobbbo",
    r9: "obbbbbbmmbbbbbbo",
    r10: "obbbbboooobbbbbo",
  },
  happy: {
    r7: "obbboobbbboobbbo",
    r8: "obbbeobbbbeobbbo",
    r9: "obbbbbobbobbbbbo",
    r10: "obbbbbbmmbbbbbbo",
  },
  calm: {
    r7: "obbboobbbboobbbo",
    r8: "obbbeobbbbeobbbo",
    r9: "obbbbbbbbbbbbbbo",
    r10: "obbbbbboobbbbbbo",
  },
  nervous: {
    r7: "obbboobbbbobbbbo",
    r8: "obbbobbbbbbbbbbo",
    r9: "obbbbbbbbbbbbbbo",
    r10: "obbbbbbombbbbbbo",
  },
  wrecked: {
    r7: "obbbbbbbbbbbbbbo",
    r8: "obbboobbbboobbbo",
    r9: "obbbbbbmmbbbbbbo",
    r10: "obbbbbbbbbbbbbbo",
  },
};

interface Palette {
  o: string; b: string; l: string; e: string; m: string; f: string; a: string;
  bg0: string; bg1: string; glow: string; ink: string;
}

const PALETTES: Record<Mood, Palette> = {
  euphoric: {
    o: "#0a2e1c", b: "#5ef2a0", l: "#c8ffe0", e: "#ffffff", m: "#0a2e1c",
    f: "#2bbf74", a: "#ffd84d", bg0: "#0d3a24", bg1: "#061a12", glow: "#5ef2a0", ink: "#c8ffe0",
  },
  happy: {
    o: "#123024", b: "#8fe6a8", l: "#d9fbe4", e: "#ffffff", m: "#123024",
    f: "#4fb47a", a: "#ffc9d4", bg0: "#123a2a", bg1: "#07170f", glow: "#8fe6a8", ink: "#d9fbe4",
  },
  calm: {
    o: "#1b2440", b: "#9fb2f0", l: "#e2e8ff", e: "#ffffff", m: "#1b2440",
    f: "#6a7fd0", a: "#ffd3e2", bg0: "#1a2245", bg1: "#0a0e1f", glow: "#9fb2f0", ink: "#e2e8ff",
  },
  nervous: {
    o: "#3a2c12", b: "#f0cf7a", l: "#fdf0cf", e: "#ffffff", m: "#3a2c12",
    f: "#c9a24d", a: "#7fd4ff", bg0: "#3a2e14", bg1: "#1a1408", glow: "#f0cf7a", ink: "#fdf0cf",
  },
  wrecked: {
    o: "#2a1430", b: "#a98fc4", l: "#ded1ea", e: "#ffffff", m: "#2a1430",
    f: "#7a5f93", a: "#ff6b8a", bg0: "#2b1636", bg1: "#100818", glow: "#a98fc4", ink: "#ded1ea",
  },
};

const MOOD_COPY: Record<Mood, string> = {
  euphoric: "EUPHORIC",
  happy: "PLEASED",
  calm: "UNBOTHERED",
  nervous: "NERVOUS",
  wrecked: "WRECKED",
};

/** Mood is derived only from the 24h move. The thresholds are published in the UI. */
export function moodFromChange(changePct: number): Mood {
  if (changePct >= 6) return "euphoric";
  if (changePct >= 1.5) return "happy";
  if (changePct > -1.5) return "calm";
  if (changePct > -6) return "nervous";
  return "wrecked";
}

export function moodLabel(mood: Mood): string {
  return MOOD_COPY[mood];
}

/** Deterministic PRNG so a given seed always renders identically. */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

function grid(mood: Mood): string[] {
  const face = FACES[mood];
  const rows = [...BASE];
  rows[7] = face.r7;
  rows[8] = face.r8;
  rows[9] = face.r9;
  rows[10] = face.r10;
  return rows;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderMascot(state: MascotState): string {
  const { mood, changePct, price, slot, ageMinutes, seed } = state;
  const p = PALETTES[mood];
  const rows = grid(mood);
  const rand = rng(seed);

  const CELL = 18;
  const ART = CELL * 16; // 288
  const W = 360;
  const H = 440;
  const offsetX = (W - ART) / 2;
  const offsetY = 74;

  const px: string[] = [];
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const ch = rows[y][x];
      if (ch === ".") continue;
      const fill =
        ch === "o" ? p.o : ch === "b" ? p.b : ch === "l" ? p.l :
        ch === "e" ? p.e : ch === "m" ? p.m : ch === "f" ? p.f : p.a;
      px.push(
        `<rect x="${offsetX + x * CELL}" y="${offsetY + y * CELL}" width="${CELL}" height="${CELL}" fill="${fill}"/>`
      );
    }
  }

  // Blush sits on the cheeks only when the mascot is actually happy about it.
  if (mood === "happy") {
    for (const cx of [2.2, 11.8]) {
      px.push(
        `<rect x="${offsetX + cx * CELL}" y="${offsetY + 9 * CELL}" width="${CELL * 1.6}" height="${CELL * 0.8}" fill="${p.a}" opacity="0.45"/>`
      );
    }
  }

  // Mood-specific weather. Sparkles when up, rain when down, one sweat bead when nervous.
  const fx: string[] = [];
  if (mood === "euphoric" || mood === "happy") {
    const n = mood === "euphoric" ? 9 : 5;
    for (let i = 0; i < n; i++) {
      const sx = offsetX + rand() * ART;
      const sy = offsetY + rand() * ART * 0.75;
      const s = CELL * (0.28 + rand() * 0.3);
      const dur = (1.6 + rand() * 1.8).toFixed(2);
      fx.push(
        `<g opacity="0.9"><rect x="${sx.toFixed(1)}" y="${sy.toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${p.a}" transform="rotate(45 ${(sx + s / 2).toFixed(1)} ${(sy + s / 2).toFixed(1)})"><animate attributeName="opacity" values="0;1;0" dur="${dur}s" repeatCount="indefinite"/></rect></g>`
      );
    }
  }
  if (mood === "wrecked") {
    for (let i = 0; i < 14; i++) {
      const sx = offsetX + rand() * ART;
      const delay = (rand() * 2).toFixed(2);
      fx.push(
        `<rect x="${sx.toFixed(1)}" y="${offsetY}" width="2.5" height="${CELL * 0.8}" fill="${p.a}" opacity="0.5"><animate attributeName="y" values="${offsetY};${offsetY + ART}" dur="1.5s" begin="${delay}s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0" dur="1.5s" begin="${delay}s" repeatCount="indefinite"/></rect>`
      );
    }
  }
  if (mood === "nervous") {
    fx.push(
      `<rect x="${offsetX + 12.4 * CELL}" y="${offsetY + 6.2 * CELL}" width="${CELL * 0.5}" height="${CELL * 0.8}" fill="${p.a}" opacity="0.9"><animate attributeName="y" values="${offsetY + 6.2 * CELL};${offsetY + 9 * CELL}" dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.9;0" dur="2.2s" repeatCount="indefinite"/></rect>`
    );
  }

  // A small crown appears once a mascot has been held a while.
  const veteran = ageMinutes >= 60;
  const crown = veteran
    ? `<g>${[0, 1, 2].map((i) => `<rect x="${offsetX + (5 + i * 2.5) * CELL}" y="${offsetY - CELL * 0.9}" width="${CELL * 0.9}" height="${CELL * 0.9}" fill="${p.a}"/>`).join("")}<rect x="${offsetX + 5 * CELL}" y="${offsetY - CELL * 0.2}" width="${CELL * 6.4}" height="${CELL * 0.45}" fill="${p.a}"/></g>`
    : "";

  const up = changePct >= 0;
  const changeStr = `${up ? "+" : ""}${changePct.toFixed(2)}%`;
  const priceStr = `$${price.toFixed(2)}`;

  // Breathing: the whole creature drifts a few pixels, faster when agitated.
  const breath = mood === "wrecked" || mood === "nervous" ? "1.1s" : "2.6s";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" font-family="ui-monospace, SFMono-Regular, Menlo, monospace">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="72%">
      <stop offset="0%" stop-color="${p.bg0}"/>
      <stop offset="100%" stop-color="${p.bg1}"/>
    </radialGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="10" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <g opacity="0.07">
    ${Array.from({ length: Math.floor(H / 4) }, (_, i) => `<rect x="0" y="${i * 4}" width="${W}" height="1" fill="${p.ink}"/>`).join("")}
  </g>

  <text x="24" y="38" fill="${p.ink}" font-size="13" letter-spacing="3" opacity="0.75">MOODMINT</text>
  <text x="${W - 24}" y="38" fill="${p.ink}" font-size="13" text-anchor="end" opacity="0.75">SOL ${esc(priceStr)}</text>

  <ellipse cx="${W / 2}" cy="${offsetY + ART - CELL * 0.6}" rx="${ART * 0.3}" ry="${CELL * 0.6}" fill="${p.o}" opacity="0.35"/>

  <g filter="url(#glow)" opacity="0.55">
    <circle cx="${W / 2}" cy="${offsetY + ART / 2}" r="${ART * 0.34}" fill="${p.glow}" opacity="0.18"/>
  </g>

  <g>
    <animateTransform attributeName="transform" type="translate" values="0 0; 0 -3; 0 0" dur="${breath}" repeatCount="indefinite"/>
    ${crown}
    ${px.join("")}
  </g>

  ${fx.join("")}

  <text x="${W / 2}" y="${H - 58}" fill="${p.ink}" font-size="26" text-anchor="middle" letter-spacing="4">${esc(moodLabel(mood))}</text>
  <text x="${W / 2}" y="${H - 34}" fill="${up ? p.glow : p.a}" font-size="15" text-anchor="middle" letter-spacing="1">${esc(changeStr)} / 24H</text>
  <text x="${W / 2}" y="${H - 14}" fill="${p.ink}" font-size="10" text-anchor="middle" opacity="0.5">SLOT ${slot}${veteran ? " . VETERAN" : ""}</text>
</svg>`;
}
