# Mithralda — El Reino Pixelado

ARPG top-down de fantasía oscura en pixel art. HTML5 Canvas + JavaScript puro (sin build, sin dependencias). UI en español.

Juego en vivo: https://happy-poppy-523.higgsfield.gg/

## Cómo correrlo en local
No necesita compilar nada. Solo sírvelo con cualquier servidor estático (no abras index.html con doble clic; los assets se cargan por HTTP):

El juego vive en la raíz del repositorio (`index.html` está en la raíz).

```bash
# opción 1: Python
python3 -m http.server 8000
# abre http://localhost:8000

# opción 2: Node
npx serve .
```

Modo desarrollo: agrega `?dev` a la URL (`http://localhost:8000/index.html?dev`) para ver FPS y usar `window.__dev.spawn(tipo,dx,dy)` y `window.__dev.tp(tx,ty)` desde la consola.

## Estructura
```
mithralda/
├── index.html        # página + canvas + bucle principal + overlay de nombre
├── game.js           # TODO el juego: mundo, héroe, clases, enemigos, combate, FX, render, HUD
├── logic.js          # stub de reglas (requerido por el pipeline de despliegue)
├── strings.js        # textos de la UI en español
├── design/
│   └── assets.csv     # inventario de assets
├── assets/
│   ├── class/         # sprites de las 5 clases (encapuchado), 4 direcciones × idle/walk/attack
│   ├── char/          # sprites del esqueleto mago (enemigo animado)
│   ├── tiles/         # texturas de suelo y muros
│   └── props/         # árboles, rocas, barriles, ruinas, etc.
└── tools-sprites/     # generadores en Python/PIL con los que se crearon los sprites
```

## Generar / editar sprites
Los sprites de las clases y varios props se generan por código con Pillow (PIL).

```bash
cd tools-sprites
pip install pillow
python3 gen_cloak.py     # regenera los 5 personajes (encapuchados) en assets/class/
python3 palette.py       # genera la lámina de paleta de clases
```

`gen_cloak.py` es el generador actual de los personajes. El diccionario `CFG` (arriba del archivo) define el color de capa, acento, arma y orbe de cada clase — cambia ahí los colores o agrega clases.

## Controles
- Mover: WASD / flechas (o joystick táctil en móvil)
- Atacar: clic / J / tecla 1  (cada clase ataca distinto)
- Hechizos: 2 Llamarada · 3 Sanar · 4 Onda Rúnica
- Rodar (esquiva con i-frames): Espacio
- Recoger: F · Inventario: I · Mapa: M · Hablar: E · Pausa: Esc
- Gamepad compatible

## Clases
| Clase | Ataque básico |
|-------|----------------|
| Guerrero | Corte cuerpo a cuerpo en arco |
| Paladín | Flechas a distancia |
| Mago | Orbe arcano con daño en área |
| Druida | Espinas/hojas en cono frontal |
| Sacerdote | Nova de luz: daña alrededor y se cura |

## Despliegue (Higgsfield)
Se empaqueta en zip (index.html, game.js, logic.js, strings.js, design, assets) y se sube vía el pipeline de Higgsfield. Para actualizar el MISMO juego/URL hay que reutilizar el game_id existente.

## Nota sobre los sprites
Los personajes son diseños **originales** en un estilo genérico de aventurero encapuchado. No se incluye ni reproduce ningún personaje con derechos de autor.
