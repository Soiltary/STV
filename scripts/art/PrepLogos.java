import javax.imageio.ImageIO;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.File;
import java.util.Locale;

/**
 * Turns the STV logo set (square RGB on a dark background) into header-ready transparent PNGs.
 *   java scripts/art/PrepLogos.java <folder with STV_01.png..STV_09.png> app/src/main/assets/site/logos
 * The glow is additive light on a near-black background, so instead of a hard cut-out the background colour is
 * subtracted and the remaining brightness becomes alpha ("light extraction"): glows stay soft and semi-transparent
 * and look right on any dark UI. Then the empty margin is cropped and two sizes are written:
 *   stv-NN.png (height 96 px, header shown at ~30-44 px CSS) and stv-NN-thumb.png (height 180 px, gallery).
 * The original files are only read, never modified.
 */
public final class PrepLogos {
    public static void main(String[] args) throws Exception {
        File in = new File(args[0]), out = new File(args[1]);
        if (!out.isDirectory() && !out.mkdirs()) throw new IllegalStateException("cannot create " + out);
        // optional third argument: one extra height (e.g. 512) for the website and promo video -> stv-NN-<h>.png
        int extra = args.length > 2 ? Integer.parseInt(args[2]) : 0;
        for (int n = 1; n <= 9; n++) {
            String id = String.format(Locale.ROOT, "%02d", n);
            BufferedImage src = ImageIO.read(new File(in, "STV_" + id + ".png"));
            BufferedImage cut = extract(src);
            // 1.5.0 rev 2: tight crop on the solid lettering/emblem (alpha > 70) so the mark fills the header height
            // and starts flush at the left edge; the wide faint halo outside it is cut and the cut is feathered.
            int[] box = bounds(cut, 70, 6);
            BufferedImage crop = feather(cut.getSubimage(box[0], box[1], box[2] - box[0], box[3] - box[1]));
            if (extra > 0) {
                write(scale(crop, Math.min(extra, crop.getHeight())), new File(out, "stv-" + id + "-" + extra + ".png"));
                continue;
            }
            write(scale(crop, 96), new File(out, "stv-" + id + ".png"));
            write(scale(crop, 180), new File(out, "stv-" + id + "-thumb.png"));
            System.out.printf(Locale.ROOT, "STV_%s bg=%s crop=%dx%d at %d,%d aspect=%.2f%n", id, hex(bg(src)),
                    crop.getWidth(), crop.getHeight(), box[0], box[1], crop.getWidth() / (double) crop.getHeight());
        }
    }

    /** Median-ish background: average of the four 40x40 corners. */
    static int[] bg(BufferedImage s) {
        long r = 0, g = 0, b = 0, c = 0;
        int w = s.getWidth(), h = s.getHeight();
        int[][] corners = {{0, 0}, {w - 40, 0}, {0, h - 40}, {w - 40, h - 40}};
        for (int[] o : corners) for (int y = o[1]; y < o[1] + 40; y++) for (int x = o[0]; x < o[0] + 40; x++) {
            int p = s.getRGB(x, y); r += (p >> 16) & 255; g += (p >> 8) & 255; b += p & 255; c++;
        }
        return new int[]{(int) (r / c), (int) (g / c), (int) (b / c)};
    }
    static String hex(int[] c) { return String.format(Locale.ROOT, "#%02x%02x%02x", c[0], c[1], c[2]); }

    static BufferedImage extract(BufferedImage s) {
        int w = s.getWidth(), h = s.getHeight();
        int[] bg = bg(s);
        BufferedImage o = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int p = s.getRGB(x, y);
            double[] c = {((p >> 16) & 255) / 255.0, ((p >> 8) & 255) / 255.0, (p & 255) / 255.0};
            double a = 0;
            double[] d = new double[3];
            for (int k = 0; k < 3; k++) {
                double b = bg[k] / 255.0;
                d[k] = Math.max(0, (c[k] - b) / (1 - b)); // light added on top of the background
                a = Math.max(a, d[k]);
            }
            // remove the faint noise/vignette of the background, keep a smooth ramp into the glow
            double alpha = a < 0.035 ? 0 : a < 0.10 ? (a - 0.035) / 0.065 * a : a;
            if (alpha <= 0) { o.setRGB(x, y, 0); continue; }
            int A = (int) Math.round(Math.min(1, alpha) * 255);
            int R = clamp(d[0] / a), G = clamp(d[1] / a), B = clamp(d[2] / a); // un-premultiplied colour
            o.setRGB(x, y, (A << 24) | (R << 16) | (G << 8) | B);
        }
        return o;
    }
    static int clamp(double v) { return (int) Math.max(0, Math.min(255, Math.round(v * 255))); }

    /** Soft fade of the outer few pixels so a halo cut by the tight crop never shows a hard edge. */
    static BufferedImage feather(BufferedImage src) {
        int w = src.getWidth(), h = src.getHeight();
        double f = Math.max(4, Math.min(w, h) * 0.03);
        BufferedImage o = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            int p = src.getRGB(x, y);
            double d = Math.min(Math.min(x, w - 1 - x), Math.min(y, h - 1 - y)) / f;
            double k = d >= 1 ? 1 : d * d * (3 - 2 * d);
            int a = (int) Math.round(((p >>> 24) & 255) * k);
            o.setRGB(x, y, (a << 24) | (p & 0xFFFFFF));
        }
        return o;
    }

    /** Bounding box of pixels with alpha above the threshold, plus a small margin. */
    static int[] bounds(BufferedImage im, int threshold, int margin) {
        int w = im.getWidth(), h = im.getHeight(), x0 = w, y0 = h, x1 = 0, y1 = 0;
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) {
            if (((im.getRGB(x, y) >>> 24) & 255) > threshold) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        }
        return new int[]{Math.max(0, x0 - margin), Math.max(0, y0 - margin), Math.min(w, x1 + margin + 1), Math.min(h, y1 + margin + 1)};
    }

    /** High-quality downscale to a target height (stepwise halving, then bicubic). */
    static BufferedImage scale(BufferedImage src, int height) {
        BufferedImage cur = src;
        int tw = Math.max(1, (int) Math.round(src.getWidth() * (height / (double) src.getHeight())));
        while (cur.getHeight() / 2 >= height) cur = resize(cur, cur.getWidth() / 2, cur.getHeight() / 2);
        return resize(cur, tw, height);
    }
    static BufferedImage resize(BufferedImage s, int w, int h) {
        BufferedImage o = new BufferedImage(w, h, BufferedImage.TYPE_INT_ARGB);
        Graphics2D g = o.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
        g.setRenderingHint(RenderingHints.KEY_ALPHA_INTERPOLATION, RenderingHints.VALUE_ALPHA_INTERPOLATION_QUALITY);
        g.drawImage(s, 0, 0, w, h, null);
        g.dispose();
        return o;
    }
    static void write(BufferedImage im, File f) throws Exception { if (!ImageIO.write(im, "png", f)) throw new IllegalStateException("png"); }
}
