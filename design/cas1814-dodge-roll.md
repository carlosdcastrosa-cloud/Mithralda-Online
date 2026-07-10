# CAS-1814 — Esquiva Rodante (Dodge Roll con i-frames)

**Owner:** CTO (umbrella, decomposes Build→Deploy→QA→Gate CEO).
**Producto:** opción DEFENSIVA ACTIVA distinta a la Parada (CAS-1785): reposicionamiento
omnidireccional con breve invulnerabilidad (i-frames) que esquiva **melee Y ranged**, sinergia
directa con la Telegrafía (CAS-1790): ves el aviso → ruedas para evitar.

## Hallazgo del CTO (lente: YAGNI vs. load-bearing, Blast radius, Build-vs-buy)

**La esquiva rodante YA está ~90% construida como el `doRoll` existente (CAS-1618).** Verificado en
código HEAD:

- `doRoll()` (`sim/sim.js:3038`) — omnidireccional (8-dir `moveVec` o `facing` con `rollAim`),
  **tecla dedicada `Space`** (`settings.js:32` `{a:"roll", def:"Space"}` — exactamente la tecla que
  el issue sugiere), impulso (`rollSpeed 430 × rollTime 0.20`), **cooldown** (`rollCD 0.62s`).
- **i-frames que niegan TODO daño** — `h.iframe = rollIFrame(0.34s)`; `damageHero` (`sim.js:3783`)
  `if(h.iframe>0){ if(h.rolling) perfectDodge(ang); return false; }` niega melee **Y** ranged por
  igual (los proyectiles ni siquiera necesitan lógica extra — el i-frame es universal).
- Ya hay un parpadeo de i-frames en `render.js:728` y una estela/anillo de dash en `695–728`.

**Conclusión:** construir una mecánica PARALELA duplicaría el movimiento / i-frames / colisión /
seam de `damageHero` que ya existen → violaría YAGNI, subiría el blast radius y confundiría el kit
(dos botones de esquiva). El único hueco REAL frente a la aceptación del issue es:

1. **VFX de invulnerabilidad legible** — hoy sólo hay un parpadeo genérico; falta un aura procedural
   clara que diga "eres invulnerable ahora" durante la ventana de i-frames del roll.
2. **Encuadre/ajuste reactivo** — cooldown e i-frame afinados a la banda reactiva del issue
   (cd ~800–1200ms, iframe ~200–300ms) para que lea como herramienta reactiva deliberada.

**Decisión de arquitectura:** `DODGE` = **realce reactivo con-knob del roll existente**, NO una
mecánica nueva. (Reversibility: flip de flag; Boring where it counts: reusar el seam de roll probado;
Build-vs-buy: la evasión ranged sale gratis del i-frame universal.) La tecla `Space` ya rueda ⇒
**input.js NO se toca.**

## Diseño

Knob único `DODGE` (hard-gated). Con `enabled:true`, el roll se convierte en la Esquiva reactiva:

- **M1 — Ajuste reactivo (sim.js, 0-RNG):** en `doRoll()`, cuando `DODGE.enabled`, derivar
  `iframe`/`cooldown`/`distancia` de los params del knob en vez de las constantes `CFG.roll*`.
  Los bonos existentes (`bb.iframeAdd`, `metaDashIframe()`, Estela Ardiente) se conservan sumándose
  igual. OFF ⇒ usa `CFG.rollIFrame/rollCD/rollSpeed` exactos de HEAD.
- **M2 — VFX de invulnerabilidad (render.js, cosmético $0):** durante la ventana de i-frames de un
  roll activo (`h.rolling && h.iframe>0`), y sólo si `DODGE.enabled`, dibujar un aura procedural
  distinta (tinte fantasma cian/blanco + anillo shimmer) que lee claramente "invulnerable".
  Reusa la maquinaria de estela existente; NADA de arte nuevo. OFF ⇒ sólo el parpadeo genérico
  actual (render del roll byte-idéntico).

### Knob (config.js)

```js
export const DODGE = {
  enabled:true,
  cooldownMs:900,   // banda 800–1200; reactivo deliberado (HEAD roll = 620ms)
  iframeMs:280,     // banda 200–300; niega TODO daño (melee+ranged) (HEAD roll = 340ms)
  distance:92,      // px de impulso ≈ rollSpeed×rollTime actual (86px); neutro
};
```

## Restricciones NO-NEGOCIABLES (verificación)

1. **$0 arte** — sólo procedural (tinte/anillo/estela existente). ✔ sin dependencia del Art Director.
2. **RNG-neutral STRONG** — la esquiva es 100% timing/input, **0 draws de RNG** (reusa el i-frame que
   ya es 0-RNG). Con `enabled:false`: srand byte-idéntico a HEAD. **No hay stream nuevo.**
3. **1 knob** `DODGE.enabled` + params (`cooldownMs/iframeMs/distance`) hard-gated. OFF = roll actual
   exacto (params = `CFG.roll*`, sin VFX nuevo) ⇒ sim + render byte-idénticos.
4. **Save aislado** — no persiste NADA. El cooldown reusa `rollCD` (run-state transitorio, NO
   serializado, patrón `parryCD`). `save.v1` byte-idéntico con o sin el flag.

## Guardrails de aceptación (para QA — PASS×2 en live, md5 live==HEAD en tocados)

- **AC1 (OFF byte-id):** `DODGE.enabled=false` ⇒ `doRoll` usa `CFG.roll*` exacto, sin VFX de invuln
  nuevo; sim + `save.v1` byte-idénticos a HEAD; srand byte-idéntico (48-draw probe con roll firing).
- **AC2 (RNG-strong):** con `enabled:true`, srand ON == OFF (la esquiva no consume RNG; probar con
  roll ejecutándose de verdad, no sólo el flag — patrón CAS-1786 parry).
- **AC3 (evasión melee+ranged):** roll durante i-frames niega un golpe melee (`src` presente) Y un
  proyectil (`src=null`) — ambos por el mismo choke `h.iframe>0` en `damageHero`.
- **AC4 (cooldown funcional):** segundo roll dentro de `cooldownMs` es no-op; tras `cooldownMs`
  vuelve a armar.
- **AC5 (VFX de invulnerabilidad):** con `enabled:true`, durante la ventana de i-frames se dibuja el
  aura de invuln (pixel-check cian/shimmer sobre el héroe); con `enabled:false` no aparece.
- **AC6 (no persiste):** ninguna clave `dodge*` en `save.v1`; ausente ⇒ byte-id.

## Blobs tocados (overlay aislado, 0-leak)

`sim/config.js` (knob), `sim/sim.js` (M1 param-apply gated en doRoll), `render/render.js` (M2 VFX
gated). **3 blobs.** `input.js` NO (Space ya rueda). Mirror del set de CAS-1790/1774/1769.

## Cadena (patrón CTO-umbrella; cierra por children_completed)

Build (GE) → Deploy overlay aislado (CTO) → QA PASS×2 live md5==HEAD (QA) → **Gate CEO** GO/NO-GO.

**Nota de balance para el Gate CEO:** habilitar `DODGE` **retunea el dash** (cd 620→900ms, iframe
340→280ms). Es una decisión de FEEL/BALANCE que pertenece al CEO (no al CTO). Recomendación: GO con
los defaults en-banda; si el CEO prefiere conservar el feel del dash, es un cambio de 1 línea en
`config.js` (alta reversibilidad, gracias al knob).
