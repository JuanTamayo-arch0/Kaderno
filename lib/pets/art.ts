import { t } from '../i18n';
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
export type Mood = 'normal' | 'feliz' | 'dormido' | 'preocupado' | 'concentrado' | 'cansado' | 'sorprendido';
/** Lugares de la ropa. Espalda (mochila, capa) y mano (lápiz, taza) llegan en v26. */
export type Slot = 'cabeza' | 'ojos' | 'cuello' | 'espalda' | 'mano';
export const SLOTS: Slot[] = ['cabeza', 'ojos', 'cuello', 'espalda', 'mano'];
export type ItemId =
  | 'gorro' | 'birrete' | 'audifonos' | 'corona' | 'boina'
  | 'gafas' | 'gafas_sol'
  | 'bufanda' | 'corbatin' | 'collar'
  // De temporada (lib/pets/seasons.ts): solo se compran en su época.
  | 'gorro_navidad' | 'cuernos_reno' | 'luces' | 'antifaz' | 'gafas_corazon' | 'sombrero_bruja' | 'sombrero_vueltiao'
  // v26: juego de Estudio, juego de Trabajo y la capa.
  | 'lapiz_oreja' | 'lentes' | 'mochila' | 'lapiz'
  | 'corbata' | 'diadema' | 'carne' | 'taza' | 'maletin'
  | 'capa';
export type Outfit = Partial<Record<Slot, ItemId | null>>;

/** Cuadros de animación. */
export type Frame =
  | 'quieto' | 'respira' | 'parpadeo'
  | 'paso1' | 'paso2' | 'paso3' | 'paso4' | 'paso5' | 'paso6'
  | 'salto' | 'agarrado' | 'cae'
  | 'sueno1' | 'sueno2'
  | 'agacha' | 'aterriza';

/** Todos los cuadros, en el orden de las tiras que se animan moviendo el fondo. */
export const SHEET_FRAMES: Frame[] = [
  'quieto', 'respira', 'parpadeo', 'paso1', 'paso2', 'paso3', 'paso4', 'paso5', 'paso6',
  'salto', 'agarrado', 'cae', 'sueno1', 'sueno2', 'agacha', 'aterriza',
];

export const GRID = 32;

type Palette = Record<string, string>;
/** `sway`: la capa se mece con el cuadro (colas y cresta). */
type Layer = { x: number; y: number; rows: string[]; behind?: boolean; sway?: boolean };
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
  anchors: Record<Exclude<Slot, 'mano'>, number>;
  /** Dónde sostiene lo que lleva en la mano (lado derecho de la pantalla). */
  hand: { x: number; y: number };
  /** Ajuste horizontal de cada lugar para esta especie. */
  nudge?: Partial<Record<Slot, number>>;
};

// Colores compartidos. El contorno es la tinta de la marca (no negro) y la
// sombra del piso es cálida.
export const PET_INK = '#1B1D3A';
const SHADOW = 'rgba(84,46,28,.24)';
const BAG = 'rgba(27,29,58,.28)';
const WHITE = '#ffffff';
const CHEEK = '#ff8fa3';

export const SPECIES: Record<Species, SpeciesDef> = {
  pinguino: {
    name: t('Pingüino'),
    coin: { id: 'pescados', one: t('pescado'), many: t('pescados') },
    palette: { o: PET_INK, b: '#2f3f60', h: '#4b6190', d: '#222e47', w: '#f6f2ea', s: '#d8d1c3', y: '#f39c34', Y: '#c4761f' },
    ink: PET_INK,
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
    // Cabeza en 7: así los sombreros de 9 filas no se cortan arriba.
    anchors: { cabeza: 7, ojos: 11, cuello: 15, espalda: 15 },
    hand: { x: 24, y: 21 },
  },
  gato: {
    name: t('Gato'),
    coin: { id: 'ovillos', one: t('ovillo'), many: t('ovillos') },
    palette: { o: PET_INK, b: '#f2a65a', h: '#f9c991', d: '#d9823c', w: '#fbe5cc', e: '#f4a9a0', n: '#e86f86' },
    ink: PET_INK,
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
      { x: 23, y: 16, behind: true, sway: true, rows: [
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
    anchors: { cabeza: 8, ojos: 12, cuello: 18, espalda: 18 },
    hand: { x: 24, y: 22 },
  },
  perro: {
    name: t('Perro'),
    coin: { id: 'huesos', one: t('hueso'), many: t('huesos') },
    palette: { o: PET_INK, b: '#dba468', h: '#ecc293', d: '#b97a45', w: '#f7e6ca', e: '#9b6337', E: '#7d4c28', n: '#2e2018', t: '#f2788d' },
    ink: PET_INK,
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
      { x: 23, y: 18, behind: true, sway: true, rows: [
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
    anchors: { cabeza: 7, ojos: 10, cuello: 20, espalda: 20 },
    hand: { x: 24, y: 23 },
  },
  loro: {
    name: t('Loro'),
    coin: { id: 'semillas', one: t('semilla'), many: t('semillas') },
    palette: { o: PET_INK, b: '#3fbf7f', h: '#79dca6', d: '#2c9563', y: '#f6d45a', Y: '#e0b53a', w: WHITE, k: '#f2b33d', K: '#c4861a', r: '#e8483b', R: '#f39c34', u: '#3a7bd5', g: '#8a8f99' },
    ink: PET_INK,
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
      { x: 12, y: 0, sway: true, rows: [
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
      { x: 12, y: 25, behind: true, sway: true, rows: [
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
    anchors: { cabeza: 7, ojos: 11, cuello: 17, espalda: 17 },
    hand: { x: 24, y: 21 },
  },
};

// ---------- Ropa ----------

const ITEM_PAL: Palette = {
  k: PET_INK, r: '#e8483b', R: '#b8352b', w: '#ffffff', W: '#d9dde6',
  g: '#f2c14e', G: '#c9951f', u: '#3a7bd5', U: '#2a5ea8', l: '#9fd3ff',
  v: '#8b5cf6', V: '#6d3fd6', n: '#2b3752', N: '#1d2638', a: '#5b6475', A: '#3a4152',
  p: '#e86f86', q: 'rgba(255,255,255,.28)',
  b: '#9a6a43', B: '#6e4a2c', o: '#f08a24', c: '#f3e6c4', C: '#d6c39a', e: '#3fae5a',
};

type ItemDef = {
  name: string; slot: Slot;
  /** Cuadrícula de la prenda (lo que va delante del cuerpo). */
  rows: string[];
  /** Fila de la prenda que cae sobre el anclaje (x en el centro de la cuadrícula). */
  oy: number;
  /** En la mano: columna por donde se agarra. */
  ox?: number;
  /** Corrimiento horizontal desde el centro (el lápiz en la oreja). */
  dx?: number;
  /** Desde esta fila, la prenda se queda un poco atrás del movimiento (bufanda, corbata, capa). */
  trail?: number;
  /** Lo que va detrás del cuerpo (la mochila, la capa), con su propia fila de anclaje. */
  back?: { rows: string[]; oy: number; trail?: number };
};

export const ITEMS: Record<ItemId, ItemDef> = {
  gorro: {
    name: t('Gorro de lana'), slot: 'cabeza', oy: 7,
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
    name: t('Birrete de graduación'), slot: 'cabeza', oy: 6,
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
    name: t('Audífonos'), slot: 'cabeza', oy: 2,
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
    name: t('Corona'), slot: 'cabeza', oy: 7,
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
    name: t('Boina de artista'), slot: 'cabeza', oy: 5,
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
    name: t('Gafas de estudio'), slot: 'ojos', oy: 2,
    rows: [
      '.kkkk......kkkk.',
      'k....kkkkkk....k',
      'k....k....k....k',
      'k....k....k....k',
      '.kkkk......kkkk.',
    ],
  },
  gafas_sol: {
    name: t('Gafas de sol'), slot: 'ojos', oy: 2,
    rows: [
      'kkkkkkkkkkkkkkkk',
      'kNqNNNkkkkNqNNNk',
      'kNNqNNk..kNNqNNk',
      '.kNNNk....kNNNk.',
      '..kkk......kkk..',
    ],
  },
  bufanda: {
    name: t('Bufanda'), slot: 'cuello', oy: 0, trail: 3,
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
    name: t('Corbatín'), slot: 'cuello', oy: 0,
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
    name: t('Collar con placa'), slot: 'cuello', oy: 0, trail: 3,
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
  // ---------- De temporada ----------
  gorro_navidad: {
    name: t('Gorro de Navidad'), slot: 'cabeza', oy: 7,
    rows: [
      '.....kkkk..kkk..',
      '....krrrrkkwwwk.',
      '...krrRrrrkwwwk.',
      '..krrrrrRrkkkk..',
      '..krrrrrrrrrk...',
      '.krrRrrrrrRrrk..',
      '.kwwwwwwwwwwwwk.',
      '.kWWWWWWWWWWWWk.',
      '..kkkkkkkkkkkk..',
    ],
  },
  cuernos_reno: {
    name: t('Cuernos de reno'), slot: 'cabeza', oy: 7,
    rows: [
      '.kk..............kk.',
      'kbbk.kk......kk.kbbk',
      'kbbkkbbk....kbbkkbbk',
      '.kbbbbk......kbbbbk.',
      '..kbbk........kbbk..',
      '..kbbk........kbbk..',
      '...kbbkkkkkkkkbbk...',
      '...kBrrrrrrrrrrBk...',
      '....kkkkkkkkkkkk....',
    ],
  },
  sombrero_bruja: {
    name: t('Sombrero de bruja'), slot: 'cabeza', oy: 10,
    rows: [
      '..............kk......',
      '.............kvvk.....',
      '............kvvk......',
      '...........kvvvk......',
      '..........kvvvvk......',
      '.........kvvvvvvk.....',
      '........kvvvvvvvk.....',
      '.......kvvvvvvvvvk....',
      '......kooooooooook....',
      'kkkkkkVVVVVVVVVVVVkkkk',
      'kvvvvvvvvvvvvvvvvvvvvk',
      '.kkkkkkkkkkkkkkkkkkkk.',
    ],
  },
  sombrero_vueltiao: {
    name: t('Sombrero vueltiao'), slot: 'cabeza', oy: 7,
    rows: [
      '........kkkkkkkkkk........',
      '.......kcccccccccck.......',
      '.......kkkkkkkkkkkk.......',
      '.......kckckckckckk.......',
      '.......kkkkkkkkkkkk.......',
      '..kkkkkcccccccccccckkkkk..',
      '.kcckkckkckkckkckkckkckck.',
      'kcccccccccccccccccccccccck',
      '.kkkkkkkkkkkkkkkkkkkkkkkk.',
    ],
  },
  antifaz: {
    name: t('Antifaz de carnaval'), slot: 'ojos', oy: 2,
    rows: [
      '.gkkkkkkkkkkkkkkkkg.',
      'kvvvvvvvvvvvvvvvvvvk',
      'kvv...vvvggvvv...vvk',
      'kvvv..vvvvvvvv..vvvk',
      '.kvvvvvvkkkkvvvvvvk.',
      '..kkkkkk....kkkkkk..',
    ],
  },
  gafas_corazon: {
    name: t('Gafas de corazón'), slot: 'ojos', oy: 2,
    rows: [
      '.kk.kk....kk.kk.',
      'krrkrrk..krrkrrk',
      'krqrrrkkkkrqrrrk',
      '.krrrk....krrrk.',
      '..krk......krk..',
      '...k........k...',
    ],
  },
  luces: {
    name: t('Luces de Navidad'), slot: 'cuello', oy: 0,
    rows: [
      'k..................k',
      '.kk..............kk.',
      '...kkkkkkkkkkkkkk...',
      '..k...k...k...k...k.',
      '.rr..gg..uu..ee..rr.',
      '.rr..gg..uu..ee..rr.',
    ],
  },
  // ---------- Juego de Estudio (v26) ----------
  lapiz_oreja: {
    name: t('Lápiz en la oreja'), slot: 'cabeza', oy: 2, dx: 7,
    rows: [
      '....kk',
      '...kpk',
      '..kgk.',
      '.kgk..',
      'kck...',
      'kk....',
    ],
  },
  lentes: {
    name: t('Lentes de lectura'), slot: 'ojos', oy: 0,
    rows: [
      'A....A....A....A',
      'Aq...AAAAAA...qA',
      '.AAAA......AAAA.',
    ],
  },
  mochila: {
    name: t('Mochila'), slot: 'espalda', oy: 0,
    rows: [
      'kuk......kuk',
      'kuk......kuk',
      'kuk......kuk',
      'kUk......kUk',
      'kkk......kkk',
    ],
    back: { oy: 3, rows: [
      '......kkkkkkkkkkkkkkkk......',
      '....kkuuuuuuuuuuuuuuuukk....',
      '...kuuuuuuuuuuuuuuuuuuuuk...',
      '..kuuuuuuuuuuuuuuuuuuuuuuk..',
      '.kuuuuuuuuuuuuuuuuuuuuuuuuk.',
      '.kuuuuuuuuuuuuuuuuuuuuuuuuk.',
      'kUUuuuuuuuuuuuuuuuuuuuuuuUUk',
      'kUUuuuuuuuuuuuuuuuuuuuuuuUUk',
      'kUUUUUUUUUUUUUUUUUUUUUUUUUUk',
      '.kkkkkkkkkkkkkkkkkkkkkkkkkk.',
    ] },
  },
  lapiz: {
    name: t('Lápiz'), slot: 'mano', oy: 5, ox: 1,
    rows: [
      '.k.',
      'kck',
      'kgk',
      'kgk',
      'kGk',
      'kgk',
      'kpk',
      'kpk',
      '.k.',
    ],
  },
  // ---------- Juego de Trabajo (v26) ----------
  corbata: {
    name: t('Corbata'), slot: 'cuello', oy: 0, trail: 3,
    rows: [
      '.kkkk.',
      '.kuuk.',
      '..kk..',
      '.kuuk.',
      'kuUuuk',
      'kuuUuk',
      'kuuuUk',
      '.kuuk.',
      '..kk..',
    ],
  },
  diadema: {
    name: t('Audífonos con micrófono'), slot: 'cabeza', oy: 2,
    rows: [
      '........kkkkkkkk........',
      '......kkAAAAAAAAkk......',
      '....kkAkk......kkAkk....',
      '...kAk............kAk...',
      '..kAk..............kAk..',
      '.kkkk..............kkkk.',
      '.knnk..............knnk.',
      '.knnk..............knnk.',
      '.kkkk..............kkkk.',
      '..kAk...................',
      '...kAk..................',
      '....kAk.................',
      '.....kAkkk..............',
      '......kkrk..............',
      '.......kk...............',
    ],
  },
  carne: {
    name: t('Carné'), slot: 'cuello', oy: 0, trail: 4,
    rows: [
      'r..........r',
      '.r........r.',
      '..r......r..',
      '...r....r...',
      '...kkkkkk...',
      '...kuwwwk...',
      '...kuWWWk...',
      '...kwwwwk...',
      '...kkkkkk...',
    ],
  },
  taza: {
    name: t('Taza de café'), slot: 'mano', oy: 3, ox: 0,
    rows: [
      '..kkkkk',
      '.kkbbbk',
      'k.kwwwk',
      'k.kwwwk',
      '.kkwwwk',
      '..kkkkk',
    ],
  },
  maletin: {
    name: t('Maletín'), slot: 'mano', oy: 0, ox: 2,
    rows: [
      '..kkkk..',
      '..k..k..',
      'kkkkkkkk',
      'kbbbbbbk',
      'kbbggbbk',
      'kBBBBBBk',
      'kkkkkkkk',
    ],
  },
  // ---------- Para lucirse ----------
  capa: {
    name: t('Capa de héroe'), slot: 'espalda', oy: 0,
    rows: [
      '.kk.',
      'kggk',
      '.kk.',
    ],
    back: { oy: 1, trail: 4, rows: [
      '.....kkkkkkkkkkkkkkkkkkkk.....',
      '....krrrrrrrrrrrrrrrrrrrrk....',
      '....krrrrrrrrrrrrrrrrrrrrk....',
      '...krrrrrrrrrrrrrrrrrrrrrrk...',
      '...krrrrrrrrrrrrrrrrrrrrrrk...',
      '..krrrrrrrrrrrrrrrrrrrrrrrrk..',
      '..krrrrrrrrrrrrrrrrrrrrrrrrk..',
      '.krrRrrrrrrrrrrrrrrrrrrrrRrrk.',
      '.krrRrrrrrrrrrrrrrrrrrrrrRrrk.',
      'krrRRrrrrrrrrrrrrrrrrrrrrRRrrk',
      'krrRRrrrrrrrrrrrrrrrrrrrrRRrrk',
      'kRRRRRRRRRRRRRRRRRRRRRRRRRRRRk',
      'kRRRRRRRRRRRRRRRRRRRRRRRRRRRRk',
      '.kkkkkkkkkkkkkkkkkkkkkkkkkkkk.',
    ] },
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
    case 'cansado': // párpado a media altura y ojeras
      return [[-1, 1, ink], [0, 1, ink], [1, 1, ink], [2, 1, ink], [0, 2, ink], [1, 2, ink], [0, 3, BAG], [1, 3, BAG]] as Px[];
    case 'sorprendido':
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

/**
 * Estampa una capa. Desde la fila `trailFrom`, las filas se corren `trail`
 * (la punta de la bufanda que se queda atrás). `maxY` recorta por abajo.
 */
function stamp(g: Grid, layer: Layer, pal: Palette, dx = 0, dy = 0, trail?: { from: number; dx: number; dy: number }, maxY = GRID - 1) {
  layer.rows.forEach((row, j) => {
    const t = trail && j >= trail.from ? trail : null;
    const y = layer.y + j + dy + (t ? t.dy : 0);
    if (y > maxY) return;
    [...row].forEach((ch, i) => { if (ch !== '.') put(g, layer.x + i + dx + (t ? t.dx : 0), y, pal[ch]); });
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
  /** Cola y cresta: -1, 0 o 1 píxel a un lado. También mece lo que lleva en la mano. */
  sway?: -1 | 0 | 1;
  /** Cuánto se queda atrás la punta de la bufanda o la capa [x, y]. */
  trail?: [number, number];
};

// Caminar en 6 cuadros: pie izquierdo, paso, pie derecho, paso. La cola va
// al revés que el cuerpo y la bufanda llega un cuadro tarde.
const FRAMES: Record<Frame, FrameSpec> = {
  quieto: { body: 0, feet: [0, 0], showFeet: true, shadow: 1 },
  respira: { body: 1, feet: [0, 0], showFeet: true, shadow: 1, sway: 1, trail: [0, -1] },
  parpadeo: { body: 0, feet: [0, 0], showFeet: true, shadow: 1, eyes: 'cerrado' },
  paso1: { body: 0, feet: [-1, 0], showFeet: true, shadow: 1, sway: -1, trail: [1, 0] },
  paso2: { body: 1, feet: [-1, 0], showFeet: true, shadow: 1, sway: 0, trail: [1, -1] },
  paso3: { body: 1, feet: [0, 0], showFeet: true, shadow: 1, sway: 1, trail: [0, -1] },
  paso4: { body: 0, feet: [0, -1], showFeet: true, shadow: 1, sway: 1, trail: [-1, 0] },
  paso5: { body: 1, feet: [0, -1], showFeet: true, shadow: 1, sway: 0, trail: [-1, -1] },
  paso6: { body: 1, feet: [0, 0], showFeet: true, shadow: 1, sway: -1, trail: [0, -1] },
  salto: { body: -3, feet: [-4, -4], showFeet: true, shadow: 0.7, trail: [0, 1] },
  agarrado: { body: 0, feet: [1, 1], showFeet: true, shadow: 0, eyes: 'sorpresa', trail: [0, 1] },
  cae: { body: -1, feet: [0, 0], showFeet: true, shadow: 0.6, eyes: 'sorpresa', trail: [0, -1] },
  sueno1: { body: 1, feet: [0, 0], showFeet: true, shadow: 1, eyes: 'cerrado', zzz: 0 },
  sueno2: { body: 2, feet: [0, 0], showFeet: true, shadow: 1, eyes: 'cerrado', zzz: 1 },
  // Antes de saltar se agacha y al caer se aplasta un poco.
  agacha: { body: 2, feet: [0, 0], showFeet: true, shadow: 1.1, trail: [0, -1] },
  aterriza: { body: 1, feet: [0, 0], showFeet: true, shadow: 1.15, eyes: 'cerrado', trail: [0, -2] },
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

/** Dónde va la esquina de una prenda en una especie y un cuadro. */
export function itemPlacement(species: Species, id: ItemId, frame: Frame = 'quieto'): { x: number; y: number; back?: { x: number; y: number } } {
  const def = SPECIES[species];
  const it = ITEMS[id];
  const f = FRAMES[frame];
  const dy = f.body;
  const nudge = def.nudge?.[it.slot] ?? 0;
  if (it.slot === 'mano') {
    return { x: def.hand.x - (it.ox ?? 0) + (f.sway ?? 0) + nudge, y: def.hand.y - it.oy + dy };
  }
  const w = it.rows[0].length;
  const x = 16 - Math.floor(w / 2) + (it.dx ?? 0) + nudge;
  const y = it.slot === 'ojos' ? def.eye.y + 1 - it.oy + dy : def.anchors[it.slot] - it.oy + dy;
  if (!it.back) return { x, y };
  const bw = it.back.rows[0].length;
  return { x, y, back: { x: 16 - Math.floor(bw / 2) + nudge, y: def.anchors[it.slot as 'espalda'] - it.back.oy + dy } };
}

/** Cuadrícula de colores de una mascota (null = transparente). */
export function petGrid(species: Species, opts: PetOpts = {}): Grid {
  const def = SPECIES[species];
  const pal = def.palette;
  const mood: Mood = opts.mood ?? 'normal';
  const outfit = opts.outfit ?? {};
  const frame = opts.frame ?? 'quieto';
  const f = FRAMES[frame];
  const g = blank();
  const dy = f.body;
  const sway = f.sway ?? 0;
  const [tdx, tdy] = f.trail ?? [0, 0];
  const wearing = (slot: Slot): ItemId | null => {
    const id = outfit[slot];
    return id && ITEMS[id] && ITEMS[id].slot === slot ? id : null;
  };

  // Sombra en el piso (dos filas de abajo).
  if (f.shadow > 0) {
    const w = Math.round(9 * f.shadow);
    for (let x = 16 - w; x < 16 + w; x++) put(g, x, 31, SHADOW);
  }
  // Capas de atrás (colas), que se mecen.
  def.extra.filter((l) => l.behind).forEach((l) => stamp(g, l, pal, l.sway ? sway : 0, dy));
  // Lo que va en la espalda, detrás del cuerpo (no tapa la sombra).
  const back = wearing('espalda');
  if (back && ITEMS[back].back) {
    const it = ITEMS[back], pos = itemPlacement(species, back, frame).back!;
    const tr = it.back!.trail;
    stamp(g, { x: pos.x, y: pos.y, rows: it.back!.rows }, ITEM_PAL, 0, 0, tr !== undefined ? { from: tr, dx: tdx, dy: tdy } : undefined, 29);
  }
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
  def.extra.filter((l) => !l.behind).forEach((l) => stamp(g, l, pal, l.sway ? -sway : 0, dy));
  // Mejillas (no cuando está concentrada o cansada).
  if (def.cheek && mood !== 'concentrado' && mood !== 'cansado') {
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
  // Ropa del frente: espalda (correas, broche), cuello, ojos, cabeza y mano.
  for (const slot of ['espalda', 'cuello', 'ojos', 'cabeza', 'mano'] as Slot[]) {
    const id = wearing(slot);
    if (!id) continue;
    const it = ITEMS[id];
    const pos = itemPlacement(species, id, frame);
    stamp(g, { x: pos.x, y: pos.y, rows: it.rows }, ITEM_PAL, 0, 0, it.trail !== undefined ? { from: it.trail, dx: tdx, dy: tdy } : undefined);
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
  // Respira despacio y parpadea a destiempo (6 segundos antes de repetirse).
  quieto: { frames: [
    'quieto', 'quieto', 'quieto', 'respira', 'respira', 'respira', 'quieto', 'quieto', 'parpadeo', 'quieto', 'respira', 'respira',
    'quieto', 'quieto', 'quieto', 'respira', 'respira', 'respira', 'quieto', 'quieto', 'quieto', 'parpadeo', 'respira', 'respira',
  ], fps: 4 },
  camina: { frames: ['paso1', 'paso2', 'paso3', 'paso4', 'paso5', 'paso6'], fps: 10 },
  duerme: { frames: ['sueno1', 'sueno2'], fps: 1.5 },
  celebra: { frames: ['agacha', 'salto', 'salto', 'aterriza'], fps: 8 },
  agarrado: { frames: ['agarrado'], fps: 1 },
};

// ---------- Monedas (12 x 12) ----------

const COINS: Record<Species, { pal: Palette; rows: string[] }> = {
  pinguino: { // pescado
    pal: { k: PET_INK, b: '#5aa9e6', B: '#3a7bd5', w: '#ffffff' },
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
