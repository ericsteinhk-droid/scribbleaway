"""
Generate the Render Enhancer app icon: a modernist building shown in
two-point perspective at sunset. Produces a multi-resolution .ico plus a PNG
preview.

Run:  python tools/make_icon.py
Output: assets/render_enhancer.ico  and  assets/render_enhancer_icon.png
"""
import os
from PIL import Image, ImageDraw, ImageFilter

R = 1024  # master render size (square)


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def grad_stops(y, stops):
    """stops: list of (pos0..1, color). Return interpolated color at y in 0..1."""
    for i in range(len(stops) - 1):
        p0, c0 = stops[i]
        p1, c1 = stops[i + 1]
        if p0 <= y <= p1:
            t = 0 if p1 == p0 else (y - p0) / (p1 - p0)
            return lerp(c0, c1, t)
    return stops[-1][1]


def bilerp(corners, u, v):
    """corners: TL, TR, BR, BL (each (x,y)). Bilinear interpolate."""
    tl, tr, br, bl = corners
    top = (tl[0] + (tr[0] - tl[0]) * u, tl[1] + (tr[1] - tl[1]) * u)
    bot = (bl[0] + (br[0] - bl[0]) * u, bl[1] + (br[1] - bl[1]) * u)
    return (top[0] + (bot[0] - top[0]) * v, top[1] + (bot[1] - top[1]) * v)


def build():
    img = Image.new("RGB", (R, R), (0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")

    horizon = int(R * 0.66)

    # ── Sky gradient ──
    sky = [
        (0.00, (36, 26, 78)),    # deep indigo (top)
        (0.42, (120, 52, 96)),   # mauve
        (0.74, (223, 104, 52)),  # sunset orange
        (1.00, (255, 206, 120)), # warm gold at horizon
    ]
    for y in range(horizon):
        img.putpixel  # noqa (kept for clarity)
        d.line([(0, y), (R, y)], fill=grad_stops(y / horizon, sky))

    # ── Ground gradient ──
    ground = [
        (0.00, (150, 92, 66)),
        (1.00, (34, 24, 34)),
    ]
    for y in range(horizon, R):
        t = (y - horizon) / (R - horizon)
        d.line([(0, y), (R, y)], fill=grad_stops(t, ground))

    # ── Sun + glow (low, to the right) ──
    sun = (int(R * 0.82), int(R * 0.60))
    glow = Image.new("RGBA", (R, R), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    for rad, alpha in ((360, 40), (260, 60), (170, 110), (110, 200)):
        gd.ellipse([sun[0] - rad, sun[1] - rad, sun[0] + rad, sun[1] + rad],
                   fill=(255, 214, 140, alpha))
    gd.ellipse([sun[0] - 78, sun[1] - 78, sun[0] + 78, sun[1] + 78],
               fill=(255, 240, 200, 255))
    glow = glow.filter(ImageFilter.GaussianBlur(6))
    img.paste(Image.alpha_composite(img.convert("RGBA"), glow).convert("RGB"),
              (0, 0))
    d = ImageDraw.Draw(img, "RGBA")

    # ── Building geometry (two-point perspective) ──
    # Vanishing points off-canvas on the horizon line.
    vpl = (-R * 1.6, horizon)
    vpr = (R * 2.5, horizon)
    front_x = int(R * 0.44)
    top_y = int(R * 0.22)
    bot_y = int(R * 0.90)

    def project(x_edge, vp, px_top, px_bot):
        """y on the top/bottom receding line at vertical edge x_edge."""
        t = (front_x - x_edge) / (front_x - vp[0])
        yt = px_top + t * (vp[1] - px_top)
        yb = px_bot + t * (vp[1] - px_bot)
        return yt, yb

    left_x = int(R * 0.15)
    right_x = int(R * 0.75)
    lt, lb = project(left_x, vpl, top_y, bot_y)
    rt, rb = project(right_x, vpr, top_y, bot_y)

    # Left (shadow) face — corners TL,TR,BR,BL
    left_face = [(left_x, lt), (front_x, top_y), (front_x, bot_y), (left_x, lb)]
    # Right (sunlit) face
    right_face = [(front_x, top_y), (right_x, rt), (right_x, rb), (front_x, bot_y)]

    d.polygon(left_face, fill=(58, 48, 74))     # cool shadow
    d.polygon(right_face, fill=(196, 116, 74))  # warm sunlit

    # ── Windows via bilinear grid ──
    def draw_windows(face, cols, rows, lit_color, dark_color, lit_bias):
        gap_u, gap_v = 0.12, 0.09
        cw = (1 - gap_u) / cols
        ch = (1 - gap_v) / rows
        for c in range(cols):
            for r in range(rows):
                u0 = gap_u + c * cw + gap_u * 0.5
                v0 = gap_v + r * ch + gap_v * 0.5
                u1 = u0 + cw * 0.72
                v1 = v0 + ch * 0.72
                pts = [bilerp(face, u0, v0), bilerp(face, u1, v0),
                       bilerp(face, u1, v1), bilerp(face, u0, v1)]
                # deterministic pseudo-random lit pattern
                lit = ((c * 7 + r * 3) % 10) < lit_bias
                d.polygon(pts, fill=lit_color if lit else dark_color)

    # sunlit face: bright reflective glass; shadow face: mostly dark, some lit
    draw_windows(right_face, 5, 9, (255, 214, 150), (150, 96, 78), 6)
    draw_windows(left_face, 3, 9, (255, 206, 150), (44, 38, 62), 3)

    # ── Warm rim light on the near vertical edge ──
    d.line([(front_x, top_y), (front_x, bot_y)], fill=(255, 224, 170), width=6)

    # subtle ground reflection of the building base
    refl = Image.new("RGBA", (R, R), (0, 0, 0, 0))
    rd = ImageDraw.Draw(refl)
    rd.polygon([(left_x, lb), (front_x, bot_y), (right_x, rb),
                (right_x, rb + 40), (front_x, bot_y + 70), (left_x, lb + 40)],
               fill=(255, 180, 120, 60))
    refl = refl.filter(ImageFilter.GaussianBlur(8))
    img = Image.alpha_composite(img.convert("RGBA"), refl).convert("RGB")

    return img


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    assets = os.path.join(here, "assets")
    os.makedirs(assets, exist_ok=True)
    master = build()

    png_path = os.path.join(assets, "render_enhancer_icon.png")
    master.resize((512, 512), Image.LANCZOS).save(png_path)

    ico_path = os.path.join(assets, "render_enhancer.ico")
    sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    master.save(ico_path, format="ICO", sizes=sizes)
    print("wrote", png_path)
    print("wrote", ico_path)


if __name__ == "__main__":
    main()
