// ============================================================
//  Qué dice cada mascota. El contenido es el mismo; cambia el tono.
//  Las plantillas usan {n}, {tarea}, {materia}, {min} y {dias}.
// ============================================================
import type { Species } from './art';
import { t } from '../i18n';

export type Situation =
  | 'vencidas' | 'paseo' | 'sin_tocar' | 'hecha' | 'dia_completo' | 'parcial'
  | 'racha_riesgo' | 'tarde' | 'enfoque_inicio' | 'enfoque_fin' | 'enfoque_corto'
  | 'despierta' | 'agarrar' | 'hola' | 'que_hacemos' | 'sugerencia' | 'nada_pendiente'
  | 'dos_minutos' | 'adoptada' | 'compra' | 'enfoque_activo' | 'logro' | 'repaso_fin' | 'meta'
  | 'dia_cerrado' | 'que_hacemos_trabajo' | 'rana';

type Lines = Record<Species, string[]>;

export const LINES: Record<Situation, Lines> = {
  vencidas: {
    pinguino: [t('Hay {n} vencida{s}. Empecemos por ahí.'), t('Primero lo vencido: {tarea}.')],
    gato: [t('{tarea} ya venció. No se va a hacer sola.'), t('Hay {n} vencida{s}. Solo digo.')],
    perro: [t('¡{n} vencida{s}! ¡La sacamos ya!'), t('¡Vamos con {tarea}! ¡Tú puedes!')],
    loro: [t('¿Vencida? ¿Vencida? ¿{tarea}?'), t('¿{n} vencida{s}? ¿La hacemos?')],
  },
  paseo: {
    pinguino: [t('Elige una sola. La más corta es {tarea}.'), t('Mucho ir y venir. ¿Qué tal {tarea}?')],
    gato: [t('Mucho mirar, poco hacer. ¿{tarea}?'), t('Ya diste la vuelta completa. {tarea} sigue ahí.')],
    perro: [t('¡Vamos con la más fácil! ¡{tarea}!'), t('¡Elige una y la hacemos juntos!')],
    loro: [t('¿{tarea}? ¿{tarea}?'), t('¿Paseando? ¿Paseando? ¿Empezamos?')],
  },
  sin_tocar: {
    pinguino: [t('{tarea} lleva {dias} días quieta. Dividámosla en pasos.')],
    gato: [t('{tarea} lleva {dias} días mirándote.')],
    perro: [t('¡Partamos {tarea} en pedacitos!')],
    loro: [t('¿{tarea}? ¿Pasos? ¿Hacemos pasos?')],
  },
  hecha: {
    pinguino: [t('Una menos. Bien hecho.'), t('Lista. Sigamos así.')],
    gato: [t('No está mal. Nada mal.'), t('Una menos. Ahora sí me impresionas un poco.')],
    perro: [t('¡SÍ! ¡Otra más!'), t('¡Bien! ¡Eres lo máximo!')],
    loro: [t('¡Lista! ¡Lista!'), t('¡Hecha! ¡Hecha!')],
  },
  rana: {
    pinguino: [t('Primero lo primero: {tarea}.')],
    gato: [t('{tarea} no se va a hacer sola. Empieza por ahí.')],
    perro: [t('¡Primero {tarea}! ¡Después todo es más fácil!')],
    loro: [t('¿{tarea}? ¿Primero? ¡Primero!')],
  },
  dia_cerrado: {
    pinguino: [t('Día cerrado. Mañana seguimos.')],
    gato: [t('Cerraste el día. Yo también me retiro.')],
    perro: [t('¡Día cerrado! ¡Buen trabajo hoy!')],
    loro: [t('¡Cerrado! ¡Hasta mañana!')],
  },
  que_hacemos_trabajo: {
    pinguino: [t('Aquí estoy, sin hacer ruido.')],
    gato: ['Trabaja tranquilo. Yo vigilo.'],
    perro: [t('¡Aquí! Calladito, lo prometo.')],
    loro: [t('Shh. Shh. Aquí estoy.')],
  },
  dia_completo: {
    pinguino: [t('Día completo. Bien hecho.')],
    gato: [t('Todo listo. Ahora sí, siesta.')],
    perro: [t('¡LO LOGRASTE! ¡TODO LISTO!')],
    loro: [t('¡Todo! ¡Todo listo!')],
  },
  parcial: {
    pinguino: [t('El parcial de {materia} es en {dias} días. 15 min de repaso hoy.')],
    gato: [t('En {dias} días hay parcial de {materia}. Solo digo.')],
    perro: [t('¡Repasemos {materia}! ¡El parcial es en {dias} días!')],
    loro: [t('¿Parcial? ¿{materia}? ¿Repasamos?')],
  },
  racha_riesgo: {
    pinguino: [t('Con 10 minutos hoy no pierdes la racha.')],
    gato: [t('Tu racha cuelga de un hilo.')],
    perro: [t('¡No perdamos la racha! ¡10 minutitos!')],
    loro: [t('¿Racha? ¿10 minutos? ¿10 minutos?')],
  },
  tarde: {
    pinguino: [t('Ya es tarde. Mañana seguimos.')],
    gato: [t('Hasta yo tengo sueño.')],
    perro: [t('¡A dormir, campeón!')],
    loro: [t('¿Dormir? Dormir.')],
  },
  enfoque_inicio: {
    pinguino: [t('Me quedo callado aquí. Tú a lo tuyo.')],
    gato: ['Silencio. Estoy vigilando.'],
    perro: [t('¡Shh! ¡A concentrarnos!')],
    loro: ['Shh. Shh.'],
  },
  enfoque_fin: {
    pinguino: [t('Buen enfoque: {min} min.'), t('{min} minutos bien aprovechados.')],
    gato: [t('{min} minutos. Aceptable. Muy aceptable.')],
    perro: [t('¡{min} minutos! ¡Qué máquina!')],
    loro: [t('¡{min} minutos! ¡{min} minutos!')],
  },
  meta: {
    pinguino: [t('Tu plan para {materia}: {plan}'), t('Recuerda lo que te propusiste: {plan}')],
    gato: [t('Te dejo esto, de ti para ti: {plan}')],
    perro: [t('¡Acuérdate de tu plan para {materia}! {plan}')],
    loro: [t('¿Te acuerdas? ¿Te acuerdas? {plan}')],
  },
  repaso_fin: {
    pinguino: [t('{n} tarjetas repasadas. Así se queda en la cabeza.'), t('Repaso listo: {n} tarjetas.')],
    gato: [t('{n} tarjetas. Tu memoria y yo estamos impresionados.')],
    perro: [t('¡{n} tarjetas! ¡Tu cerebro está en forma!')],
    loro: [t('¿{n} tarjetas? ¡{n} tarjetas!')],
  },
  enfoque_corto: {
    pinguino: [t('La próxima, intentemos 10 minutos seguidos.')],
    gato: [t('Eso fue un suspiro. Otra vez.')],
    perro: [t('¡Casi! ¡La próxima más larga!')],
    loro: [t('¿Ya? ¿Ya?')],
  },
  enfoque_activo: {
    pinguino: [t('Sigues en enfoque. ¿Lo terminamos?')],
    gato: [t('Estabas concentrado. ¿Seguro?')],
    perro: [t('¡Seguimos en enfoque! ¿Paramos?')],
    loro: [t('¿Enfoque? ¿Paramos?')],
  },
  despierta: {
    pinguino: [t('Aquí estoy.')],
    gato: [t('Estaba descansando los ojos.')],
    perro: [t('¡Desperté! ¡Hola!')],
    loro: [t('¿Qué? ¿Qué pasó?')],
  },
  agarrar: {
    pinguino: [t('¡Uy!')],
    gato: [t('Bájame.')],
    perro: [t('¡Wiii!')],
    loro: [t('¡Vuelo! ¡Vuelo!')],
  },
  hola: {
    pinguino: [t('Hola. Hoy tienes {n} para hacer.')],
    gato: [t('Volviste. Hay {n} cosas para hoy.')],
    perro: [t('¡Hola! ¡Hoy hay {n}! ¡Vamos!')],
    loro: [t('¡Hola! ¡Hola! ¿{n} para hoy?')],
  },
  que_hacemos: {
    pinguino: [t('¿Qué hacemos?')],
    gato: [t('¿Sí?')],
    perro: [t('¡Hola! ¿Qué hacemos?')],
    loro: [t('¿Qué? ¿Qué hacemos?')],
  },
  sugerencia: {
    pinguino: ['Sigue {tarea}.'],
    gato: [t('{tarea}. Te está esperando.')],
    perro: [t('¡{tarea}! ¡Vamos!')],
    loro: [t('¿{tarea}? ¡{tarea}!')],
  },
  nada_pendiente: {
    pinguino: [t('No hay nada urgente. Buen momento para repasar.')],
    gato: [t('Nada pendiente. Puedes acariciarme.')],
    perro: [t('¡Nada pendiente! ¿Repasamos tarjetas?')],
    loro: [t('¿Nada? ¿Nada? ¿Repasamos?')],
  },
  dos_minutos: {
    pinguino: [t('Regla de los 2 minutos: abre {tarea} y haz solo lo primero.')],
    gato: [t('Dos minutos. Abre {tarea}. Luego decides.')],
    perro: [t('¡Solo 2 minutos con {tarea} y ya!')],
    loro: [t('¿Dos minutos? ¿Dos minutos?')],
  },
  adoptada: {
    pinguino: [t('Hola, soy {nombre}. Te acompaño mientras estudias.')],
    gato: [t('Soy {nombre}. Vamos a llevarnos bien si me das tiempo de siesta.')],
    perro: [t('¡Hola! ¡Soy {nombre}! ¡Vamos a estudiar!')],
    loro: [t('¡{nombre}! ¡{nombre}! ¡Hola!')],
  },
  logro: {
    pinguino: [t('Logro nuevo:')],
    gato: [t('Bien, desbloqueaste algo:')],
    perro: [t('¡LOGRO NUEVO!')],
    loro: [t('¡Logro! ¡Logro!')],
  },
  compra: {
    pinguino: [t('Me queda bien. Gracias.')],
    gato: [t('Elegante. Como yo.')],
    perro: [t('¡Me encanta! ¡Me encanta!')],
    loro: [t('¡Nuevo! ¡Nuevo!')],
  },
};

/** Frases del día: cortas, para el primer arranque. */
export const DAILY: string[] = [
  t('Empieza por lo más pequeño. Lo demás se mueve solo.'),
  t('Hecho es mejor que perfecto.'),
  t('Diez minutos cuentan.'),
  t('Una tarea a la vez.'),
  t('Si te da pereza empezar, empieza por dos minutos.'),
  t('El mejor momento para repasar es antes de olvidarlo.'),
  t('Hoy no tienes que hacerlo todo. Solo lo siguiente.'),
  t('Divide lo grande en pasos que puedas terminar hoy.'),
  t('Guarda el celular lejos mientras estudias.'),
  t('Un descanso corto también es parte del trabajo.'),
  t('Lo que se agenda, se hace.'),
  t('Estudiar poco todos los días gana a estudiar todo un día.'),
  t('Escribe la duda en vez de quedarte atascado.'),
  t('Cierra lo que no estés usando.'),
  t('Termina una cosa antes de abrir otra.'),
  t('Explicarlo en voz alta es la mejor prueba.'),
  t('Si no sabes por dónde empezar, haz una lista.'),
  t('Lo difícil primero, mientras tienes energía.'),
  t('Agua, luz y una silla cómoda ayudan más de lo que crees.'),
  t('Mañana te vas a agradecer lo de hoy.'),
  t('No esperes ganas. Empieza y llegan.'),
  t('Repasar 15 minutos hoy ahorra una hora mañana.'),
  t('Tu horario es una guía, no una cárcel.'),
  t('Un pomodoro es un buen comienzo.'),
  t('Pregunta pronto. Las dudas crecen.'),
  t('Revisa la rúbrica antes de empezar.'),
  t('Haz un borrador feo. Luego lo arreglas.'),
  t('Lo urgente y lo importante no siempre son lo mismo.'),
  t('Las tarjetas de repaso funcionan si las haces a diario.'),
  t('Duerme bien la noche antes del parcial.'),
  t('Celebra lo que terminas, aunque sea pequeño.'),
  t('No te compares. Compárate con tu yo de ayer.'),
  t('Pon una hora de fin, no solo de inicio.'),
  t('Si te distraes, vuelve sin regañarte.'),
  t('Los ejercicios resueltos enseñan más que leer la teoría tres veces.'),
  t('Un escritorio despejado ayuda a pensar.'),
  t('Planea mañana antes de cerrar hoy.'),
  t('Una tarea vencida pesa más que dos por hacer.'),
  t('Cinco minutos de orden ahorran veinte de búsqueda.'),
  t('Estudia con preguntas, no solo con resúmenes.'),
  t('Si algo toma menos de dos minutos, hazlo ya.'),
  t('Lo que no está anotado, se olvida.'),
  t('Los grupos de estudio funcionan con una meta clara.'),
  t('Avanza aunque sea un paso.'),
  t('El primer párrafo es el más difícil. Escríbelo mal.'),
  t('Revisa tus notas el mismo día de la clase.'),
  t('Elige una sola meta para hoy.'),
  t('Silencia las notificaciones por un rato.'),
  t('Haz una pausa antes de estar agotado.'),
  t('Leer no es estudiar. Practicar sí.'),
  t('Empieza el trabajo grande con anticipación, aunque sea un poco.'),
  t('Lo constante vence a lo intenso.'),
  t('Un día malo no borra una buena semana.'),
  t('Pide ayuda antes de que sea tarde.'),
  t('Si te bloqueas, cambia de tarea por diez minutos.'),
  t('Termina el día anotando lo que lograste.'),
  t('Llegar a tiempo a clase ya es medio trabajo hecho.'),
  t('Lo que hoy parece mucho, en pasos es poco.'),
  t('Ya llegaste hasta aquí. Sigue.'),
  t('Tu futuro yo está mirando. Hazlo sonreír.'),
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
