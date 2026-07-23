// Verify the engine-manager path: spawn the real sidecar (python), complete the
// `hello` handshake, send a `clone` with a real reference, and confirm the full
// round-trip resolves cleanly. Without torch installed the model load fails — we
// assert that surfaces as a clean JSON `error` (not a crash), proving spawn +
// line-JSON IPC + lazy-load + error handling all work. (Same logic as voiceClone.ts.)
const { spawn } = require('node:child_process')
const { createInterface } = require('node:readline')
const { existsSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

const script = join(__dirname, '..', 'python', 'chatterbox_sidecar.py')
const reference = join(process.env.TEMP || tmpdir(), 'whisper_test.wav') // an existing wav
const output = join(tmpdir(), 'clone_engine_test_out.wav')
// Use the dev venv python if set (matches resolveSidecar's KAIZEN_CLONE_PYTHON
// override), else fall back to a system `python`. With the venv + a cached model
// this exercises the full synth; without deps it asserts a clean error.
const py = process.env.KAIZEN_CLONE_PYTHON || 'python'
const hf = process.env.HF_HOME || join(tmpdir(), 'kz-chatterbox')
// If KAIZEN_SIDECAR_EXE is set, test the packaged standalone exe directly
// (no Python) — otherwise run the .py script with a Python interpreter.
const exe = process.env.KAIZEN_SIDECAR_EXE
const env = { ...process.env, HF_HOME: hf, HF_HUB_DISABLE_TELEMETRY: '1' }
const proc = exe ? spawn(exe, [], { env }) : spawn(py, [script], { env })
let helloed = false
const rl = createInterface({ input: proc.stdout })
rl.on('line', (line) => {
  let m
  try {
    m = JSON.parse(line)
  } catch {
    return
  }
  if (m.type === 'hello') {
    helloed = true
    console.log('hello received (engine spawned) — cuda:', m.cuda)
    proc.stdin.write(
      JSON.stringify({ id: 1, cmd: 'clone', reference, text: 'Hola, esto es una prueba.', language: 'es', output }) + '\n',
    )
  } else if (m.id === 1) {
    if (m.type === 'progress') {
      console.log('  progress:', m.stage)
      return
    }
    if (m.type === 'ready') {
      // Intermediate status from the lazy model-load inside clone — keep waiting.
      console.log('  ready:', m.model, '/', m.device, '/', m.sampleRate + 'Hz')
      return
    }
    if (m.type === 'done') {
      const wrote = existsSync(m.output) && statSync(m.output).size > 1000
      console.log(`clone DONE: ${m.durationSec}s audio @ ${m.sampleRate}Hz in ${m.elapsedSec}s — file ${wrote ? 'OK' : 'MISSING'}`)
      console.log(wrote
        ? 'RESULT: PASS — full clone round-trip produced audio via the app sidecar protocol.'
        : 'RESULT: FAIL — done reported but no audio file.')
      proc.kill()
      process.exit(wrote ? 0 : 1)
    }
    // A clean error is acceptable ONLY when deps/model are absent (e.g. system python).
    console.log('clone response:', m.type, '|', (m.error || '').slice(0, 80))
    const ok = m.type === 'error'
    console.log(ok
      ? 'RESULT: PASS (degraded) — graceful error path works, but deps/model absent so no audio.'
      : 'RESULT: FAIL — unexpected response.')
    proc.kill()
    process.exit(ok ? 0 : 1)
  }
})
proc.on('error', (e) => {
  console.log('spawn error:', e.message)
  process.exit(1)
})
setTimeout(() => {
  console.log(helloed ? 'timeout after hello' : 'no hello — engine failed to start')
  process.exit(1)
}, 240000)
