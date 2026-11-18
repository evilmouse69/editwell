import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
const lock = JSON.parse(readFileSync('package-lock.json'))
const notices = []
for (const [path, metadata] of Object.entries(lock.packages)) {
  if (!path || metadata.dev) continue
  const files = readdirSync(path).filter(name => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name))
  const title = path.split('node_modules/').pop() + '@' + metadata.version
  for (const file of files) notices.push(title + '\n' + readFileSync(join(path, file), 'utf8'))
}
mkdirSync('lib', { recursive:true })
writeFileSync('lib/THIRD_PARTY_NOTICES.txt', notices.join('\n\n----------------\n\n'))
copyFileSync('LICENSE', 'lib/LICENSE')
writeFileSync('lib/version.json', JSON.stringify({ name:'editwell', version:lock.version }) + '\n')
