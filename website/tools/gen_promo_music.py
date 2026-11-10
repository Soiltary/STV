#!/usr/bin/env python3
"""Original ambient score for the STV promo video (no samples, no vocals, no third-party audio).

    python website/tools/gen_promo_music.py <seconds> <out.wav>

Everything is synthesised here from sine waves and seeded noise, so the result is free of third-party rights.
Structure: slow pad chords (Dm9 - Bbmaj7 - Fmaj7 - C6/9), a soft sub bass, a sparse bell arpeggio that enters after
the intro, a short noise swell on the logo, and fades at both ends.
"""
import math
import random
import struct
import sys
import wave

SR = 44100
random.seed(7)


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


CHORDS = [  # midi notes
    [50, 57, 60, 64, 65],   # Dm9 (D A C E F)
    [46, 53, 57, 62, 65],   # Bbmaj7
    [41, 53, 57, 60, 64],   # Fmaj7
    [48, 55, 57, 62, 64],   # C6/9
]
ARP = [74, 77, 81, 79, 76, 74, 72, 76]


def render(total):
    n = int(total * SR)
    left = [0.0] * n
    right = [0.0] * n
    bar = total / 8.0  # eight chord changes across the piece
    # pad
    for b in range(8):
        chord = CHORDS[b % 4]
        start = int(b * bar * SR)
        length = int(bar * SR * 1.35)  # overlap into the next chord
        for vi, note in enumerate(chord):
            f = hz(note)
            for det, pan in ((-0.0025, 0.25), (0.0025, 0.75)):
                ff = f * (1 + det)
                w = 2 * math.pi * ff / SR
                amp = 0.045 if note > 52 else 0.06
                for i in range(length):
                    j = start + i
                    if j >= n:
                        break
                    t = i / SR
                    env = min(1.0, t / 1.6) * (1.0 if i < length - SR * 1.6 else max(0.0, (length - i) / (SR * 1.6)))
                    s = math.sin(w * i) + 0.18 * math.sin(2 * w * i)
                    v = s * amp * env
                    left[j] += v * (1 - pan)
                    right[j] += v * pan
    # sub bass
    for b in range(8):
        root = CHORDS[b % 4][0] - 12
        w = 2 * math.pi * hz(root) / SR
        start = int(b * bar * SR)
        for i in range(int(bar * SR)):
            j = start + i
            if j >= n:
                break
            t = i / SR
            env = min(1.0, t / 0.4) * max(0.0, 1 - t / (bar * 1.05))
            v = math.sin(w * i) * 0.09 * env
            left[j] += v
            right[j] += v
    # bell arpeggio from 3.5 s, eighth notes at ~84 bpm, every other bar busier
    step = 60 / 84 / 2
    t0 = 3.5
    k = 0
    while t0 < total - 3.0:
        note = ARP[k % len(ARP)] + (0 if (k // 8) % 2 == 0 else -2)
        f = hz(note)
        w = 2 * math.pi * f / SR
        start = int(t0 * SR)
        pan = 0.3 + 0.4 * ((k * 37) % 10) / 10
        amp = 0.05 if k % 4 == 0 else 0.03
        for i in range(int(1.6 * SR)):
            j = start + i
            if j >= n:
                break
            t = i / SR
            env = math.exp(-t * 3.2) * min(1.0, t / 0.004)
            v = (math.sin(w * i) + 0.25 * math.sin(3.01 * w * i) * math.exp(-t * 8)) * amp * env
            left[j] += v * (1 - pan)
            right[j] += v * pan
        t0 += step * (2 if k % 8 in (3, 7) else 1)
        k += 1
    # noise swell under the logo (0.2 - 2.6 s) and a soft one before the outro
    for (a, b_, peak) in ((0.2, 2.6, 0.05), (total - 7.0, total - 4.6, 0.035)):
        prev = 0.0
        for i in range(int(a * SR), min(n, int(b_ * SR))):
            t = (i / SR - a) / (b_ - a)
            env = math.sin(math.pi * t) ** 2
            prev = prev * 0.985 + random.uniform(-1, 1) * 0.015  # gentle low-pass
            v = prev * peak * env * 9
            left[i] += v
            right[i] += v
    # master fades and soft clip
    fade_in, fade_out = int(0.8 * SR), int(2.5 * SR)
    peak = 1e-9
    for i in range(n):
        g = 1.0
        if i < fade_in:
            g = i / fade_in
        elif i > n - fade_out:
            g = (n - i) / fade_out
        left[i] = math.tanh(left[i] * 1.2) * g
        right[i] = math.tanh(right[i] * 1.2) * g
        peak = max(peak, abs(left[i]), abs(right[i]))
    norm = 0.85 / peak
    return left, right, norm


def main():
    total = float(sys.argv[1])
    out = sys.argv[2]
    left, right, norm = render(total)
    with wave.open(out, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        frames = bytearray()
        for a, b in zip(left, right):
            frames += struct.pack('<hh', int(a * norm * 32767), int(b * norm * 32767))
        wf.writeframes(bytes(frames))
    print('wrote', out, total, 's')


if __name__ == '__main__':
    main()
