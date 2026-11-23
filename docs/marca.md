# Marca de Kaderno: Margen

Guía corta para que todo lo que lleve el nombre de Kaderno se vea igual. El código está en `lib/brand.ts`; los íconos se generan con `npx tsx scripts/brand-icons.ts`.

## La idea

La raya roja del margen de los cuadernos de siempre, junto a una K. Kaderno viene de "cuaderno": el logo cuenta eso sin palabras.

## Logo

- Un cuadro de 48 x 48 con esquinas de 12, la raya del margen y la K en trazo redondo.
- **Tinta:** cuadro de tinta, K de papel, margen coral. Va sobre fondos claros, en los íconos de la app y en la pestaña del navegador.
- **Papel:** cuadro claro, K de tinta, margen coral. Va sobre fondos oscuros.
- **Una tinta:** todo en negro y blanco, para documentos e impresos.
- **Silueta:** solo la K y el margen en blanco, para la insignia de los avisos.
- El logo no cambia con el tema ni con el color de acento.
- Espacio libre alrededor: al menos la mitad del ancho del cuadro.
- No se estira, no se gira, no se le ponen sombras ni degradados, no se cambia el color del margen.
- Tamaño mínimo: 16 px. Desde 16 px se reconocen la raya y la K.

## Nombre

"kaderno", siempre en minúscula en el logotipo, en Plus Jakarta Sans de peso 800 con el espaciado un poco cerrado. En el texto corrido se escribe Kaderno, con mayúscula, como cualquier nombre.

## Colores

| Nombre | Hex | Uso |
| --- | --- | --- |
| Tinta | #1B1D3A | Texto en claro, cuadro del logo |
| Papel | #F7F4EE | Fondo en claro, K del logo |
| Margen | #F2674E | Raya del logo, acento en oscuro |
| Margen hondo | #C93F28 | Acento en claro (con texto blanco) |
| Lápiz | #2F6FE0 | Color de apoyo |

Para Trabajo (fase 2): grafito #0F1014, hueso #F5F4F1, cobre #D98A6A y terracota #A9472F.

Los temas de la marca son **Kaderno oscuro** y **Kaderno claro**. Cada persona escoge su acento en Personalizar (coral, lápiz azul, hoja verde, uva, mostaza o rosa); todos pasan el contraste de 4,5:1 en texto. Los temas de antes siguen en "Más colores".

Los errores van en un rojo distinto al coral (#FF5C70 en oscuro, #D6334A en claro) y siempre con un ícono o una palabra, nunca solo con el color.

## Letra

- Plus Jakarta Sans para la app (títulos y texto), servida desde el mismo servidor (`public/fonts`). Licencia SIL Open Font License, incluida junto al archivo.
- Las notas se leen en Source Serif, como hasta ahora.
- Los documentos que se descargan (cuentas de cobro, informes, historial) van en Times New Roman, todo en negro.

## Tono

- **Estudio:** cercano, en segunda persona, frases cortas. Celebra sin exagerar.
- **Trabajo:** directo y claro, sin chistes ni frases de ánimo.
- En los dos: español neutro de Colombia, sin rayas largas, sin mayúsculas sostenidas, sin signos de exclamación seguidos.

## Movimiento

Corto (de 120 a 300 ms), con curvas que frenan al final, y solo cuando la persona hace algo. Con "reducir movimiento" del sistema, todo queda quieto. Detalle en `lib/motion.ts`.
