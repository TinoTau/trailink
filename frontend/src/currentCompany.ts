const KEY = 'trailink.currentCompanyId'

export function readCurrentCompanyId() {
  return localStorage.getItem(KEY)
}

export function writeCurrentCompanyId(companyId: string) {
  localStorage.setItem(KEY, companyId)
}
