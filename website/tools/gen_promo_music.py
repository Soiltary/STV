#!/usr/bin/env python3
"""Original ambient score for the STV promo video (no samples, no vocals, no third-party audio).

    python website/tools/gen_promo_music.py <seconds> <out.wav>

Everything is synthesised here from sine waves and seeded noise, so the result is free of third-party rights.
Calm version: only a slow, soft pad (three notes per chord, pure sine tones, long fades) over a very quiet bass.
No arpeggio, no percussion and no noise, mixed low so it stays in the background.
"""
import math
import struct
import sys
import wave

SR = 44100


def hz(midi):
    return 440.0 * 2 ** ((midi - 69) / 12)


CHORDS = [  # midi notes, three per chord
    [50, 57, 62],   # D A D
    [46, 53, 62],   # Bb F D
    [41, 57, 60],   # F A C
    [48, 55, 64],   # C G E
]


def render(total):
    n = int(total * SR)
    left = [0.0] * n
    right = [0.0] * n
    bar = total / 4.0  # four slow chord changes across the piece
    # pad
    for b in range(4):
        chord = CHORDS[b % 4]
        start = int(b * bar * SR)
        length = int(bar * SR * 1.5)  # overlap into the next chord
        for vi, note in enumerate(chord):
            f = hz(note)
            for det, pan in ((-0.0025, 0.25), (0.0025, 0.75)):
                ff = f * (1 + det)
                w = 2 * math.pi * ff / SR
                amp = 0.05
                for i in range(length):
                    j = start + i
                    if j >= n:
                        break
                    t = i / SR
                    env = min(1.0, t / 3.0) * (1.0 if i < length - SR * 3.0 else max(0.0, (length - i) / (SR * 3.0)))
                    s = math.sin(w * i)
                    v = s * amp * env
                    left[j] += v * (1 - pan)
                    right[j] += v * pan
    # sub bass
    for b in range(4):
        root = CHORDS[b % 4][0] - 12
        w = 2 * math.pi * hz(root) / SR
        start = int(b * bar * SR)
        for i in range(int(bar * SR)):
            j = start + i
            if j >= n:
                break
            t = i / SR
            env = min(1.0, t / 2.0) * max(0.0, 1 - t / (bar * 1.1))
            v = math.sin(w * i) * 0.04 * env
            left[j] += v
            right[j] += v
    # master fades and soft clip
    fade_in, fade_out = int(2.0 * SR), int(3.5 * SR)
    peak = 1e-9
    for i in range(n):
        g = 1.0
        if i < fade_in:
            g = i / fade_in
        elif i > n - fade_out:
            g = (n - i) / fade_out
        left[i] = left[i] * g
        right[i] = right[i] * g
        peak = max(peak, abs(left[i]), abs(right[i]))
    norm = 0.35 / peak  # quiet: about -9 dBFS peak
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
