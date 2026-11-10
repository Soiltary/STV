package tv.customhome.launcher;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.SoundPool;
import android.os.SystemClock;

import java.util.HashMap;
import java.util.Map;

/**
 * Short interface sounds through a SoundPool (low latency, preloaded, sonification usage so it follows the
 * TV's system volume and never takes audio focus from other apps). The pool exists only while the
 * launcher is in the foreground and sounds are enabled; it is released on pause.
 */
final class UiSounds {
    private static final String[] EVENTS = {"move", "select", "back", "panel"};
    private static final Map<String, Integer> RES = new HashMap<>();
    static {
        RES.put("soft_move", R.raw.snd_soft_move); RES.put("soft_select", R.raw.snd_soft_select);
        RES.put("soft_back", R.raw.snd_soft_back); RES.put("soft_panel", R.raw.snd_soft_panel);
        RES.put("whisper_move", R.raw.snd_whisper_move); RES.put("whisper_select", R.raw.snd_whisper_select);
        RES.put("whisper_back", R.raw.snd_whisper_back); RES.put("whisper_panel", R.raw.snd_whisper_panel);
        RES.put("minimal_move", R.raw.snd_minimal_move); RES.put("minimal_select", R.raw.snd_minimal_select);
        RES.put("minimal_back", R.raw.snd_minimal_back); RES.put("minimal_panel", R.raw.snd_minimal_panel);
        RES.put("cinematic_move", R.raw.snd_cinematic_move); RES.put("cinematic_select", R.raw.snd_cinematic_select);
        RES.put("cinematic_back", R.raw.snd_cinematic_back); RES.put("cinematic_panel", R.raw.snd_cinematic_panel);
    }

    private final Context context;
    private SoundPool pool;
    private final Map<String, Integer> ids = new HashMap<>();
    private final Map<Integer, Boolean> loaded = new HashMap<>();
    private boolean enabled, foreground;
    private String style = "soft";
    private float volume = 0.35f;
    private String lastEvent = "";
    private long lastAt;

    UiSounds(Context context) { this.context = context.getApplicationContext(); }

    synchronized void configure(boolean on, String newStyle, String level) {
        String s = "minimal".equals(newStyle) || "cinematic".equals(newStyle) || "whisper".equals(newStyle) ? newStyle : "soft";
        // 1.4.0 files are already quiet (RMS -28..-38 dBFS); Low is ~7 dB below the 1.3.x Low.
        volume = "high".equals(level) ? 1.0f : "medium".equals(level) ? 0.72f : 0.5f;
        boolean styleChanged = !s.equals(style);
        style = s;
        enabled = on;
        if (!enabled) release();
        else if (foreground && (pool == null || styleChanged)) { release(); create(); }
    }

    synchronized void resume() { foreground = true; if (enabled && pool == null) create(); }
    synchronized void pause() { foreground = false; release(); }

    /** Plays one event; repeated identical events closer than 60 ms are dropped (fast key repeat). */
    synchronized void play(String event) {
        if (!enabled || pool == null) return;
        long now = SystemClock.uptimeMillis();
        if (event.equals(lastEvent) && now - lastAt < 60) return;
        Integer id = ids.get(event);
        if (id == null || !Boolean.TRUE.equals(loaded.get(id))) return;
        lastEvent = event;
        lastAt = now;
        // No stop() of the previous sound: an abrupt cut would itself click. Sounds are 26-85 ms, the 60 ms
        // throttle and maxStreams(2) keep fast arrow presses from stacking.
        pool.play(id, volume, volume, 1, 0, 1f);
    }

    private void create() {
        pool = new SoundPool.Builder().setMaxStreams(2).setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()).build();
        loaded.clear();
        ids.clear();
        final SoundPool p = pool;
        p.setOnLoadCompleteListener((sp, sampleId, status) -> {
            synchronized (UiSounds.this) { if (sp == pool && status == 0) loaded.put(sampleId, true); }
        });
        for (String e : EVENTS) {
            Integer res = RES.get(style + "_" + e);
            if (res != null) ids.put(e, p.load(context, res, 1));
        }
    }

    private void release() {
        if (pool != null) { pool.release(); pool = null; }
        ids.clear();
        loaded.clear();
    }
}
