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
  huntCleared: (zone) => "¡Zona despejada: " + ({ forest:"Bosque del Este", ruins:"Ruinas de Eldath", caves:"Criptas Olvidadas", arena:"Arena de Sangre", abyss:"El Abismo", frost:"la Cripta Helada" }[zone] || "la zona") + "! Recompensa garantizada.",
  // CAS-114 — the power-gated Abismo (second, harder hunt zone).
  abyssLocked: (pw, req) => "El Abismo te rechaza. Necesitas más poder (" + pw + "/" + req + "): mejora con el Mercader y sube de nivel.",
  enteredAbyss: "Has descendido al Abismo. Aquí todo golpea más fuerte… y paga mejor.",
  leftAbyss: "Regresas a Puerto Solana.",
  // CAS-121 — the power-gated Cripta Helada (third gated biome, harder than the Abismo).
  frostLocked: (pw, req) => "La Cripta Helada está sellada. Necesitas más poder (" + pw + "/" + req + "): supera el Abismo, mejora y sube de nivel.",
  enteredFrost: "Entras en la Cripta Helada. El frío muerde y el Guardián vigila…",
  // CAS-121 — Coraza de Escarcha (status-vulnerability shield) telegraph + outcomes.
  bossShield: (name) => "¡" + name + " invoca la CORAZA DE ESCARCHA! Aplícale un efecto de estado para romperla.",
  bossShatter: (name) => "¡Coraza rota! " + name + " queda expuesto.",
  bossNova: (name) => "¡" + name + " libera la NOVA GÉLIDA! Te ralentiza.",
  immune: "INMUNE",
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
  zoneField: "Valdoria",

  invTitle: "INVENTARIO",
  slotHead: "Cabeza",
  slotBody: "Cuerpo",
  slotWeapon: "Arma",
  slotShield: "Escudo",
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

  pauseTitle: "PAUSA",
  resume: "VOLVER AL JUEGO",
  settingsTitle: "AJUSTES",
  settingShake: "Sacudida de pantalla",
  settingCRT: "Filtro CRT",
  settingRollDir: "Dirección de rodada",
  rollTowardMove: "Hacia el movimiento",
  rollTowardAim: "Hacia la mira",

  perfectDodge: "¡ESQUIVA!",
  levelUp: (n) => "¡Subiste al nivel " + n + "!",
  redSkull: "¡Calavera roja! Penalización de muerte aumentada.",
  pickedUp: (t) => "Recogiste: " + t,
  notEnoughMP: "Maná insuficiente",
  bought: (t) => "Compraste: " + t,
  sold: (t) => "Vendiste: " + t,
  blessingOn: "Bendición activa",
  questReward: "Recompensa: 50 de oro + poción de vida",
  bossDefeated: "¡Gólem Ancestral derrotado!",
  enteredArena: "Arena de Sangre: atacar a aventureros activa el sistema de calaveras",

  npcBram: "Tendero Bram",
  npcRolf: "Guardia Rolf",
  npcLina: "Curandera Lina",
  npcAdventurer: "Aventurero",
  npcMerchant: "Mercader Ambulante",

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
  adventurerLines: [
    "Esta es la Arena de Sangre. Pelea con honor, forastero.",
    "Atacar sin razón mancha tu nombre con calaveras.",
  ],
  merchantLines: [
    "Reliquias de las Ruinas Antiguas, recién traídas. Echa un ojo.",
    "Vuelve con oro, forastero. Siempre tengo algo nuevo en el carro.",
  ],

  fountainRest: "Descansaste en la Fuente. Vida y maná restaurados.",
  fountainSaved: "Punto de reaparición fijado en esta Fuente.",
  controlsHintPC: "Mover WASD/flechas · Atacar clic o J · Rodar Espacio · Hechizos 1-4 · Recoger F · Inventario I · Mapa M · Hablar E · Pausa Esc",
  tapToStart: "Toca o pulsa una tecla",
};
