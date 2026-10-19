"""Compress the cut poses for the self-contained preview (requires Pillow)."""
from pathlib import Path
from PIL import Image
from io import BytesIO
import base64, json
root = Path(__file__).resolve().parents[1]
def embed(path):
    out = BytesIO()
    Image.open(root / path).save(out, 'WEBP', quality=82, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(out.getvalue()).decode('ascii')
data = {
    'garden': embed('assets/garden.jpg'),
    'cats': [[embed(f'assets/animations/cat{cat}/{frame:02}.png') for frame in range(count)]
             for cat, count in enumerate([7,5,5,10,5,7],1)],
    'player': [embed(f'assets/animations/player/{frame:02}.png') for frame in range(7)],
}
(root / 'assets' / 'embedded.json').write_text(json.dumps(data, separators=(',',':')))
print('Embedded resources:', (root / 'assets' / 'embedded.json').stat().st_size, 'bytes')
