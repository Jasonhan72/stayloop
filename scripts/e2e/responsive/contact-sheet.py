# usage: python3 contact-sheet.py <out.png> <per sheet> <height> <offset y> <shot.png>...   (needs Pillow)
# Contact sheet: the top H px (from offset Y) of several screenshots side by side, N per sheet, each labelled.
import sys, os
from PIL import Image, ImageDraw
dst, per, H, Y = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]); files = sys.argv[5:]
names = []
for s in range(0, len(files), per):
    chunk = files[s:s + per]; ims = [Image.open(f).convert('RGB') for f in chunk]
    W = sum(im.size[0] for im in ims) + 12 * (len(ims) - 1)
    sheet = Image.new('RGB', (W, H + 22), (40, 40, 60)); d = ImageDraw.Draw(sheet); x = 0
    for f, im in zip(chunk, ims):
        sheet.paste(im.crop((0, Y, im.size[0], min(im.size[1], Y + H))), (x, 22))
        d.text((x + 4, 5), os.path.basename(f).replace('webkit-zh-', '').replace('.png', '')[:60] + f'  h={im.size[1]}', fill=(255, 255, 255)); x += im.size[0] + 12
    n = dst.replace('.png', f'-{s // per + 1}.png'); sheet.save(n); names.append(n)
print('\n'.join(names))
