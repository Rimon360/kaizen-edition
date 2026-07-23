// Check es/en translation-key parity (a common launch bug). Bundle:
//   npx esbuild src/i18n/translations.ts --bundle --platform=node --format=esm --alias:@=./src --outfile=$TEMP/i18n.mjs
import { pathToFileURL } from 'node:url'
const m = await import(pathToFileURL(process.env.I18N_BUNDLE).href)
const { es, en } = m.translations
const ek = Object.keys(es)
const nk = Object.keys(en)
const missEn = ek.filter((k) => !(k in en))
const missEs = nk.filter((k) => !(k in es))
console.log(`es keys: ${ek.length} | en keys: ${nk.length}`)
console.log('missing in EN:', missEn.length ? missEn.join(', ') : 'none')
console.log('missing in ES:', missEs.length ? missEs.join(', ') : 'none')
const ok = missEn.length + missEs.length === 0
console.log(ok ? 'RESULT: I18N PARITY OK' : 'RESULT: I18N PARITY MISMATCH')
process.exit(ok ? 0 : 1)
