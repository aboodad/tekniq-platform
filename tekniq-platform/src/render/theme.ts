import type { ThemeTokens } from '../core/types';

const GOOGLE_FONTS = new Set(['Cairo', 'Tajawal', 'IBM Plex Sans Arabic', 'Almarai', 'Readex Pro']);
const q = (f: string) => (f === 'system-ui' ? 'system-ui' : `'${f}'`);

export function themeVars(t: ThemeTokens): Record<string, string> {
  const c = t.colors;
  return {
    '--bg': c.bg, '--surface': c.surface, '--text': c.text, '--muted': c.muted, '--primary': c.primary, '--primary-text': c.primaryText,
    '--accent': c.accent, '--border': c.border, '--sale': c.sale, '--radius': t.radius + 'px', '--container': t.container + 'px',
    '--font-h': `${q(t.fonts.heading)}, system-ui, sans-serif`, '--font-b': `${q(t.fonts.body)}, system-ui, sans-serif`,
    '--btn-radius': t.buttonShape === 'pill' ? '999px' : t.buttonShape === 'square' ? '2px' : Math.max(6, t.radius - 2) + 'px',
  };
}

// Load web fonts lazily (only fonts the store actually uses).
export function ensureFonts(t: ThemeTokens) {
  if (typeof document === 'undefined') return;
  for (const f of new Set([t.fonts.heading, t.fonts.body])) {
    if (!GOOGLE_FONTS.has(f)) continue;
    const id = 'gf-' + f.replace(/\s+/g, '-');
    if (document.getElementById(id)) continue;
    const l = document.createElement('link'); l.id = id; l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(f).replace(/%20/g, '+')}:wght@400;600;700;800&display=swap`;
    document.head.appendChild(l);
  }
}
