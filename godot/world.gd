extends Node2D
## Static world layer (CAS-187 G1). Floor + 32px grid + walls are drawn ONCE and
## never redrawn — they don't move, so re-rasterizing them every frame would just
## burn frame budget (role-charter frame-budget lens). Godot caches the draw list
## and re-renders it under the camera transform for free.

const TILE := 32

var dims := Vector2i(48, 34)
var walls: PackedVector2Array = PackedVector2Array()

func _draw() -> void:
	var w := dims.x * TILE
	var h := dims.y * TILE
	draw_rect(Rect2(Vector2.ZERO, Vector2(w, h)), Color(0.06, 0.07, 0.10))
	var grid := Color(0.12, 0.14, 0.20)
	for gx in dims.x + 1:
		draw_line(Vector2(gx * TILE, 0), Vector2(gx * TILE, h), grid, 1.0)
	for gy in dims.y + 1:
		draw_line(Vector2(0, gy * TILE), Vector2(w, gy * TILE), grid, 1.0)
	var wall_fill := Color(0.20, 0.23, 0.30)
	var wall_edge := Color(0.32, 0.36, 0.46)
	for t in walls:
		var r := Rect2(t.x * TILE, t.y * TILE, TILE, TILE)
		draw_rect(r, wall_fill, true)
		draw_rect(r, wall_edge, false, 1.0)
