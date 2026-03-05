<script>
  import { get as getStore } from 'svelte/store';
  import { hubUrlStore } from '$lib/api';
  import { getFactoryById } from '$lib/svg-catalog.js';

  let { spec = null, width = 420, height = 280 } = $props();

  let containerEl;
  let loaded = $state(false);
  let loadError = $state('');
  let renderTimer = null;

  const FACTORY_SCRIPTS = [
    'svg-stage.js',
    'svg-helpers.js',
    'svg-factories.js',
    'svg-factories-dynamic.js',
    'svg-factories-geometry.js',
    'svg-registry.js'
  ];

  function injectScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(src));
      document.head.appendChild(el);
    });
  }

  $effect(() => {
    if (loaded || typeof window === 'undefined') return;

    if (window.AGNI_SVG?.Registry) {
      loaded = true;
      return;
    }

    (async () => {
      if (!window.AGNI_SHARED) {
        window.AGNI_SHARED = {
          subscribeToSensor: function () { return function () {}; },
          unsubscribeFromSensor: function () {},
          sensorSubscriptions: {}
        };
      }

      const hubUrl = getStore(hubUrlStore);
      if (!hubUrl) {
        loadError = 'Connect to a Village Hub to enable live SVG preview';
        return;
      }

      const base = hubUrl.replace(/\/+$/, '');

      for (const file of FACTORY_SCRIPTS) {
        try {
          await injectScript(base + '/factories/' + file);
        } catch {
          loadError = 'Could not load SVG factories from hub';
          return;
        }
      }

      if (!window.AGNI_SVG) {
        loadError = 'SVG factories did not initialize';
        return;
      }

      loaded = true;
    })();
  });

  function renderSvg() {
    if (!loaded || !containerEl || !spec?.factory) return;

    containerEl.innerHTML = '';

    try {
      if (spec.compose && window.AGNI_SVG.compose) {
        window.AGNI_SVG.compose(containerEl, spec);
      } else if (window.AGNI_SVG.Registry?.fromSpec) {
        window.AGNI_SVG.Registry.fromSpec(spec, containerEl);
      } else {
        const fn = window.AGNI_SVG[spec.factory];
        if (!fn) return;
        const regEntry = window.AGNI_SVG.Registry?.get(spec.factory);
        if (regEntry && regEntry.stageRequired) {
          const stage = window.AGNI_SVG.stage(containerEl, {
            w: spec.opts?.w || width,
            h: spec.opts?.h || height
          });
          fn(stage, spec.opts || {});
        } else {
          fn(containerEl, spec.opts || {});
        }
      }
    } catch (e) {
      containerEl.innerHTML = '';
      const msg = document.createElement('div');
      msg.className = 'render-error';
      msg.textContent = 'Preview: ' + e.message;
      containerEl.appendChild(msg);
    }
  }

  $effect(() => {
    const _spec = spec;
    const _loaded = loaded;

    if (renderTimer) clearTimeout(renderTimer);
    renderTimer = setTimeout(renderSvg, 80);
  });
</script>

<div class="svg-preview-wrap">
  {#if loadError}
    {@const desc = spec?.factory ? getFactoryById(spec.factory) : null}
    <div class="fallback">
      {#if desc}
        <span class="fallback-icon">{desc.icon}</span>
        <span class="fallback-label">{desc.label}</span>
      {/if}
      <span class="fallback-msg">{loadError}</span>
    </div>
  {:else if !loaded}
    <div class="loading">
      <div class="spinner"></div>
      <span>Loading SVG engine...</span>
    </div>
  {:else if !spec?.factory}
    <div class="fallback">
      <span class="fallback-msg">Select a factory to see a preview</span>
    </div>
  {:else}
    <div bind:this={containerEl} class="svg-container"
      style="max-width:{width}px;max-height:{height + 40}px;"></div>
  {/if}
</div>

<style>
  .svg-preview-wrap {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 8px;
    background: #F4F1E8;
    min-height: 100px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    margin-bottom: 0.6rem;
  }

  .svg-container {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .svg-container :global(svg) {
    max-width: 100%;
    height: auto;
    display: block;
  }

  .fallback {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    padding: 1rem;
    text-align: center;
  }
  .fallback-icon { font-size: 2rem; opacity: 0.4; }
  .fallback-label { font-size: 0.85rem; font-weight: 600; color: #333; opacity: 0.6; }
  .fallback-msg { font-size: 0.75rem; color: #666; opacity: 0.7; }

  .loading {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    font-size: 0.8rem;
    color: #666;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0,0,0,0.1);
    border-top-color: #4dabf7;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  :global(.render-error) {
    padding: 0.8rem;
    color: #d63031;
    font-size: 0.78rem;
    text-align: center;
  }
</style>
