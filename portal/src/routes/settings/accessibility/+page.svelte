<script>
  import { a11yPrefs, updateA11yPrefs, resetA11yPrefs } from '$lib/accessibility';

  let prefs = $state({ hapticIntensity: 1, reducedMotion: false, highContrast: false, fontScale: 1 });
  let saved = $state(false);

  $effect(() => {
    const unsub = a11yPrefs.subscribe(v => { prefs = { ...v }; });
    return unsub;
  });

  function setHaptic(val) {
    prefs.hapticIntensity = val;
    updateA11yPrefs({ hapticIntensity: val });
    flash();
  }
  function toggleReducedMotion() {
    prefs.reducedMotion = !prefs.reducedMotion;
    updateA11yPrefs({ reducedMotion: prefs.reducedMotion });
    flash();
  }
  function toggleHighContrast() {
    prefs.highContrast = !prefs.highContrast;
    updateA11yPrefs({ highContrast: prefs.highContrast });
    flash();
  }
  function setFontScale(val) {
    prefs.fontScale = val;
    updateA11yPrefs({ fontScale: val });
    flash();
  }
  function reset() {
    resetA11yPrefs();
    flash();
  }

  let flashTimer = null;
  function flash() {
    saved = true;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { saved = false; }, 1500);
  }

  const hapticLabel = $derived(
    prefs.hapticIntensity === 0 ? 'Off' :
    prefs.hapticIntensity <= 0.3 ? 'Low' :
    prefs.hapticIntensity <= 0.7 ? 'Medium' : 'Full'
  );
</script>

<svelte:head>
  <title>Accessibility | AGNI Portal</title>
</svelte:head>

<nav class="breadcrumb">
  <a href="/">Home</a> → <a href="/settings">Settings</a> → Accessibility
</nav>

<h1>Accessibility</h1>
<p class="subtitle">Adjust haptics, motion, contrast and text size. Saved automatically to this device.</p>

{#if saved}
  <div class="save-flash">Saved</div>
{/if}

<div class="card section">
  <h2>Haptic feedback</h2>
  <p class="hint">Controls vibration intensity on sensor-triggered steps. Set to 0 to disable vibration entirely.</p>

  <div class="slider-row">
    <input type="range" min="0" max="1" step="0.1" value={prefs.hapticIntensity}
           oninput={(e) => setHaptic(parseFloat(e.target.value))} class="slider" />
    <span class="slider-value">{hapticLabel} ({(prefs.hapticIntensity * 100).toFixed(0)}%)</span>
  </div>

  <div class="preset-chips">
    <button class:active={prefs.hapticIntensity === 0} onclick={() => setHaptic(0)}>Off</button>
    <button class:active={prefs.hapticIntensity === 0.3} onclick={() => setHaptic(0.3)}>Low</button>
    <button class:active={prefs.hapticIntensity === 0.7} onclick={() => setHaptic(0.7)}>Medium</button>
    <button class:active={prefs.hapticIntensity === 1} onclick={() => setHaptic(1)}>Full</button>
  </div>
</div>

<div class="card section">
  <h2>Motion</h2>
  <label class="toggle-row">
    <input type="checkbox" checked={prefs.reducedMotion} onchange={toggleReducedMotion} />
    <span>Reduced motion</span>
  </label>
  <p class="hint">Disables animations and transitions. Respects the OS-level <code>prefers-reduced-motion</code> setting as well.</p>
</div>

<div class="card section">
  <h2>Display</h2>
  <label class="toggle-row">
    <input type="checkbox" checked={prefs.highContrast} onchange={toggleHighContrast} />
    <span>High contrast</span>
  </label>
  <p class="hint">Increases border visibility and text contrast for low-vision users.</p>

  <h3>Text size</h3>
  <div class="slider-row">
    <input type="range" min="0.8" max="1.5" step="0.05" value={prefs.fontScale}
           oninput={(e) => setFontScale(parseFloat(e.target.value))} class="slider" />
    <span class="slider-value">{(prefs.fontScale * 100).toFixed(0)}%</span>
  </div>
  <p class="preview-text" style="font-size: {prefs.fontScale}rem;">
    The quick brown fox jumps over the lazy dog.
  </p>
</div>

<div class="actions">
  <button class="secondary" onclick={reset}>Reset to defaults</button>
</div>

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: 0.9rem; opacity: 0.9; }
  .breadcrumb a { color: var(--accent); }
  .subtitle { opacity: 0.9; margin-bottom: 1.5rem; }

  .save-flash {
    position: fixed; top: 1rem; right: 1rem; z-index: 999;
    background: var(--accent); color: #1a1a2e; padding: 0.4rem 1rem;
    border-radius: 6px; font-weight: bold; font-size: 0.9rem;
    animation: fadeIn 0.15s ease;
  }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: none; } }

  .section { margin-bottom: 1.25rem; }
  .section h2 { margin-top: 0; margin-bottom: 0.5rem; }
  .section h3 { margin-top: 1rem; margin-bottom: 0.4rem; font-size: 0.95rem; }
  .hint { font-size: 0.9rem; opacity: 0.75; margin-bottom: 0.5rem; }
  .hint code { background: rgba(255,255,255,0.08); padding: 0.1rem 0.3rem; border-radius: 3px; }

  .slider-row { display: flex; align-items: center; gap: 1rem; margin: 0.5rem 0; }
  .slider {
    flex: 1; max-width: 300px; accent-color: var(--accent);
    height: 6px; -webkit-appearance: none; appearance: none;
    background: rgba(255,255,255,0.1); border-radius: 3px; outline: none;
  }
  .slider::-webkit-slider-thumb {
    -webkit-appearance: none; width: 18px; height: 18px;
    border-radius: 50%; background: var(--accent); cursor: pointer;
  }
  .slider-value { min-width: 100px; font-size: 0.9rem; font-weight: 600; }

  .preset-chips { display: flex; gap: 0.4rem; margin-top: 0.5rem; }
  .preset-chips button {
    background: rgba(31,43,78,0.7); color: var(--text); border: 1px solid var(--border);
    padding: 0.3rem 0.7rem; border-radius: 16px; cursor: pointer; font-size: 0.85rem;
  }
  .preset-chips button:hover { border-color: var(--accent); }
  .preset-chips button.active { background: rgba(0,230,118,0.15); border-color: var(--accent); color: var(--accent); }

  .toggle-row {
    display: flex; align-items: center; gap: 0.5rem; cursor: pointer;
    font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem;
  }
  .toggle-row input[type="checkbox"] { accent-color: var(--accent); width: 18px; height: 18px; }

  .preview-text {
    margin-top: 0.5rem; padding: 0.5rem 0.75rem;
    background: rgba(31,43,78,0.5); border: 1px solid var(--border);
    border-radius: 6px; line-height: 1.5;
  }

  .actions { margin-top: 1rem; }
  .secondary {
    background: #2a2a4a; color: var(--text); border: 1px solid var(--border);
    padding: 0.5rem 1rem; border-radius: 6px; cursor: pointer;
  }
</style>
