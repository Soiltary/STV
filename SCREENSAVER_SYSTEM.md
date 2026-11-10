# SCREENSAVER_SYSTEM (1.3.x — replaces Ambient mode)

## Two official routes
1. **In-app screensaver** (always available): Solitary TV's own idle timer while Solitary TV is on screen.
   - `ssOn`, `ssIdle` (1, 2, 5, 10, 15, 20, 30, 60 min, Never; default 5), style or slideshow, clock/date/weather/
     next-prayer toggles, clock style Digital/Minimal, dimming.
   - While it is enabled (and not "Never") the window keeps the screen on, so Android's system screensaver (at the time
     of writing: SMART TV's `SmartDreamService`, after 5 min) does not start before Solitary's. After 3 hours of
     screensaver the flag is released and the system's own sleep rules apply. With "Off"/"Never" Solitary does not
     hold the screen: Android's own screensaver/sleep apply unchanged.
   - Idle = no real remote key; programmatic UI changes do not count. It never starts over a dialog, the quick
     panel, typing, reordering, an image import in progress, or when another app is in front (the app is paused).
   - The first key only wakes it (never opens what is underneath); focus returns to where it was.
2. **System screensaver** (`SolitaryDream`, a `DreamService`): Solitary TV appears in Android settings ›
   Device Preferences › Screen saver. Android decides when it runs (its own timer) and video apps prevent it.
   The app never selects it by itself (that would change a system setting). Read-only: it shows the same
   screensaver from the saved settings.

## Styles
Dark Orbit, Nebula Drift, Minimal Stars, Abstract Waves (images) and Midnight Gradient (CSS); any wallpaper or user
image can also be used. Slideshow: pick items (✓), change every 30 s / 1 / 2 / 5 / 10 min, shuffle on/off.

## Cost on this receiver (measured)
- 1.3.0 used a continuous CSS drift animation: launcher ≈ 67% of one core + surfaceflinger ≈ 40% (repaints at 60 fps).
- 1.3.2: drift moves in small steps every 3 s (≈ 2 px), crossfade only on slideshow change, clock shifts a little
  every minute (burn-in protection): launcher ≈ 3.4% of one core. The "press any button" hint fades out after 8 s.
- Weather is shown only if fetched within 3 h; the next prayer only when prayer data is ready.
