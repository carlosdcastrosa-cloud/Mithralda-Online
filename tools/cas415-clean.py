# CAS-415 — keep only the dominant connected sprite in a 32x32 RGBA PNG.
# PixelLab's 64-pack occasionally leaks sliver pixels from neighboring pack
# cells into a frame; this drops every alpha component except the largest
# (and any component >= 25% of it, so multi-part icons like boot PAIRS survive).
# Pure stdlib: PNG decode (filters 0-4) + re-encode.
import sys, zlib, struct

def read_png(path):
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    pos, idat, w, h = 8, b"", 0, 0
    while pos < len(d):
        ln, typ = struct.unpack(">I4s", d[pos:pos+8]); pos += 8
        chunk = d[pos:pos+ln]; pos += ln + 4
        if typ == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", chunk[:10])
            assert bd == 8 and ct == 6, f"need RGBA8, got bd={bd} ct={ct}"
        elif typ == b"IDAT": idat += chunk
        elif typ == b"IEND": break
    raw = zlib.decompress(idat)
    stride = w * 4
    px, prev = bytearray(w * h * 4), bytearray(stride)
    for y in range(h):
        f = raw[y * (stride + 1)]
        row = bytearray(raw[y * (stride + 1) + 1: (y + 1) * (stride + 1)])
        for x in range(stride):
            a = row[x - 4] if x >= 4 else 0
            b = prev[x]
            c = prev[x - 4] if x >= 4 else 0
            if f == 1: row[x] = (row[x] + a) & 255
            elif f == 2: row[x] = (row[x] + b) & 255
            elif f == 3: row[x] = (row[x] + (a + b) // 2) & 255
            elif f == 4:
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                row[x] = (row[x] + pr) & 255
        px[y * stride:(y + 1) * stride] = row
        prev = row
    return w, h, px

def write_png(path, w, h, px):
    stride = w * 4
    raw = b"".join(b"\x00" + bytes(px[y * stride:(y + 1) * stride]) for y in range(h))
    def chunk(typ, data):
        c = struct.pack(">I", len(data)) + typ + data
        return c + struct.pack(">I", zlib.crc32(typ + data) & 0xffffffff)
    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(raw, 9))
    out += chunk(b"IEND", b"")
    open(path, "wb").write(out)

def clean(src, dst):
    w, h, px = read_png(src)
    seen, comps = set(), []
    for sy in range(h):
        for sx in range(w):
            if (sx, sy) in seen or px[(sy * w + sx) * 4 + 3] == 0: continue
            comp, stack = [], [(sx, sy)]
            seen.add((sx, sy))
            while stack:
                x, y = stack.pop(); comp.append((x, y))
                for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1),(x-1,y-1),(x+1,y-1),(x-1,y+1),(x+1,y+1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and px[(ny * w + nx) * 4 + 3] > 0:
                        seen.add((nx, ny)); stack.append((nx, ny))
            comps.append(comp)
    comps.sort(key=len, reverse=True)
    keep_min = len(comps[0]) * 0.25
    removed = 0
    for comp in comps[1:]:
        if len(comp) >= keep_min: continue
        for x, y in comp:
            px[(y * w + x) * 4:(y * w + x) * 4 + 4] = b"\x00\x00\x00\x00"
            removed += 1
    write_png(dst, w, h, px)
    print(f"{src} -> {dst}: {len(comps)} components, removed {removed}px")

if __name__ == "__main__":
    clean(sys.argv[1], sys.argv[2])
