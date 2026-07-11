# CAS-2163 — mec #41 · SECOND_WIND / Segundo Aliento (DARK build)

Umbrella: CAS-2162. Baseline live: LUNGE #40 GO-LIVE (`6e32a8af63e0/799`, commit `d5c83ac`).
Ship DARK (`enabled:false`) ⇒ byte-idéntico al HEAD previo salvo el bloque config nuevo.

## Qué es

Verbo de **supervivencia clutch**: un **negado-letal automático de 1 uso por descanso** + una **nova de
espacio**. Cuando un golpe dejaría al héroe en `hp<=0` y hay carga disponible, el héroe **no muere**: su HP
se clampa a `surviveHpFrac×maxHp`, se consume la carga, se arma una breve ventana de i-frames y estalla una
nova de empuje radial que reposiciona a los enemigos cercanos (crea espacio para recuperarse). La carga se
**rearma sólo en HOGUERA** (mirror del refill de Estus) — no es spammeable, es un salvavidas por descanso.

Eje NUEVO en el stack de 40: **negación reactiva de la MUERTE**, no de un golpe. Es lo último que corre.

## No-solape vs las 40 vivas (justificación)

- **RALLY (#35)** — cura CONTINUA de un pool por golpear tras recibir daño; es sostenido y condicionado a
  seguir peleando. SECOND_WIND es un evento binario 1-uso que dispara SÓLO en el instante letal. Ortogonal:
  RALLY llena `rallyPool`; SECOND_WIND lee `hp<=0`.
- **FLASK / Estus (#…)** — trago MANUAL, canalizado, cancelable, cura fija; el jugador decide y se expone.
  SECOND_WIND es automático, instantáneo, y sólo en el borde de la muerte. No comparte recurso (charge propia).
- **BONFIRE (#…)** — el descanso que CURA y recarga; SECOND_WIND **reusa** ese descanso como punto de rearme
  (igual que Estus), pero no es el descanso: es lo que te salva ENTRE descansos.
- **HYPERARMOR / CHARGED windup** — absorbe la INTERRUPCIÓN (stun) durante un golpe comprometido y capea daño
  entrante; NO niega la muerte. Un slam letal durante hyper-armor te mata igual; SECOND_WIND lo niega una vez.
- **SHIELD_BLOCK / PARRY / DODGE / DEFLECT** — niegan/mitigan un golpe ANTES de que reste HP (requieren timing
  o estamina o dirección). SECOND_WIND corre DESPUÉS de que el daño ya restó HP, como último recurso pasivo.

Conclusión: es el único verbo que actúa sobre el resultado `hp<=0` en sí. 0 solape de trigger, recurso ni gate.

## Knob (`sim/config.js`, DARK-by-default)

```js
export const SECOND_WIND = {
  enabled:false,          // DARK — CEO gate flip false→true tras QA PASS×2. Reversible 1 línea.
  surviveHpFrac:0.15,     // HP al que se clampa al negar el golpe letal (frac de maxHp)
  novaRadius:120,         // px — radio de la nova de empuje que crea espacio
  novaKnockback:180,      // fuerza de empuje radial (reusa vx/vy, mismo primitivo que parry/lunge)
  novaPoiseDmg:0,         // opcional poise a enemigos empujados (0 = sólo reposición, sin stagger gratis)
  iframesMs:600,          // i-frames tras el disparo (evita muerte en el mismo tick por multi-hit)
  chargesPerRest:1,       // usos por descanso; se rearma en HOGUERA (mirror FLASK.charges gated BONFIRE)
};
```

## Lógica (`sim/sim.js`) — mínima, reusa primitivas

1. **i-frames (early-out):** en `damageHero`, junto al check de `h.iframe`, si `SECOND_WIND.enabled &&
   h._secondWindIframeT>0` ⇒ `return false` (daño ignorado, mirror del i-frame de roll). Decae por `dt` en el
   bloque de timers del héroe (junto a `h.iframe`).
2. **Negado-letal + nova:** en `damageHero`, DESPUÉS de `h.hp-=real` (el daño se "recibió") y ANTES del
   death-check del tick (`if(h.hp<=0) heroDie()` en el update — separado): si `SECOND_WIND.enabled &&
   h.hp<=0 && h._secondWindLeft>0` ⇒ clampa `h.hp=ceil(maxHp*surviveHpFrac)`, `h._secondWindLeft--`, arma
   `h._secondWindIframeT`, dispara la NOVA (itera `G.enemies` vivos en `novaRadius`, empuje radial
   `e.vx/e.vy += cos/sin*novaKnockback`; poise opcional gateado), VFX `shakeAdd+freeze+floater+addFx` ($0 arte).
3. **Rearme:** en `beginRun` (run start) y en el rest de HOGUERA (donde `FLASK.charges` se recarga) ⇒
   `if(SECOND_WIND.enabled) h._secondWindLeft=SECOND_WIND.chargesPerRest`. Init literal `_secondWindLeft:0`.
4. **HUD (opcional, `render/render.js`):** pip de cargo disponible reusando primitivas de HUD ($0 arte),
   gateado `if(SECOND_WIND.enabled)` ⇒ OFF render byte-idéntico.

## Guardrails (CRÍTICO — igual que #39/#40)

- **RNG-neutral STRONG:** 0 `secondWindRng`, pura aritmética/geometría (`Math.hypot`/`atan2`/`ceil`) ⇒
  **srand ON==OFF byte-idéntico** (incluye fp de N draws).
- **save-neutral:** `h._secondWindLeft`/`_secondWindIframeT` son estado de run transitorio, **NO** en el
  allowlist `save.v1` ⇒ OFF byte-id al baseline (mirror `rallyPool`/`dodgeCounterT`/`hyperarmor`).
- **enabled:false ⇒ build byte-idéntico al HEAD previo** salvo el bloque config nuevo (todas las ramas gated).
- **Reversible** en 1 línea (`enabled`).

## Entrega

Commit a master (DARK), deploy overlay N-blob (blob set REAL por `git show --stat`: config+sim+strings
+render), reporta build id nuevo/799, served md5 ×N == HEAD, `SECOND_WIND.enabled=false`, master SHA. Luego
dispara la QA OBSERVABLE (hijo de CAS-2162).
