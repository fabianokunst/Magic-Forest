# -*- coding: utf-8 -*-
"""
Exporta "ogro e sua casa.blend" para o jogo web (Three.js): a casinha da fase 1 e o ogro de todas as fases.

Uso (a partir da pasta do projeto; ou simplesmente npm run export-ogre):
  "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" -b "ogro e sua casa.blend" ^
      --python tools/export_ogre.py -- public/ogre [--preview pasta_previews]

Gera em public/ogre/:
  scene.glb      cenario (casa, arvores, montanhas, poste, estrelas)
  ogre.glb       ogro + balde + animacoes
  instances.bin  matrizes (float32, column-major) das folhas e da grama, que no .blend sao particulas
  level.json     arvores (colisao), luzes, poste, mapeamento UV do chao
  textures/      texturas do chao (grama, terra e mascara do caminho)

O .blend original nao e alterado (nada e salvo).
"""
import bpy
import os
import sys
import json
import math
from array import array

import numpy as np
from mathutils import Matrix, Vector, Quaternion

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
PREVIEW = None
if "--preview" in argv:
    i = argv.index("--preview")
    PREVIEW = os.path.abspath(argv[i + 1])
    del argv[i:i + 2]

BLEND_DIR = os.path.dirname(bpy.data.filepath)
OUT = os.path.abspath(argv[0]) if argv else os.path.join(BLEND_DIR, "public", "ogre")
TEX_OUT = os.path.join(OUT, "textures")
os.makedirs(TEX_OUT, exist_ok=True)

scene = bpy.context.scene
FPS = 30
scene.render.fps = FPS

# Blender (Z para cima) -> glTF (Y para cima)
C = Matrix(((1, 0, 0, 0), (0, 0, 1, 0), (0, -1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()


def gl(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def update():
    bpy.context.view_layer.update()


# ---------------------------------------------------------------- texturas

def fix_textures():
    tex_dir = os.path.join(BLEND_DIR, "texture")
    for img in bpy.data.images:
        if img.source != 'FILE' or not img.filepath:
            continue
        path = bpy.path.abspath(img.filepath)
        if not os.path.exists(path):
            cand = os.path.join(tex_dir, os.path.basename(path.replace("\\", "/")))
            if os.path.exists(cand):
                img.filepath = cand
                img.reload()
                print("textura corrigida:", img.name, "->", cand)
    limits = {"Ogro Base Color": 2048, "grass-texture.png": 2048, "ground-texture.png": 2048}
    for img in bpy.data.images:
        if img.source != 'FILE' or img.size[0] == 0:
            continue
        w, h = img.size
        m = limits.get(img.name, 1024)
        if max(w, h) > m:
            s = m / max(w, h)
            img.scale(max(1, round(w * s)), max(1, round(h * s)))


def save_texture(name, filename, color=True):
    src = bpy.data.images[name]
    w, h = src.size
    px = np.empty(w * h * 4, dtype=np.float32)
    src.pixels.foreach_get(px)
    if src.is_float and color:
        rgb = px.reshape(-1, 4)[:, :3]
        rgb[:] = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, None), 1 / 2.4) - 0.055)
    dst = bpy.data.images.new(filename, w, h, alpha=True)
    dst.pixels.foreach_set(px)
    dst.filepath_raw = os.path.join(TEX_OUT, filename)
    dst.file_format = 'WEBP'
    try:
        dst.save(quality=85)
    except TypeError:
        dst.save()


# ---------------------------------------------------------------- cenario

def tree_objects():
    out = []
    for o in scene.objects:
        if o.type == 'MESH' and o.data.materials and o.data.materials[0] \
                and o.data.materials[0].name == 'Tree':
            out.append(o)
    return out


def trunk_info(o):
    pts = [o.matrix_world @ v.co for v in o.data.vertices]
    low = [p for p in pts if p.z < 0.4] or pts
    cx = sum(p.x for p in low) / len(low)
    cy = sum(p.y for p in low) / len(low)
    mid = [p for p in pts if 0.8 < p.z < 1.2]
    r = max(math.hypot(p.x - cx, p.y - cy) for p in mid) if mid else 0.5
    # raio das raizes na altura do ogro, usado para colisao
    band = [p for p in pts if 0.15 < p.z < 0.45]
    rc = max(math.hypot(p.x - cx, p.y - cy) for p in band) if band else r
    h = max(p.z for p in pts)
    return Vector((cx, cy, 0.0)), r, rc, h


def collect_instances():
    dg = bpy.context.evaluated_depsgraph_get()
    leaves, grass = {}, []
    for inst in dg.object_instances:
        if not inst.is_instance:
            continue
        name = inst.object.original.name
        if name == 'Leaf':
            leaves.setdefault(inst.parent.original.name, []).append((C @ inst.matrix_world @ CI).copy())
        elif name == 'grass':
            grass.append((C @ inst.matrix_world @ CI).copy())
    return leaves, grass


def ground_uv_mapping():
    """u,v (convencao glTF, v para baixo) como funcao linear de x,z (glTF)."""
    pl = bpy.data.objects['Plane']
    me = pl.data
    uv = me.uv_layers.active.data
    rows, us, vs = [], [], []
    for loop in me.loops:
        p = pl.matrix_world @ me.vertices[loop.vertex_index].co
        x, z = p.x, -p.y
        rows.append([x, z, 1.0])
        us.append(uv[loop.index].uv[0])
        vs.append(1.0 - uv[loop.index].uv[1])
    A = np.array(rows)
    cu = np.linalg.lstsq(A, np.array(us), rcond=None)[0]
    cv = np.linalg.lstsq(A, np.array(vs), rcond=None)[0]
    return [[round(float(c), 6) for c in cu], [round(float(c), 6) for c in cv]]


def make_lamppost_prefab():
    parts = ['Cube.157', 'Cube.158', 'Cube.159', 'Cube.160', 'Torus.005']
    post = bpy.data.objects['Cube.160']
    lp = bpy.data.objects.new('Lamppost', None)
    scene.collection.objects.link(lp)
    lp.location = (post.location.x, post.location.y, 0.0)
    update()
    for n in parts:
        o = bpy.data.objects[n]
        mw = o.matrix_world.copy()
        o.parent = lp
        o.matrix_world = mw
    update()
    return lp


# ---------------------------------------------------------------- ogro: poses e animacoes

arm = bpy.data.objects['Armature']
PB = arm.pose.bones
RIGHT = Vector((-1, 0, 0))   # eixos no espaco da armature (o ogro olha para -Y)
FWD = Vector((0, -1, 0))
UP = Vector((0, 0, 1))
ROOTS = ('Bone', 'Bone.023', 'Bone.024')          # coluna e as duas pernas partem do quadril
LEG_R = ('Bone.025', 'Bone.027', 'Bone.029')      # coxa, canela, pe
LEG_L = ('Bone.026', 'Bone.028', 'Bone.030')
LEG_LEN = 0.29                                   # altura do quadril em metros


def bone_set(root):
    b = arm.data.bones[root]
    return [root] + [c.name for c in b.children_recursive]


def capture():
    return {pb.name: (pb.rotation_quaternion.copy(), pb.location.copy(), pb.scale.copy()) for pb in PB}


def apply(p):
    for pb in PB:
        q, l, s = p[pb.name]
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = q
        pb.location = l
        pb.scale = s


def blend(a, b, t, names=None):
    out = dict(a)
    for n in (names if names is not None else a.keys()):
        qa, la, sa = a[n]
        qb, lb, sb = b[n]
        if qa.dot(qb) < 0:
            qb = -qb
        out[n] = (qa.slerp(qb, t), la.lerp(lb, t), sa.lerp(sb, t))
    return out


def with_bones(a, b, names):
    out = dict(a)
    for n in names:
        out[n] = b[n]
    return out


def rot(name, axis, deg, pivot=None):
    if abs(deg) < 1e-6:
        return
    update()
    pb = PB[name]
    M = pb.matrix.copy()
    p = M.to_translation() if pivot is None else pivot
    pb.matrix = Matrix.Translation(p) @ Matrix.Rotation(math.radians(deg), 4, axis) @ Matrix.Translation(-p) @ M


def shift(names, delta_m):
    update()
    d = Vector(delta_m) / arm.scale.x
    for n in names:
        pb = PB[n]
        M = pb.matrix.copy()
        M.translation += d
        pb.matrix = M


def ease(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


def envelope(f, a, b, c, d):
    if f <= a or f >= d:
        return 0.0
    if f < b:
        return ease((f - a) / (b - a))
    if f <= c:
        return 1.0
    return 1.0 - ease((f - c) / (d - c))


def legs(thigh, knee, foot, which=(LEG_R, LEG_L)):
    for th, sh, ft in which:
        rot(th, RIGHT, thigh)
        rot(sh, RIGHT, -knee)
        rot(ft, RIGHT, foot)


def build_animations(CARRY, P1, P3):
    L_ARM = bone_set('Bone.004')
    HEAD = bone_set('Bone.009')
    LEGS = bone_set('Bone.023') + bone_set('Bone.024')
    ident = (Quaternion(), Vector(), Vector((1, 1, 1)))

    # base: carregando o balde, pernas em repouso com joelhos levemente dobrados
    base = dict(CARRY)
    for n in LEGS:
        base[n] = ident
    apply(base)
    shift(ROOTS, (0, 0, -0.006))
    legs(5, 10, 5)
    update()
    BASE = capture()

    anims = {}

    def anim(name, n, fn, loop=True):
        frames = []
        for f in range(n + 1 if loop else n):
            t = (f % n) / n if loop else f / max(1, n - 1)
            apply(BASE)
            fn(t, f)
            update()
            frames.append(capture())
        anims[name] = frames

    def idle(t, f):
        b = math.sin(2 * math.pi * t)
        shift(ROOTS, (0, 0, -0.003 * (1 + b) / 2))
        rot('Bone.002', RIGHT, 1.5 * b)
        rot('Bone.009', RIGHT, -1.0 * b)
        rot('Bone.006', RIGHT, 3 * math.sin(2 * math.pi * t + 1.0))

    def gait(amp, knee, lean, arm_amp, drop_k, sway):
        def fn(t, f):
            th = 2 * math.pi * t
            s, c = math.sin(th), math.cos(th)
            drop = LEG_LEN * (1 - math.cos(math.radians(amp * s))) * drop_k
            side = RIGHT * (-c * sway)
            shift(ROOTS, (side.x, side.y, -drop))
            rot('Bone', RIGHT, -lean)
            rot('Bone', UP, 5 * s)
            rot('Bone.009', RIGHT, lean * 0.6)
            for (th_b, sh_b, ft_b), a, k in ((LEG_R, amp * s, knee * max(0.0, c) + 8),
                                              (LEG_L, -amp * s, knee * max(0.0, -c) + 8)):
                rot(th_b, RIGHT, a)
                rot(sh_b, RIGHT, -k)
                rot(ft_b, RIGHT, (k - a) * 0.85)
            rot('Bone.006', RIGHT, arm_amp * s + 4)
            rot('Bone.008', RIGHT, 10 + 0.6 * arm_amp * max(0.0, s))
        return fn

    ROARP = with_bones(BASE, P3, L_ARM + HEAD + ['Bone.001', 'Bone.002'])

    def roar(t, f):
        w = envelope(f, 0, 7, 26, 36)
        apply(blend(BASE, ROARP, w))
        shake = math.sin(f * 2.3) * w if 7 <= f <= 26 else 0.0
        shift(ROOTS, (0, 0, -0.03 * w))
        rot('Bone.001', RIGHT, 10 * w)
        rot('Bone.002', UP, 4 * shake)
        rot('Bone.010', RIGHT, 14 * w)
        rot('Bone.012', RIGHT, -26 * w)
        legs(16 * w, 32 * w, 16 * w)

    WIND = with_bones(BASE, P3, L_ARM)
    REL = with_bones(BASE, P1, L_ARM)

    def throw(t, f):
        if f < 6:
            u = ease(f / 6)
            apply(blend(BASE, WIND, u, L_ARM))
            tw = 14 * u
        elif f < 9:
            u = (f - 6) / 3
            apply(blend(WIND, REL, u, L_ARM))
            tw = 14 - 30 * u
        else:
            u = ease((f - 9) / 9)
            apply(blend(REL, BASE, u, L_ARM))
            tw = -16 * (1 - u)
        rot('Bone', UP, tw)

    def interact(t, f):
        w = envelope(f, 0, 6, 18, 24)
        apply(blend(BASE, REL, w, L_ARM))
        push = math.sin((f - 6) / 12 * 4 * math.pi) if 6 <= f <= 18 else 0.0
        rot('Bone', RIGHT, -(8 * w + 3 * push))
        rot('Bone.006', RIGHT, 25 * w + 10 * push)

    def hit(t, f):
        w = ease(f / 3) if f < 3 else 1 - ease((f - 3) / 11)
        rot('Bone', RIGHT, 18 * w)
        rot('Bone.010', RIGHT, 12 * w)
        rot('Bone.006', RIGHT, 40 * w)
        legs(0, 10 * w, -5 * w)

    UPARM = with_bones(BASE, P3, L_ARM)

    def celebrate(t, f):
        j = abs(math.sin(2 * math.pi * t))
        apply(UPARM)
        shift(ROOTS, (0, 0, 0.07 * j))
        legs(25 * j, 50 * j, 25 * j)
        rot('Bone.006', FWD, 14 * math.sin(4 * math.pi * t))

    def sad(t, f):
        w = ease(min(1.0, f / 24))
        shift(ROOTS, (0, 0, -0.035 * w))
        rot('Bone', RIGHT, -22 * w)
        rot('Bone.009', RIGHT, -16 * w)
        legs(18 * w, 36 * w, 18 * w)

    anim('Idle', 60, idle)
    anim('Walk', 20, gait(amp=30, knee=55, lean=5, arm_amp=22, drop_k=1.0, sway=0.008))
    anim('Run', 16, gait(amp=42, knee=75, lean=13, arm_amp=38, drop_k=0.6, sway=0.006))
    anim('Roar', 36, roar, loop=False)
    anim('Throw', 18, throw, loop=False)
    anim('Interact', 24, interact, loop=False)
    anim('Hit', 15, hit, loop=False)
    anim('Celebrate', 30, celebrate)
    anim('Sad', 30, sad, loop=False)
    return BASE, anims


def write_action(name, frames):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data.action = act
    n = len(frames)
    for pb in PB:
        b = pb.name
        qs, prev = [], None
        for p in frames:
            q = p[b][0].copy()
            if prev is not None:
                q.make_compatible(prev)
            qs.append(q)
            prev = q
        channels = (('rotation_quaternion', qs, 4),
                    ('location', [p[b][1] for p in frames], 3),
                    ('scale', [p[b][2] for p in frames], 3))
        for chan, values, size in channels:
            path = 'pose.bones["%s"].%s' % (b, chan)
            for idx in range(size):
                fc = act.fcurve_ensure_for_datablock(arm, path, index=idx, group_name=b)
                fc.keyframe_points.add(n)
                co = []
                for i in range(n):
                    co += [i + 1, values[i][idx]]
                fc.keyframe_points.foreach_set('co', co)
                for kp in fc.keyframe_points:
                    kp.interpolation = 'LINEAR'
                fc.update()
    arm.animation_data.action = None
    return act


def prepare_ogre():
    CARRY = capture()   # pose atual da cena: andando com o balde no ombro

    poses = {}
    lib = bpy.data.actions.get('PoseLib')
    if lib:
        if not arm.animation_data:
            arm.animation_data_create()
        arm.animation_data.action = lib
        if lib.slots:
            arm.animation_data.action_slot = lib.slots[0]
        for f in (1, 2, 3, 4):
            scene.frame_set(f)
            poses[f] = capture()
        arm.animation_data.action = None
        bpy.data.actions.remove(lib)
    scene.frame_set(1)
    apply(CARRY)
    update()

    # o balde e as macas passam a seguir a mao direita
    for n in ('Plane.017', 'Sphere.006', 'Circle.005'):
        o = bpy.data.objects[n]
        mw = o.matrix_world.copy()
        o.parent = arm
        o.parent_type = 'BONE'
        o.parent_bone = 'Bone.007'
        update()
        o.matrix_world = mw
    update()

    # ogro na origem, olhando para +Z no glTF, pes no chao
    arm.location = (0.0, 0.0, 0.297)
    arm.rotation_euler = (0.0, 0.0, 0.0)
    update()

    names = {'Plane.019': 'OgroCorpo', 'Sphere': 'OgroOlhos', 'Circle.006': 'OgroDentes',
             'Plane.017': 'Balde', 'Sphere.006': 'Macas', 'Circle.005': 'BaldeFundo'}
    for old, new in names.items():
        bpy.data.objects[old].name = new

    if not arm.animation_data:
        arm.animation_data_create()
    BASE, anims = build_animations(CARRY, poses.get(1, CARRY), poses.get(3, CARRY))
    for name, frames in anims.items():
        write_action(name, frames)
    apply(BASE)
    update()
    return BASE, anims


# ---------------------------------------------------------------- export

def select_only(objs):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.hide_viewport = False
        o.hide_set(False)
        o.select_set(True)


COMMON = dict(export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
              export_cameras=False, export_lights=False, export_extras=True,
              export_image_format='WEBP', export_image_quality=85)


def main():
    fix_textures()
    save_texture('grass-texture.png', 'grass.webp')
    save_texture('ground-texture.png', 'ground.webp')
    save_texture('Mask', 'mask.webp', color=False)

    trees = tree_objects()
    leaves, grass = collect_instances()

    floats = array('f')
    level = {"trees": [], "leaves": [], "grass": None}
    for o in trees:
        base, r, rc, h = trunk_info(o)
        level["trees"].append({"name": o.name, "pos": gl(base), "r": round(r, 3), "rc": round(rc, 3),
                               "h": round(h, 3)})
        mats = leaves.get(o.name, [])
        bgl = Vector(gl(base))
        T = Matrix.Translation(-bgl)
        off = len(floats) // 16
        for M in mats:
            R = T @ M
            floats.extend(R[r_][c_] for c_ in range(4) for r_ in range(4))
        level["leaves"].append({"tree": o.name, "base": gl(base), "offset": off, "count": len(mats)})
    off = len(floats) // 16
    for M in grass:
        floats.extend(M[r_][c_] for c_ in range(4) for r_ in range(4))
    level["grass"] = {"offset": off, "count": len(grass)}
    with open(os.path.join(OUT, "instances.bin"), "wb") as fh:
        floats.tofile(fh)

    L = bpy.data.objects
    lp = make_lamppost_prefab()
    level["lights"] = {
        "house_lanterns": [gl(L[n].location) for n in ('Light.004', 'Light.005', 'Light.006')],
        "interior": gl(L['Light.003'].location),
    }
    level["lamppost"] = {"base": gl(lp.location),
                         "lantern_offset": gl(L['Light.007'].location - lp.location)}
    level["ground"] = {"uv": ground_uv_mapping(), "half": round(bpy.data.objects['Plane'].dimensions.x / 2, 3)}
    level["ogre"] = {"spawn": gl(arm.location), "scale": round(arm.scale.x, 5)}

    # particulas viram instancias no jogo: remove os sistemas antes de exportar
    for o in scene.objects:
        for m in list(o.modifiers):
            if m.type == 'PARTICLE_SYSTEM':
                o.modifiers.remove(m)

    BASE, anims = prepare_ogre()
    ogre_objs = [arm] + list(arm.children_recursive)

    # Leaf e grass ficam ocultos no render (sao so a forma das particulas), mas o jogo precisa da malha
    skip = set(ogre_objs)
    scene_objs = [o for o in scene.objects
                  if o not in skip and o.type in {'MESH', 'EMPTY'}
                  and (not o.hide_render or o.name in ('Leaf', 'grass'))]
    select_only(scene_objs)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "scene.glb"),
                              export_animations=False, export_skins=False, **COMMON)

    select_only(ogre_objs)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "ogre.glb"),
                              export_animations=True, export_animation_mode='ACTIONS',
                              export_force_sampling=True, export_frame_step=1,
                              export_frame_range=False, export_anim_slide_to_zero=True,
                              export_reset_pose_bones=True, export_rest_position_armature=True,
                              export_anim_single_armature=True, export_optimize_animation_size=False,
                              export_skins=True, export_def_bones=False, **COMMON)

    level["animations"] = {k: {"frames": len(v), "fps": FPS} for k, v in anims.items()}
    with open(os.path.join(OUT, "level.json"), "w", encoding="utf-8") as fh:
        json.dump(level, fh, indent=1)
    print("EXPORT OK ->", OUT, "| arvores:", len(trees), "| folhas:", sum(len(v) for v in leaves.values()),
          "| grama:", len(grass))

    if PREVIEW:
        render_previews(anims, ogre_objs)


def render_previews(anims, ogre_objs):
    os.makedirs(PREVIEW, exist_ok=True)
    keep = set(ogre_objs)
    for o in scene.objects:
        if o.type == 'MESH' and o not in keep:
            o.hide_render = True
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'TEXTURE'
    scene.render.resolution_x, scene.render.resolution_y = 300, 380
    cam_data = bpy.data.cameras.new("preview")
    cam_data.lens = 50
    cam = bpy.data.objects.new("preview", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    target = Vector((0, 0, 0.38))
    views = {"side": Vector((2.3, 0, 0.45)), "front": Vector((0, -2.3, 0.45))}
    for name, frames in anims.items():
        idx = np.linspace(0, len(frames) - 1, 6).round().astype(int)
        for view, pos in views.items():
            cam.location = pos
            cam.rotation_euler = (target - pos).to_track_quat('-Z', 'Y').to_euler()
            tiles = []
            for i in idx:
                apply(frames[i])
                update()
                path = os.path.join(PREVIEW, "_tile.png")
                scene.render.filepath = path
                bpy.ops.render.render(write_still=True)
                im = bpy.data.images.load(path)
                w, h = im.size
                px = np.empty(w * h * 4, dtype=np.float32)
                im.pixels.foreach_get(px)
                tiles.append(px.reshape(h, w, 4))
                bpy.data.images.remove(im)
            sheet = np.concatenate(tiles, axis=1)
            out = bpy.data.images.new("sheet", sheet.shape[1], sheet.shape[0], alpha=True)
            out.pixels.foreach_set(sheet.ravel())
            out.filepath_raw = os.path.join(PREVIEW, "%s_%s.png" % (name, view))
            out.file_format = 'PNG'
            out.save()
            bpy.data.images.remove(out)


main()
