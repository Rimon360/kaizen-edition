// Verify a cancel during the prepare/synth phase can't be resurrected by late
// progress/finish events (which would re-lock the studio), and that a fresh
// export still works afterwards.
import { pathToFileURL } from 'node:url'

const m = await import(pathToFileURL(process.env.RENDER_STORE).href)
const { useRenderStore } = m
const get = () => useRenderStore.getState()
// Mirror useIsRendering()'s selector.
const locked = () => get().status === 'preparing' || get().status === 'rendering'

let failures = 0
const check = (name, cond) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

// --- Cancel during prepare/synth, then late events arrive ---
get().start('job1')
check('start -> preparing (locked)', get().status === 'preparing' && locked())
get().setProgress(0, 'generating voice')
check('synth setProgress -> rendering (locked)', get().status === 'rendering' && locked())
get().cancel()
check('cancel -> canceled (UNLOCKED)', get().status === 'canceled' && !locked())
// These late events previously re-locked the UI:
get().setProgress(50, 'processing')
check('late setProgress after cancel is ignored (stays unlocked)', get().status === 'canceled' && !locked())
get().finish('C:/out/video.mp4')
check('late finish after cancel is ignored (stays unlocked)', get().status === 'canceled' && !locked())

// --- A fresh export must NOT be blocked by the guard ---
get().start('job2')
check('new job start -> preparing (locked)', get().status === 'preparing' && locked())
get().setProgress(10, 'processing')
check('new job progresses normally', get().status === 'rendering' && locked())
get().finish('C:/out/video2.mp4')
check('new job finishes (done, unlocked)', get().status === 'done' && !locked())

console.log(`\n${failures === 0 ? 'RESULT: PASS — cancel survives late events; new jobs unaffected.' : `RESULT: FAIL — ${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
