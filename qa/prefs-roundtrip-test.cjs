// Durability proof for "remember my settings": write prefs in one Electron
// process, then read them back in a SEPARATE process (cache is per-process, so a
// successful read proves the value came off disk from userData — i.e. it would
// survive an app restart).
const { app } = require('electron')
const { setPrefs, getPrefs } = require(process.env.PREFS_BUNDLE)

app.disableHardwareAcceleration()
app.whenReady().then(() => {
  if (process.env.PREFS_MODE === 'write') {
    const sample = {
      subtitle: {
        enabled: true,
        position: 'top',
        fontSize: 64,
        fontFamily: 'Impact',
        color: '#ffee00',
        backgroundColor: '#000000',
        backgroundEnabled: true,
        stroke: true,
        strokeColor: '#111111',
        strokeWidth: 4,
      },
      format: 'horizontal',
      extras: { voiceOver: false, soundEffects: true, normalizeAudio: true },
      template: 'gaming',
      voice: { voiceId: 'Microsoft Sabina', rate: 3, pitch: -5, volume: 80 },
    }
    const out = setPrefs(sample)
    console.log('WROTE prefs:', JSON.stringify({ template: out.template, vol: out.voice.volume }))
    app.exit(0)
  } else {
    const p = getPrefs()
    console.log('READ prefs:', p ? JSON.stringify(p) : 'null')
    const ok =
      !!p &&
      p.template === 'gaming' &&
      p.format === 'horizontal' &&
      p.voice.volume === 80 &&
      p.voice.voiceId === 'Microsoft Sabina' &&
      p.subtitle.position === 'top' &&
      p.subtitle.fontFamily === 'Impact' &&
      p.extras.soundEffects === true
    console.log(
      ok
        ? 'RESULT: PASS — prefs read back intact in a fresh process (survives restart).'
        : 'RESULT: FAIL — prefs did not round-trip.',
    )
    app.exit(ok ? 0 : 1)
  }
})
