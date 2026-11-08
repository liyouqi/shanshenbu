"""Generate the prototype's original short sound effects using only Python stdlib."""
import math
import random
import struct
import wave
from pathlib import Path

rng = random.Random(9)
folder = Path(__file__).resolve().parent.parent / 'public' / 'assets'
folder.mkdir(parents=True, exist_ok=True)
for name, duration, frequency in [
    ('swing', .09, 320), ('swoosh', .19, 600), ('hit', .15, 130),
    ('block', .13, 900), ('bell', .65, 660), ('land', .09, 80),
]:
    samples = []
    for i in range(int(22050 * duration)):
        t = i / 22050
        envelope = (1 - t / duration) ** 2
        tone = math.sin(2 * math.pi * (frequency * t - frequency * .3 / duration * t * t))
        if name in ('swing', 'swoosh', 'hit', 'land'):
            tone = .55 * tone + .45 * rng.uniform(-1, 1)
        if name == 'bell':
            tone = .6 * math.sin(2 * math.pi * frequency * t) + .3 * math.sin(2 * math.pi * frequency * 1.5 * t)
        samples.append(struct.pack('<h', int(tone * envelope * 15000)))
    with wave.open(str(folder / (name + '.wav')), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(22050)
        output.writeframes(b''.join(samples))
