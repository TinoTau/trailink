import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import dayjs from 'dayjs'
import 'dayjs/locale/zh-cn'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthContext.tsx'
import './index.css'

dayjs.locale('zh-cn')

const touchUi = window.matchMedia('(pointer: coarse), (max-width: 800px)')

const textEntrySelector =
  'input:is(:not([type]), [type="text"], [type="search"], [type="password"], [type="email"], [type="tel"], [type="url"], [type="number"]), textarea, select, option, [contenteditable="true"]'

function mobileNonEditingTarget(target: EventTarget | null) {
  if (!touchUi.matches || !(target instanceof Element)) {
    return false
  }
  return !target.closest(textEntrySelector)
}

document.addEventListener('selectstart', (event) => {
  if (mobileNonEditingTarget(event.target)) {
    event.preventDefault()
  }
})

document.addEventListener('contextmenu', (event) => {
  if (mobileNonEditingTarget(event.target)) {
    event.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ConfigProvider>
  </StrictMode>,
)
