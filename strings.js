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

  spells: ["GOLPE", "LLAMARADA", "SANAR", "ONDA RÚNICA"],

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

  shopTitle: "TIENDA DE SOLANA",
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

  fountainRest: "Descansaste en la Fuente. Vida y maná restaurados.",
  fountainSaved: "Punto de reaparición fijado en esta Fuente.",
  controlsHintPC: "Mover WASD/flechas · Atacar clic o J · Rodar Espacio · Hechizos 1-4 · Recoger F · Inventario I · Mapa M · Hablar E · Pausa Esc",
  tapToStart: "Toca o pulsa una tecla",
};
