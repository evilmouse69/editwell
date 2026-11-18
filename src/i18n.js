import en from './locales/en.js'
import fr from './locales/fr.js'
import de from './locales/de.js'
import es from './locales/es.js'
export const locales = { en, fr, de, es }
export function translator(locale = 'en', overrides = {}) {
  const messages = { ...en, ...locales[locale], ...overrides }
  return (key, values = {}) => String(messages[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '')
}
