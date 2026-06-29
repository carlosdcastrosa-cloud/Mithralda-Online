#!/usr/bin/env bash
# CAS-179 Task#1 deploy-gate spike: can a size-stripped Godot 4.3 web template
# get index.wasm UNDER the 25 MiB (26,214,400 byte) per-asset deploy bound?
# Stock template = 35,376,909 B (33.74 MiB) = 35% over. This builds the engine
# from source with optimize=size + LTO + heavy module strips and reports the
# resulting raw .wasm size. Background job; everything logged.
set -uo pipefail
LOG=/tmp/godot-stripped-build.log
exec > >(tee -a "$LOG") 2>&1
echo "=== CAS-179 stripped-engine spike start ==="
BOUND=26214400  # 25 MiB in bytes

cd /tmp || exit 1

# 1. emsdk pinned to Godot 4.3's supported emscripten (3.1.62)
if [ ! -d /tmp/emsdk ]; then
  git clone --depth 1 https://github.com/emscripten-core/emsdk.git /tmp/emsdk || exit 2
fi
cd /tmp/emsdk || exit 2
./emsdk install 3.1.62 || exit 3
./emsdk activate 3.1.62 || exit 3
source ./emsdk_env.sh
emcc --version | head -1

# 2. scons (build system) — system python is pip-less; run SCons wheel as a module
SCONS="python3 -m SCons"
export PYTHONPATH="/tmp/scons-pkg${PYTHONPATH:+:$PYTHONPATH}"
$SCONS --version | head -1 || { echo "FATAL: scons unavailable"; exit 4; }

# 3. Godot 4.3 source (shallow)
if [ ! -d /tmp/godot-src ]; then
  git clone --depth 1 --branch 4.3-stable https://github.com/godotengine/godot.git /tmp/godot-src || exit 5
fi
cd /tmp/godot-src || exit 5

# 4. Size-optimized web template build. optimize=size + LTO + production,
#    strip 3D/navigation/heavy text-server which a top-down 2D game does not need.
NPROC=$(nproc 2>/dev/null || echo 4)
echo "=== scons build on $NPROC cores (this is the long part) ==="
# threads=no = the single-threaded export we MUST ship (no COOP/COEP) — also smaller &
# links in far less RAM. lto=none: full LTO link OOM-kills on this 8GB box (SIGKILL at
# wasm-ld). optimize=size still beats the stock optimize=speed template.
$SCONS platform=web target=template_release \
  threads=no optimize=size lto=none production=no \
  module_navigation_enabled=no \
  module_text_server_adv_enabled=no module_text_server_fb_enabled=yes \
  module_gridmap_enabled=no module_csg_enabled=no \
  module_raycast_enabled=no module_multiplayer_enabled=no \
  module_webrtc_enabled=no module_websocket_enabled=no \
  module_openxr_enabled=no module_camera_enabled=no \
  deprecated=no \
  -j"$NPROC" || { echo "FATAL: scons build failed"; exit 6; }

echo "=== build artifacts ==="
ls -l bin/*.wasm 2>/dev/null
for f in bin/*.wasm; do
  sz=$(stat -c%s "$f")
  echo "ARTIFACT $f = $sz bytes ($(awk "BEGIN{printf \"%.2f\", $sz/1048576}") MiB)"
  if [ "$sz" -le "$BOUND" ]; then
    echo "RESULT: PASS — $f is UNDER the 25 MiB bound ($sz <= $BOUND)"
  else
    echo "RESULT: FAIL — $f is OVER the 25 MiB bound by $((sz-BOUND)) bytes"
  fi
done
echo "=== CAS-179 stripped-engine spike done ==="
