export interface EditorAppearance {
  accent: string;
  surface: string;
}

export const defaultAppearance: EditorAppearance = {
  accent: '#f3ac66',
  surface: '#17212b',
};

const key = 'protomake.appearance.v1';
const hex = /^#[0-9a-fA-F]{6}$/;

function rgb(value: string): [number, number, number] {
  const n = Number.parseInt(value.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function color(values: readonly number[]): string {
  return `#${values.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
}

function mix(a: string, b: string, amount: number): string {
  const aa = rgb(a),
    bb = rgb(b);
  return color(aa.map((v, i) => v + (bb[i]! - v) * amount));
}

function linear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(value: string): number {
  const [r, g, b] = rgb(value);
  return linear(r) * 0.2126 + linear(g) * 0.7152 + linear(b) * 0.0722;
}

function contrast(a: string, b: string): number {
  const l1 = luminance(a),
    l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function automaticText(background: string): '#101820' | '#ffffff' {
  return contrast(background, '#101820') >= contrast(background, '#ffffff')
    ? '#101820'
    : '#ffffff';
}

export function loadAppearance(): EditorAppearance {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<EditorAppearance>;
    return {
      accent: parsed.accent && hex.test(parsed.accent) ? parsed.accent : defaultAppearance.accent,
      surface: parsed.surface && hex.test(parsed.surface) ? parsed.surface : defaultAppearance.surface,
    };
  } catch {
    return { ...defaultAppearance };
  }
}

export function applyAppearance(value: EditorAppearance, persist = true): void {
  if (!hex.test(value.accent) || !hex.test(value.surface))
    throw new Error('Editor colours must be #RRGGBB values');
  const root = document.documentElement,
    darkSurface = luminance(value.surface) < 0.45,
    accentText = automaticText(value.accent),
    surfaceText = automaticText(value.surface);
  root.style.setProperty('--protomake-accent', value.accent);
  root.style.setProperty('--protomake-accent-text', accentText);
  root.style.setProperty('--protomake-surface', value.surface);
  root.style.setProperty('--protomake-surface-text', surfaceText);
  root.style.setProperty('--protomake-panel', mix(value.surface, darkSurface ? '#ffffff' : '#000000', darkSurface ? 0.06 : 0.05));
  root.style.setProperty('--protomake-panel-raised', mix(value.surface, darkSurface ? '#ffffff' : '#000000', darkSurface ? 0.11 : 0.09));
  root.style.setProperty('--protomake-control', mix(value.surface, darkSurface ? '#ffffff' : '#000000', darkSurface ? 0.15 : 0.13));
  root.style.setProperty('--protomake-border', mix(value.surface, darkSurface ? '#ffffff' : '#000000', darkSurface ? 0.24 : 0.22));
  root.style.setProperty('--protomake-muted', mix(surfaceText, value.surface, 0.38));
  root.style.colorScheme = darkSurface ? 'dark' : 'light';
  if (persist) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Preferences remain active for this session. */
    }
  }
}
