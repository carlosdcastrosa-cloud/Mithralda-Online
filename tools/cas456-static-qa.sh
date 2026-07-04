#!/bin/bash
URL="https://carlosdcastrosa-cloud.github.io/Mithralda-Online"
JS=$(curl -s "$URL/render/render.js")
VER=$(curl -s "$URL/version.json")
P=0; F=0
chk(){ if echo "$JS" | grep -q "$2"; then echo "  PASS $1"; P=$((P+1)); else echo "  FAIL $1"; F=$((F+1)); fi; }
echo "live build: $VER"
# AC1: radial cooldown arc (clock-style, 12 o'clock origin, clockwise drain)
chk "AC1 radial cooldown arc (arc + -Math.PI/2 origin)" 'arc(cxs,cys,rs,-Math.PI/2'
chk "AC1 CD seconds centred in slot" 'fillText(Math.ceil(h.spellCD\[i\])'
# AC2: mana insufficient dim + red tint overlay
chk "AC2 enoughMp gate" 'const enoughMp=h.mp>=costs\[i\]'
chk "AC2 red tint overlay rgba(160,30,30)" 'rgba(160,30,30,0.28)'
# AC3: larger mana cost label (bold 10px, red when low)
chk "AC3 bold 10px cost label" "bold 10px 'Courier New'"
chk "AC3 cost colour shifts red when low" 'enoughMp?"#8ab8ff":"#e06060"'
# AC4: consumable — single [Q] hint + corner count badge
chk "AC4 single [Q] usar hint" '\[Q\] usar'
chk "AC4 consumable rect published" 'AR("consumable"'
echo "RESULT: $P passed, $F failed"
[ "$F" -eq 0 ] || exit 1
