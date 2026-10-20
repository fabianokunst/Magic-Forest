"""Export Magic Forest assets from the .blend sources to web-ready files.

Normally run through `npm run export-models` (tools/export-models.mjs), which calls:
    blender -b <file.blend> --python tools/export_assets.py -- <models_dir> <textures_dir> <cache_dir>

The .blend files are never saved: each asset reopens the source file, edits it in
memory (realize particles, join, rebuild materials, set pivot) and exports a .glb.
"""
import bpy
import os
import sys
import numpy as np
from mathutils import Matrix, Vector

MODELS_DIR, TEXTURES_DIR, CACHE_DIR = sys.argv[sys.argv.index("--") + 1:][:3]
SRC = bpy.data.filepath
SRC_NAME = os.path.basename(SRC)
TEX_SIZE = 1024

HOUSE_MATERIALS = {
    "Barrel", "Door", "Material", "Material.001", "Stone", "Wood", "Wood Roof", "Wood2",
    "chaminé", "concrete", "correntes", "light", "smoke", "stairs", "telha", "telha2",
    "telha3", "window", "wood wall",
}
OGRE_MATERIALS = {"Ogro", "olhos", "dentes", "apple", "base-madeira", "madeira-balde", "Grass"}
LAMPPOST_XY = (-1.15, -3.5)


# ---------------------------------------------------------------- picking rules

def world_bbox(obj):
    pts = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)])
    mx = Vector([max(p[i] for p in pts) for i in range(3)])
    return mn, mx


def center_xy(obj):
    mn, mx = world_bbox(obj)
    return Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2))


def materials_of(obj):
    return {s.material.name for s in obj.material_slots if s.material}


def by_names(*names):
    return lambda: [bpy.data.objects[n] for n in names]


def by_materials(mats):
    return lambda: [o for o in bpy.data.objects
                    if o.type == "MESH" and materials_of(o) and materials_of(o) <= mats]


def near(xy, radius, types=("MESH",)):
    xy = Vector(xy)
    return lambda: [o for o in bpy.data.objects
                    if o.type in types and (center_xy(o) - xy).length < radius]


def cottage():
    lamppost = set(near(LAMPPOST_XY, 0.6)())
    picked = []
    for o in bpy.data.objects:
        if o.type != "MESH" or o in lamppost or materials_of(o) & OGRE_MATERIALS:
            continue
        c = center_xy(o)
        if -1.7 < c.x < 1.7 and -3.3 < c.y < 1.6 and world_bbox(o)[1].z < 4:
            picked.append(o)
    return picked


ASSETS = {
    "House.blend": [
        dict(name="tree_autumn", pick=by_names("Circle.049"), pivot="base"),
        dict(name="pine", pick=by_names("Circle.061"), pivot="base"),
        dict(name="cabin", pick=by_materials(HOUSE_MATERIALS), pivot=(0, 3.25, -1.3)),
        dict(name="grass", pick=by_names("Plane.355", "Plane.356", "Plane.357", "Plane.358"),
             pivot="base", join=False),
    ],
    "ogro e sua casa.blend": [
        dict(name="tree_twisted", pick=by_names("Plane.004"), pivot="base",
             leaves=dict(count=1300, size_mul=1.25, quad=True)),
        dict(name="cottage", pick=cottage, pivot=(0, 0, -0.1)),
        dict(name="lamppost", pick=near(LAMPPOST_XY, 0.6), pivot="base"),
    ],
}

# Standalone textures (terrain, sky) written straight to TEXTURES_DIR.
# crop keeps only the center fraction (grass-big has a dark painted border).
TEXTURES = {
    "House.blend": [
        dict(out="terrain_floor", image="grass-big.jpg", hsv=(0.7, 1.2, 0.3, 1.0), size=1024, crop=0.76),
        dict(out="sky", image="sky.jpg", hsv=(0.45, 1.1, 1.0, 1.0), size=2048),
    ],
    "ogro e sua casa.blend": [
        dict(out="terrain_grass", image="grass-texture.png", size=1024),
        dict(out="terrain_dirt", image="ground-texture.png", size=1024),
    ],
}


# ---------------------------------------------------------------- image baking

def srgb_to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def hue_sat_value(rgb, hue, sat, val, fac):
    """Same math as Blender's Hue/Saturation/Value node, on sRGB-encoded pixels."""
    lin = srgb_to_linear(rgb)
    r, g, b = lin[:, 0], lin[:, 1], lin[:, 2]
    cmax = lin.max(axis=1)
    cmin = lin.min(axis=1)
    delta = cmax - cmin
    safe = np.where(delta > 1e-8, delta, 1.0)
    rc, gc, bc = (cmax - r) / safe, (cmax - g) / safe, (cmax - b) / safe
    h = np.where(r == cmax, bc - gc, np.where(g == cmax, 2.0 + rc - bc, 4.0 + gc - rc)) / 6.0
    h = np.where(delta > 1e-8, h % 1.0, 0.0)
    s = np.where(cmax > 0, delta / np.where(cmax > 0, cmax, 1.0), 0.0)

    h = (h + hue + 0.5) % 1.0
    s = np.clip(s * sat, 0.0, 1.0)
    v = cmax * val

    i = np.floor(h * 6.0).astype(int) % 6
    f = h * 6.0 - np.floor(h * 6.0)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.select(
        [i[:, None] == k for k in range(6)],
        [np.stack(c, axis=1) for c in ((v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q))],
    )
    out = np.maximum(lin * (1 - fac) + out * fac, 0.0)
    return linear_to_srgb(out)


def read_pixels(im):
    w, h = im.size
    px = np.empty(w * h * 4, dtype=np.float32)
    im.pixels.foreach_get(px)
    return px.reshape(h, w, 4)


def find_atlas_background(img):
    """The flat fill color around the UV islands of a painted texture atlas, if any:
    same opaque color in all four corners and covering a good part of the image."""
    probe = img.copy()
    probe.scale(128, 128)
    px = read_pixels(probe)
    bpy.data.images.remove(probe)
    corners = px[[0, 0, -1, -1], [0, -1, 0, -1]]
    if corners[:, 3].min() < 0.99 or np.ptp(corners[:, :3], axis=0).max() > 0.01:
        return None
    bg = corners[:, :3].mean(0)
    # Atlases measure 20-65% of exactly-flat fill; tiling photos/paintings stay under 5%.
    covered = (np.abs(px[..., :3] - bg).max(-1) < 0.002).mean()
    return bg if covered > 0.15 else None


def downsample_atlas(img, bg, size):
    """Shrink an atlas without bleeding its background into the islands, then grow the
    islands' colors over the background so mipmaps never reach it (no seams in game)."""
    px = read_pixels(img)
    h, w = px.shape[:2]
    f = max(1, max(w, h) // size)
    H, W = h // f * f, w // f * f
    px = px[:H, :W]
    mask = (np.abs(px[..., :3] - bg).max(-1) > 0.004).astype(np.float32)
    m = mask.reshape(H // f, f, W // f, f)
    count = m.sum((1, 3))
    col = (px.reshape(H // f, f, W // f, f, 4) * m[..., None]).sum((1, 3)) / np.maximum(count, 1)[..., None]
    filled = count > 0
    for _ in range(32):
        if filled.all():
            break
        acc = np.zeros_like(col)
        n = np.zeros(filled.shape, dtype=np.float32)
        for shift in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            f_shift = np.roll(filled, shift, (0, 1))
            acc += np.roll(col, shift, (0, 1)) * f_shift[..., None]
            n += f_shift
        grow = ~filled & (n > 0)
        col[grow] = acc[grow] / n[grow][:, None]
        filled |= grow
    col[~filled] = col[filled].mean(0)
    col[..., 3] = 1.0
    return col


def bake_image(img, hsv, size, path, file_format="PNG", crop=1.0):
    """Resize `img` to fit `size` (after keeping the center `crop` fraction), apply the
    HSV node values and save it to `path`."""
    if os.path.exists(path):
        return path
    adjust = hsv and any(abs(a - b) > 1e-4 for a, b in zip(hsv, (0.5, 1.0, 1.0, 1.0)))
    bg = find_atlas_background(img) if crop == 1.0 else None
    if bg is not None:
        px = downsample_atlas(img, bg, size)
        im = bpy.data.images.new(img.name + "_atlas", px.shape[1], px.shape[0], alpha=True)
    else:
        im = img.copy()
        w, h = im.size
        scale = min(1.0, size / (max(w, h) * crop))
        if scale < 1.0:
            im.scale(max(1, round(w * scale)), max(1, round(h * scale)))
        px = read_pixels(im) if (adjust or crop < 1.0) else None
        if crop < 1.0:
            h, w = px.shape[:2]
            cw, ch = round(w * crop), round(h * crop)
            x0, y0 = (w - cw) // 2, (h - ch) // 2
            px = px[y0:y0 + ch, x0:x0 + cw].copy()
            bpy.data.images.remove(im)
            im = bpy.data.images.new(img.name + "_crop", cw, ch, alpha=True)
    if px is not None:
        if adjust:
            flat = px.reshape(-1, 4)
            flat[:, :3] = hue_sat_value(flat[:, :3].astype(np.float64), *hsv)
        im.pixels.foreach_set(px.ravel())
    im.filepath_raw = path
    im.file_format = file_format
    im.save(quality=85)
    bpy.data.images.remove(im)
    print(f"  baked {os.path.basename(path)}{' (atlas, dilated)' if bg is not None else ''}")
    return path


# ---------------------------------------------------------------- materials

def upstream(sock):
    return sock.links[0].from_node if sock.is_linked else None


def read_material(mat):
    """Reduce a material's node graph to: color/image/hsv/alpha/emission/uv mapping."""
    info = dict(color=(0.8, 0.8, 0.8, 1.0), image=None, hsv=None, alpha=False,
                emission=None, roughness=1.0, metallic=0.0, uv_scale=None)
    nt = mat.node_tree
    outputs = [n for n in nt.nodes if n.type == "OUTPUT_MATERIAL"]
    out = next((n for n in outputs if n.is_active_output), outputs[0])
    shader = upstream(out.inputs["Surface"])

    if shader and shader.type == "MIX_SHADER":
        fac = upstream(shader.inputs[0])
        if fac and fac.type == "TEX_IMAGE":
            info["alpha"] = True
        shaders = [upstream(shader.inputs[i]) for i in (1, 2)]
        shader = next((s for s in shaders if s and s.type not in {"BSDF_TRANSPARENT"}), None)

    if shader is None:
        return info
    if shader.type == "EMISSION":
        c = shader.inputs["Color"].default_value
        info["emission"] = (c[0], c[1], c[2])
        info["color"] = (0.0, 0.0, 0.0, 1.0)
        return info

    color_sock = shader.inputs.get("Base Color") or shader.inputs.get("Color")
    if shader.type == "BSDF_PRINCIPLED":
        info["roughness"] = shader.inputs["Roughness"].default_value
        info["metallic"] = shader.inputs["Metallic"].default_value
        alpha_src = upstream(shader.inputs["Alpha"])
        if alpha_src and alpha_src.type == "TEX_IMAGE":
            info["alpha"] = True

    node = upstream(color_sock)
    if node is None:
        info["color"] = tuple(color_sock.default_value)
        return info
    if node.type == "HUE_SAT":
        info["hsv"] = tuple(node.inputs[k].default_value for k in ("Hue", "Saturation", "Value", "Fac" if "Fac" in node.inputs else "Factor"))
        node = upstream(node.inputs["Color"])
    if node and node.type == "TEX_IMAGE":
        info["image"] = node.image
        mapping = upstream(node.inputs["Vector"])
        if mapping and mapping.type == "MAPPING":
            s = mapping.inputs["Scale"].default_value
            loc = mapping.inputs["Location"].default_value
            if (s[0], s[1], loc[0], loc[1]) != (1, 1, 0, 0):
                info["uv_scale"] = (s[0], s[1], loc[0], loc[1])
    return info


def rebuild_material(mat, info):
    """Replace the node tree with a single Principled BSDF the glTF exporter understands."""
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Roughness"].default_value = info["roughness"]
    bsdf.inputs["Metallic"].default_value = info["metallic"]
    bsdf.inputs["Base Color"].default_value = info["color"]
    if info["emission"]:
        bsdf.inputs["Emission Color"].default_value = (*info["emission"], 1.0)
        bsdf.inputs["Emission Strength"].default_value = 1.0
    if info["image"]:
        img = info["image"]
        tag = "" if not info["hsv"] else "_" + "_".join(f"{v:g}" for v in info["hsv"])
        stem = img.name
        for ext in (".png", ".jpg", ".jpeg"):
            stem = stem[: -len(ext)] if stem.lower().endswith(ext) else stem
        name = bpy.path.clean_name(stem) + tag
        path = bake_image(img, info["hsv"], TEX_SIZE, os.path.join(CACHE_DIR, name + ".png"))
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = bpy.data.images.load(path, check_existing=True)
        nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
        if info["alpha"]:
            nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])


def apply_uv_mapping(obj, mat_uv):
    """Bake Mapping-node scale/offset into the UVs of faces using those materials."""
    me = obj.data
    if not me.uv_layers:
        return
    uv = me.uv_layers.active.data
    slots = {i: s.material.name for i, s in enumerate(obj.material_slots) if s.material}
    for poly in me.polygons:
        m = mat_uv.get(slots.get(poly.material_index))
        if not m:
            continue
        sx, sy, ox, oy = m
        for li in poly.loop_indices:
            u, v = uv[li].uv
            uv[li].uv = (u * sx + ox, v * sy + oy)


# ---------------------------------------------------------------- asset pipeline

def make_visible(obj):
    if obj.name not in bpy.context.view_layer.objects:
        bpy.context.scene.collection.objects.link(obj)
    obj.hide_viewport = False
    obj.hide_select = False
    obj.hide_set(False)


def select_only(objs, active=None):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active or objs[0]


def leaf_to_quad(obj):
    """Replace a leaf mesh by a single quad. The texture alpha already cuts the leaf
    shape, so 2 triangles look the same as the original 16. UVs follow a linear fit."""
    me = obj.data
    uv = me.uv_layers.active.data
    pos, uvs = [], []
    for poly in me.polygons:
        for vi, li in zip(poly.vertices, poly.loop_indices):
            pos.append(me.vertices[vi].co[:2])
            uvs.append(uv[li].uv[:])
    pos, uvs = np.array(pos), np.array(uvs)
    fit = np.c_[pos, np.ones(len(pos))]
    coef_u = np.linalg.lstsq(fit, uvs[:, 0], rcond=None)[0]
    coef_v = np.linalg.lstsq(fit, uvs[:, 1], rcond=None)[0]
    (x0, y0), (x1, y1) = pos.min(0), pos.max(0)
    corners = [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
    mats = [s.material for s in obj.material_slots]
    quad = bpy.data.meshes.new(me.name + "_quad")
    quad.from_pydata([(x, y, 0.0) for x, y in corners], [], [(0, 1, 2, 3)])
    layer = quad.uv_layers.new()
    for li, (x, y) in enumerate(corners):
        layer.data[li].uv = (coef_u @ (x, y, 1), coef_v @ (x, y, 1))
    for m in mats:
        quad.materials.append(m)
    obj.data = quad


def realize_leaves(trunk, count, size_mul, quad=False):
    """Turn particle leaves into real objects, keeping a random `count` of them, scaled up
    by `size_mul` to keep the canopy full (the hair is groomed, so its count is locked)."""
    for ps in trunk.particle_systems:
        ps.settings.display_percentage = 100
        if quad and ps.settings.instance_object:
            leaf_to_quad(ps.settings.instance_object)
    bpy.context.view_layer.update()
    before = set(bpy.data.objects)
    select_only([trunk])
    bpy.ops.object.duplicates_make_real()
    leaves = [o for o in bpy.data.objects if o not in before]
    for m in [m for m in trunk.modifiers if m.type == "PARTICLE_SYSTEM"]:
        trunk.modifiers.remove(m)
    total = len(leaves)
    rng = np.random.default_rng(7)
    kept = set(rng.choice(total, size=min(count, total), replace=False).tolist())
    for i, o in enumerate(leaves):
        if i not in kept:
            bpy.data.objects.remove(o, do_unlink=True)
    leaves = [o for i, o in enumerate(leaves) if i in kept]
    for o in leaves:
        o.scale = o.scale * size_mul
    print(f"  realized {len(leaves)} of {total} leaves")
    return leaves


def lamp_points(objs):
    """Lamp positions: emissive meshes + point lights near the picked objects."""
    pts = []
    for o in objs:
        if o.type == "MESH" and "light" in materials_of(o):
            mn, mx = world_bbox(o)
            pts.append((mn + mx) / 2)
    if objs:
        mn = Vector([min(world_bbox(o)[0][i] for o in objs) for i in range(3)])
        mx = Vector([max(world_bbox(o)[1][i] for o in objs) for i in range(3)])
        for l in bpy.data.objects:
            p = l.matrix_world.translation
            if l.type == "LIGHT" and l.data.type == "POINT" and all(mn[i] - 0.3 <= p[i] <= mx[i] + 0.3 for i in range(3)):
                pts.append(p.copy())
    unique = []
    for p in pts:
        if all((p - q).length > 0.3 for q in unique):
            unique.append(p)
    return unique


def base_pivot(objs):
    verts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    zmin = min(v.z for v in verts)
    zmax = max(v.z for v in verts)
    bottom = [v for v in verts if v.z < zmin + (zmax - zmin) * 0.05]
    return Vector((sum(v.x for v in bottom) / len(bottom), sum(v.y for v in bottom) / len(bottom), zmin))


def export_asset(spec):
    bpy.ops.wm.open_mainfile(filepath=SRC)
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    picked = spec["pick"]()
    print(f"\n[{spec['name']}] {len(picked)} objects: {[o.name for o in picked][:8]}{' ...' if len(picked) > 8 else ''}")
    for o in picked:
        make_visible(o)

    lamps = lamp_points(picked)
    if spec.get("leaves"):
        picked += realize_leaves(picked[0], **spec["leaves"])

    keep = set(picked)
    for o in list(bpy.data.objects):
        if o not in keep:
            bpy.data.objects.remove(o, do_unlink=True)

    select_only(picked)
    bpy.ops.object.make_single_user(object=True, obdata=True, material=False)
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]

    mat_uv = {}
    for mat in {s.material for o in meshes for s in o.material_slots if s.material}:
        if mat.node_tree:
            info = read_material(mat)
            if info["uv_scale"]:
                mat_uv[mat.name] = info["uv_scale"]
            rebuild_material(mat, info)
    for o in meshes:
        apply_uv_mapping(o, mat_uv)

    if spec.get("join", True):
        pivot = base_pivot(meshes) if spec["pivot"] == "base" else Vector(spec["pivot"])
        select_only(meshes)
        bpy.ops.object.join()
        root = bpy.context.view_layer.objects.active
        root.name = spec["name"]
        root.data.transform(Matrix.Translation(-pivot))
        exported = [root]
        for i, p in enumerate(lamps):
            empty = bpy.data.objects.new(f"lamp_{i}", None)
            empty.location = p - pivot
            bpy.context.scene.collection.objects.link(empty)
            exported.append(empty)
    else:
        exported = []
        for i, o in enumerate(meshes):
            o.data.transform(Matrix.Translation(-base_pivot([o])))
            o.name = f"{spec['name']}_{i}"
            exported.append(o)

    select_only(exported, exported[0])
    path = os.path.join(MODELS_DIR, spec["name"] + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="WEBP",
        export_image_quality=85,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_extras=False,
    )
    tris = sum(len(p.vertices) - 2 for o in exported if o.type == "MESH" for p in o.data.polygons)
    print(f"  -> {os.path.basename(path)}  {tris:,} tris, {len(lamps)} lamps, "
          f"{os.path.getsize(path) / 1024:.0f} KB")


def export_textures(specs):
    for spec in specs:
        img = bpy.data.images[spec["image"]]
        path = os.path.join(TEXTURES_DIR, spec["out"] + ".webp")
        if os.path.exists(path):
            os.remove(path)
        bake_image(img, spec.get("hsv"), spec["size"], path, file_format="WEBP", crop=spec.get("crop", 1.0))


def main():
    for d in (MODELS_DIR, TEXTURES_DIR, CACHE_DIR):
        os.makedirs(d, exist_ok=True)
    export_textures(TEXTURES.get(SRC_NAME, []))
    for spec in ASSETS.get(SRC_NAME, []):
        export_asset(spec)


main()
