// ============================================================
//  Qué dice cada mascota. El contenido es el mismo; cambia el tono.
//  Las plantillas usan {n}, {tarea}, {materia}, {min} y {dias}.
// ============================================================
import type { Species } from './art';

export type Situation =
  | 'vencidas' | 'paseo' | 'sin_tocar' | 'hecha' | 'dia_completo' | 'parcial'
  | 'racha_riesgo' | 'tarde' | 'enfoque_inicio' | 'enfoque_fin' | 'enfoque_corto'
  | 'despierta' | 'agarrar' | 'hola' | 'que_hacemos' | 'sugerencia' | 'nada_pendiente'
  | 'dos_minutos' | 'adoptada' | 'compra' | 'enfoque_activo' | 'logro' | 'repaso_fin' | 'meta';

type Lines = Record<Species, string[]>;

export const LINES: Record<Situation, Lines> = {
  vencidas: {
    pinguino: ['Hay {n} vencida{s}. Empecemos por ahí.', 'Primero lo vencido: {tarea}.'],
    gato: ['{tarea} ya venció. No se va a hacer sola.', 'Hay {n} vencida{s}. Solo digo.'],
    perro: ['¡{n} vencida{s}! ¡La sacamos ya!', '¡Vamos con {tarea}! ¡Tú puedes!'],
    loro: ['¿Vencida? ¿Vencida? ¿{tarea}?', '¿{n} vencida{s}? ¿La hacemos?'],
  },
  paseo: {
    pinguino: ['Elige una sola. La más corta es {tarea}.', 'Mucho ir y venir. ¿Qué tal {tarea}?'],
    gato: ['Mucho mirar, poco hacer. ¿{tarea}?', 'Ya diste la vuelta completa. {tarea} sigue ahí.'],
    perro: ['¡Vamos con la más fácil! ¡{tarea}!', '¡Elige una y la hacemos juntos!'],
    loro: ['¿{tarea}? ¿{tarea}?', '¿Paseando? ¿Paseando? ¿Empezamos?'],
  },
  sin_tocar: {
    pinguino: ['{tarea} lleva {dias} días quieta. Dividámosla en pasos.'],
    gato: ['{tarea} lleva {dias} días mirándote.'],
    perro: ['¡Partamos {tarea} en pedacitos!'],
    loro: ['¿{tarea}? ¿Pasos? ¿Hacemos pasos?'],
  },
  hecha: {
    pinguino: ['Una menos. Bien hecho.', 'Lista. Sigamos así.'],
    gato: ['No está mal. Nada mal.', 'Una menos. Ahora sí me impresionas un poco.'],
    perro: ['¡SÍ! ¡Otra más!', '¡Bien! ¡Eres lo máximo!'],
    loro: ['¡Lista! ¡Lista!', '¡Hecha! ¡Hecha!'],
  },
  dia_completo: {
    pinguino: ['Día completo. Bien hecho.'],
    gato: ['Todo listo. Ahora sí, siesta.'],
    perro: ['¡LO LOGRASTE! ¡TODO LISTO!'],
    loro: ['¡Todo! ¡Todo listo!'],
  },
  parcial: {
    pinguino: ['El parcial de {materia} es en {dias} días. 15 min de repaso hoy.'],
    gato: ['En {dias} días hay parcial de {materia}. Solo digo.'],
    perro: ['¡Repasemos {materia}! ¡El parcial es en {dias} días!'],
    loro: ['¿Parcial? ¿{materia}? ¿Repasamos?'],
  },
  racha_riesgo: {
    pinguino: ['Con 10 minutos hoy no pierdes la racha.'],
    gato: ['Tu racha cuelga de un hilo.'],
    perro: ['¡No perdamos la racha! ¡10 minutitos!'],
    loro: ['¿Racha? ¿10 minutos? ¿10 minutos?'],
  },
  tarde: {
    pinguino: ['Ya es tarde. Mañana seguimos.'],
    gato: ['Hasta yo tengo sueño.'],
    perro: ['¡A dormir, campeón!'],
    loro: ['¿Dormir? Dormir.'],
  },
  enfoque_inicio: {
    pinguino: ['Me quedo callado aquí. Tú a lo tuyo.'],
    gato: ['Silencio. Estoy vigilando.'],
    perro: ['¡Shh! ¡A concentrarnos!'],
    loro: ['Shh. Shh.'],
  },
  enfoque_fin: {
    pinguino: ['Buen enfoque: {min} min.', '{min} minutos bien aprovechados.'],
    gato: ['{min} minutos. Aceptable. Muy aceptable.'],
    perro: ['¡{min} minutos! ¡Qué máquina!'],
    loro: ['¡{min} minutos! ¡{min} minutos!'],
  },
  meta: {
    pinguino: ['Tu plan para {materia}: {plan}', 'Recuerda lo que te propusiste: {plan}'],
    gato: ['Te dejo esto, de ti para ti: {plan}'],
    perro: ['¡Acuérdate de tu plan para {materia}! {plan}'],
    loro: ['¿Te acuerdas? ¿Te acuerdas? {plan}'],
  },
  repaso_fin: {
    pinguino: ['{n} tarjetas repasadas. Así se queda en la cabeza.', 'Repaso listo: {n} tarjetas.'],
    gato: ['{n} tarjetas. Tu memoria y yo estamos impresionados.'],
    perro: ['¡{n} tarjetas! ¡Tu cerebro está en forma!'],
    loro: ['¿{n} tarjetas? ¡{n} tarjetas!'],
  },
  enfoque_corto: {
    pinguino: ['La próxima, intentemos 10 minutos seguidos.'],
    gato: ['Eso fue un suspiro. Otra vez.'],
    perro: ['¡Casi! ¡La próxima más larga!'],
    loro: ['¿Ya? ¿Ya?'],
  },
  enfoque_activo: {
    pinguino: ['Sigues en enfoque. ¿Lo terminamos?'],
    gato: ['Estabas concentrado. ¿Seguro?'],
    perro: ['¡Seguimos en enfoque! ¿Paramos?'],
    loro: ['¿Enfoque? ¿Paramos?'],
  },
  despierta: {
    pinguino: ['Aquí estoy.'],
    gato: ['Estaba descansando los ojos.'],
    perro: ['¡Desperté! ¡Hola!'],
    loro: ['¿Qué? ¿Qué pasó?'],
  },
  agarrar: {
    pinguino: ['¡Uy!'],
    gato: ['Bájame.'],
    perro: ['¡Wiii!'],
    loro: ['¡Vuelo! ¡Vuelo!'],
  },
  hola: {
    pinguino: ['Hola. Hoy tienes {n} para hacer.'],
    gato: ['Volviste. Hay {n} cosas para hoy.'],
    perro: ['¡Hola! ¡Hoy hay {n}! ¡Vamos!'],
    loro: ['¡Hola! ¡Hola! ¿{n} para hoy?'],
  },
  que_hacemos: {
    pinguino: ['¿Qué hacemos?'],
    gato: ['¿Sí?'],
    perro: ['¡Hola! ¿Qué hacemos?'],
    loro: ['¿Qué? ¿Qué hacemos?'],
  },
  sugerencia: {
    pinguino: ['Sigue {tarea}.'],
    gato: ['{tarea}. Te está esperando.'],
    perro: ['¡{tarea}! ¡Vamos!'],
    loro: ['¿{tarea}? ¡{tarea}!'],
  },
  nada_pendiente: {
    pinguino: ['No hay nada urgente. Buen momento para repasar.'],
    gato: ['Nada pendiente. Puedes acariciarme.'],
    perro: ['¡Nada pendiente! ¿Repasamos tarjetas?'],
    loro: ['¿Nada? ¿Nada? ¿Repasamos?'],
  },
  dos_minutos: {
    pinguino: ['Regla de los 2 minutos: abre {tarea} y haz solo lo primero.'],
    gato: ['Dos minutos. Abre {tarea}. Luego decides.'],
    perro: ['¡Solo 2 minutos con {tarea} y ya!'],
    loro: ['¿Dos minutos? ¿Dos minutos?'],
  },
  adoptada: {
    pinguino: ['Hola, soy {nombre}. Te acompaño mientras estudias.'],
    gato: ['Soy {nombre}. Vamos a llevarnos bien si me das tiempo de siesta.'],
    perro: ['¡Hola! ¡Soy {nombre}! ¡Vamos a estudiar!'],
    loro: ['¡{nombre}! ¡{nombre}! ¡Hola!'],
  },
  logro: {
    pinguino: ['Logro nuevo:'],
    gato: ['Bien, desbloqueaste algo:'],
    perro: ['¡LOGRO NUEVO!'],
    loro: ['¡Logro! ¡Logro!'],
  },
  compra: {
    pinguino: ['Me queda bien. Gracias.'],
    gato: ['Elegante. Como yo.'],
    perro: ['¡Me encanta! ¡Me encanta!'],
    loro: ['¡Nuevo! ¡Nuevo!'],
  },
};

/** Frases del día: cortas, para el primer arranque. */
export const DAILY: string[] = [
  'Empieza por lo más pequeño. Lo demás se mueve solo.',
  'Hecho es mejor que perfecto.',
  'Diez minutos cuentan.',
  'Una tarea a la vez.',
  'Si te da pereza empezar, empieza por dos minutos.',
  'El mejor momento para repasar es antes de olvidarlo.',
  'Hoy no tienes que hacerlo todo. Solo lo siguiente.',
  'Divide lo grande en pasos que puedas terminar hoy.',
  'Guarda el celular lejos mientras estudias.',
  'Un descanso corto también es parte del trabajo.',
  'Lo que se agenda, se hace.',
  'Estudiar poco todos los días gana a estudiar todo un día.',
  'Escribe la duda en vez de quedarte atascado.',
  'Cierra lo que no estés usando.',
  'Termina una cosa antes de abrir otra.',
  'Explicarlo en voz alta es la mejor prueba.',
  'Si no sabes por dónde empezar, haz una lista.',
  'Lo difícil primero, mientras tienes energía.',
  'Agua, luz y una silla cómoda ayudan más de lo que crees.',
  'Mañana te vas a agradecer lo de hoy.',
  'No esperes ganas. Empieza y llegan.',
  'Repasar 15 minutos hoy ahorra una hora mañana.',
  'Tu horario es una guía, no una cárcel.',
  'Un pomodoro es un buen comienzo.',
  'Pregunta pronto. Las dudas crecen.',
  'Revisa la rúbrica antes de empezar.',
  'Haz un borrador feo. Luego lo arreglas.',
  'Lo urgente y lo importante no siempre son lo mismo.',
  'Las tarjetas de repaso funcionan si las haces a diario.',
  'Duerme bien la noche antes del parcial.',
  'Celebra lo que terminas, aunque sea pequeño.',
  'No te compares. Compárate con tu yo de ayer.',
  'Pon una hora de fin, no solo de inicio.',
  'Si te distraes, vuelve sin regañarte.',
  'Los ejercicios resueltos enseñan más que leer la teoría tres veces.',
  'Un escritorio despejado ayuda a pensar.',
  'Planea mañana antes de cerrar hoy.',
  'Una tarea vencida pesa más que dos por hacer.',
  'Cinco minutos de orden ahorran veinte de búsqueda.',
  'Estudia con preguntas, no solo con resúmenes.',
  'Si algo toma menos de dos minutos, hazlo ya.',
  'Lo que no está anotado, se olvida.',
  'Los grupos de estudio funcionan con una meta clara.',
  'Avanza aunque sea un paso.',
  'El primer párrafo es el más difícil. Escríbelo mal.',
  'Revisa tus notas el mismo día de la clase.',
  'Elige una sola meta para hoy.',
  'Silencia las notificaciones por un rato.',
  'Haz una pausa antes de estar agotado.',
  'Leer no es estudiar. Practicar sí.',
  'Empieza el trabajo grande con anticipación, aunque sea un poco.',
  'Lo constante vence a lo intenso.',
  'Un día malo no borra una buena semana.',
  'Pide ayuda antes de que sea tarde.',
  'Si te bloqueas, cambia de tarea por diez minutos.',
  'Termina el día anotando lo que lograste.',
  'Llegar a tiempo a clase ya es medio trabajo hecho.',
  'Lo que hoy parece mucho, en pasos es poco.',
  'Ya llegaste hasta aquí. Sigue.',
  'Tu futuro yo está mirando. Hazlo sonreír.',
];

/** Elige una línea y rellena la plantilla. `seed` permite variar sin azar en las pruebas. */
export function lineFor(sit: Situation, species: Species, vars: Record<string, string | number> = {}, seed = Math.random()): string {
  const list = LINES[sit][species];
  const raw = list[Math.floor(seed * list.length) % list.length];
  const n = Number(vars.n ?? 0);
  return raw.replace(/\{(\w+)\}/g, (_, k) => k === 's' ? (n === 1 ? '' : 's') : String(vars[k] ?? ''));
}

/** Frase del día: la misma todo el día y no se repite en 30 días seguidos. */
export function dailyPhrase(date = new Date()): string {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  // Paso coprimo con el largo de la lista para recorrerla entera antes de repetir.
  const step = 17;
  return DAILY[(day * step) % DAILY.length];
}
