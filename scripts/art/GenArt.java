import javax.imageio.IIOImage;
import javax.imageio.ImageIO;
import javax.imageio.ImageWriteParam;
import javax.imageio.ImageWriter;
import javax.imageio.stream.ImageOutputStream;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Random;

/**
 * Original procedural art for Solitary TV (wallpapers + screensaver layers). Run from the project root:
 *   java scripts/art/GenArt.java app/src/main/assets/site/art
 * Every image is generated from fixed seeds, so the output is reproducible and owned by the project.
 */
public final class GenArt {
    static final int W = 1920, H = 1080;

    // ------------------------------------------------------------------ noise
    static final class Noise {
        final int[] p = new int[512];
        Noise(long seed) {
            Random r = new Random(seed);
            int[] a = new int[256];
            for (int i = 0; i < 256; i++) a[i] = i;
            for (int i = 255; i > 0; i--) { int j = r.nextInt(i + 1); int t = a[i]; a[i] = a[j]; a[j] = t; }
            for (int i = 0; i < 512; i++) p[i] = a[i & 255];
        }
        static double fade(double t) { return t * t * t * (t * (t * 6 - 15) + 10); }
        static double lerp(double a, double b, double t) { return a + (b - a) * t; }
        double hash(int x, int y) { return p[p[x & 255] + (y & 255)] / 255.0; }
        double value(double x, double y) {
            int xi = (int) Math.floor(x), yi = (int) Math.floor(y);
            double xf = x - xi, yf = y - yi, u = fade(xf), v = fade(yf);
            return lerp(lerp(hash(xi, yi), hash(xi + 1, yi), u), lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u), v);
        }
        double fbm(double x, double y, int oct) {
            double s = 0, amp = 0.5, f = 1, norm = 0;
            for (int i = 0; i < oct; i++) { s += amp * value(x * f, y * f); norm += amp; amp *= 0.5; f *= 2.03; }
            return s / norm;
        }
    }

    // ------------------------------------------------------------------ float canvas
    static final class Img {
        final int w, h; final float[] r, g, b;
        Img(int w, int h) { this.w = w; this.h = h; r = new float[w * h]; g = new float[w * h]; b = new float[w * h]; }
        void set(int x, int y, double rr, double gg, double bb) { int i = y * w + x; r[i] = (float) rr; g[i] = (float) gg; b[i] = (float) bb; }
        void add(int x, int y, double rr, double gg, double bb) { int i = y * w + x; r[i] += rr; g[i] += gg; b[i] += bb; }
        BufferedImage toImage(long seed, double grain) {
            BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            Random rnd = new Random(seed);
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
                int i = y * w + x;
                double d = (rnd.nextDouble() - 0.5) * grain; // dithering: hides 8-bit banding in dark gradients
                out.setRGB(x, y, (c(r[i] * 255 + d) << 16) | (c(g[i] * 255 + d) << 8) | c(b[i] * 255 + d));
            }
            return out;
        }
        static int c(double v) { return (int) Math.max(0, Math.min(255, Math.round(v))); }
    }

    static double[] hex(String h) {
        int v = Integer.parseInt(h.substring(1), 16);
        return new double[]{((v >> 16) & 255) / 255.0, ((v >> 8) & 255) / 255.0, (v & 255) / 255.0};
    }
    static double smooth(double e0, double e1, double x) { double t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); }

    static void gradient(Img im, String top, String bottom, double angleDeg) {
        double[] a = hex(top), z = hex(bottom);
        double ca = Math.cos(Math.toRadians(angleDeg)), sa = Math.sin(Math.toRadians(angleDeg));
        for (int y = 0; y < im.h; y++) for (int x = 0; x < im.w; x++) {
            double nx = (x / (double) im.w - 0.5), ny = (y / (double) im.h - 0.5);
            double t = smooth(-0.6, 0.6, nx * sa + ny * ca);
            im.set(x, y, a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t, a[2] + (z[2] - a[2]) * t);
        }
    }
    /** Soft additive glow; radius in pixels, strength 0..1. */
    static void glow(Img im, double cx, double cy, double rx, double ry, String color, double strength) {
        double[] c = hex(color);
        int x0 = (int) Math.max(0, cx - rx * 2.2), x1 = (int) Math.min(im.w - 1, cx + rx * 2.2);
        int y0 = (int) Math.max(0, cy - ry * 2.2), y1 = (int) Math.min(im.h - 1, cy + ry * 2.2);
        for (int y = y0; y <= y1; y++) for (int x = x0; x <= x1; x++) {
            double dx = (x - cx) / rx, dy = (y - cy) / ry, k = Math.exp(-(dx * dx + dy * dy)) * strength;
            im.add(x, y, c[0] * k, c[1] * k, c[2] * k);
        }
    }
    static void vignette(Img im, double amount) {
        for (int y = 0; y < im.h; y++) for (int x = 0; x < im.w; x++) {
            double dx = x / (double) im.w - 0.5, dy = y / (double) im.h - 0.5, k = 1 - amount * smooth(0.15, 0.75, Math.sqrt(dx * dx + dy * dy) * 1.3);
            int i = y * im.w + x; im.r[i] *= k; im.g[i] *= k; im.b[i] *= k;
        }
    }
    static void stars(Img im, long seed, int count, double maxBright, double bigShare) {
        Random r = new Random(seed);
        for (int n = 0; n < count; n++) {
            double x = r.nextDouble() * im.w, y = r.nextDouble() * im.h;
            double br = Math.pow(r.nextDouble(), 3) * maxBright + 0.04;
            boolean big = r.nextDouble() < bigShare;
            double rad = big ? 1.6 + r.nextDouble() * 1.4 : 0.7 + r.nextDouble() * 0.5;
            double tint = r.nextDouble();
            double cr = tint < 0.3 ? 0.8 : 1.0, cg = 0.9, cb = tint > 0.7 ? 0.82 : 1.0;
            for (int yy = (int) (y - rad * 3); yy <= y + rad * 3; yy++) for (int xx = (int) (x - rad * 3); xx <= x + rad * 3; xx++) {
                if (xx < 0 || yy < 0 || xx >= im.w || yy >= im.h) continue;
                double d2 = ((xx - x) * (xx - x) + (yy - y) * (yy - y)) / (rad * rad), k = Math.exp(-d2) * br;
                im.add(xx, yy, cr * k, cg * k, cb * k);
            }
        }
    }
    static void nebula(Img im, long seed, double scale, String c1, String c2, double strength, double cx, double cy, double spread) {
        Noise n = new Noise(seed), n2 = new Noise(seed * 31 + 7);
        double[] a = hex(c1), z = hex(c2);
        for (int y = 0; y < im.h; y++) for (int x = 0; x < im.w; x++) {
            double nx = x / (double) im.w, ny = y / (double) im.h;
            double warp = n2.fbm(nx * 2.2, ny * 2.2, 4);
            double v = n.fbm(nx * scale + warp * 1.6, ny * scale + warp * 1.3, 6);
            double dx = (nx - cx) / spread, dy = (ny - cy) / (spread * 0.7);
            double mask = Math.exp(-(dx * dx + dy * dy));
            double k = smooth(0.42, 0.85, v) * mask * strength;
            double t = smooth(0.3, 0.8, warp);
            im.add(x, y, (a[0] + (z[0] - a[0]) * t) * k, (a[1] + (z[1] - a[1]) * t) * k, (a[2] + (z[2] - a[2]) * t) * k);
        }
    }
    /** Thin luminous ribbon along y = base + amp * sin(...): soft core plus wide glow. */
    static void ribbon(Img im, double base, double amp, double freq, double phase, double tilt, String color, double width, double strength) {
        double[] c = hex(color);
        for (int x = 0; x < im.w; x++) {
            double nx = x / (double) im.w;
            double cy = base + amp * Math.sin(nx * freq * Math.PI * 2 + phase) + amp * 0.35 * Math.sin(nx * freq * 5.1 + phase * 1.7) + tilt * (nx - 0.5);
            double fadeX = smooth(0.0, 0.25, nx) * smooth(1.0, 0.7, nx);
            int y0 = (int) Math.max(0, cy - width * 8), y1 = (int) Math.min(im.h - 1, cy + width * 8);
            for (int y = y0; y <= y1; y++) {
                double d = (y - cy) / width;
                double k = (Math.exp(-d * d * 4) * 0.9 + Math.exp(-d * d * 0.18) * 0.25) * strength * fadeX;
                im.add(x, y, c[0] * k, c[1] * k, c[2] * k);
            }
        }
    }
    static void planet(Img im, double cx, double cy, double R, String lit, String rim, double lightAngle) {
        double[] L = hex(lit), Rm = hex(rim);
        double lx = Math.cos(Math.toRadians(lightAngle)), ly = -Math.sin(Math.toRadians(lightAngle));
        Noise n = new Noise(77);
        for (int y = 0; y < im.h; y++) for (int x = 0; x < im.w; x++) {
            double dx = (x - cx) / R, dy = (y - cy) / R, d2 = dx * dx + dy * dy;
            int i = y * im.w + x;
            if (d2 <= 1) {
                double dz = Math.sqrt(1 - d2), shade = Math.max(0, dx * lx + dy * ly + dz * 0.25);
                double bands = 0.85 + 0.15 * n.fbm(dx * 3 + 10, dy * 9 + 4, 4);
                double k = Math.pow(shade, 1.6) * bands;
                im.r[i] = (float) (0.012 + L[0] * k); im.g[i] = (float) (0.014 + L[1] * k); im.b[i] = (float) (0.03 + L[2] * k);
                double edge = smooth(0.82, 1.0, Math.sqrt(d2)) * Math.max(0, dx * lx + dy * ly + 0.35);
                im.add(x, y, Rm[0] * edge * 0.6, Rm[1] * edge * 0.6, Rm[2] * edge * 0.6);
            } else {
                double d = Math.sqrt(d2) - 1, facing = Math.max(0, (dx * lx + dy * ly) / Math.sqrt(d2) + 0.25);
                double k = Math.exp(-d * 18) * 0.55 * facing + Math.exp(-d * 4) * 0.12 * facing;
                im.add(x, y, Rm[0] * k, Rm[1] * k, Rm[2] * k);
            }
        }
    }

    // ------------------------------------------------------------------ output
    static void writeJpeg(BufferedImage img, File f, float q) throws Exception {
        ImageWriter w = ImageIO.getImageWritersByFormatName("jpg").next();
        ImageWriteParam p = w.getDefaultWriteParam();
        p.setCompressionMode(ImageWriteParam.MODE_EXPLICIT); p.setCompressionQuality(q);
        try (ImageOutputStream out = ImageIO.createImageOutputStream(f)) { w.setOutput(out); w.write(null, new IIOImage(img, null, null), p); }
        w.dispose();
    }
    static BufferedImage scale(BufferedImage src, int w, int h) {
        BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.drawImage(src, 0, 0, w, h, null); g.dispose();
        return out;
    }
    static void save(File dir, String name, Img im, long seed) throws Exception {
        BufferedImage img = im.toImage(seed, 2.2);
        writeJpeg(img, new File(dir, name + ".jpg"), 0.9f);
        writeJpeg(scale(img, 384, 216), new File(dir, name + "-thumb.jpg"), 0.86f);
        System.out.println("wrote " + name);
    }

    public static void main(String[] args) throws Exception {
        File dir = new File(args.length > 0 ? args[0] : "art");
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException("cannot create " + dir);

        // ---- wallpapers
        Img m = new Img(W, H); // 01 Midnight Blue
        gradient(m, "#081430", "#03060f", 10);
        glow(m, W * 0.5, -60, 900, 420, "#1d4ed8", 0.32);
        glow(m, W * 0.85, H * 0.95, 700, 380, "#0e3a8c", 0.18);
        nebula(m, 11, 2.4, "#1e3a8a", "#312e81", 0.10, 0.5, 0.35, 0.6);
        vignette(m, 0.45);
        save(dir, "wall-01-midnight-blue", m, 1);

        Img v = new Img(W, H); // 02 Violet Atmosphere
        gradient(v, "#120a26", "#05030c", 20);
        glow(v, W * 0.18, H * 0.92, 820, 520, "#6d28d9", 0.30);
        glow(v, W * 0.86, H * 0.12, 700, 420, "#7c3aed", 0.20);
        glow(v, W * 0.55, H * 0.55, 600, 300, "#4338ca", 0.08);
        nebula(v, 22, 2.0, "#7c3aed", "#db2777", 0.10, 0.35, 0.6, 0.7);
        vignette(v, 0.5);
        save(dir, "wall-02-violet-atmosphere", v, 2);

        Img s = new Img(W, H); // 03 Deep Space Minimal
        gradient(s, "#050816", "#020309", 0);
        nebula(s, 33, 3.0, "#1e293b", "#3b0764", 0.16, 0.72, 0.3, 0.38);
        glow(s, W * 0.72, H * 0.3, 160, 110, "#a5b4fc", 0.06);
        stars(s, 3, 420, 0.75, 0.05);
        vignette(s, 0.4);
        save(dir, "wall-03-deep-space", s, 3);

        Img f = new Img(W, H); // 04 Blue Light Flow
        gradient(f, "#06102a", "#02040c", 15);
        ribbon(f, H * 0.62, 70, 0.9, 0.4, -120, "#38bdf8", 3.2, 0.55);
        ribbon(f, H * 0.66, 90, 0.7, 1.9, -90, "#3b82f6", 5.0, 0.35);
        ribbon(f, H * 0.70, 60, 1.1, 3.1, -150, "#818cf8", 2.4, 0.30);
        glow(f, W * 0.5, H * 0.66, 1100, 160, "#1d4ed8", 0.12);
        vignette(f, 0.45);
        save(dir, "wall-04-blue-light-flow", f, 4);

        Img d = new Img(W, H); // 05 Pure Dark
        gradient(d, "#121419", "#07080a", 0);
        glow(d, W * 0.5, H * 0.1, 1000, 360, "#1f2937", 0.18);
        vignette(d, 0.35);
        save(dir, "wall-05-pure-dark", d, 5);

        Img a = new Img(W, H); // 06 Aurora Horizon (extra)
        gradient(a, "#030712", "#071528", 0);
        glow(a, W * 0.5, H * 1.08, 1300, 300, "#0ea5e9", 0.22);
        glow(a, W * 0.3, H * 0.98, 700, 200, "#6366f1", 0.18);
        ribbon(a, H * 0.86, 24, 0.5, 0.8, -40, "#22d3ee", 6.0, 0.18);
        stars(a, 6, 160, 0.5, 0.03);
        vignette(a, 0.4);
        save(dir, "wall-06-aurora-horizon", a, 6);

        // ---- screensaver layers (drifted slowly with CSS transforms at runtime)
        Img o = new Img(W, H); // Dark Orbit
        gradient(o, "#03040a", "#010205", 0);
        stars(o, 41, 520, 0.7, 0.04);
        planet(o, W * 0.82, H * 1.02, 560, "#1f3a8a", "#5b8def", 140);
        glow(o, W * 0.2, H * 0.2, 260, 200, "#4338ca", 0.06);
        save(dir, "ss-dark-orbit", o, 41);

        Img n = new Img(W, H); // Nebula Drift
        gradient(n, "#04030a", "#020208", 0);
        nebula(n, 52, 1.7, "#6d28d9", "#0ea5e9", 0.55, 0.5, 0.5, 0.75);
        nebula(n, 53, 3.4, "#a855f7", "#1d4ed8", 0.22, 0.4, 0.55, 0.55);
        stars(n, 52, 360, 0.6, 0.03);
        vignette(n, 0.35);
        save(dir, "ss-nebula-drift", n, 52);

        Img st = new Img(W, H); // Minimal Stars
        gradient(st, "#03050c", "#000000", 0);
        stars(st, 63, 900, 0.85, 0.04);
        save(dir, "ss-minimal-stars", st, 63);

        Img wv = new Img(W, H); // Abstract Waves
        gradient(wv, "#050816", "#02030a", 10);
        for (int i = 0; i < 7; i++)
            ribbon(wv, H * (0.36 + i * 0.07), 50 + i * 8, 0.6 + i * 0.08, i * 0.9, -60 + i * 20,
                    i % 2 == 0 ? "#3b82f6" : "#8b5cf6", 2.2 + i * 0.5, 0.26 - i * 0.02);
        vignette(wv, 0.4);
        save(dir, "ss-abstract-waves", wv, 74);
    }
}
