// ============================================================
//  Arte de las mascotas de Kaderno: pixel art.
//
//  Cada mascota es una cuadrícula de 32 x 32 píxeles. Se dibuja solo la mitad
//  izquierda y se refleja (son de frente), y encima van capas: detalles que no
//  son simétricos (cola, mancha, cresta), ojos según el ánimo, patas y ropa.
//
//  La salida es texto SVG con un <rect> por tramo de color, así que pesa poco,
//  se ve nítido a cualquier tamaño entero y sirve igual en web (inyectado) y en
//  el celular (SvgXml). Para caminar, saltar o dormir hay "cuadros" (frames):
//  `petSheet` los pone en fila para animarlos con CSS steps() sin JavaScript.
// ============================================================

export type Species = 'pinguino' | 'gato' | 'perro' | 'loro';
export type Mood = 'normal' | 'feliz' | 'dormido' | 'preocupado' | 'concentrado';
export type Slot = 'cabeza' | 'ojos' | 'cuello';
export type ItemId =
  | 'gorro' | 'birrete' | 'audifonos' | 'corona' | 'boina'
  | 'gafas' | 'gafas_sol'
  | 'bufanda' | 'corbatin' | 'collar';
export type Outfit = Partial<Record<Slot, ItemId | null>>;

/** Cuadros de animación. */
export type Frame =
  | 'quieto' | 'respira' | 'parpadeo'
  | 'paso1' | 'paso2' | 'paso3' | 'paso4'
  | 'salto' | 'agarrado' | 'cae'
  | 'sueno1' | 'sueno2';

export const GRID = 32;

type Palette = Record<string, string>;
type Layer = { x: number; y: number; rows: string[]; behind?: boolean };
type SpeciesDef = {
  name: string;
  coin: { id: string; one: string; many: string };
  palette: Palette;
  /** Mitad izquierda, 32 filas de 16 caracteres. '.' es transparente. */
  half: string[];
  /** Capas no simétricas (coordenadas absolutas en la cuadrícula de 32). */
  extra: Layer[];
  /** Patas: mitad izquierda; se reflejan. Filas desde `feetY`. */
  feet: string[];
  feetY: number;
  /** Esquina superior izquierda del ojo izquierdo (2 x 3). */
  eye: { x: number; y: number };
  /** Color de las pupilas y del contorno de la cara. */
  ink: string;
  /** Mejillas: x del cachete izquierdo y fila. */
  cheek?: { x: number; y: number };
  /** Anclajes de la ropa: x es el centro (entre 15 y 16), y es una fila. */
  anchors: Record<Slot, number>;
};

// Colores compartidos.
const SHADOW = 'rgba(0,0,0,.22)';
const WHITE = '#ffffff';
const CHEEK = '#ff8fa3';

export const SPECIES: Record<Species, SpeciesDef> = {
  pinguino: {
    name: 'Pingüino',
    coin: { id: 'pescados', one: 'pescado', many: 'pescados' },
    palette: { o: '#161c2c', b: '#2f3f60', h: '#4b6190', d: '#222e47', w: '#f6f2ea', s: '#d8d1c3', y: '#f39c34', Y: '#c4761f' },
    ink: '#161c2c',
    half: [
      '................',
      '................',
      '................',
      '................',
      '..........oooooo',
      '........oobbbbbb',
      '.......obhhbbbbb',
      '......obhbbbbbbb',
      '......obbbbwwwbb',
      '.....obbbwwwwwwb',
      '.....obbwwwwwwww',
      '.....obbwwwwwwww',
      '.....obbwwwwwwww',
      '.....obbwwwwwwww',
      '.....obbbwwwwwww',
      '....obbbbbwwwwww',
      '...obbbbbwwwwwww',
      '..oobbbbwwwwwwww',
      '.odobbbwwwwwwwww',
      '.oddobbwwwwwwwww',
      '.oddobbwwwwwwwww',
      '.oddobbwwwwwwwww',
      '..oddobwwwwwwwww',
      '..oodobswwwwwwww',
      '...obbbswwwwwwww',
      '...obbbsswwwwwww',
      '....obbbssswwwww',
      '.....obbbbssssss',
      '......oobbbbbbbb',
      '........oooooooo',
      '................',
      '................',
    ],
    extra: [
      // Pico.
      { x: 13, y: 13, rows: ['.oooo.', 'oyyyyo', '.oYYo.', '..oo..'] },
    ],
    feet: [
      '......oyyyyo....',
      '.....oyyyyyyo...',
      '......oooooo....',
    ],
    feetY: 27,
    eye: { x: 10, y: 10 },
    cheek: { x: 8, y: 13 },
    anchors: { cabeza: 6, ojos: 11, cuello: 15 },
  },
  gato: {
    name: 'Gato',
    coin: { id: 'ovillos', one: 'ovillo', many: 'ovillos' },
    palette: { o: '#3a2414', b: '#f2a65a', h: '#f9c991', d: '#d9823c', w: '#fbe5cc', e: '#f4a9a0', n: '#e86f86' },
    ink: '#3a2414',
    half: [
      '................',
      '................',
      '................',
      '................',
      '....oo..........',
      '....oeo.........',
      '....oeeo........',
      '....obeeoooooooo',
      '....obebbbbbbdbd',
      '...obbbbhhbbbbbd',
      '...obbbhbbbbbbbb',
      '...obbbbbbbbbbbb',
      '...obbbbbbbbbbbb',
      '...obbbbbbbbbbbb',
      '...obbbbbbbbwwww',
      '...obbbbbbbwwwww',
      '....obbbbbbbwwww',
      '.....oobbbbbbbbb',
      '.......obbbbbbbb',
      '......obbbbbwwww',
      '.....obbbbwwwwww',
      '.....obbdbwwwwww',
      '....obbbbwwwwwww',
      '....obbdbwwwwwww',
      '....obbbbwwwwwww',
      '....obbdbbwwwwww',
      '....obbbbbwwwwww',
      '.....obbbbbbwwww',
      '......oobbbbbbbb',
      '........oooooooo',
      '................',
      '................',
    ],
    extra: [
      // Cola que sube por la derecha (detrás del cuerpo).
      { x: 23, y: 16, behind: true, rows: [
        '....ooo.',
        '...obbbo',
        '...obdbo',
        '....obbo',
        '....obbo',
        '....obdo',
        '...obbo.',
        '..obbbo.',
        '.obbdo..',
        'obbbo...',
        'bbbo....',
        'boo.....',
      ] },
      // Nariz y boca.
      { x: 14, y: 14, rows: ['.nn.', 'onno', '.oo.'] },
    ],
    feet: [
      '........owwo....',
      '.......owwwwo...',
      '........oooo....',
    ],
    feetY: 27,
    eye: { x: 9, y: 11 },
    cheek: { x: 6, y: 15 },
    anchors: { cabeza: 8, ojos: 12, cuello: 18 },
  },
  perro: {
    name: 'Perro',
    coin: { id: 'huesos', one: 'hueso', many: 'huesos' },
    palette: { o: '#3a2414', b: '#dba468', h: '#ecc293', d: '#b97a45', w: '#f7e6ca', e: '#9b6337', E: '#7d4c28', n: '#2e2018', t: '#f2788d' },
    ink: '#2e2018',
    half: [
      '................',
      '................',
      '................',
      '................',
      '..........oooooo',
      '........oobbbbbb',
      '.......obbhhbbbb',
      '...ooooobhbbbbbb',
      '..oeeeeobbbbbbbb',
      '.oeeeeeobbbbbbbb',
      '.oeeeeobbbbbbbbb',
      '.oeeeeobbbbbbbbb',
      '.oeeEeobbbbbbbbb',
      '.oeeEeobbbbbbbbb',
      '.oeeEeobbbbbwwww',
      '..oeEeobbbbwwwww',
      '..oeeoobbbbwwwww',
      '...oo..obbbwwwww',
      '.......obbbbwwww',
      '........oobbbbbb',
      '..........oobbbb',
      '.......oobbbwwww',
      '......obbbbwwwww',
      '......obbbwwwwww',
      '.....obbbbwwwwww',
      '.....obbbbwwwwww',
      '.....obbbbbwwwww',
      '.....obbbbbbwwww',
      '......oobbbbbbbb',
      '........oooooooo',
      '................',
      '................',
    ],
    extra: [
      // Mancha alrededor del ojo derecho.
      { x: 18, y: 8, rows: ['.ddd.', 'ddddd', 'ddddd', 'ddddd', '.ddd.'] },
      // Cola.
      { x: 23, y: 18, behind: true, rows: [
        '.....oo',
        '....obo',
        '...obbo',
        '..obbo.',
        '.obbo..',
        'obbo...',
        'bbo....',
      ] },
      // Nariz y boca.
      { x: 13, y: 13, rows: ['.oooo.', 'onnnno', '.onno.', '..oo..', '.o..o.'] },
    ],
    feet: [
      '........owwo....',
      '.......owwwwo...',
      '........oooo....',
    ],
    feetY: 27,
    eye: { x: 10, y: 9 },
    cheek: { x: 8, y: 14 },
    anchors: { cabeza: 6, ojos: 10, cuello: 20 },
  },
  loro: {
    name: 'Loro',
    coin: { id: 'semillas', one: 'semilla', many: 'semillas' },
    palette: { o: '#123522', b: '#3fbf7f', h: '#79dca6', d: '#2c9563', y: '#f6d45a', Y: '#e0b53a', w: WHITE, k: '#f2b33d', K: '#c4861a', r: '#e8483b', R: '#f39c34', u: '#3a7bd5', g: '#8a8f99' },
    ink: '#123522',
    half: [
      '................',
      '................',
      '................',
      '................',
      '..........oooooo',
      '........oobbbbbb',
      '.......obhhbbbbb',
      '......obhbbbbbbb',
      '......obbbbbbbbb',
      '.....obbwwwwbbbb',
      '.....obwwwwwwbbb',
      '.....obwwwwwwbbb',
      '.....obwwwwwwbbb',
      '.....obbwwwwbbbb',
      '.....obbbbbbbbbb',
      '....obbbbbbbbbbb',
      '....obbbbbbbbbbb',
      '...obdbbbbbbyyyy',
      '..obddbbbyyyyyyy',
      '..obddbbyyyyyyyy',
      '..obddbbyyyyyyyy',
      '..obddbbyyyyyyyy',
      '..obddbbyyyyyyyy',
      '...obddbbyyyyyyy',
      '...obddbbYyyyyyy',
      '....obddbbYYyyyy',
      '.....obbbbbbYYYY',
      '......oooobbbbbb',
      '..........oooooo',
      '................',
      '................',
      '................',
    ],
    extra: [
      // Cresta.
      { x: 12, y: 0, rows: [
        '...oo...',
        '..orRo..',
        '.orroRo.',
        '.orRorRo',
        'orRrorro',
      ] },
      // Pico curvo.
      { x: 13, y: 12, rows: [
        '.oooo.',
        'okkkko',
        'okkkko',
        'oKkkko',
        '.oKKko',
        '..oKo.',
        '...o..',
      ] },
      // Cola de plumas (detrás).
      { x: 12, y: 25, behind: true, rows: [
        '.oooooo.',
        'ouuoruuo',
        'ouuoruuo',
        'ouuoruuo',
        '.ouorruo',
        '.ouoruo.',
        '..ooooo.',
      ] },
    ],
    feet: [
      '..........ogo...',
      '.........ogggo..',
    ],
    feetY: 28,
    eye: { x: 9, y: 10 },
    anchors: { cabeza: 6, ojos: 11, cuello: 17 },
  },
};

// ---------- Ropa ----------

const ITEM_PAL: Palette = {
  k: '#1f2433', r: '#e8483b', R: '#b8352b', w: '#ffffff', W: '#d9dde6',
  g: '#f2c14e', G: '#c9951f', u: '#3a7bd5', U: '#2a5ea8', l: '#9fd3ff',
  v: '#8b5cf6', V: '#6d3fd6', n: '#2b3752', N: '#1d2638', a: '#5b6475', A: '#3a4152',
  p: '#e86f86', q: 'rgba(255,255,255,.28)',
};

type ItemDef = {
  name: string; slot: Slot;
  /** Cuadrícula de la prenda. */
  rows: string[];
  /** Píxel de la prenda que cae sobre el anclaje (x en el centro de la cuadrícula). */
  oy: number;
};

export const ITEMS: Record<ItemId, ItemDef> = {
  gorro: {
    name: 'Gorro de lana', slot: 'cabeza', oy: 7,
    rows: [
      '......kk......',
      '.....kwwk.....',
      '....kkwwkk....',
      '...krrrrrrk...',
      '..krrRrrRrrk..',
      '..krrRrrRrrk..',
      '.kRRRRRRRRRRk.',
      '.kRRRRRRRRRRk.',
      '..kkkkkkkkkk..',
    ],
  },
  birrete: {
    name: 'Birrete de graduación', slot: 'cabeza', oy: 6,
    rows: [
      '.......kkkk.......',
      '....kkknnnnkkk....',
      '.kkknnnnggnnnnkkk.',
      'knnnnnnnggnnnnnnnk',
      '.kkknnnnnnnnnnkkkg',
      '....kNNNNNNNNk..g.',
      '....kNNNNNNNNk..G.',
      '.....kkkkkkkk..kGk',
      '...............kGk',
    ],
  },
  audifonos: {
    name: 'Audífonos', slot: 'cabeza', oy: 2,
    rows: [
      '........kkkkkkkk........',
      '.....kkkaaaaaaaakkk.....',
      '...kkaaakkkkkkkkaaakk...',
      '..kaakk..........kkaak..',
      '.kakk..............kkak.',
      'kkkk................kkkk',
      'kuuk................kuuk',
      'kuqk................kqUk',
      'kuqk................kqUk',
      'kuuk................kuUk',
      'kkkk................kkkk',
    ],
  },
  corona: {
    name: 'Corona', slot: 'cabeza', oy: 7,
    rows: [
      '.......kk.......',
      '..kk..krrk..kk..',
      '.kuuk.krrk.kuuk.',
      '.kggkkkggkkkggk.',
      '.kgggggggggggggk',
      '.kggwggggggwggk.',
      '.kGGGGGGGGGGGGk.',
      '.kGGGGGGGGGGGGk.',
      '..kkkkkkkkkkkk..',
    ],
  },
  boina: {
    name: 'Boina de artista', slot: 'cabeza', oy: 5,
    rows: [
      '.........kk.......',
      '.....kkkkVkkkk....',
      '...kkvvvvvvvvvkk..',
      '.kkvvvvvvvvvvvvvk.',
      'kvvvvvvvvvvvvvvvvk',
      '.kkVVVVVVVVVVVVkk.',
      '...kkkkkkkkkkkk...',
    ],
  },
  gafas: {
    name: 'Gafas de estudio', slot: 'ojos', oy: 2,
    rows: [
      '.kkkk......kkkk.',
      'k....kkkkkk....k',
      'k....k....k....k',
      'k....k....k....k',
      '.kkkk......kkkk.',
    ],
  },
  gafas_sol: {
    name: 'Gafas de sol', slot: 'ojos', oy: 2,
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kNqNNNkkkkNqNNNk',
      'kNNqNNk..kNNqNNk',
      '.kNNNk....kNNNk.',
      '..kkk......kkk..',
    ],
  },
  bufanda: {
    name: 'Bufanda', slot: 'cuello', oy: 0,
    rows: [
      '.kkkkkkkkkkkkkkkk.',
      'kuuwuuwuuwuuwuuwuk',
      'kuuwuuwuuwuuwuuwuk',
      '.kkkkkkkkkkuuuuk..',
      '..........kwwwwk..',
      '..........kuuuuk..',
      '..........kwwwwk..',
      '..........kkkkkk..',
    ],
  },
  corbatin: {
    name: 'Corbatín', slot: 'cuello', oy: 0,
    rows: [
      'kk......kk',
      'krkk..kkrk',
      'krrrkkrrrk',
      'krRrRRrRrk',
      'krrrkkrrrk',
      'krkk..kkrk',
      'kk......kk',
    ],
  },
  collar: {
    name: 'Collar con placa', slot: 'cuello', oy: 0,
    rows: [
      'kk............kk',
      'krkkkkkkkkkkkkrk',
      '.krrrrrrrrrrrrk.',
      '..kkkkkggkkkkk..',
      '......kggk......',
      '......kGGk......',
      '.......kk.......',
    ],
  },
};

// ---------- Ojos según el ánimo (2 x 3, desde la esquina del ojo izquierdo) ----------

type Px = [number, number, string];

function eyePixels(mood: Mood | 'cerrado' | 'sorpresa', ink: string): Px[] {
  // Coordenadas relativas al ojo izquierdo; el derecho se refleja.
  switch (mood) {
    case 'feliz': // ^ ^
      return [[0, 2, ink], [1, 1, ink], [2, 2, ink]] as Px[];
    case 'dormido':
    case 'cerrado': // línea curva hacia abajo
      return [[0, 1, ink], [1, 2, ink], [2, 1, ink]] as Px[];
    case 'concentrado': // ojos entrecerrados y ceja recta
      return [[0, 1, ink], [1, 1, ink], [0, 2, ink], [1, 2, ink], [-1, -1, ink], [0, -1, ink], [1, -1, ink], [2, 0, ink]] as Px[];
    case 'preocupado': // ceja que sube hacia el centro
      return [[0, 0, ink], [1, 0, WHITE], [0, 1, ink], [1, 1, ink], [0, 2, ink], [1, 2, ink], [-1, -1, ink], [0, -2, ink], [1, -2, ink]] as Px[];
    case 'sorpresa':
      return [[0, 0, ink], [1, 0, ink], [0, 1, ink], [1, 1, WHITE], [0, 2, ink], [1, 2, ink], [-1, 1, ink], [2, 1, ink]] as Px[];
    default:
      return [[0, 0, ink], [1, 0, WHITE], [0, 1, ink], [1, 1, ink], [0, 2, ink], [1, 2, ink]] as Px[];
  }
}

// ---------- Composición ----------

type Grid = (string | null)[][];

const blank = (): Grid => Array.from({ length: GRID }, () => Array<string | null>(GRID).fill(null));

function put(g: Grid, x: number, y: number, c: string | null | undefined) {
  if (!c || x < 0 || y < 0 || x >= GRID || y >= GRID) return;
  g[y][x] = c;
}

function stamp(g: Grid, layer: Layer, pal: Palette, dx = 0, dy = 0) {
  layer.rows.forEach((row, j) => {
    [...row].forEach((ch, i) => { if (ch !== '.') put(g, layer.x + i + dx, layer.y + j + dy, pal[ch]); });
  });
}

function stampHalf(g: Grid, half: string[], pal: Palette, y0 = 0, dy = 0) {
  half.forEach((row, j) => {
    [...row].forEach((ch, i) => {
      if (ch === '.') return;
      put(g, i, y0 + j + dy, pal[ch]);
      put(g, GRID - 1 - i, y0 + j + dy, pal[ch]);
    });
  });
}

type FrameSpec = {
  /** Desplazamiento vertical del cuerpo (positivo = abajo). */
  body: number;
  /** Desplazamiento de cada pata [izq, der]. */
  feet: [number, number];
  /** Las patas se dibujan (no en el salto). */
  showFeet: boolean;
  eyes?: 'cerrado' | 'sorpresa';
  shadow: number; // ancho relativo de la sombra (0 = sin sombra)
  zzz?: 0 | 1;
};

const FRAMES: Record<Frame, FrameSpec> = {
  quieto: { body: 0, feet: [0, 0], showFeet: true, shadow: 1 },
  respira: { body: 1, feet: [0, 0], showFeet: true, shadow: 1 },
  parpadeo: { body: 0, feet: [0, 0], showFeet: true, shadow: 1, eyes: 'cerrado' },
  paso1: { body: 0, feet: [-1, 0], showFeet: true, shadow: 1 },
  paso2: { body: 1, feet: [0, 0], showFeet: true, shadow: 1 },
  paso3: { body: 0, feet: [0, -1], showFeet: true, shadow: 1 },
  paso4: { body: 1, feet: [0, 0], showFeet: true, shadow: 1 },
  salto: { body: -3, feet: [-4, -4], showFeet: true, shadow: 0.7 },
  agarrado: { body: 0, feet: [1, 1], showFeet: true, shadow: 0, eyes: 'sorpresa' },
  cae: { body: -1, feet: [0, 0], showFeet: true, shadow: 0.6, eyes: 'sorpresa' },
  sueno1: { body: 1, feet: [0, 0], showFeet: true, shadow: 1, eyes: 'cerrado', zzz: 0 },
  sueno2: { body: 2, feet: [0, 0], showFeet: true, shadow: 1, eyes: 'cerrado', zzz: 1 },
};

const ZZZ: Layer[] = [
  { x: 24, y: 3, rows: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] },
  { x: 26, y: 0, rows: ['ZZZZ', '..Z.', '.Z..', 'ZZZZ'] },
];

export type PetOpts = {
  mood?: Mood; outfit?: Outfit; frame?: Frame;
  /** Hacia dónde mira: -1 izquierda, 1 derecha (corre las pupilas un píxel). */
  look?: -1 | 0 | 1;
};

/** Cuadrícula de colores de una mascota (null = transparente). */
export function petGrid(species: Species, opts: PetOpts = {}): Grid {
  const def = SPECIES[species];
  const pal = def.palette;
  const mood: Mood = opts.mood ?? 'normal';
  const outfit = opts.outfit ?? {};
  const f = FRAMES[opts.frame ?? 'quieto'];
  const g = blank();
  const dy = f.body;

  // Sombra en el piso (dos filas de abajo).
  if (f.shadow > 0) {
    const w = Math.round(9 * f.shadow);
    for (let x = 16 - w; x < 16 + w; x++) put(g, x, 31, SHADOW);
  }
  // Capas de atrás (colas).
  def.extra.filter((l) => l.behind).forEach((l) => stamp(g, l, pal, 0, dy));
  // Patas: van delante del borde de abajo del cuerpo.
  const drawFeet = () => {
    if (!f.showFeet) return;
    def.feet.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch === '.') return;
        put(g, i, def.feetY + j + f.feet[0], pal[ch]);
        put(g, GRID - 1 - i, def.feetY + j + f.feet[1], pal[ch]);
      });
    });
  };
  // Cuerpo.
  stampHalf(g, def.half, pal, 0, dy);
  drawFeet();
  // Detalles del frente.
  def.extra.filter((l) => !l.behind).forEach((l) => stamp(g, l, pal, 0, dy));
  // Mejillas.
  if (def.cheek && mood !== 'concentrado') {
    put(g, def.cheek.x, def.cheek.y + dy, CHEEK); put(g, def.cheek.x + 1, def.cheek.y + dy, CHEEK);
    put(g, GRID - 1 - def.cheek.x, def.cheek.y + dy, CHEEK); put(g, GRID - 2 - def.cheek.x, def.cheek.y + dy, CHEEK);
  }
  // Ojos.
  const em = f.eyes ?? (mood === 'dormido' ? 'cerrado' : mood);
  const lk = opts.look ?? 0;
  for (const [x, y, c] of eyePixels(em, def.ink)) {
    put(g, def.eye.x + x + lk, def.eye.y + y + dy, c);
    // Reflejo: el ojo derecho ocupa las columnas espejo (2 de ancho).
    const rx = GRID - 1 - (def.eye.x + x) + lk;
    // El brillo blanco queda arriba a la derecha en los dos ojos.
    const isGlint = c === WHITE;
    put(g, isGlint ? rx + 1 : rx, def.eye.y + y + dy, c);
    if (isGlint) put(g, rx, def.eye.y + y + dy, def.ink);
  }
  // Ropa: cuello, ojos y cabeza.
  for (const slot of ['cuello', 'ojos', 'cabeza'] as Slot[]) {
    const id = outfit[slot];
    const it = id ? ITEMS[id] : null;
    if (!it || it.slot !== slot) continue;
    const w = it.rows[0].length;
    const x0 = 16 - Math.floor(w / 2);
    let y0 = def.anchors[slot] - it.oy + dy;
    if (slot === 'ojos') y0 = def.eye.y + 1 - it.oy + dy;
    stamp(g, { x: x0, y: y0, rows: it.rows }, ITEM_PAL);
  }
  // Zzz.
  if (f.zzz !== undefined || (mood === 'dormido' && !opts.frame)) {
    stamp(g, ZZZ[f.zzz ?? 0], { Z: '#9aa3b8' });
  }
  return g;
}

/** Convierte una cuadrícula en <rect> agrupando tramos del mismo color. */
function gridRects(g: Grid, ox = 0): string {
  const byColor = new Map<string, string[]>();
  for (let y = 0; y < GRID; y++) {
    let x = 0;
    while (x < GRID) {
      const c = g[y][x];
      if (!c) { x++; continue; }
      let w = 1;
      while (x + w < GRID && g[y][x + w] === c) w++;
      const list = byColor.get(c) ?? [];
      list.push(`M${x + ox} ${y}h${w}v1h-${w}z`);
      byColor.set(c, list);
      x += w;
    }
  }
  let out = '';
  byColor.forEach((d, c) => {
    const m = /^rgba\((\d+),(\d+),(\d+),([.\d]+)\)$/.exec(c);
    out += m
      ? `<path d="${d.join('')}" fill="rgb(${m[1]},${m[2]},${m[3]})" fill-opacity="${m[4]}"/>`
      : `<path d="${d.join('')}" fill="${c}"/>`;
  });
  return out;
}

/** SVG de un cuadro. `size` en píxeles de pantalla (mejor múltiplo de 32). */
export function petSvg(species: Species, opts: PetOpts & { size?: number; label?: string } = {}): string {
  const size = opts.size ?? 96;
  const aria = opts.label ? ` role="img" aria-label="${opts.label}"` : ' aria-hidden="true"';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID} ${GRID}" width="${size}" height="${size}" shape-rendering="crispEdges"${aria}>${gridRects(petGrid(species, opts))}</svg>`;
}

/**
 * Tira de cuadros en fila (para animar con CSS `steps()`).
 * Mide GRID * n de ancho en unidades del viewBox.
 */
export function petSheet(species: Species, frames: Frame[], opts: Omit<PetOpts, 'frame'> & { scale?: number } = {}): string {
  const s = opts.scale ?? 1;
  const n = frames.length;
  const body = frames.map((fr, i) => gridRects(petGrid(species, { ...opts, frame: fr }), i * GRID)).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${GRID * n} ${GRID}" width="${GRID * n * s}" height="${GRID * s}" shape-rendering="crispEdges">${body}</svg>`;
}

/** Animaciones: qué cuadros y a cuántos cuadros por segundo. */
export const ANIMS: Record<'quieto' | 'camina' | 'duerme' | 'celebra' | 'agarrado', { frames: Frame[]; fps: number }> = {
  quieto: { frames: ['quieto', 'quieto', 'quieto', 'respira', 'respira', 'respira', 'quieto', 'quieto', 'parpadeo', 'quieto', 'respira', 'respira'], fps: 4 },
  camina: { frames: ['paso1', 'paso2', 'paso3', 'paso4'], fps: 8 },
  duerme: { frames: ['sueno1', 'sueno2'], fps: 1.5 },
  celebra: { frames: ['quieto', 'salto', 'salto', 'quieto'], fps: 8 },
  agarrado: { frames: ['agarrado'], fps: 1 },
};

// ---------- Monedas (12 x 12) ----------

const COINS: Record<Species, { pal: Palette; rows: string[] }> = {
  pinguino: { // pescado
    pal: { k: '#1f2433', b: '#5aa9e6', B: '#3a7bd5', w: '#ffffff' },
    rows: [
      '............',
      '............',
      '...kkkk...k.',
      '..kbbbbk.kBk',
      '.kbwbbbbkBBk',
      '.kbkbbbbbBk.',
      '.kbbbbbbbBk.',
      '..kbbbbbkBBk',
      '...kkkk..kBk',
      '..........k.',
      '............',
      '............',
    ],
  },
  gato: { // ovillo
    pal: { k: '#5a2a35', p: '#e86f86', w: '#ffd3dc' },
    rows: [
      '............',
      '....kkkk....',
      '..kkppppkk..',
      '.kppwwwpppk.',
      '.kpppppwwpk.',
      'kpwwppppppk.',
      'kpppwwwpppk.',
      '.kpppppwwpk.',
      '.kppwwppppkk',
      '..kkppppkk.k',
      '....kkkk..k.',
      '............',
    ],
  },
  perro: { // hueso
    pal: { k: '#5c4a30', w: '#f3ead8', s: '#d8ccb2' },
    rows: [
      '............',
      '.kk.........',
      'kwwk........',
      'kwwwkk......',
      '.kwwwwk.....',
      '..kswwwk....',
      '...kswwwk...',
      '....kswwwk..',
      '.....kkswwk.',
      '.......kswwk',
      '........kssk',
      '.........kk.',
    ],
  },
  loro: { // semilla de girasol
    pal: { k: '#3b2c1d', b: '#8a6d4b', w: '#e6e1d3' },
    rows: [
      '.....kk.....',
      '....kbbk....',
      '...kbwbbk...',
      '...kbwbbk...',
      '..kbbwbwbk..',
      '..kbbwbwbk..',
      '..kbbwbwbk..',
      '..kbbwbwbk..',
      '...kbwbbk...',
      '...kbbbbk...',
      '....kbbk....',
      '.....kk.....',
    ],
  },
};

/** Ícono de la moneda de cada especie. */
export function coinSvg(species: Species, size = 18): string {
  const c = COINS[species];
  let d = '';
  c.rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') d += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c.pal[ch]}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" width="${size}" height="${size}" shape-rendering="crispEdges" aria-hidden="true">${d}</svg>`;
}
