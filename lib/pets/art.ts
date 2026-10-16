// ============================================================
//  Arte de las mascotas de Kaderno (SVG como texto).
//
//  Una sola fuente para web y celular: en web se inyecta el SVG tal cual y
//  en nativo se pinta con SvgXml. Todo es vectorial (no hay imágenes que
//  descargar) y pesa unos pocos KB.
//
//  Cada mascota se dibuja en un lienzo de 160 x 160 y declara tres puntos de
//  anclaje (cabeza, ojos y cuello). La ropa se dibuja centrada en (0, 0) y se
//  coloca en el anclaje que le toca; así un mismo gorro le sirve a las cuatro.
// ============================================================

export type Species = 'pinguino' | 'gato' | 'perro' | 'loro';
export type Mood = 'normal' | 'feliz' | 'dormido' | 'preocupado' | 'concentrado';
export type Slot = 'cabeza' | 'ojos' | 'cuello';
export type ItemId =
  | 'gorro' | 'birrete' | 'audifonos' | 'corona' | 'boina'
  | 'gafas' | 'gafas_sol'
  | 'bufanda' | 'corbatin' | 'collar';

type Anchor = { x: number; y: number; s: number };
type SpeciesDef = {
  name: string;
  /** Moneda propia de la especie. */
  coin: { id: string; one: string; many: string };
  anchors: Record<Slot, Anchor>;
  /** Cuerpo detrás de los ojos (incluye sombra, cola, patas). */
  body: string;
  /** Lo que va delante de los ojos (pico, nariz, boca, mejillas). */
  front: string;
  eyeY: number;
  /** Color de las pupilas. */
  ink: string;
};

const INK = '#1f2433';
const CHEEK = '<ellipse cx="60" cy="{y}" rx="6" ry="3.5" fill="#ff8fa3" opacity=".55"/><ellipse cx="100" cy="{y}" rx="6" ry="3.5" fill="#ff8fa3" opacity=".55"/>';
const cheeks = (y: number) => CHEEK.replace(/\{y\}/g, String(y));
const shadow = '<ellipse cx="80" cy="150" rx="36" ry="6" fill="#000" opacity=".16"/>';

export const SPECIES: Record<Species, SpeciesDef> = {
  pinguino: {
    name: 'Pingüino',
    coin: { id: 'pescados', one: 'pescado', many: 'pescados' },
    eyeY: 68, ink: INK,
    anchors: { cabeza: { x: 80, y: 46, s: 1 }, ojos: { x: 80, y: 68, s: 1 }, cuello: { x: 80, y: 93, s: 1.02 } },
    body: shadow + `
      <ellipse cx="65" cy="144" rx="11" ry="5.5" fill="#f39c34"/><ellipse cx="95" cy="144" rx="11" ry="5.5" fill="#f39c34"/>
      <ellipse cx="38" cy="100" rx="9" ry="23" transform="rotate(22 38 100)" fill="#22304a"/>
      <ellipse cx="122" cy="100" rx="9" ry="23" transform="rotate(-22 122 100)" fill="#22304a"/>
      <ellipse cx="80" cy="94" rx="44" ry="52" fill="#2d3c5a"/>
      <ellipse cx="80" cy="108" rx="30" ry="36" fill="#f6f2ea"/>
      <path d="M80 62 C 68 44, 44 50, 47 70 C 49 86, 66 90, 80 84 C 94 90, 111 86, 113 70 C 116 50, 92 44, 80 62 Z" fill="#f6f2ea"/>
      <ellipse cx="66" cy="56" rx="12" ry="5" fill="#fff" opacity=".35"/>`,
    front: cheeks(79) + `<path d="M72 76 Q80 71 88 76 Q80 85 72 76 Z" fill="#f39c34"/><path d="M74 76.5 Q80 74 86 76.5" stroke="#c97a20" stroke-width="1.4" fill="none"/>`,
  },
  gato: {
    name: 'Gato',
    coin: { id: 'ovillos', one: 'ovillo', many: 'ovillos' },
    eyeY: 64, ink: INK,
    anchors: { cabeza: { x: 80, y: 33, s: 0.98 }, ojos: { x: 80, y: 64, s: 1 }, cuello: { x: 80, y: 103, s: 0.92 } },
    body: shadow + `
      <path d="M108 130 C 140 128, 148 98, 130 86" stroke="#e8954f" stroke-width="12" fill="none" stroke-linecap="round"/>
      <path d="M134 92 C 138 96, 140 100, 140 104" stroke="#d9823c" stroke-width="5" fill="none" stroke-linecap="round"/>
      <ellipse cx="80" cy="124" rx="31" ry="24" fill="#f2a65a"/>
      <ellipse cx="80" cy="130" rx="17" ry="15" fill="#fbe5cc"/>
      <ellipse cx="67" cy="145" rx="9" ry="5.5" fill="#fbe5cc"/><ellipse cx="93" cy="145" rx="9" ry="5.5" fill="#fbe5cc"/>
      <path d="M48 54 L43 16 L76 38 Z" fill="#f2a65a"/><path d="M52 47 L49 26 L68 39 Z" fill="#f7b9a6"/>
      <path d="M112 54 L117 16 L84 38 Z" fill="#f2a65a"/><path d="M108 47 L111 26 L92 39 Z" fill="#f7b9a6"/>
      <circle cx="80" cy="66" r="39" fill="#f2a65a"/>
      <path d="M80 29 L80 40 M70 31 L72 40 M90 31 L88 40" stroke="#d9823c" stroke-width="4" stroke-linecap="round"/>
      <ellipse cx="80" cy="84" rx="17" ry="12" fill="#fbe5cc"/>
      <ellipse cx="64" cy="48" rx="11" ry="5" fill="#fff" opacity=".25"/>`,
    front: cheeks(77) + `
      <path d="M76 77 L84 77 L80 82 Z" fill="#e86f86"/>
      <path d="M80 82 Q76 88 71 85 M80 82 Q84 88 89 85" stroke="#7a4a2a" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M58 80 L40 77 M58 84 L41 86 M102 80 L120 77 M102 84 L119 86" stroke="#7a4a2a" stroke-width="1.6" stroke-linecap="round" opacity=".55"/>`,
  },
  perro: {
    name: 'Perro',
    coin: { id: 'huesos', one: 'hueso', many: 'huesos' },
    eyeY: 63, ink: INK,
    anchors: { cabeza: { x: 80, y: 33, s: 0.98 }, ojos: { x: 80, y: 63, s: 1 }, cuello: { x: 80, y: 103, s: 0.92 } },
    body: shadow + `
      <path d="M108 122 C 128 118, 134 102, 126 92" stroke="#c98b55" stroke-width="11" fill="none" stroke-linecap="round"/>
      <ellipse cx="80" cy="124" rx="31" ry="24" fill="#dba468"/>
      <ellipse cx="80" cy="130" rx="17" ry="14" fill="#f7e6ca"/>
      <ellipse cx="67" cy="145" rx="9" ry="5.5" fill="#f7e6ca"/><ellipse cx="93" cy="145" rx="9" ry="5.5" fill="#f7e6ca"/>
      <circle cx="80" cy="66" r="38" fill="#dba468"/>
      <ellipse cx="96" cy="61" rx="12" ry="11" fill="#b97a45"/>
      <path d="M47 42 C 27 44, 25 80, 38 94 C 47 88, 52 66, 57 52 Z" fill="#9b6337"/>
      <path d="M113 42 C 133 44, 135 80, 122 94 C 113 88, 108 66, 103 52 Z" fill="#9b6337"/>
      <ellipse cx="80" cy="85" rx="19" ry="13" fill="#f7e6ca"/>
      <ellipse cx="64" cy="46" rx="11" ry="5" fill="#fff" opacity=".25"/>`,
    front: cheeks(78) + `
      <ellipse cx="80" cy="78" rx="7.5" ry="5.5" fill="#3b2a20"/><ellipse cx="78" cy="76.5" rx="2.4" ry="1.4" fill="#fff" opacity=".7"/>
      <path d="M74 88 Q80 93 86 88" stroke="#5a3a22" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M77 90 Q80 99 83 90 Z" fill="#f2788d"/>`,
  },
  loro: {
    name: 'Loro',
    coin: { id: 'semillas', one: 'semilla', many: 'semillas' },
    eyeY: 70, ink: INK,
    anchors: { cabeza: { x: 80, y: 50, s: 0.86 }, ojos: { x: 80, y: 70, s: 1 }, cuello: { x: 80, y: 108, s: 0.86 } },
    body: shadow + `
      <path d="M70 128 L60 156 L77 135 Z" fill="#3a7bd5"/><path d="M80 130 L80 158 L88 133 Z" fill="#e8483b"/><path d="M90 128 L100 154 L94 131 Z" fill="#3a7bd5"/>
      <path d="M74 52 C 64 30, 74 18, 80 40 Z" fill="#e8483b"/><path d="M80 48 C 80 22, 94 18, 88 44 Z" fill="#f39c34"/><path d="M86 52 C 96 32, 106 32, 94 54 Z" fill="#e8483b"/>
      <ellipse cx="80" cy="96" rx="37" ry="47" fill="#3fbf7f"/>
      <ellipse cx="80" cy="112" rx="22" ry="27" fill="#f6d45a"/>
      <path d="M49 84 C 37 106, 46 130, 64 134 C 59 114, 60 98, 49 84 Z" fill="#2f9c66"/>
      <path d="M111 84 C 123 106, 114 130, 96 134 C 101 114, 100 98, 111 84 Z" fill="#2f9c66"/>
      <circle cx="66" cy="70" r="10.5" fill="#fff"/><circle cx="94" cy="70" r="10.5" fill="#fff"/>
      <ellipse cx="72" cy="140" rx="5" ry="3.5" fill="#8a8f99"/><ellipse cx="88" cy="140" rx="5" ry="3.5" fill="#8a8f99"/>
      <ellipse cx="64" cy="58" rx="11" ry="5" fill="#fff" opacity=".25"/>`,
    front: `
      <path d="M71 79 C 72 70, 90 70, 91 80 C 90 91, 83 97, 78 99 C 80 91, 78 85, 71 79 Z" fill="#f2b33d"/>
      <path d="M73 85 C 75 93, 80 95, 82 93 C 80 89, 78 87, 73 85 Z" fill="#c98a1e"/>
      <ellipse cx="77" cy="76" rx="4" ry="1.6" fill="#fff" opacity=".5"/>`,
  },
};

// ---------- Ojos según el ánimo ----------

function eyes(def: SpeciesDef, mood: Mood): string {
  const y = def.eyeY;
  const L = 66, R = 94;
  switch (mood) {
    case 'feliz':
      return `<path d="M${L - 6} ${y + 2} Q${L} ${y - 6} ${L + 6} ${y + 2} M${R - 6} ${y + 2} Q${R} ${y - 6} ${R + 6} ${y + 2}" stroke="${def.ink}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
    case 'dormido':
      return `<path d="M${L - 6} ${y} Q${L} ${y + 5} ${L + 6} ${y} M${R - 6} ${y} Q${R} ${y + 5} ${R + 6} ${y}" stroke="${def.ink}" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    case 'concentrado':
      return `<g class="pet-eyes"><ellipse cx="${L}" cy="${y + 1}" rx="5.2" ry="4" fill="${def.ink}"/><ellipse cx="${R}" cy="${y + 1}" rx="5.2" ry="4" fill="${def.ink}"/></g>
        <path d="M${L - 7} ${y - 8} L${L + 5} ${y - 6} M${R + 7} ${y - 8} L${R - 5} ${y - 6}" stroke="${def.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    case 'preocupado':
      return `<g class="pet-eyes"><ellipse cx="${L}" cy="${y}" rx="5" ry="6" fill="${def.ink}"/><ellipse cx="${R}" cy="${y}" rx="5" ry="6" fill="${def.ink}"/>
        <circle cx="${L + 1.8}" cy="${y - 2.2}" r="1.9" fill="#fff"/><circle cx="${R + 1.8}" cy="${y - 2.2}" r="1.9" fill="#fff"/></g>
        <path d="M${L - 7} ${y - 9} L${L + 4} ${y - 12} M${R + 7} ${y - 9} L${R - 4} ${y - 12}" stroke="${def.ink}" stroke-width="2.6" stroke-linecap="round"/>`;
    default:
      return `<g class="pet-eyes"><ellipse cx="${L}" cy="${y}" rx="5" ry="6" fill="${def.ink}"/><ellipse cx="${R}" cy="${y}" rx="5" ry="6" fill="${def.ink}"/>
        <circle cx="${L + 1.8}" cy="${y - 2.2}" r="1.9" fill="#fff"/><circle cx="${R + 1.8}" cy="${y - 2.2}" r="1.9" fill="#fff"/></g>`;
  }
}

// ---------- Ropa (centrada en 0,0) ----------

export const ITEMS: Record<ItemId, { name: string; slot: Slot; svg: string; behindEars?: boolean }> = {
  gorro: {
    name: 'Gorro de lana', slot: 'cabeza',
    svg: `<path d="M-31 6 C -33 -30, 33 -30, 31 6 Z" fill="#e8483b"/>
      <path d="M-14 -20 C -10 -8, -12 0, -14 6 M0 -24 L0 6 M14 -20 C 10 -8, 12 0, 14 6" stroke="#c63a2f" stroke-width="2.5" fill="none" opacity=".6"/>
      <rect x="-35" y="0" width="70" height="12" rx="6" fill="#c63a2f"/><circle cx="0" cy="-27" r="8" fill="#fff"/>`,
  },
  birrete: {
    name: 'Birrete de graduación', slot: 'cabeza',
    svg: `<path d="M-21 -4 L21 -4 L19 12 C 8 16, -8 16, -19 12 Z" fill="#1d2638"/>
      <path d="M-42 -9 L0 -23 L42 -9 L0 5 Z" fill="#2b3752"/><path d="M-42 -9 L0 5 L42 -9 L42 -6 L0 8 L-42 -6 Z" fill="#1d2638"/>
      <circle cx="0" cy="-9" r="3" fill="#f2c14e"/><path d="M0 -9 L30 -6 L33 14" stroke="#f2c14e" stroke-width="2.4" fill="none"/>
      <path d="M30 13 L36 13 L34 24 L32 24 Z" fill="#f2c14e"/>`,
  },
  audifonos: {
    name: 'Audífonos', slot: 'cabeza',
    svg: `<path d="M-38 30 C -40 -22, 40 -22, 38 30" stroke="#2a2f3d" stroke-width="7" fill="none" stroke-linecap="round"/>
      <rect x="-48" y="18" width="16" height="26" rx="7" fill="#3a7bd5"/><rect x="32" y="18" width="16" height="26" rx="7" fill="#3a7bd5"/>
      <rect x="-44" y="22" width="6" height="18" rx="3" fill="#fff" opacity=".35"/>`,
  },
  corona: {
    name: 'Corona', slot: 'cabeza',
    svg: `<path d="M-26 8 L-30 -20 L-14 -6 L0 -26 L14 -6 L30 -20 L26 8 Z" fill="#f2c14e" stroke="#d49a1f" stroke-width="2" stroke-linejoin="round"/>
      <circle cx="0" cy="-26" r="3.5" fill="#e8483b"/><circle cx="-30" cy="-20" r="3" fill="#3a7bd5"/><circle cx="30" cy="-20" r="3" fill="#3a7bd5"/>
      <rect x="-27" y="2" width="54" height="7" rx="2" fill="#d49a1f"/>`,
  },
  boina: {
    name: 'Boina de artista', slot: 'cabeza',
    svg: `<ellipse cx="-4" cy="-4" rx="38" ry="14" fill="#8b5cf6"/><ellipse cx="0" cy="4" rx="28" ry="6" fill="#6d3fd6"/>
      <path d="M-4 -18 L-2 -26" stroke="#6d3fd6" stroke-width="4" stroke-linecap="round"/>`,
  },
  gafas: {
    name: 'Gafas de estudio', slot: 'ojos',
    svg: `<circle cx="-14" cy="0" r="10.5" fill="#fff" fill-opacity=".18" stroke="#2a2f3d" stroke-width="3"/>
      <circle cx="14" cy="0" r="10.5" fill="#fff" fill-opacity=".18" stroke="#2a2f3d" stroke-width="3"/>
      <path d="M-3.5 -1 Q0 -4 3.5 -1" stroke="#2a2f3d" stroke-width="3" fill="none"/>
      <path d="M-18 -5 L-12 -7" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>`,
  },
  gafas_sol: {
    name: 'Gafas de sol', slot: 'ojos',
    svg: `<path d="M-26 -6 L-3 -6 L-5 6 C -7 11, -21 11, -24 6 Z" fill="#1f2433"/>
      <path d="M26 -6 L3 -6 L5 6 C 7 11, 21 11, 24 6 Z" fill="#1f2433"/>
      <path d="M-3 -4 L3 -4" stroke="#1f2433" stroke-width="3"/>
      <path d="M-20 -3 L-12 -3" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".55"/>`,
  },
  bufanda: {
    name: 'Bufanda', slot: 'cuello',
    svg: `<path d="M-31 -7 C -10 3, 10 3, 31 -7 L31 7 C 10 17, -10 17, -31 7 Z" fill="#3a7bd5"/>
      <path d="M12 6 L25 5 L23 32 L10 30 Z" fill="#3a7bd5"/>
      <path d="M-20 -1 L-20 11 M-8 2 L-8 14 M4 2 L4 14 M16 -1 L16 11" stroke="#fff" stroke-width="2.5" opacity=".45"/>
      <path d="M11 22 L24 23 M11 27 L23 28" stroke="#fff" stroke-width="2.5" opacity=".45"/>`,
  },
  corbatin: {
    name: 'Corbatín', slot: 'cuello',
    svg: `<path d="M-2 0 L-18 -9 L-18 9 Z" fill="#e8483b"/><path d="M2 0 L18 -9 L18 9 Z" fill="#e8483b"/>
      <rect x="-5" y="-5" width="10" height="10" rx="3" fill="#c63a2f"/>`,
  },
  collar: {
    name: 'Collar con placa', slot: 'cuello',
    svg: `<path d="M-30 -6 C -10 4, 10 4, 30 -6" stroke="#e8483b" stroke-width="6" fill="none" stroke-linecap="round"/>
      <circle cx="0" cy="8" r="7" fill="#f2c14e" stroke="#d49a1f" stroke-width="1.5"/><path d="M-3 8 L3 8" stroke="#d49a1f" stroke-width="1.5"/>`,
  },
};

const place = (a: Anchor, svg: string) => `<g transform="translate(${a.x} ${a.y}) scale(${a.s})">${svg}</g>`;

export type Outfit = Partial<Record<Slot, ItemId | null>>;

/**
 * SVG completo de una mascota. `animated` agrega las clases para respirar y
 * parpadear (las animaciones viven en lib/motion.ts).
 */
export function petSvg(species: Species, opts: { mood?: Mood; outfit?: Outfit; size?: number; animated?: boolean } = {}): string {
  const def = SPECIES[species];
  const mood = opts.mood ?? 'normal';
  const outfit = opts.outfit ?? {};
  const size = opts.size ?? 160;
  const wear = (slot: Slot) => {
    const id = outfit[slot];
    return id && ITEMS[id] && ITEMS[id].slot === slot ? place(def.anchors[slot], ITEMS[id].svg) : '';
  };
  const zzz = mood === 'dormido'
    ? `<g class="pet-zzz" fill="#8b93a7" font-family="system-ui, sans-serif" font-weight="800"><text x="118" y="40" font-size="14">z</text><text x="128" y="28" font-size="11">z</text></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="${size}" height="${size}" class="pet pet-${species} mood-${mood}${opts.animated ? ' pet-anim' : ''}">`
    + `<g class="pet-body">${def.body}${wear('cuello')}${eyes(def, mood)}${def.front}${wear('ojos')}${wear('cabeza')}</g>${zzz}</svg>`;
}

/** Ícono de la moneda de cada especie (24 x 24). */
export function coinSvg(species: Species, size = 18): string {
  const box = (inner: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${inner}</svg>`;
  switch (species) {
    case 'pinguino': // pescado
      return box(`<path d="M3 12 C 7 5, 15 5, 18 12 C 15 19, 7 19, 3 12 Z" fill="#5aa9e6"/><path d="M18 12 L23 7 L22 12 L23 17 Z" fill="#3a7bd5"/><circle cx="7.5" cy="11" r="1.4" fill="#1f2433"/>`);
    case 'gato': // ovillo
      return box(`<circle cx="12" cy="12" r="9" fill="#e86f86"/><path d="M5 9 C 10 11, 14 11, 19 8 M4 13 C 10 15, 15 15, 20 12 M6 17 C 11 18, 15 18, 18 16" stroke="#fff" stroke-width="1.4" fill="none" opacity=".7"/><path d="M19 15 C 22 18, 21 21, 18 22" stroke="#e86f86" stroke-width="1.6" fill="none"/>`);
    case 'perro': // hueso
      return box(`<path d="M7 9 L17 15" stroke="#f3ead8" stroke-width="5" stroke-linecap="round"/><circle cx="5.5" cy="7" r="3" fill="#f3ead8"/><circle cx="8" cy="5.5" r="3" fill="#f3ead8"/><circle cx="16" cy="18.5" r="3" fill="#f3ead8"/><circle cx="18.5" cy="17" r="3" fill="#f3ead8"/>`);
    case 'loro': // semilla de girasol
      return box(`<path d="M12 2 C 18 7, 18 17, 12 22 C 6 17, 6 7, 12 2 Z" fill="#8a6d4b"/><path d="M12 4 C 15 8, 15 16, 12 20" stroke="#e6e1d3" stroke-width="1.6" fill="none"/><path d="M10 6 C 9 10, 9 14, 10 18" stroke="#e6e1d3" stroke-width="1" fill="none" opacity=".6"/>`);
  }
}
