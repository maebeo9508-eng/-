#!/usr/bin/env python3
"""AI가 만든 그림을 게임용 스프라이트로 가져와요.

    python3 tower/tools/import_sprites.py              # tower/assets/src/ 에 있는 것 전부
    python3 tower/tools/import_sprites.py hero slime   # 일부만
    python3 tower/tools/import_sprites.py --smooth     # 도트로 바꾸지 않고 부드러운 가장자리 유지

입력 (tower/assets/src/<키>/):
    base.png              기본 그림 (초상화 아이콘을 여기서 잘라요)
    <동작>.png/.webp      동작 시트 — 가로 한 줄이든, 격자(예: 4×2)든 빈 칸을 찾아 프레임을 나눠요
    <동작>.gif/.webp      움직이는 그림 — 프레임을 꺼내요
    <동작>.mp4/.webm      동영상 — ffmpeg 로 프레임을 뽑아요
    <동작>/               낱장 프레임 PNG 폴더 (이름순)
    <동작>.json           (선택) {"cols": 4, "rows": 2, "frames": 8} — 자동으로 못 나눌 때 직접 지정
아이콘 (tower/assets/src/icons|obs|tiles|ui/): asset-plan.json 의 out 경로 그대로

하는 일:
  1. 배경 지우기 — 가장자리에서 이어진 배경색(마젠타·흰색 등)을 투명하게, 분홍 테두리 번짐 정리
  2. 크기 맞추기 — 같은 캐릭터는 모든 동작에서 같은 크기 (기준: idle/walk 의 키)
  3. 발 위치 맞추기 — 발밑이 프레임 아래쪽 같은 줄에, 몸 가운데가 프레임 가운데에
  4. 도트 처리 — 계획한 픽셀 크기로 줄이고 반투명 가장자리를 또렷하게 (--smooth 로 끔)
  5. 저장 — tower/assets/sprites/<키>_<동작>.png (가로 한 줄 시트), 초상화 tower/assets/icons/<키>.png
  6. 등록 — tower/assets/manifest.auto.js 를 다시 써요 (manifest.js 에 직접 쓴 내용이 우선)
필요: Pillow (pip install pillow), 동영상은 ffmpeg
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile

try:
    from PIL import Image, ImageSequence
except ImportError:
    sys.exit('Pillow 가 필요해요: pip install pillow')

TOWER = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(TOWER, 'assets')
SRC = os.path.join(ASSETS, 'src')
SPRITES = os.path.join(ASSETS, 'sprites')
ICONS = os.path.join(ASSETS, 'icons')
PLAN = os.path.join(ASSETS, 'asset-plan.json')
MANIFEST = os.path.join(ASSETS, 'manifest.auto.js')
STATES = ['idle', 'walk', 'attack', 'hurt', 'ult', 'cast', 'die']
LOOPING = {'idle', 'walk'}
FOOT_PAD = 2       # 프레임 맨 아래와 발 사이 여백(픽셀)
BODY_FILL = 0.84   # 기준 동작에서 캐릭터 키가 프레임 높이에서 차지하는 비율


# ── 프레임 읽기 ────────────────────────────────────────────
def frames_from_video(path, n):
    if not shutil.which('ffmpeg'):
        sys.exit(f'동영상을 읽으려면 ffmpeg 가 필요해요: {path}')
    tmp = tempfile.mkdtemp()
    try:
        out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
                              'stream=nb_read_packets', '-of', 'csv=p=0', path], capture_output=True, text=True)
        total = int((out.stdout.strip() or '0').split(',')[0] or 0)
        step = max(1, total // n) if total else 1
        subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f"select='not(mod(n\\,{step}))'", '-vsync', 'vfr',
                        os.path.join(tmp, 'f%04d.png')], check=True)
        files = sorted(glob.glob(os.path.join(tmp, '*.png')))[:n]
        return [Image.open(f).convert('RGBA') for f in files]
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def frames_from_animated(img, n):
    frames = [f.convert('RGBA') for f in ImageSequence.Iterator(img)]
    if n and len(frames) > n:
        frames = [frames[round(i * (len(frames) - 1) / (n - 1))] for i in range(n)] if n > 1 else frames[:1]
    return frames


def background_color(img):
    """네 귀퉁이에서 가장 많이 나온 색을 배경색으로 봐요."""
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1], px[w // 2, 0], px[0, h // 2]]
    best = max(corners, key=lambda c: sum(1 for d in corners if close(c, d, 24)))
    return best


def close(a, b, tol):
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def remove_background(img, tol=60):
    """가장자리에서 이어진 배경색 영역을 투명하게 (캐릭터 안쪽의 같은 색은 남겨요)."""
    img = img.convert('RGBA')
    w, h = img.size
    px = img.load()
    # 이미 투명 배경이면 그대로
    alpha_corners = [px[0, 0][3], px[w - 1, 0][3], px[0, h - 1][3], px[w - 1, h - 1][3]]
    if max(alpha_corners) < 16:
        return img
    bg = background_color(img)
    seen = bytearray(w * h)
    stack = [(x, 0) for x in range(w)] + [(x, h - 1) for x in range(w)] + [(0, y) for y in range(h)] + [(w - 1, y) for y in range(h)]
    while stack:
        x, y = stack.pop()
        i = y * w + x
        if seen[i]:
            continue
        seen[i] = 1
        c = px[x, y]
        if c[3] < 16 or close(c, bg, tol):
            px[x, y] = (0, 0, 0, 0)
            if x > 0: stack.append((x - 1, y))
            if x < w - 1: stack.append((x + 1, y))
            if y > 0: stack.append((x, y - 1))
            if y < h - 1: stack.append((x, y + 1))
    # 배경색 번짐(마젠타 테두리) 정리: 투명 칸 옆의, 배경색 쪽으로 물든 픽셀을 반투명+탈색
    for y in range(h):
        for x in range(w):
            c = px[x, y]
            if c[3] == 0:
                continue
            edge = (x > 0 and px[x - 1, y][3] == 0) or (x < w - 1 and px[x + 1, y][3] == 0) or \
                   (y > 0 and px[x, y - 1][3] == 0) or (y < h - 1 and px[x, y + 1][3] == 0)
            if edge and close(c, bg, tol * 2):
                px[x, y] = (c[0], c[1], c[2], c[3] // 3)
    return img


def runs(mask):
    """True/False 목록에서 True 가 이어진 구간들 [(시작, 끝)]"""
    out, start = [], None
    for i, v in enumerate(mask + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i))
            start = None
    return out


def split_by_gaps(img, n_hint):
    """빈 줄·빈 칸을 찾아 프레임으로 나눠요. 실패하면 None."""
    w, h = img.size
    a = img.getchannel('A')
    ap = a.load()
    row_has = [any(ap[x, y] > 16 for x in range(0, w, 1)) for y in range(h)]
    rows = [r for r in runs(row_has) if r[1] - r[0] > 4]
    frames = []
    for (y0, y1) in rows:
        col_has = [any(ap[x, y] > 16 for y in range(y0, y1)) for x in range(w)]
        cols = [c for c in runs(col_has) if c[1] - c[0] > 2]
        # 너무 가까운 조각(같은 캐릭터의 떨어진 부분)은 합쳐요
        merged = []
        for c in cols:
            if merged and c[0] - merged[-1][1] < max(3, w // 200):
                merged[-1] = (merged[-1][0], c[1])
            else:
                merged.append(c)
        for (x0, x1) in merged:
            frames.append(img.crop((x0, y0, x1, y1)))
    if n_hint and len(frames) != n_hint:
        return None
    return frames or None


def split_grid(img, cols, rows, n):
    w, h = img.size
    fw, fh = w / cols, h / rows
    out = []
    for r in range(rows):
        for c in range(cols):
            if len(out) >= n:
                break
            out.append(img.crop((round(c * fw), round(r * fh), round((c + 1) * fw), round((r + 1) * fh))))
    return out


def guess_grid(img, n):
    """프레임 수 n 에 맞는 격자를 그림 비율로 짐작해요 (각 칸이 정사각형에 가까운 것)."""
    w, h = img.size
    best = None
    for cols in range(1, n + 1):
        rows = -(-n // cols)
        cell = (w / cols) / (h / rows)
        score = abs(cell - 1)
        if best is None or score < best[0]:
            best = (score, cols, rows)
    return best[1], best[2]


def load_frames(path, n):
    """파일/폴더에서 프레임 목록을 읽어요 (배경 제거까지)."""
    meta = {}
    base = os.path.splitext(path)[0]
    if os.path.exists(base + '.json'):
        meta = json.load(open(base + '.json'))
        n = meta.get('frames', n)
    if os.path.isdir(path):
        files = sorted(f for f in glob.glob(os.path.join(path, '*')) if f.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')))
        return [remove_background(Image.open(f)) for f in files][:n or None]
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.mp4', '.webm', '.mov'):
        return [remove_background(f) for f in frames_from_video(path, n or 8)]
    img = Image.open(path)
    if getattr(img, 'is_animated', False) and img.n_frames > 1:
        return [remove_background(f) for f in frames_from_animated(img, n)]
    img = remove_background(img)
    if 'cols' in meta:
        return split_grid(img, meta['cols'], meta.get('rows', 1), n or meta['cols'] * meta.get('rows', 1))
    frames = split_by_gaps(img, n)
    if frames:
        return frames
    if not n:
        return [img]
    cols, rows = guess_grid(img, n)
    return split_grid(img, cols, rows, n)


# ── 정렬·크기 맞추기 ─────────────────────────────────────
def bbox(img):
    return img.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()


def foot_center(img, box):
    """발 쪽(아래 35%)의 가운데 x — 무기·효과가 옆으로 뻗어도 몸 중심을 잡아요."""
    x0, y0, x1, y1 = box
    a = img.getchannel('A').load()
    top = y1 - max(1, int((y1 - y0) * 0.35))
    xs, total = 0, 0
    for y in range(top, y1):
        for x in range(x0, x1):
            if a[x, y] > 24:
                xs += x
                total += 1
    return xs / total if total else (x0 + x1) / 2


def place(frames, scale, cell_h, pixel, colors):
    """프레임들을 같은 칸 크기로, 발밑·몸 중심을 맞춰 가로 한 줄 시트로 만들어요."""
    infos = []
    for f in frames:
        b = bbox(f)
        if not b:
            infos.append(None)
            continue
        infos.append((b, foot_center(f, b)))
    valid = [i for i in infos if i]
    if not valid:
        return None, 0
    # 칸 너비: 가장 넓게 뻗은 프레임이 들어가도록 (몸 중심 기준 좌우 대칭)
    half = max(max(cx - b[0], b[2] - cx) for b, cx in valid) * scale
    cell_w = max(cell_h, int(half * 2 + 4))
    cell_w += cell_w % 2
    sheet = Image.new('RGBA', (cell_w * len(frames), cell_h), (0, 0, 0, 0))
    for i, (f, info) in enumerate(zip(frames, infos)):
        if not info:
            continue
        b, cx = info
        crop = f.crop(b)
        w = max(1, round(crop.width * scale))
        h = max(1, round(crop.height * scale))
        crop = crop.resize((w, h), Image.BOX if scale < 1 else Image.NEAREST)
        ox = i * cell_w + round(cell_w / 2 - (cx - b[0]) * scale)
        oy = cell_h - FOOT_PAD - h
        if oy < 0:  # 너무 높이 뛰어오른 프레임은 위를 조금 잘라요
            crop = crop.crop((0, -oy, w, h))
            oy = 0
        sheet.alpha_composite(crop, (ox, oy))
    if pixel:  # 시트 전체를 한 번에: 프레임마다 색이 달라져 깜빡이지 않게
        sheet = crisp(sheet, colors)
    return sheet, cell_w


def crisp(img, colors):
    """도트 처리: 반투명 가장자리를 또렷하게, 색 수를 줄여 픽셀 그림처럼."""
    r, g, b, a = img.split()
    a = a.point(lambda v: 255 if v >= 110 else 0)
    rgb = Image.merge('RGB', (r, g, b))
    if colors:
        rgb = rgb.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert('RGB')
    out = rgb.convert('RGBA')
    out.putalpha(a)
    return out


# ── 메인 ───────────────────────────────────────────────
def find_input(folder, state):
    for ext in ('.png', '.webp', '.gif', '.mp4', '.webm', '.mov', '.jpg', '.jpeg'):
        p = os.path.join(folder, state + ext)
        if os.path.exists(p):
            return p
    p = os.path.join(folder, state)
    return p if os.path.isdir(p) else None


def import_character(key, entry, args, manifest, report):
    folder = os.path.join(SRC, key)
    plan_anims = {a['state']: a for a in (entry or {}).get('anims', [])}
    size = (entry or {}).get('frameSize', 48)
    loaded = {}
    for st in STATES:
        p = find_input(folder, st)
        if not p:
            continue
        n = plan_anims.get(st, {}).get('frames')
        frames = load_frames(p, n)
        if not frames:
            report.append(f'  ! {key}/{st}: 프레임을 찾지 못했어요')
            continue
        loaded[st] = (frames, p)
    if not loaded:
        return
    # 기준 키: idle → walk → 아무거나. 그 동작들 프레임 키의 중간값이 프레임 높이의 BODY_FILL 이 되게
    ref_state = next((s for s in ('idle', 'walk') if s in loaded), next(iter(loaded)))
    heights = sorted(bbox(f)[3] - bbox(f)[1] for f in loaded[ref_state][0] if bbox(f))
    ref_h = heights[len(heights) // 2]
    scale = (size * BODY_FILL) / ref_h
    entry_out = manifest.get(key, {})
    for st, (frames, p) in loaded.items():
        sheet, cell_w = place(frames, scale, size, not args.smooth, args.colors)
        if sheet is None:
            continue
        os.makedirs(SPRITES, exist_ok=True)
        out = os.path.join(SPRITES, f'{key}_{st}.png')
        sheet.save(out, optimize=True)
        pa = plan_anims.get(st, {})
        entry_out[st] = {
            'src': f'assets/sprites/{key}_{st}.png', 'frames': len(frames),
            'fps': pa.get('fps', 12 if st in LOOPING else 14), 'loop': st in LOOPING,
            'anchor': round((size - FOOT_PAD) / size, 4),
        }
        report.append(f'  ✓ {key}/{st}: {len(frames)}프레임, 칸 {cell_w}×{size}px ← {os.path.relpath(p, TOWER)}')
    manifest[key] = entry_out
    # 초상화: 기본 그림(없으면 기준 동작 첫 프레임)의 위쪽(얼굴)을 정사각형으로
    base = os.path.join(folder, 'base.png')
    src_img = remove_background(Image.open(base)) if os.path.exists(base) else loaded[ref_state][0][0]
    b = bbox(src_img)
    if b:
        x0, y0, x1, y1 = b
        side = min(x1 - x0, y1 - y0)
        cx = (x0 + x1) / 2
        face = src_img.crop((round(cx - side / 2), y0, round(cx + side / 2), y0 + side)).resize((128, 128), Image.LANCZOS)
        os.makedirs(ICONS, exist_ok=True)
        face.save(os.path.join(ICONS, f'{key}.png'), optimize=True)
        manifest[f'icon_{key}'] = {'src': f'assets/icons/{key}.png'}


def import_icon(icon, args, manifest, report):
    p = os.path.join(TOWER, '..', icon['out'])
    if not os.path.exists(p):
        return
    img = Image.open(p)
    tile = icon['key'].startswith('tile_')
    if not tile:
        img = remove_background(img)
        b = bbox(img)
        if b:
            img = img.crop(b)
    size = icon.get('size', 64)
    if tile:
        img = img.convert('RGB').resize((size * 2, size * 2), Image.LANCZOS)  # 바닥은 128px 로 (게임이 반복해서 깔아요)
    else:
        ratio = size / max(img.size)
        img = img.resize((max(1, round(img.width * ratio)), max(1, round(img.height * ratio))), Image.LANCZOS)
        if not args.smooth and icon['key'] != 'ui_logo':
            img = crisp(img, args.colors)
    name = icon['key'].replace('icon_', '') + '.png'
    os.makedirs(ICONS, exist_ok=True)
    img.save(os.path.join(ICONS, name), optimize=True)
    manifest[icon['key']] = {'src': f'assets/icons/{name}'}
    report.append(f"  ✓ {icon['key']} ← {os.path.relpath(p, TOWER)}")


def read_manifest():
    if not os.path.exists(MANIFEST):
        return {}
    txt = open(MANIFEST, encoding='utf-8').read()
    start = txt.find('{', txt.find('ASSET_MANIFEST_AUTO'))
    end = txt.rfind('}')
    try:
        return json.loads(txt[start:end + 1])
    except ValueError:
        return {}


def write_manifest(m):
    body = json.dumps(m, ensure_ascii=False, indent=2, sort_keys=True)
    open(MANIFEST, 'w', encoding='utf-8').write(
        '// 자동 생성 파일 — tools/import_sprites.py 가 AI 스프라이트를 가져올 때 다시 씁니다. 직접 고치지 마세요.\n'
        '// 손으로 덧붙이거나 고칠 내용은 manifest.js 에 쓰면 이 파일보다 우선해요.\n'
        f'window.ASSET_MANIFEST_AUTO = {body};\n')


def main():
    ap = argparse.ArgumentParser(description='AI 그림 → 게임 스프라이트')
    ap.add_argument('keys', nargs='*', help='가져올 키 (없으면 src 폴더 전부)')
    ap.add_argument('--smooth', action='store_true', help='도트 처리하지 않기')
    ap.add_argument('--colors', type=int, default=24, help='도트 처리 때 색 수 (0 = 줄이지 않음)')
    ap.add_argument('--fresh', action='store_true', help='manifest.auto.js 를 비우고 새로 쓰기')
    args = ap.parse_args()

    plan = json.load(open(PLAN, encoding='utf-8')) if os.path.exists(PLAN) else {'characters': [], 'icons': []}
    chars = {c['key']: c for c in plan['characters']}
    manifest = {} if args.fresh else read_manifest()
    report = []
    keys = args.keys
    if not keys and os.path.isdir(SRC):
        keys = sorted(d for d in os.listdir(SRC) if os.path.isdir(os.path.join(SRC, d)))
    for key in keys:
        if key in ('icons', 'obs', 'tiles', 'ui'):
            continue
        if key not in chars:
            report.append(f'  ? {key}: asset-plan.json 에 없는 키예요 (기본 크기 48px 로 가져와요)')
        import_character(key, chars.get(key), args, manifest, report)
    for icon in plan.get('icons', []):
        if not args.keys or icon['key'] in args.keys:
            import_icon(icon, args, manifest, report)
    write_manifest(manifest)

    # 남은 일: 계획 대비 빠진 것
    have = set(manifest)
    missing = {}
    for c in plan['characters']:
        for a in c['anims']:
            if a['phase'] <= 3 and not (c['key'] in have and a['state'] in manifest[c['key']]):
                missing.setdefault(a['phase'], []).append(f"{c['key']}/{a['state']}")
    print('\n'.join(report) or '가져올 그림이 없어요. tower/assets/src/<키>/ 에 넣어 주세요.')
    print(f'\nmanifest.auto.js: {len([k for k in manifest if not k.startswith(("icon_", "obs_", "tile_", "ui_"))])}명, 아이콘 {len([k for k in manifest if k.startswith(("icon_", "obs_", "tile_", "ui_"))])}개 등록')
    for ph in sorted(missing):
        print(f'{ph}단계 남은 동작 {len(missing[ph])}개')


if __name__ == '__main__':
    main()
