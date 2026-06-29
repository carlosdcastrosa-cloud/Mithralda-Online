extends Node2D
## Mithralda — Godot migration vertical slice (CAS-174 / CAS-172).
## Top-down movement + chasing enemies, drawn procedurally. Deliberately small:
## the point of this prototype is to measure the REAL web/WASM bundle size and
## prove the Godot -> WASM -> deployable-zip pipeline end to end, not feature parity.

const SPEED := 220.0
const TILE := 48
const ENEMY_SPEED := 60.0

var player_pos := Vector2(480, 270)
var enemies: Array = []
var hud: Label

func _ready() -> void:
	for i in 6:
		enemies.append(Vector2(120 + i * 130, 110 + (i % 2) * 220))
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.text = "Mithralda — Godot prototype · move: WASD / arrows"
	hud.position = Vector2(12, 10)
	hud.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
	layer.add_child(hud)

func _process(delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): dir.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): dir.y += 1
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): dir.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): dir.x += 1
	player_pos += dir.normalized() * SPEED * delta
	var vp := get_viewport_rect().size
	player_pos.x = clampf(player_pos.x, 16, vp.x - 16)
	player_pos.y = clampf(player_pos.y, 16, vp.y - 16)
	for i in enemies.size():
		var e: Vector2 = enemies[i]
		e += (player_pos - e).normalized() * ENEMY_SPEED * delta
		enemies[i] = e
	queue_redraw()

func _draw() -> void:
	var vp := get_viewport_rect().size
	draw_rect(Rect2(Vector2.ZERO, vp), Color(0.06, 0.07, 0.10))
	var grid := Color(0.12, 0.14, 0.20)
	var x := 0
	while x <= int(vp.x):
		draw_line(Vector2(x, 0), Vector2(x, vp.y), grid, 1.0)
		x += TILE
	var y := 0
	while y <= int(vp.y):
		draw_line(Vector2(0, y), Vector2(vp.x, y), grid, 1.0)
		y += TILE
	for e in enemies:
		draw_circle(e, 14, Color(0.80, 0.30, 0.30))
		draw_arc(e, 14, 0, TAU, 24, Color(1, 0.6, 0.6), 2.0)
	draw_circle(player_pos, 16, Color(0.40, 0.80, 1.0))
	draw_arc(player_pos, 16, 0, TAU, 28, Color(1, 1, 1), 2.0)
