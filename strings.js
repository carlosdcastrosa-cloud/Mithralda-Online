// All player-visible text lives here. Switching language = swapping this data.
export const STR = {
  title: "MITHRALDA",
  subtitle: "EL REINO PIXELADO",
  version: "Mithralda v1.0",
  namePlaceholder: "Escribe el nombre de tu héroe",
  play: "JUGAR",
  nameTooShort: "El nombre debe tener al menos 2 letras",

  hp: "HP",
  mp: "MP",
  level: (n) => "Nivel " + n,
  gold: (n) => "Oro: " + n,
  questLabel: (n) => "Misión: Limpia el Bosque (lobos " + n + "/8)",
  questDone: "Misión completada: ¡Bosque limpio!",

  // Hunt contracts (CAS-63): per-zone cull objective → Champion → zone cleared.
  zoneNames: { forest:"Bosque del Este", ruins:"Ruinas de Eldath", caves:"Criptas Olvidadas", arena:"Arena de Sangre", abyss:"El Abismo" },
  huntLabel: (n, need) => "Cacería: " + n + "/" + need,
  huntChampApproaches: "¡CAMPEÓN!",
  huntZoneCleared: "ZONA DESPEJADA",
  huntChampion: (name) => "¡Aparece " + name + "! Derrótalo para despejar la zona.",
  huntCleared: (zone) => "¡Zona despejada: " + ({ forest:"Bosque del Este", ruins:"Ruinas de Eldath", caves:"Criptas Olvidadas", arena:"Arena de Sangre", abyss:"El Abismo", frost:"la Cripta Helada", trial:"el Coliseo Eterno" }[zone] || "la zona") + "! Recompensa garantizada.",
  // CAS-114 — the power-gated Abismo (second, harder hunt zone).
  abyssLocked: (pw, req) => "El Abismo te rechaza. Necesitas más poder (" + pw + "/" + req + "): mejora con el Mercader y sube de nivel.",
  enteredAbyss: "Has descendido al Abismo. Aquí todo golpea más fuerte… y paga mejor.",
  leftAbyss: "Regresas a Puerto Solana.",
  // CAS-121 — the power-gated Cripta Helada (third gated biome, harder than the Abismo).
  frostLocked: (pw, req) => "La Cripta Helada está sellada. Necesitas más poder (" + pw + "/" + req + "): supera el Abismo, mejora y sube de nivel.",
  enteredFrost: "Entras en la Cripta Helada. El frío muerde y el Guardián vigila…",
  // CAS-196 — the deepest gate: el Coliseo Eterno (the post-finale challenge arena + world-boss).
  trialLocked: (pw, req) => "El Coliseo Eterno permanece cerrado. Necesitas más poder (" + pw + "/" + req + "): vence al Guardián, mejora y sube de nivel.",
  enteredTrial: "Cruzas al Coliseo Eterno. La arena ruge: sobrevive y el Avatar del Coliseo despertará…",
  // CAS-121 — Coraza de Escarcha (status-vulnerability shield) telegraph + outcomes.
  bossShield: (name) => "¡" + name + " invoca la CORAZA DE ESCARCHA! Aplícale un efecto de estado para romperla.",
  bossShatter: (name) => "¡Coraza rota! " + name + " queda expuesto.",
  bossNova: (name) => "¡" + name + " libera la NOVA GÉLIDA! Te ralentiza.",
  immune: "INMUNE",
  // CAS-146 — elite ambush / pack event.
  ambush: (zone) => "¡EMBOSCADA en " + ({ forest:"Bosque del Este", ruins:"Ruinas de Eldath", caves:"Criptas Olvidadas", arena:"Arena de Sangre", abyss:"El Abismo", frost:"la Cripta Helada", trial:"el Coliseo Eterno" }[zone] || "la zona") + "! Una élite y su jauría te rodean.",
  eliteDown: "¡Élite abatida! Botín superior garantizado.",
  // CAS-149 — Elite Mastery (persistent progression hook).
  masteryUp: (n) => "¡Maestría de Élite " + n + "! +Vida máx · botín de élite mejorado.",
  masteryFloater: (n) => "✦ Maestría " + n,
  masteryHud: (n) => "⚔ Maestría " + n,
  // CAS-150 — Elite-Mastery REWARD TRACK (milestone unlock + panel).
  masteryMilestone: (name, desc) => "✦ HITO DE MAESTRÍA: " + name + " — " + desc,
  masteryTitle: "SENDA DE MAESTRÍA DE ÉLITE",
  masteryPanelHint: (k) => "Élites abatidas: " + k + "  ·  cada élite, campeón y jefe cuenta",
  masteryNextHint: (rem, name) => "Próximo hito en " + rem + " élite" + (rem===1?"":"s") + ": " + name,
  masteryAllUnlocked: "Senda completa — todos los hitos desbloqueados.",
  // CAS-169 character customization (wardrobe) screen.
  customizeTitle: "PERSONALIZAR HÉROE",
  customizeHint: "Recolorea cada parte y elige casco / capa  ·  los cambios se guardan",
  customizeOpen: "Personalizar",
  customizeDone: "Listo",
  customizeReset: "Restaurar",
  customizeKeys: "↑↓ parte  ·  ←→ cambiar  ·  R restaurar  ·  C / Esc cerrar",
  // CAS-65 capstone phase shift — fires when the boss crosses its enrage threshold.
  bossEnrage: (name) => "¡" + name + " SE ENFURECE! Esquiva la onda expansiva.",
  bossEnrageBanner: "¡ENFURECIDO!",

  spells: ["GOLPE", "LLAMARADA", "SANAR", "ONDA RÚNICA"], // generic fallback labels
  // per-class name for the basic-attack slot (slot 0) — surfaces class identity on the HUD
  spellSlot0: { warrior: "CORTE", paladin: "FLECHA", mage: "ORBE", druid: "ESPINAS", priest: "NOVA" },
  // per-class names for spell slots 2-4 (cast indices 1-3). Order matches SPELLS[cls].
  // Mechanics are data in sim/config.js; these are just the player-visible labels.
  spellNames: {
    warrior: ["GOLPE ESCUDO", "GRITO", "EMBESTIDA"],
    paladin: ["CONSAGRAR", "ESC. DIVINO", "JUICIO"],
    mage:    ["BOLA FUEGO", "ESCARCHA", "PARPADEO"],
    druid:   ["ENREDADERAS", "REGENERAR", "T. ESPINAS"],
    priest:  ["SANACIÓN", "PAL. PODER", "CASTIGO"],
  },
  spellAtkUp: "¡DAÑO+!",
  spellDefUp: "¡DEFENSA+!",
  spellRegen: "REGEN",

  // Class-selection screen. Class identity (names, roles, attack flavour) is data,
  // not code — designers edit it here without touching game logic.
  classSelTitle: "Elige tu clase",
  classSelHint: "Toca una clase  ·  o usa 1-5 / ←→ + Enter",
  classes: {
    warrior:  { name: "Guerrero",  role: "Espada y escudo", attack: "Corte en arco cuerpo a cuerpo" },
    paladin:  { name: "Paladín",   role: "Arco sagrado",    attack: "Flechas benditas a distancia" },
    mage:     { name: "Mago",      role: "Orbes arcanos",   attack: "Orbe arcano con daño en área" },
    druid:    { name: "Druida",    role: "Furia natural",   attack: "Espinas en cono frontal" },
    priest:   { name: "Sacerdote", role: "Luz sagrada",     attack: "Nova de luz: daña y se cura" },
  },

  zoneTown: "Puerto Solana",
  zoneForest: "Bosque del Este",
  zoneCaves: "Cuevas del Norte",
  zoneArena: "Arena de Sangre",
  zoneRuins: "Ruinas de Eldath",
  zoneAbyss: "El Abismo",
  zoneFrost: "Cripta Helada",
  zoneTrial: "Coliseo Eterno",
  zoneField: "Valdoria",

  invTitle: "INVENTARIO",
  slotHead: "Cabeza",
  slotBody: "Cuerpo",
  slotWeapon: "Arma",
  slotShield: "Escudo",
  // CAS-226 — Tibia-style equip slots. Only Arma/Cuerpo/Escudo are functional
  // (data-driven gear); the rest are visual placeholders until their content
  // lands (kept here so adding them later is a one-line label edit).
  slotNeck: "Cuello",
  slotBack: "Espalda",
  slotLegs: "Piernas",
  slotFeet: "Pies",
  slotRing: "Anillo",
  slotBag: "Bolsa",
  backpack: "Mochila",
  invHint: "I: cerrar",
  statsDmg: "Daño",
  statsDef: "Defensa",
  // Loot & gear. Rarity labels are UI categories (here); item proper names are
  // content data in sim/gear.js GEAR so adding gear is a one-line edit.
  loot: (t) => "Botín: " + t,
  bagFull: "Mochila llena: convertida en oro",
  bagEmpty: "(vacía)",
  equipHint: "▲▼ elegir · Enter/tap equipar · I cerrar · P/O pociones",
  rarity: { common: "Común", uncommon: "Infrecuente", rare: "Raro", epic: "Épico" },
  // CAS-117 equip-decision compare box (equipado vs nuevo) + affix tooltip chrome
  cmpEquipped: "Equipado",
  cmpNew: "Nuevo",
  // CAS-237 — Forja (equipment upgrade): spend gold + mena to raise an equipped piece's tier.
  forgeTitle: "FORJA",
  forgeMat: "Mena",
  invForge: "Forjar (G)",
  forgeBtn: "Forjar",
  forgeMaxTag: "MÁX",
  forgeHint: "▲▼ elegir · Enter/tap forjar · G/E cerrar",
  forgeNeed: (g, m) => g + " oro · " + m + " mena",
  forgeHave: (g, m) => "Oro " + g + "   ⚒ Mena " + m,
  forgeLvl: (l, max) => "Forja +" + l + "/" + max,
  forgeMax: "Pieza ya al máximo de forja",
  forgeCant: "Faltan oro o mena para forjar",
  forgeEmpty: "No hay pieza equipada en esa ranura",
  forgeDone: (n, l) => n + " forjada → +" + l,

  // CAS-119 — talent tree / class progression (build agency).
  talentTitle: "TALENTOS",
  talentPoints: (n) => "Puntos: " + n,
  talentPointGain: "+1 talento",
  talentPtHud: " talento",
  talentRespec: "Talentos reiniciados — puntos devueltos",
  talentRespecBtn: "Reespecializar (devolver puntos)",
  talentHint: "T cerrar · clic/Enter gastar punto · una rama tiene elección exclusiva",
  talentLocked: "Requiere el talento previo",
  talentExcl: "Elección exclusiva (ya elegiste la otra rama)",
  talentNoPts: "Sin puntos — sube de nivel",
  talentRank: (r, m) => r + "/" + m,
  talentDodge: "¡ESQUIVA!",

  shopTitle: "TIENDA DE SOLANA",
  merchantTitle: "CARRO DEL MERCADER",
  buy: "Comprar",
  sell: "Vender",
  shopHint: "E / tap para cerrar",
  cantAfford: "No tienes suficiente oro",

  dialogContinue: "Continuar",

  deathTitle: "HAS CAÍDO",
  deathSub: "Renaces en el templo de Puerto Solana",
  deathContinue: "Continuar",
  // CAS-277 — end-of-run RECAP. A concise "this run" summary that turns death into
  // "one more run". `recapRetry` is bind-aware (the rebindable attack/confirm key);
  // the labels read existing counters only (no new economy).
  recapHead: "RESUMEN DE LA RONDA",
  recapTime: (t) => "Tiempo con vida: " + t,
  recapKills: (n) => "Enemigos derrotados: " + n,
  recapGold: (n) => "Oro conseguido: " + n,
  recapElites: (n) => "Élites abatidos: " + n,
  recapLevel: (n) => "Nivel: " + n,
  recapLevelUp: (lvl, up) => "Nivel: " + lvl + " (+" + up + ")",
  recapRetry: (k) => "OTRA RONDA  [" + k + "]",
  recapHub: "Pueblo / Menú  [Esc]",

  // CAS-123 — Stage-1 objective tracker (HUD) + victory / run-completion screen.
  // The single legible GOAL, shown from minute one so a new player knows where the run
  // is headed; the text switches as the gate opens and once the run is won.
  objLabel: "OBJETIVO",
  objLocked: (pw, req) => "Reúne poder para la Cripta Helada (" + pw + "/" + req + ")",
  objReady: "Derrota al Guardián de la Cripta Helada",
  objDone: "Stage-1 completado ✔ — juego libre",
  victoryTitle: "¡VICTORIA!",
  victorySub: (boss) => "Has derrotado al " + boss + " y completado la Crónica de Mithralda.",
  victoryClass: (cls) => "Clase: " + cls,
  victoryLevel: (n) => "Nivel alcanzado: " + n,
  victoryTime: (t) => "Tiempo de juego: " + t,
  victoryDeaths: (n) => "Caídas: " + n,
  victoryGold: (n) => "Oro acumulado: " + n,
  victoryLoot: (name, rarity) => "Mejor botín: " + name + " (" + rarity + ")",
  victoryContinue: "SEGUIR JUGANDO (juego libre)",
  victoryFooter: "Tu héroe persiste. Sigue cazando, perfecciona tu build o repite al Guardián.",
  // class display names for the summary (lowercase ids → Spanish labels)
  classLabel: { warrior:"Guerrero", paladin:"Paladín", mage:"Mago", druid:"Druida", priest:"Sacerdote" },
  rarityLabel: { common:"común", uncommon:"infrecuente", rare:"raro", epic:"épico" },

  pauseTitle: "PAUSA",
  resume: "VOLVER AL JUEGO",
  settingsTitle: "AJUSTES",
  settingShake: "Sacudida de pantalla",
  settingReduceMotion: "Movimiento reducido",
  settingCRT: "Filtro CRT",
  settingRollDir: "Dirección de rodada",
  settingResetHud: "Restablecer paneles (HUD)", // CAS-418: reset the draggable layout
  rollTowardMove: "Hacia el movimiento",
  rollTowardAim: "Hacia la mira",
  settingMute: "Silenciar",
  settingMaster: "Volumen",
  settingMusic: "Música",
  settingSfx: "Efectos",
  // CAS-265: accessibility & quality-of-life polish — grouped settings tabs, colour-blind
  // cues and key rebinding.
  settingColorblind: "Modo daltónico",
  setTabAudio: "Audio",
  setTabAccess: "Accesibilidad",
  setTabControls: "Controles",
  controlsHint: "Toca una acción y pulsa la tecla nueva.",
  bindPressKey: "… pulsa una tecla (Esc cancela)",
  bindResetDefaults: "Restaurar predeterminados",
  bindLabel: {
    up:"Arriba", down:"Abajo", left:"Izquierda", right:"Derecha",
    attack:"Atacar", roll:"Rodar", skill2:"Habilidad 2", skill3:"Habilidad 3", skill4:"Habilidad 4",
    pickup:"Recoger", interact:"Interactuar", useConsumable:"Usar consumible", cycleConsumable:"Rotar consumible",
    potionHP:"Poción de vida", potionMP:"Poción de maná", inventory:"Inventario", forge:"Forja",
    talents:"Talentos", mastery:"Maestría", customize:"Vestuario", map:"Mapa", pause:"Pausa",
  },

  perfectDodge: "¡ESQUIVA!",
  riposte: "¡CASTIGO!",                              // CAS-210: the perfect-dodge → counter payoff banner
  levelUp: (n) => "¡Subiste al nivel " + n + "!",
  redSkull: "¡Calavera roja! Penalización de muerte aumentada.",
  pickedUp: (t) => "Recogiste: " + t,
  notEnoughMP: "Maná insuficiente",
  bought: (t) => "Compraste: " + t,
  sold: (t) => "Vendiste: " + t,
  blessingOn: "Bendición activa",
  consumEmpty: (n) => "Sin " + n,                 // CAS-192: tried to use an empty consumable slot
  consumPurged: "¡Purgado!",                      // CAS-192: antídoto cleansed DoT/slow
  questReward: "Recompensa: 50 de oro + poción de vida",
  bossDefeated: "¡Gólem Ancestral derrotado!",
  enteredArena: "Arena de Sangre: atacar a aventureros activa el sistema de calaveras",

  npcBram: "Tendero Bram",
  npcRolf: "Guardia Rolf",
  npcLina: "Curandera Lina",
  npcAdventurer: "Aventurero",
  npcMerchant: "Mercader Ambulante",
  npcBounty: "Heraldo de Cacerías",
  npcHealer: "Maren la Sanadora",

  bramLines: [
    "Bienvenido a mi tienda, viajero. ¿Buscas acero o frascos?",
    "Las pociones rojas curan vida; las azules, maná. Llévate varias.",
  ],
  rolfLines: [
    "Los lobos del Bosque del Este se han vuelto agresivos.",
    "Despacha ocho de ellos y Puerto Solana te lo agradecerá.",
    "Recuerda: rueda para esquivar, eres invencible al rodar.",
  ],
  rolfDone: [
    "¡Limpiaste el bosque! Toma tu recompensa, héroe.",
    "Las Cuevas del Norte guardan algo antiguo... y peligroso.",
  ],
  linaLines: [
    "Que las fuentes te guarden. Puedo curarte y venderte bendiciones.",
    "Una bendición reduce lo que pierdes al morir... salvo con calavera roja.",
  ],
  // CAS-309 — Maren tends the spring where the old healing fountain stood. Used as the
  // dialogue fallback; the Game Engineer wires her rest-heal (STR.fountainRest toast).
  healerLines: [
    "Acércate, viajero. El manantial sana a quien descansa aquí.",
    "Reposa un momento y recuperarás vida y maná, como siempre.",
  ],
  adventurerLines: [
    "Esta es la Arena de Sangre. Pelea con honor, forastero.",
    "Atacar sin razón mancha tu nombre con calaveras.",
  ],
  merchantLines: [
    "Reliquias de las Ruinas Antiguas, recién traídas. Echa un ojo.",
    "Vuelve con oro, forastero. Siempre tengo algo nuevo en el carro.",
  ],
  bountyLines: [
    "El Tablón de Cacerías tiene encargos frescos cada amanecer.",
    "Cúmplelos y cobra. Y vuelve a diario: la racha paga mejor.",
  ],

  // CAS-134 — daily return loop: bounty board (daily contracts + login streak).
  bountyTitle: "TABLÓN DE CACERÍAS",
  bountyContracts: "Contratos de hoy",
  bountyStreak: (n) => "Racha diaria: " + n + (n === 1 ? " día" : " días"),
  // CAS-243: today's streak reward — gold always, mena from day 3 (feeds la Forja).
  bountyStreakReward: (g, mena) => "Hoy: +" + g + " oro" + (mena > 0 ? " · +" + mena + " mena" : ""),
  // CAS-243: tomorrow's reward preview — the escalating return hook.
  bountyStreakNext: (g, mena) => "Mañana: +" + g + " oro" + (mena > 0 ? " · +" + mena + " mena" : ""),
  bountyStreakMilestone: "¡HITO! Día 7: gran botín de mena + pociones",
  bountyComeback: "Racha amortiguada — ¡bienvenido de vuelta!",
  bountyClaim: "Reclamar",
  bountyClaimed: "Cobrado",
  bountyResetIn: (t) => "Rota en " + t,
  bountyReward: (g, xp) => "+" + g + " oro · +" + xp + " XP",
  bountyHint: "E / tap para cerrar",
  // CAS-383 — inter-zone boon draft (roguelite build variety).
  draftTitle: "BENDICIÓN DE ZONA",
  draftSub: "Zona despejada — elige una bendición para el resto de la partida",
  draftPick: (n) => "Elegir (" + n + ")",
  draftActive: (n) => "Bendiciones activas: " + n,
  draftSynHint: "Combina bendiciones para desbloquear sinergias",
  // CAS-392 — draft agency: reroll the whole hand / banish one card from the run pool.
  draftReroll: "Rebarajar",
  draftBanished: (n) => "Desterradas: " + n,
  // CAS-394 — opt-in zone modifier ("Maldición" / risk-for-reward).
  curseTitle: "MALDICIÓN DE ZONA",
  curseSub: "Acepta el reto para forjar mejores recompensas… o sigue sin arriesgar.",
  curseReward: "Recompensa: botín garantizado de mayor rareza + una pieza de equipo extra al despejar.",
  curseAccept: "Aceptar (A)",
  curseSkip: "Omitir (Esc)",
  curseAccepted: (name) => "Maldición aceptada: " + name + ". La zona se vuelve más letal.",
  zoneName: (zone) => ({ forest:"Bosque del Este", ruins:"Ruinas de Eldath", caves:"Criptas Olvidadas", arena:"Arena de Sangre", abyss:"El Abismo", frost:"la Cripta Helada", trial:"el Coliseo Eterno" }[zone] || "la zona"),
  dailySlay: (n) => "Da caza a " + n + " enemigos",
  // CAS-375: directed bounty — localized plural mob names (fallback to the raw key).
  dailySlayType: (mob, n) => "Da caza a " + n + " " + ({ quillback:"Acechadores Espinosos", wendigo:"Wéndigos", demon:"Demonios Oscuros", skeleton:"esqueletos", orc:"orcos", wraith:"espectros", bandit:"bandidos", wolf:"lobos" }[mob] || (mob || "enemigos")),
  dailyChampion: (n) => "Derrota " + n + (n === 1 ? " campeón" : " campeones"),
  dailyClear: (zone) => "Despeja: " + ({ forest:"Bosque del Este", ruins:"Ruinas de Eldath", caves:"Criptas Olvidadas", arena:"Arena de Sangre", abyss:"El Abismo", frost:"la Cripta Helada" }[zone] || "la zona"),
  dailyClaimed: (g, xp) => "¡Contrato cobrado! +" + g + " oro, +" + xp + " XP",
  dailyStreakClaimed: (n, g, mena) => "¡Racha de " + n + "! +" + g + " oro" + (mena > 0 ? ", +" + mena + " mena" : ""),
  dailyStreakMilestone: (n, g, mena) => "¡HITO de racha (" + n + ")! +" + g + " oro, +" + mena + " mena y pociones",
  dailyNotDone: "Aún no has cumplido este contrato",
  dailyAlready: "Ya lo has cobrado hoy",

  // CAS-386 — Bestiary / Codex collection meta-goal. Canonical localized mob names
  // (singular) — reused across the codex; falls back to the raw key for any unlisted
  // type so a new mob never renders blank.
  mobName: (t) => ({
    rat:"Rata", wolf:"Lobo", bat:"Murciélago", skeleton:"Esqueleto", spearman:"Lancero",
    orc:"Orco", bandit:"Bandido", moose:"Alce Antiguo", mage:"Mago Oscuro", wraith:"Espectro",
    charger:"Embestidor", summoner:"Nigromante", healer:"Sanador", volatile:"Volátil",
    revenant:"Renaciente", quillback:"Acechador Espinoso", demon:"Demonio Oscuro",
    wendigo:"Wéndigo", golem:"Gólem de Piedra", dragon:"Dragón Ancestral",
  }[t] || (t || "Enemigo")),
  bestiaryTitle: "BESTIARIO",
  bestiarySub: (d, tot) => "Descubiertos " + d + "/" + tot,
  bestiaryTier: (id) => ({ seen:"Visto", hunted:"Cazado", mastered:"Dominado" }[id] || id),
  bestiaryKills: (n) => n + (n === 1 ? " caza" : " cazas"),
  bestiaryNext: (n) => "Siguiente: " + n,
  bestiaryReward: (g, xp, mena) => "+" + g + " oro · +" + xp + " XP" + (mena > 0 ? " · +" + mena + " mena" : ""),
  bestiaryClaim: "Reclamar",
  bestiaryClaimed: (mob, tier, g, xp) => "¡" + mob + " — " + tier + "! +" + g + " oro, +" + xp + " XP",
  bestiaryClaimedChip: "Cobrado",
  bestiaryLocked: "Aún no alcanzas ese rango",
  bestiaryNothing: "Nada que reclamar todavía",
  bestiaryHint: "↑/↓ elegir · Enter reclamar · E cerrar",
  bestiaryUndiscovered: "Sin descubrir — dale caza para revelarlo",
  npcCodex: "Yára la Cronista",
  codexLines: [
    "Soy Yára, guardo el registro de todo lo que acecha estas tierras.",
    "Cada bestia que abatas quedará escrita en el Bestiario.",
    "Llena sus rangos y te recompensaré por tu diligencia.",
  ],

  fountainRest: "Descansaste en la Fuente. Vida y maná restaurados.",
  fountainSaved: "Punto de reaparición fijado en esta Fuente.",
  // CAS-267: controls hint is bind-aware — `k(action)` resolves the player's LIVE
  // keybinding (respects CAS-265 rebinds) so it never shows a stale hardcoded key.
  controlsHintPC: (k) => "Mover " + k("up")+k("left")+k("down")+k("right") + "/flechas · Atacar clic o " + k("attack") + " · Rodar " + k("roll") + " · Hechizos " + k("skill2")+k("skill3")+k("skill4") + " · Recoger " + k("pickup") + " · Inventario " + k("inventory") + " · Mapa " + k("map") + " · Hablar " + k("interact") + " · Pausa " + k("pause"),
  tapToStart: "Toca o pulsa una tecla",

  // CAS-128 — first-session onboarding tutorial (pure UX layer). Coachmark text is
  // device-aware (pc / touch). headers are the short verb on each card.
  // CAS-267 — the pc copy is bind-aware: each is a function of `k(action)` that
  // resolves the player's CURRENT keybinding (CAS-265 rebind table) at render time,
  // so a rebind is reflected immediately and no stale/hardcoded key is ever shown.
  // touch copy stays a plain string (touch controls are not rebindable).
  tutTitle: "GUÍA",
  tutStepLabel: (i, n) => "Paso " + i + "/" + n,
  tutSkip: "Saltar ▸",
  tutReplay: "Repetir guía inicial",
  tutHead: { move:"MOVERSE", attack:"ATACAR", skill:"HABILIDAD", travel:"EXPLORAR", loot:"BOTÍN", equip:"EQUIPAR" },
  tutSteps: {
    move:   { pc:(k)=>"Muévete con "+k("up")+k("left")+k("down")+k("right")+" o las flechas.", touch:"Arrastra el lado izquierdo de la pantalla para moverte." },
    attack: { pc:(k)=>"Ataca con clic izquierdo o la tecla "+k("attack")+".", touch:"Toca el botón ⚔ (abajo a la derecha) para atacar." },
    skill:  { pc:(k)=>"Lanza una habilidad con las teclas "+k("skill2")+", "+k("skill3")+" o "+k("skill4")+" (gastan maná).", touch:"Toca los botones 2, 3 o 4 para lanzar habilidades." },
    travel: { pc:"Sal de Puerto Solana hacia una zona de caza para hallar enemigos.", touch:"Sal de Puerto Solana hacia una zona de caza para hallar enemigos." },
    loot:   { pc:(k)=>"Derrota enemigos y recoge tu primer botín con la tecla "+k("pickup")+".", touch:"Derrota enemigos y recoge tu primer botín con el botón F." },
    equip:  { pc:(k)=>"Abre el inventario con "+k("inventory")+" y equípate el botín que encuentres.", touch:"Toca el botón I (arriba) para abrir el inventario y equiparte." },
  },
  tutDoneHead: "¡LISTO PARA LA AVENTURA!",
  // CAS-270 — close the bind-aware loop by also surfacing the Forja and Opciones
  // (Ajustes) keys on the final card, resolved live from the CAS-265 rebind table
  // like every other step. Pure onboarding copy; no balance/economy touch.
  tutDone: (k) => "Sigue el OBJETIVO de arriba. Gasta talentos ("+k("talents")+"), mejora con el Mercader ("+k("interact")+"), forja equipo ("+k("forge")+") y abre Opciones para reconfigurar controles ("+k("pause")+").",
};
