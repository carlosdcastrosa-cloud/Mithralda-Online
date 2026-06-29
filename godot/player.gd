extends CharacterBody2D
## Player (CAS-187 G1). Owns its own movement and marker.
## FIXED-TIMESTEP: _physics_process runs at the engine physics tick (60Hz),
## independent of render frame rate -> movement is not tied to fps. Collision is
## real (move_and_slide against the grid-anchored static walls). The marker is
## drawn ONCE at local origin and rides the node transform — no per-frame redraw.

const SPEED := 200.0          # px/s — tuned to JS live ARPG feel (documented in CAS-187)
const RADIUS := 12.0

func _ready() -> void:
	queue_redraw()

func _physics_process(_delta: float) -> void:
	var dir := Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): dir.y -= 1
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): dir.y += 1
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): dir.x -= 1
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): dir.x += 1
	velocity = dir.normalized() * SPEED
	move_and_slide()

func _draw() -> void:
	draw_circle(Vector2.ZERO, RADIUS + 2.0, Color(0.40, 0.80, 1.0))
	draw_arc(Vector2.ZERO, RADIUS + 2.0, 0, TAU, 28, Color(1, 1, 1), 2.0)
