# Mithralda — El Reino Pixelado

ARPG top-down de fantasía oscura en pixel art. HTML5 Canvas + JavaScript puro (sin build, sin dependencias). UI en español.

## ▶ Jugar ahora

**URL de juego OFICIAL y ÚNICA: https://carlosdcastrosa-cloud.github.io/Mithralda-Online/**

GitHub Pages (rama `gh-pages`) es el host de producción del juego. Es la única URL que se comunica a jugadores y al board, y la única que QA verifica.

> **Espejo de Higgsfield RETIRADO (directiva del board, [CAS-412](/CAS/issues/CAS-412)):** la antigua URL fija `tender-bridge-504.higgsfield.gg` quedó congelada en un build viejo por la interrupción permanente de `deploy_game` (CAS-159/CAS-136) y fue retirada como destino de deploy. No deployar ni citar esa URL; el pipeline de Higgsfield ya no forma parte de este repositorio.

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

Pruebas de colisión: agrega `?test` (o `?dev`) y abre la consola — al cargar corre `runCollisionTests()`, que ejercita contra el mundo real: caminar contra un muro (bloqueado), deslizarse por un muro, rodar/embestir contra un muro (sin atravesarlo) y proyectiles barridos. Vuelve a correrlas con `window.__collisionTests()`. Sin dependencias.

## Invariantes de rejilla y colisión (E1.3)
Una sola fuente de verdad en `game.js`; las épicas de combate y construcción de mundo dependen de esto:
- **Tamaño de tile:** `TS = 32` px. Todo (generación, movimiento, colisión, render, minimapa) se deriva de `TS`; no hay otros literales `32` para tiles.
- **Test de tile sólido:** `isSolidTile(tx,ty)` = agua + `wallSet`. Es el ÚNICO lugar que decide si un tile es transitable; `solidBlocked()` y el spawneo lo usan.
- **Sólidos circulares** (props/fuentes) bloquean por radio en `solidBlocked()` (`radio_ent + radio_sólido`). El test de tile es por punto central (una entidad puede solaparse visualmente con el borde de un muro hasta su radio; los pasillos se diseñan ≥1 tile).
- **Radios de colisión:** héroe `HERO_R = 12`, enemigos `tpl.size * ENEMY_R_MUL (0.6)`, proyectiles `PROJ_R = 4`.
- **Sin tunneling:** `moveEnt()` y el movimiento de proyectiles están **substeppeados** (`SWEEP_STEP = TS/4 = 8` px máx. entre muestras). Junto con el bucle de timestep fijo (`index.html`, `STEP = 1/60`), los móviles más rápidos (rodar `430 ≈ 7.2` px/paso, flecha `440 ≈ 7.3` px/paso) no pueden atravesar un muro de 32 px.

## Verificación (harness headless)
Arnés repetible en `tools/` que corre el juego real en Chromium headless (puppeteer-core, solo `devDependency`; el juego desplegado sigue sin dependencias de runtime). El binario de Chromium se autodetecta (`PUPPETEER_EXECUTABLE_PATH`, `/usr/bin/chromium`, …).

```bash
npm install --include=dev   # el entorno usa NODE_ENV=production; hay que incluir dev deps
npm run smoke               # menu→clase→play en headless; 0 errores, spawns, FPS ≥ 58 + screenshot
npm run determinism         # buildWorld() es puro y repetible (mismo mundo siempre)
npm run verify              # determinism + smoke
```

- **`tools/smoke.mjs`** — conduce menú → selección de clase → `play` con input sintético, sostiene movimiento mientras muestrea FPS desde el `requestAnimationFrame` real, afirma: cero errores de página, escena llega a `play`, héroe presente, enemigos spawnean, y FPS ≥ 58. Guarda `tools/smoke-screenshot.png`.
- **`tools/determinism.mjs`** — afirma que `buildWorld()` produce terreno/sólidos/muros/spawns idénticos en N corridas y entre cargas de página. Protege la asunción de autoridad-de-servidor de Stage-2.
- **`tools/harness.mjs`** — servidor estático efímero + lanzador de Chromium compartido por ambos.
- Hooks de prueba (solo `?dev`, sin impacto en gameplay) viven en `window.__dev` dentro de `game.js`: `scene()`, `enemyCount()`, `hero()`, `worldFingerprint()`.

## Arquitectura del motor — seams para Stage-2
El juego entero vive hoy en una clausura (`createGame()` en `game.js`). Funciona y es performante, pero para Stage-2 (servidor autoritativo + red) hay que poder extraer el **núcleo de simulación** sin reescribir. Las fronteras *intencionadas* (aún no físicamente separadas en archivos) son:

| Capa | Responsabilidad | Dónde vive hoy | Regla |
|------|-----------------|----------------|-------|
| **Sim core** | `update()` paso fijo, colisión (`moveEnt`/`solidBlocked`/`isSolidTile`), RNG (`seed`/`srand`), IA de enemigos, `buildWorld()` | `game.js` (clausura) | Determinista. Sin `Date`, sin `Math.random` en lógica, sin leer estado de render/DOM. |
| **Render** | `render(alpha)`, dibujo de sprites/FX/HUD, cámara, minimapa | `game.js` | Solo lee estado de sim; **nunca** muta la simulación. |
| **Input** | teclado/puntero/gamepad/táctil → intención | `onKeyDown`/`onPointer*`/`pollPad` | Produce intención; no aplica reglas directamente. |
| **Content-data** | clases (`CLS`/`ATK`), enemigos (`ETPL`), zonas, loot, strings | `game.js` + `strings.js` | Datos, no código; los diseñadores iteran sin tocar el sim. |

**Contrato clave:** la lógica corre a paso fijo (`STEP = 1000/60`, `index.html`); `render(alpha)` solo interpola. Esto ya separa *temporalmente* sim de render — la red de Stage-2 reemplaza la fuente de intención (input local → input del servidor) sin tocar el sim.

### Deudas conocidas para Stage-2 (mapear ahora, extraer después)
1. **Stream global único de RNG.** `_seed`/`srand()` es un solo estado mutable compartido por world-gen *y* efectos por-frame. `buildWorld()` re-siembra a `13371` al entrar, así que la generación de mundo es determinista y repetible (lo verifica `determinism.mjs`) **pero aún no parametrizable por semilla**: el servidor de Stage-2 necesitará `buildWorld(seed)` y, idealmente, **streams de RNG separados** (uno para world-gen autoritativo, otro para FX cosméticos no-autoritativos) para que lo cosmético nunca desincronice la simulación.
2. **Sim y render comparten una clausura.** `update()` y `render()` cierran sobre el mismo objeto `G` y los mismos helpers. Es cómodo pero significa que el sim no puede correr *sin* el render (p. ej. en un servidor Node sin canvas). La extracción futura: mover sim core a un módulo sin DOM (`sim.js`) con una interfaz explícita de estado, dejando render/input como consumidores. El paso fijo y los hooks `?dev` actuales son el andamiaje para esa extracción.

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
├── tools/            # harness de verificación headless (smoke, determinism, atlas-qa)
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

## Despliegue (GitHub Pages — URL oficial)
El build **solo de runtime** (`index.html` + `logic.js` en la raíz + `game.js`, `audio.js`, `input.js`, `view.js`, `strings.js`, `version.json`, `sim/`, `render/`, `assets/`) se publica a la rama `gh-pages` de este repositorio. Runbook completo: `docs/deploy-runbook-CAS-193.md`. (El pipeline anterior de Higgsfield — `media_upload` → `deploy_game` a `tender-bridge-504` — fue **retirado** por directiva del board en [CAS-412](/CAS/issues/CAS-412).)

### Paso PREVIO obligatorio: romper cache (CAS-58 / CAS-68)
Los módulos ES se sirven con **nombre fijo** y sin garantía de cabeceras de cache, así que un jugador que volvió al día siguiente seguía ejecutando los módulos **cacheados** — el deploy se veía idéntico aunque `master` había avanzado. Solución, sin renombrar archivos ni controlar cabeceras del server.

**Receta de deploy — en este orden exacto (CAS-68):**

```
1. npm run stamp                          # reescribe version.json con build id = hash de contenido del árbol
2. git add version.json && git commit ... # version.json VA en el bundle
3. node tools/stamp-version.mjs --check   # FALLA si version.json quedó stale vs. el árbol (guard "olvidé stampear")
4. # empaquetar el zip — DEBE incluir version.json en la lista de archivos (ver §bundle arriba)
5. # publicar el fileset runtime a la rama gh-pages (ver docs/deploy-runbook-CAS-193.md)
6. npm run deploy-verify                  # FALLA si el build-id vivo ≠ hash del árbol servido, o si live ≠ master
7. npm run cache-bust                     # (opcional) e2e: un navegador con cache previa toma el build nuevo sin hard-refresh
```

**El error de CAS-54** fue saltarse el paso 4: el zip **excluyó `version.json`**, así que el sitio vivo siguió sirviendo un `build-id` viejo (`?v=ceb53143ab91`) mientras los módulos cambiaban → los recurrentes nunca rompieron cache. Ahora `deploy-verify` (paso 6) **re-deriva el hash de contenido del árbol y exige que el `build-id` vivo Y el commiteado sean exactamente ese hash** — un id reusado/stale falla ruidosamente en vez de quedar verde. Cobertura de regresión: `node tools/buildid-gate-test.mjs` prueba que el gate efectivamente FALLA en ambos modos (olvidé-stampear y id-reusado-vivo).

Cómo funciona: el bootstrap de `index.html` (script **clásico**) hace `fetch('./version.json', {cache:'no-store'})` — siempre pega a la red aunque el HTML esté cacheado —, lee `build`, e inyecta un **import map** que enruta TODO el grafo de módulos (incluidos los `import` internos de `game.js`/`sim/`/`render/`) a `?v=<build>`. Un solo id rompe el cache de todo el grafo + los assets (`render/sprites.js` les agrega el mismo `?v=`). Como los nombres de archivo no cambian, el gate de byte-identidad (CAS-37) sigue siendo válido. **Regla:** si cambió cualquier archivo del runtime, corré `npm run stamp` y commiteá `version.json` ANTES de empaquetar; si no, los recurrentes no verán el cambio.

**URL fija:** la URL oficial es `https://carlosdcastrosa-cloud.github.io/Mithralda-Online/` (rama `gh-pages` de este repo). No hay `game_id` ni servicio externo de por medio: actualizar el juego = publicar el fileset runtime a `gh-pages`.

### Gate post-deploy OBLIGATORIO (CAS-37)
Todo deploy DEBE terminar con el gate de verificación, o se considera no completado:

```
npm run deploy-verify    # tras cada deploy_game; sale ≠0 si el build vivo no es master
```

El gate descarga **cada archivo del bundle servido** desde la URL viva y lo compara byte-a-byte (sha256) contra el árbol local, más el assert de comportamiento `tools/gear-live.mjs` (los 7 hooks de gear). Si el build vivo quedó **stale** (un bundle anterior a `master`, como detectó [CAS-27](/CAS/issues/CAS-27)) → falla **ruidosamente** con la lista de archivos desfasados, en vez de quedar verde. Prueba conjunta: `live == árbol local` y (árbol limpio + `HEAD`) `== master` ⇒ `live == master`.
**Consistencia de build-id (CAS-68):** además del byte-compare, el gate re-deriva el hash de contenido del árbol (misma lógica que `npm run stamp`, compartida en `tools/build-id.mjs`) y exige que el `build` del `version.json` **vivo** Y del **commiteado** sean exactamente ese hash. Esto atrapa lo que el byte-compare no puede: (a) olvidar `npm run stamp` (id stale e idéntico en ambos lados), y (b) un zip que excluyó `version.json` (id reusado solo en vivo — el modo de falla de [CAS-54](/CAS/issues/CAS-54)).
Flags: `--code-only` (omite los 70 assets, solo código), `--no-behavior` (omite el assert puppeteer, más rápido), `--base=<url>`.
Nota: `logic.js` (manifiesto de reglas heredado del pipeline retirado de Higgsfield) sigue en la raíz del bundle por compatibilidad histórica; el gate no lo compara.

## Nota sobre los sprites
Los personajes son diseños **originales** en un estilo genérico de aventurero encapuchado. No se incluye ni reproduce ningún personaje con derechos de autor.
