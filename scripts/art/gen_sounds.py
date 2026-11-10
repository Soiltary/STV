"""Original interface sounds for Solitary TV (1.4.0 redesign), synthesized from scratch, standard library only.

    python scripts/art/gen_sounds.py app/src/main/res/raw            # write the WAV files
    python scripts/art/gen_sounds.py app/src/main/res/raw --report   # also print the technical analysis

Design rules (after user feedback that 1.3.x sounds were harsh):
- fundamentals 330-880 Hz, almost pure tones; no partials above ~2.6 kHz; air taps are low-passed noise;
- 2nd-order low-pass (2.6-3.2 kHz) removes sharpness, high-pass (~180 Hz) removes bass/rumble;
- raised-cosine fade-in (6-12 ms) and fade-out to exact zero: no clicks at start or end;
- loudness matched by RMS (perceived level), with a peak ceiling of -12 dBFS (no clipping);
- events: move (quietest, shortest), select (a little more present), back (softer than select), panel (very subtle).
Styles: soft (default), whisper (air only, even quieter), minimal (tiny ticks), cinematic (warmer, a bit longer).
"""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 44100


# ------------------------------------------------------------------ building blocks
def n_of(ms):
    return int(RATE * ms / 1000)


def tone(f0, f1, ms, partials=((1, 1.0),)):
    """Sine (with optional quiet partials) gliding from f0 to f1 (exponential glide)."""
    n = n_of(ms)
    out, ph = [0.0] * n, [0.0] * len(partials)
    for i in range(n):
        f = f0 * (f1 / f0) ** (i / max(1, n - 1))
        s = 0.0
        for k, (m, a) in enumerate(partials):
            ph[k] += 2 * math.pi * f * m / RATE
            s += a * math.sin(ph[k])
        out[i] = s
    return out


def noise(ms, seed):
    rnd = random.Random(seed)
    return [rnd.random() * 2 - 1 for _ in range(n_of(ms))]


def biquad(x, kind, fc, q=0.707):
    """RBJ cookbook 2nd-order low-pass / high-pass / band-pass."""
    w = 2 * math.pi * fc / RATE
    cw, sw = math.cos(w), math.sin(w)
    alpha = sw / (2 * q)
    if kind == 'lp':
        b0, b1, b2 = (1 - cw) / 2, 1 - cw, (1 - cw) / 2
    elif kind == 'hp':
        b0, b1, b2 = (1 + cw) / 2, -(1 + cw), (1 + cw) / 2
    else:  # band-pass, constant 0 dB peak gain
        b0, b1, b2 = alpha, 0.0, -alpha
    a0, a1, a2 = 1 + alpha, -2 * cw, 1 - alpha
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y, x1, x2, y1, y2 = [0.0] * len(x), 0.0, 0.0, 0.0, 0.0
    for i, v in enumerate(x):
        o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, o
        y[i] = o
    return y


def envelope(x, attack_ms, curve=3.0):
    """Raised-cosine attack, smooth power-curve decay reaching exactly zero at the end."""
    n, a = len(x), max(1, n_of(attack_ms))
    out = [0.0] * n
    for i, v in enumerate(x):
        if i < a:
            g = 0.5 - 0.5 * math.cos(math.pi * i / a)
        else:
            g = (1 - (i - a) / max(1, n - a)) ** curve
        out[i] = v * g
    return out


def mix(*parts):
    """parts: (samples, gain, offset_ms)."""
    n = max(n_of(off) + len(p) for p, _, off in parts)
    out = [0.0] * n
    for p, g, off in parts:
        s = n_of(off)
        for i, v in enumerate(p):
            out[s + i] += v * g
    return out


def finish(x, lp=2800, hp=180, tail_ms=4):
    """Band-limit, then a final short fade-out so the very last samples are zero."""
    y = biquad(biquad(x, 'lp', lp), 'hp', hp)
    t = n_of(tail_ms)
    for i in range(t):
        y[len(y) - t + i] *= 0.5 + 0.5 * math.cos(math.pi * (i + 1) / t)
    return y


# ------------------------------------------------------------------ loudness / analysis
def rms_db(x):
    r = math.sqrt(sum(v * v for v in x) / max(1, len(x)))
    return 20 * math.log10(max(r, 1e-9))


def peak_db(x):
    return 20 * math.log10(max(max(abs(v) for v in x), 1e-9))


def normalize(x, target_rms_db, peak_ceiling_db=-12.0):
    g = 10 ** ((target_rms_db - rms_db(x)) / 20)
    y = [v * g for v in x]
    over = peak_db(y) - peak_ceiling_db
    if over > 0:  # never clip: lower the whole sound instead
        k = 10 ** (-over / 20)
        y = [v * k for v in y]
    return y


def spectrum_stats(x):
    """Spectral centroid and share of energy above 4 kHz (plain DFT on a 2048-sample window)."""
    n = min(1024, len(x))
    start = max(0, (len(x) - n) // 3)  # the loud early part of the sound
    seg = [x[start + i] * (0.5 - 0.5 * math.cos(2 * math.pi * i / (n - 1))) for i in range(n)]
    mags = []
    for k in range(1, n // 2):
        w = 2 * math.pi * k / n
        re = sum(seg[i] * math.cos(w * i) for i in range(n))
        im = sum(seg[i] * math.sin(w * i) for i in range(n))
        mags.append((k * RATE / n, re * re + im * im))
    tot = sum(m for _, m in mags) or 1e-12
    centroid = sum(f * m for f, m in mags) / tot
    high = sum(m for f, m in mags if f > 4000) / tot
    return centroid, high


# ------------------------------------------------------------------ sound design
def design():
    soft_p = ((1, 1.0), (2, 0.06))          # almost pure: one very quiet octave partial
    warm_p = ((1, 1.0), (2, 0.10), (3, 0.02))
    S = {}
    # Soft (default): a gentle "air tap" with a faint pitched body.
    S['soft'] = {
        'move': (finish(mix((envelope(biquad(noise(46, 11), 'bp', 1100, 1.2), 3, 3.2), 0.9, 0),
                            (envelope(tone(700, 660, 46, soft_p), 6, 3.0), 0.35, 0)), lp=2600), -34),
        'select': (finish(mix((envelope(tone(587.3, 587.3, 120, soft_p), 8, 2.6), 0.8, 0),
                              (envelope(tone(880, 880, 110, soft_p), 8, 2.8), 0.55, 28))), -29),
        'back': (finish(mix((envelope(tone(660, 520, 90, soft_p), 8, 2.8), 1.0, 0))), -32),
        'panel': (finish(mix((envelope(biquad(noise(170, 12), 'lp', 900), 60, 2.0), 0.9, 0),
                             (envelope(tone(440, 440, 150, soft_p), 40, 2.2), 0.25, 10)), lp=2200), -35),
    }
    # Whisper: air only, the quietest style.
    S['whisper'] = {
        'move': (finish(envelope(biquad(noise(40, 21), 'bp', 900, 1.0), 4, 3.0), lp=2400), -38),
        'select': (finish(mix((envelope(biquad(noise(70, 22), 'bp', 800, 1.4), 6, 2.6), 0.8, 0),
                              (envelope(tone(523.3, 523.3, 80, soft_p), 10, 3.0), 0.25, 0)), lp=2400), -34),
        'back': (finish(envelope(biquad(noise(60, 23), 'bp', 650, 1.2), 6, 2.8), lp=2200), -36),
        'panel': (finish(envelope(biquad(noise(140, 24), 'lp', 700), 50, 2.2), lp=2000), -38),
    }
    # Minimal: tiny soft ticks.
    S['minimal'] = {
        'move': (finish(envelope(tone(880, 840, 26, soft_p), 3, 4.0), lp=3000), -36),
        'select': (finish(envelope(tone(740, 740, 60, soft_p), 5, 3.4), lp=3000), -31),
        'back': (finish(envelope(tone(620, 600, 50, soft_p), 5, 3.4), lp=3000), -33),
        'panel': (finish(envelope(tone(660, 660, 60, soft_p), 8, 3.0), lp=2800), -36),
    }
    # Cinematic: warmer, a little longer, still soft.
    S['cinematic'] = {
        'move': (finish(mix((envelope(tone(392, 392, 85, warm_p), 8, 3.2), 1.0, 0),
                            (envelope(biquad(noise(60, 31), 'lp', 1200), 6, 3.0), 0.25, 0)), lp=2600), -33),
        'select': (finish(mix((envelope(tone(329.6, 329.6, 200, warm_p), 10, 2.4), 0.8, 0),
                              (envelope(tone(493.9, 493.9, 180, warm_p), 10, 2.6), 0.55, 30))), -28),
        'back': (finish(envelope(tone(440, 349.2, 130, warm_p), 10, 2.6)), -31),
        'panel': (finish(mix((envelope(biquad(noise(260, 32), 'lp', 800), 90, 2.0), 0.9, 0),
                             (envelope(tone(330, 330, 230, warm_p), 70, 2.2), 0.35, 20)), lp=2000), -33),
    }
    return S


def write(path, samples):
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b''.join(struct.pack('<h', int(round(max(-1.0, min(1.0, s)) * 32767))) for s in samples))


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else 'raw')
    report = '--report' in sys.argv
    out.mkdir(parents=True, exist_ok=True)
    for old in out.glob('snd_*.wav'):
        old.unlink()  # styles may have been renamed; only generated files live here
    rows = []
    for style, events in design().items():
        for event, (samples, target) in events.items():
            y = normalize(samples, target)
            p = out / f'snd_{style}_{event}.wav'
            write(p, y)
            if report:
                c, hi = spectrum_stats(y)
                rows.append((p.name, len(y) / RATE * 1000, peak_db(y), rms_db(y), c, hi * 100, abs(y[0]), abs(y[-1])))
    if report:
        print(f"{'file':28} {'ms':>5} {'peak dBFS':>9} {'RMS dBFS':>9} {'centroid Hz':>11} {'>4kHz %':>8} {'first':>6} {'last':>6}")
        for r in rows:
            print(f'{r[0]:28} {r[1]:5.0f} {r[2]:9.1f} {r[3]:9.1f} {r[4]:11.0f} {r[5]:8.2f} {r[6]:6.4f} {r[7]:6.4f}')


if __name__ == '__main__':
    main()
