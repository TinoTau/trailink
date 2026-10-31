import { PREF_KEYS, readPref, writePref } from './localPrefs'

export function readCurrentCompanyId() {
  return readPref(PREF_KEYS.currentCompanyId) ?? undefined
}

export function writeCurrentCompanyId(companyId: string) {
  writePref(PREF_KEYS.currentCompanyId, companyId)
}
