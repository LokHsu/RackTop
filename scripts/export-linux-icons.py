"""Export the existing transparent Windows ICO without changing its artwork.

Requires Pillow; generated PNGs are committed so builds do not require Python.
"""
from pathlib import Path
from PIL import Image

icons = Path(__file__).resolve().parents[1] / 'src-tauri' / 'icons'
with Image.open(icons / 'icon.ico') as source:
    image = source.convert('RGBA')
    for size, name in [(256, 'icon-linux.png'), (32, '32x32-linux.png'),
                       (128, '128x128-linux.png'), (256, '128x128@2x-linux.png')]:
        image.resize((size, size), Image.Resampling.LANCZOS).save(icons / name)
