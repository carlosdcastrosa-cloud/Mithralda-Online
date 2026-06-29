extends Node2D
## Mithralda — Godot G1 vertical slice (CAS-187 / roadmap CAS-182 §G1).
## First playable subsystem on top of the G0 slice (58dd793):
##   * tile-anchored player movement on a 32px grid (player.gd),
##   * FIXED-TIMESTEP simulation (_physics_process, decoupled from render),
##   * REAL collision (CharacterBody2D.move_and_slide) against grid-anchored walls,
##   * a Camera2D that follows the player through a world larger than the viewport.
## Static world is drawn ONCE (world.gd); nothing re-rasterizes per frame except
## the moving player marker (frame-budget lens). No new art — real art lands in G2.
## Non-destructive: separate from the live JS build; does not touch game_id/URL.

const TILE := 32                 # ~32px world/collision grid (tile-integrity lens)
const WORLD_W := 48              # world is 48x34 tiles = 1536x1088, bigger than the 960x540 view
const WORLD_H := 34

var player: CharacterBody2D
var camera: Camera2D
var walls: PackedVector2Array = PackedVector2Array()
var wall_lookup := {}
var hud: Label
var _hud_accum := 0.0
var _js: Object = null

func _ready() -> void:
	_build_world()
	_build_player()
	_build_hud()
	if OS.has_feature("web") and Engine.has_singleton("JavaScriptBridge"):
		_js = Engine.get_singleton("JavaScriptBridge")

# ---------------------------------------------------------------------------
# World: a deterministic 32px grid with a border + interior blocks. Each solid
# tile gets a real 32x32 static collider so movement collision is genuine, not a
# viewport clamp. Layout is hard-coded (no RNG) -> deterministic / authority-ready.
# ---------------------------------------------------------------------------
func _build_world() -> void:
	var body := StaticBody2D.new()
	body.name = "Walls"
	add_child(body)
	for ty in WORLD_H:
		for tx in WORLD_W:
			if _is_wall(tx, ty):
				wall_lookup[Vector2i(tx, ty)] = true
				walls.append(Vector2(tx, ty))
				var shape := CollisionShape2D.new()
				var rect := RectangleShape2D.new()
				rect.size = Vector2(TILE, TILE)
				shape.shape = rect
				shape.position = Vector2(tx * TILE + TILE / 2.0, ty * TILE + TILE / 2.0)
				body.add_child(shape)
	# static visual layer — drawn once (world.gd), never per-frame
	var world := Node2D.new()
	world.name = "World"
	world.set_script(load("res://world.gd"))
	world.dims = Vector2i(WORLD_W, WORLD_H)
	world.walls = walls
	add_child(world)
	move_child(world, 0)   # behind the player

func _is_wall(tx: int, ty: int) -> bool:
	if tx == 0 or ty == 0 or tx == WORLD_W - 1 or ty == WORLD_H - 1:
		return true
	var blocks := [
		Rect2i(8, 6, 6, 1), Rect2i(8, 6, 1, 6),       # an L wall
		Rect2i(20, 4, 1, 10),                          # a long vertical wall with a doorway
		Rect2i(30, 10, 8, 1),
		Rect2i(12, 20, 10, 1), Rect2i(21, 20, 1, 6),   # a room corner
		Rect2i(34, 22, 4, 4),                          # a solid block
		Rect2i(6, 26, 6, 1),
	]
	for b in blocks:
		if tx >= b.position.x and tx < b.position.x + b.size.x \
		and ty >= b.position.y and ty < b.position.y + b.size.y:
			if b == Rect2i(20, 4, 1, 10) and ty == 9:   # doorway gap
				continue
			return true
	return false

func _build_player() -> void:
	player = CharacterBody2D.new()
	player.name = "Player"
	player.set_script(load("res://player.gd"))
	player.position = Vector2(3 * TILE + TILE / 2.0, 3 * TILE + TILE / 2.0)   # open tile (3,3)
	var col := CollisionShape2D.new()
	var circ := CircleShape2D.new()
	circ.radius = 12.0
	col.shape = circ
	player.add_child(col)
	add_child(player)

	camera = Camera2D.new()
	camera.position_smoothing_enabled = false   # crisp, tile-precise follow (feel parity vs JS)
	player.add_child(camera)
	camera.make_current()

func _build_hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	hud = Label.new()
	hud.position = Vector2(12, 10)
	hud.add_theme_color_override("font_color", Color(0.9, 0.95, 1.0))
	layer.add_child(hud)

# Render-rate work only: HUD + expose telemetry to the measurement harness.
# No simulation here (that is in player.gd::_physics_process). No queue_redraw —
# the only moving CanvasItem is the player, which rides its node transform.
func _process(delta: float) -> void:
	_hud_accum += delta
	if _hud_accum < 0.25:
		return
	_hud_accum = 0.0
	var fps := Engine.get_frames_per_second()
	var tile := Vector2i(int(player.position.x) / TILE, int(player.position.y) / TILE)
	hud.text = "Mithralda — Godot G1 · move WASD/arrows\nfps %d · tile (%d,%d)" % [fps, tile.x, tile.y]
	if _js != null:
		_js.eval("window.__godot_fps=%d;window.__godot_tx=%d;window.__godot_ty=%d;window.__godot_ready=true;" % [fps, tile.x, tile.y], true)
