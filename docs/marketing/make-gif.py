"""Assembles docs/marketing/frames/*.png into the README demo GIF.

    python docs/marketing/make-gif.py

Each frame's `hold` (from frames.json) is a multiple of the base tick; frames
are downscaled to 960px wide and quantised to 256 colours so the GIF stays
small enough for GitHub.
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
FRAMES = os.path.join(HERE, "frames")
OUT = os.path.join(HERE, "demo.gif")
WIDTH = int(sys.argv[1]) if len(sys.argv) > 1 else 960
TICK_MS = 350


def main() -> None:
    with open(os.path.join(FRAMES, "frames.json"), encoding="utf-8") as f:
        frames = json.load(f)

    images = []
    durations = []
    for frame in frames:
        img = Image.open(frame["file"]).convert("RGB")
        ratio = WIDTH / img.width
        img = img.resize((WIDTH, int(img.height * ratio)), Image.LANCZOS)
        images.append(img.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG))
        durations.append(int(frame.get("hold", 1)) * TICK_MS)

    images[0].save(
        OUT,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
        disposal=2,
    )
    size_kb = os.path.getsize(OUT) / 1024
    total_s = sum(durations) / 1000
    print(f"wrote {OUT}: {len(images)} frames, {total_s:.1f}s loop, {size_kb:.0f} KB")


if __name__ == "__main__":
    main()
