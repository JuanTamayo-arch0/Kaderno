// ============================================================
//  La casa de la mascota: un cuarto en pixel art (120 x 64 píxeles).
//
//  Capas: papel de pared, zócalo, piso, ventana (con lo que se ve afuera según
//  la hora), el escritorio de siempre y los muebles comprados. La mascota se
//  dibuja aparte, encima (components/pets/PetRoom.tsx).
//  Cada mascota tiene su propia casa: lo comprado y elegido vive en pets.home.
// ============================================================

export const ROOM_W = 120;
export const ROOM_H = 64;
/** Fila donde empieza el piso. */
export const FLOOR_Y = 48;
/** Dónde se para la mascota (píxel del cuarto bajo sus pies, centro en x). */
export const PET_SPOT = { x: 60, y: 62 };

export type HomeSlot = 'papel' | 'piso' | 'vista' | 'mueble';
export type HomeItemId =
  | 'papel_rayas' | 'papel_ladrillo' | 'papel_madera' | 'papel_estrellas'
  | 'piso_baldosa' | 'piso_alfombrado' | 'piso_marmol'
  | 'vista_montanas' | 'vista_playa' | 'vista_espacio'
  | 'lampara' | 'planta' | 'alfombra' | 'cuadro' | 'estante' | 'cojin';
export type Home = Partial<Record<'papel' | 'piso' | 'vista', HomeItemId | null> & Record<string, unknown>>;

export const HOME_ITEMS: Record<HomeItemId, { name: string; short: string; slot: HomeSlot; price: number; level: number }> = {
  papel_rayas: { name: 'Papel a rayas', short: 'Rayas', slot: 'papel', price: 80, level: 1 },
  papel_ladrillo: { name: 'Pared de ladrillo', short: 'Ladrillo', slot: 'papel', price: 120, level: 1 },
  papel_madera: { name: 'Paneles de madera', short: 'Madera', slot: 'papel', price: 200, level: 2 },
  papel_estrellas: { name: 'Papel de estrellas', short: 'Estrellas', slot: 'papel', price: 250, level: 3 },
  piso_baldosa: { name: 'Piso de baldosa', short: 'Baldosa', slot: 'piso', price: 80, level: 1 },
  piso_alfombrado: { name: 'Piso alfombrado', short: 'Alfombrado', slot: 'piso', price: 120, level: 1 },
  piso_marmol: { name: 'Piso de mármol', short: 'Mármol', slot: 'piso', price: 250, level: 3 },
  vista_montanas: { name: 'Vista a las montañas', short: 'Montañas', slot: 'vista', price: 150, level: 1 },
  vista_playa: { name: 'Vista a la playa', short: 'Playa', slot: 'vista', price: 200, level: 2 },
  vista_espacio: { name: 'Vista al espacio', short: 'Espacio', slot: 'vista', price: 400, level: 5 },
  lampara: { name: 'Lámpara de escritorio', short: 'Lámpara', slot: 'mueble', price: 60, level: 1 },
  cojin: { name: 'Cojín', short: 'Cojín', slot: 'mueble', price: 60, level: 1 },
  planta: { name: 'Planta', short: 'Planta', slot: 'mueble', price: 70, level: 1 },
  alfombra: { name: 'Alfombra', short: 'Alfombra', slot: 'mueble', price: 90, level: 1 },
  cuadro: { name: 'Cuadro', short: 'Cuadro', slot: 'mueble', price: 100, level: 1 },
  estante: { name: 'Estante con libros', short: 'Estante', slot: 'mueble', price: 120, level: 1 },
};
export const HOME_ORDER = (Object.keys(HOME_ITEMS) as HomeItemId[]);
export const HOME_DEFAULT_NAMES: Record<'papel' | 'piso' | 'vista', string> = { papel: 'Pared lisa', piso: 'Piso de madera', vista: 'Vista a la ciudad' };
export const HOME_DEFAULT_SHORT: Record<'papel' | 'piso' | 'vista', string> = { papel: 'Lisa', piso: 'Madera', vista: 'Ciudad' };

export type DayPart = 'dia' | 'tarde' | 'noche';
export function dayPart(hour: number): DayPart { return hour >= 6 && hour < 17 ? 'dia' : hour >= 17 && hour < 19 ? 'tarde' : 'noche'; }

/** ¿Está puesta esta cosa en la casa? */
export function homeHas(home: Home, id: HomeItemId): boolean {
  const it = HOME_ITEMS[id];
  return it.slot === 'mueble' ? home[id] === true : home[it.slot] === id;
}

// ---------- Dibujo ----------
type Grid = (string | null)[][];
// El cuarto puede ser más ancho que 120 (para llenar pantallas anchas sin
// recortar ni estirar): la pared y el piso siguen y los muebles quedan al centro.
let GW = ROOM_W;  // ancho de la cuadrícula actual
let OX = 0;       // corrimiento de los muebles
const blank = (): Grid => Array.from({ length: ROOM_H }, () => Array<string | null>(GW).fill(null));
/** Píxel sin corrimiento (pared y piso). */
function pxa(g: Grid, x: number, y: number, c: string | null) { if (c && x >= 0 && y >= 0 && x < GW && y < ROOM_H) g[y][x] = c; }
/** Píxel de un objeto (va corrido al centro). */
function px(g: Grid, x: number, y: number, c: string | null) { pxa(g, x + OX, y, c); }
function rect(g: Grid, x: number, y: number, w: number, h: number, c: string) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, c); }
function sprite(g: Grid, x: number, y: number, rows: string[], pal: Record<string, string>) {
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (ch !== '.') px(g, x + i, y + j, pal[ch]); }));
}
/** Pseudoazar fijo por posición (para estrellas y motas). */
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 997;

function wall(g: Grid, id: Home['papel']) {
  for (let y = 0; y < FLOOR_Y - 2; y++) for (let x = 0; x < GW; x++) {
    let c: string;
    switch (id) {
      case 'papel_rayas': c = Math.floor(x / 4) % 2 ? '#5d7f8f' : '#557684'; break;
      case 'papel_ladrillo': {
        const row = Math.floor(y / 4), off = row % 2 ? 4 : 0;
        c = y % 4 === 3 || (x + off) % 8 === 0 ? '#6b3a2f' : ((x + off) >> 3) % 3 === 0 ? '#93503d' : '#8a4a39';
        break;
      }
      case 'papel_madera': c = x % 8 === 0 ? '#5e4430' : (x >> 3) % 2 ? '#8a6748' : '#7f5f42'; if (y === 30 || y === 31) c = '#5e4430'; break;
      case 'papel_estrellas': { const h = hash(x, y); c = h < 8 ? '#f2e6a0' : h < 12 ? '#9aa6d8' : '#2a3358'; break; }
      default: c = y < 3 ? '#4f5c7c' : '#465372';
    }
    pxa(g, x, y, c);
  }
  for (let x = 0; x < GW; x++) { pxa(g, x, FLOOR_Y - 2, '#2b2433'); pxa(g, x, FLOOR_Y - 1, '#2b2433'); } // zócalo
}

function floor(g: Grid, id: Home['piso']) {
  for (let y = FLOOR_Y; y < ROOM_H; y++) for (let x = 0; x < GW; x++) {
    let c: string;
    const yy = y - FLOOR_Y;
    switch (id) {
      case 'piso_baldosa': c = (Math.floor(x / 6) + Math.floor(yy / 5)) % 2 ? '#cfc8b8' : '#b3ab99'; break;
      case 'piso_alfombrado': c = hash(x, y) < 60 ? '#5d4469' : '#6c5079'; break;
      case 'piso_marmol': c = (x + yy * 2) % 17 === 0 || (x - yy) % 23 === 0 ? '#c4c0d2' : '#e6e4ee'; break;
      default: {
        const row = Math.floor(yy / 3), off = (row * 11) % 24;
        c = yy % 3 === 2 || (x + off) % 24 === 0 ? '#6a4529' : row % 2 ? '#8b5e3c' : '#83583a';
      }
    }
    pxa(g, x, y, c);
  }
}

const SKY: Record<DayPart, [string, string]> = { dia: ['#8fd3ff', '#cdeeff'], tarde: ['#ff9f6e', '#ffd08a'], noche: ['#151c40', '#28356b'] };

function windowView(g: Grid, vista: Home['vista'], part: DayPart) {
  const X = 10, Y = 8, W = 28, H = 24;
  const ix = X + 2, iy = Y + 2, iw = W - 4, ih = H - 4;
  const night = part === 'noche' || vista === 'vista_espacio';
  // Cielo
  for (let j = 0; j < ih; j++) for (let i = 0; i < iw; i++) {
    const [top, bot] = vista === 'vista_espacio' ? ['#05060f', '#0e1230'] : SKY[part];
    px(g, ix + i, iy + j, j < ih / 2 ? top : bot);
    if (night && hash(ix + i, iy + j) < 18 && j < ih - 6) px(g, ix + i, iy + j, '#f4f1d0');
  }
  const sunC = night ? '#f1ecc8' : part === 'tarde' ? '#ffeb99' : '#fff3a6';
  switch (vista) {
    case 'vista_montanas': {
      sprite(g, ix + 14, iy + 2, ['.oo.', 'oooo', 'oooo', '.oo.'], { o: sunC });
      for (let i = 0; i < iw; i++) {
        const h1 = Math.max(0, 9 - Math.abs(i - 6)), h2 = Math.max(0, 11 - Math.abs(i - 15));
        for (let j = 0; j < Math.max(h1, h2); j++) {
          const y = iy + ih - 1 - j, peak = Math.max(h1, h2) - j <= 2;
          px(g, ix + i, y, peak && Math.max(h1, h2) > 7 ? '#f2f4f8' : night ? '#2d3b5c' : h2 >= h1 ? '#5b7f6b' : '#6f9a7d');
        }
      }
      rect(g, ix, iy + ih - 2, iw, 2, night ? '#1f3b2c' : '#4f8a4a');
      break;
    }
    case 'vista_playa': {
      sprite(g, ix + 4, iy + 2, ['.oo.', 'oooo', 'oooo', '.oo.'], { o: sunC });
      rect(g, ix, iy + 10, iw, 4, night ? '#1d3a6b' : '#3a8fd5');
      for (let i = 0; i < iw; i += 3) px(g, ix + i, iy + 11, night ? '#2c4f86' : '#bfe6ff');
      rect(g, ix, iy + 14, iw, ih - 14, night ? '#8a7a55' : '#f2d796');
      break;
    }
    case 'vista_espacio': {
      sprite(g, ix + 11, iy + 5, ['...oooo...', '..oPPPPo..', 'rrrrrrrrrr', '..oPPPPo..', '...oooo...'], { o: '#c77dff', P: '#a35be0', r: '#f2c14e' });
      px(g, ix + 3, iy + 12, '#ffffff'); px(g, ix + 18, iy + 14, '#ffffff');
      break;
    }
    default: { // ciudad
      sprite(g, ix + 16, iy + 1, ['.oo.', 'oooo', 'oooo', '.oo.'], { o: sunC });
      const bs = [[0, 8, 5], [5, 12, 4], [9, 6, 5], [14, 10, 4], [18, 7, 4]];
      for (const [bx, bh, bw] of bs) {
        rect(g, ix + bx, iy + ih - bh, bw, bh, night ? '#252a3d' : '#5a6380');
        for (let j = 2; j < bh - 1; j += 2) for (let i = 1; i < bw - 1; i += 2) {
          if (night ? hash(bx + i, j) % 3 === 0 : hash(bx + i, j) % 5 === 0) px(g, ix + bx + i, iy + ih - bh + j, night ? '#ffd56b' : '#a8c4e6');
        }
      }
    }
  }
  // Marco, cruz y repisa
  for (let i = 0; i < W; i++) { px(g, X + i, Y, '#e9dcc0'); px(g, X + i, Y + 1, '#d6c6a4'); px(g, X + i, Y + H - 1, '#e9dcc0'); px(g, X + i, Y + H - 2, '#d6c6a4'); }
  for (let j = 0; j < H; j++) { px(g, X, Y + j, '#e9dcc0'); px(g, X + 1, Y + j, '#d6c6a4'); px(g, X + W - 1, Y + j, '#e9dcc0'); px(g, X + W - 2, Y + j, '#d6c6a4'); }
  for (let j = 2; j < H - 2; j++) px(g, X + W / 2, Y + j, '#d6c6a4');
  for (let i = 2; i < W - 2; i++) px(g, X + i, Y + H / 2, '#d6c6a4');
  rect(g, X - 2, Y + H, W + 4, 2, '#cbb894');
}

function desk(g: Grid) {
  rect(g, 78, 38, 40, 3, '#9c6b43');     // tabla
  rect(g, 78, 41, 40, 1, '#6e4a2c');
  rect(g, 80, 42, 3, 10, '#7a5233');     // patas
  rect(g, 113, 42, 3, 10, '#7a5233');
  rect(g, 97, 42, 16, 6, '#8a5d3a');     // cajón
  px(g, 104, 44, '#e0c08a');
  // libros y una taza sobre el escritorio
  rect(g, 82, 33, 3, 5, '#e8483b'); rect(g, 85, 34, 3, 4, '#3a7bd5'); rect(g, 88, 32, 2, 6, '#37c98b');
  sprite(g, 93, 34, ['www.', 'wwwb', 'www.', '.ww.'], { w: '#f6f2ea', b: '#d8d1c3' });
}

const FURN: Record<string, (g: Grid, night: boolean) => void> = {
  estante: (g) => {
    rect(g, 46, 25, 20, 2, '#6e4a2c');
    rect(g, 47, 27, 2, 2, '#5a3c24'); rect(g, 63, 27, 2, 2, '#5a3c24');
    const books = ['#e8483b', '#f2c14e', '#3a7bd5', '#37c98b', '#8b5cf6', '#e86f86', '#f39c34'];
    let x = 47;
    for (let i = 0; i < 7; i++) { const h = 6 + (i % 3); rect(g, x, 25 - h, 2, h, books[i]); x += 2; }
    rect(g, x + 1, 21, 3, 4, '#d6c6a4');
  },
  cuadro: (g) => {
    rect(g, 92, 10, 16, 12, '#c9951f');
    rect(g, 93, 11, 14, 10, '#8fd3ff');
    for (let i = 0; i < 14; i++) { const h = Math.max(0, 5 - Math.abs(i - 7) / 1.4); rect(g, 93 + i, 21 - Math.round(h), 1, Math.round(h), '#5b8a6b'); }
    sprite(g, 102, 12, ['.o.', 'ooo', '.o.'], { o: '#fff3a6' });
  },
  lampara: (g, night) => {
    if (night) {
      // Luz cálida sobre el escritorio (tramado fijo).
      for (let j = 0; j < 7; j++) for (let i = -j; i < 5 + j; i++) if ((i + j) % 2 === 0) px(g, 108 + i, 30 + j, '#ffe9a0');
    }
    sprite(g, 107, 25, ['..oooo..', '.oOOOOo.', 'oOOOOOOo', '...kk...', '...kk...', '...kk...', '...kk...', '...kk...', '..kkkk..', '.kkkkkk.'], { o: '#d49a1f', O: '#f2c14e', k: '#3a3f4f' });
  },
  planta: (g) => {
    sprite(g, 1, 38, [
      '...gg.....', '..gGg.gg..', '.gGgggGg..', '..ggGgGgg.', '.gGggggGg.', '..gggGgg..', '...ggg.g..', '....g.....',
      '..pppppp..', '..pPPPPp..', '..pPPPPp..', '...pPPp...', '...pppp...',
    ], { g: '#4f9a5a', G: '#6fbf6a', p: '#a0522d', P: '#c46a3a' });
  },
  alfombra: (g) => {
    for (let y = 54; y < 64; y++) for (let x = 32; x < 90; x++) {
      const dx = (x - 60) / 28, dy = (y - 59) / 4.6;
      const d = dx * dx + dy * dy;
      if (d <= 1) px(g, x, y, d > 0.72 ? '#c8553d' : d > 0.45 ? '#f2c14e' : '#3a7bd5');
    }
  },
  cojin: (g) => {
    sprite(g, 96, 55, ['.oooooooooo.', 'oOOOOOOOOOOo', 'oOOkOOOOkOOo', 'oOOOOOOOOOOo', '.oooooooooo.'], { o: '#6d3fd6', O: '#8b5cf6', k: '#5b2fb8' });
  },
};

function gridPaths(g: Grid): string {
  const by = new Map<string, string[]>();
  for (let y = 0; y < ROOM_H; y++) {
    let x = 0;
    while (x < GW) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let w = 1;
      while (x + w < GW && g[y][x + w] === c) w++;
      (by.get(c) ?? by.set(c, []).get(c)!).push(`M${x} ${y}h${w}v1h-${w}z`);
      x += w;
    }
  }
  let out = '';
  by.forEach((d, c) => { out += `<path d="${d.join('')}" fill="${c}"/>`; });
  return out;
}

/** Corrimiento de los muebles para un cuarto de `cols` columnas. */
export function roomOffset(cols: number): number { return Math.floor((Math.max(ROOM_W, Math.min(400, Math.round(cols))) - ROOM_W) / 2); }

/** El cuarto completo como SVG (sin la mascota). `cols` lo hace más ancho. */
export function roomSvg(home: Home = {}, opts: { hour?: number; width?: number; height?: number; slice?: boolean; cols?: number } = {}): string {
  const part = dayPart(opts.hour ?? new Date().getHours());
  GW = Math.max(ROOM_W, Math.min(400, Math.round(opts.cols ?? ROOM_W)));
  OX = Math.floor((GW - ROOM_W) / 2);
  const g = blank();
  wall(g, home.papel ?? null);
  floor(g, home.piso ?? null);
  windowView(g, home.vista ?? null, part);
  const night = part === 'noche';
  if (home.estante === true) FURN.estante(g, night);
  if (home.cuadro === true) FURN.cuadro(g, night);
  if (home.alfombra === true) FURN.alfombra(g, night);
  desk(g);
  if (home.lampara === true) FURN.lampara(g, night);
  if (home.planta === true) FURN.planta(g, night);
  if (home.cojin === true) FURN.cojin(g, night);
  // De noche, el cuarto un poco más oscuro.
  const shade = night ? `<rect width="${GW}" height="${ROOM_H}" fill="#0b1030" fill-opacity=".18"/>` : '';
  const size = opts.width ? ` width="${opts.width}" height="${opts.height ?? Math.round((opts.width * ROOM_H) / GW)}"` : '';
  const par = opts.slice ? ' preserveAspectRatio="xMidYMax slice"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GW} ${ROOM_H}"${size}${par} shape-rendering="crispEdges" aria-hidden="true">${gridPaths(g)}${shade}</svg>`;
}

/** La casa con una cosa puesta (para las vistas previas de la tienda). */
export function withItem(home: Home, id: HomeItemId): Home {
  const it = HOME_ITEMS[id];
  return it.slot === 'mueble' ? { ...home, [id]: true } : { ...home, [it.slot]: id };
}
