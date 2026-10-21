# Builds the Android launcher icons, splash screens and the in-app logo from assets/logo.png.
# Run from anywhere: python assets/make-icons.py  (needs Pillow: pip install pillow)
import os, sys
from PIL import Image, ImageDraw
root = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), "..")
res = os.path.join(root, 'android/app/src/main/res')
BG = (245, 245, 245, 255)
logo = Image.open(os.path.join(root, 'assets/logo.png')).convert('RGBA')
art = logo.crop((14, 14, 142, 142))          # the bowl only (rows/cols 20-135 plus margin)
full = logo                                   # bowl + "NUTRITION"

def placed(size, img, fraction):
    canvas = Image.new('RGBA', (size, size), BG)
    w = round(size * fraction)
    h = round(img.height * w / img.width)
    canvas.alpha_composite(img.resize((w, h), Image.LANCZOS), ((size - w) // 2, (size - h) // 2))
    return canvas

densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
for name, scale in densities.items():
    d = os.path.join(res, 'mipmap-' + name)
    # Adaptive icon foreground: 108dp, art inside the 66dp safe circle.
    placed(round(108 * scale), art, 0.54).save(os.path.join(d, 'ic_launcher_foreground.png'))
    # Legacy icons (Android 7 and older): 48dp square with rounded corners, and round.
    size = round(48 * scale)
    icon = placed(size, art, 0.86)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size - 1, size - 1), radius=round(size * 0.18), fill=255)
    square = Image.new('RGBA', (size, size), (0, 0, 0, 0)); square.paste(icon, (0, 0), mask)
    square.save(os.path.join(d, 'ic_launcher.png'))
    round_icon = placed(size, art, 0.76)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, size - 1, size - 1), fill=255)
    circle = Image.new('RGBA', (size, size), (0, 0, 0, 0)); circle.paste(round_icon, (0, 0), mask)
    circle.save(os.path.join(d, 'ic_launcher_round.png'))

# Splash screens: the full logo in the middle, same size as the existing files.
for folder in os.listdir(res):
    path = os.path.join(res, folder, 'splash.png')
    if folder.startswith('drawable') and os.path.exists(path):
        w, h = Image.open(path).size
        canvas = Image.new('RGB', (w, h), BG[:3])
        lw = round(min(w, h) * 0.45)
        lh = round(full.height * lw / full.width)
        canvas.paste(full.resize((lw, lh), Image.LANCZOS), ((w - lw) // 2, (h - lh) // 2), full.resize((lw, lh), Image.LANCZOS))
        canvas.save(path)

# In-app logo and favicon.
os.makedirs(os.path.join(root, 'www/img'), exist_ok=True)
logo.save(os.path.join(root, 'www/img/logo.png'))
placed(192, art, 0.86).save(os.path.join(root, 'www/img/icon-192.png'))
# Web version installed to the home screen: iPhone icon, and a 512px icon whose art sits inside
# the safe circle so Android can crop it to any shape ("maskable").
placed(180, art, 0.86).convert('RGB').save(os.path.join(root, 'www/img/apple-touch-icon.png'))
placed(512, art, 0.62).save(os.path.join(root, 'www/img/icon-512.png'))
print('done')
