// packages/agni-runtime/audio/beacon.js
// ES5 compatible. Repeating beep for collab "find classmates" flow.
// Web Audio API: Chrome 51+ on Android. User gesture required before playBeacon().

(function (global) {
  'use strict';

  var AudioContext = global.AudioContext || global.webkitAudioContext;
  var ctx = null;
  var oscillator = null;
  var gainNode = null;
  var intervalId = null;

  var FREQ = 440;
  var BEEP_MS = 500;
  var PAUSE_MS = 500;

  function stopBeacon() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
    if (oscillator) {
      try { oscillator.stop(); } catch (e) { void 0; }
      oscillator = null;
    }
    if (gainNode && ctx) {
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
    }
  }

  function playBeacon() {
    if (!AudioContext) return false;
    stopBeacon();
    try {
      ctx = ctx || new AudioContext();
      oscillator = ctx.createOscillator();
      gainNode = ctx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = FREQ;
      gainNode.gain.value = 0.3;
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.start(0);

      var on = true;
      intervalId = setInterval(function () {
        if (!gainNode || !ctx) return;
        on = !on;
        gainNode.gain.setValueAtTime(on ? 0.3 : 0, ctx.currentTime);
      }, BEEP_MS);
      return true;
    } catch (e) {
      return false;
    }
  }

  global.AGNI_BEACON = {
    playBeacon: playBeacon,
    stopBeacon: stopBeacon
  };
})(typeof window !== 'undefined' ? window : this);
