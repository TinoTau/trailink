import { useState } from 'react'
import { LibraryManager } from './LibraryManager'
import './library.css'

/** 公司信息页的「活动库」入口：所有公司共用一份，只有公司账户能看到并编辑。管理在弹框里进行。 */
export function ActivityLibrarySection() {
  const [open, setOpen] = useState(false)
  return (
    <section className="account-section profile-block">
      <div className="library-entry">
        <div>
          <h2>活动库</h2>
          <p className="account-hint">所有公司共用的活动和住宿酒店，日期详情里添加活动时按目的地列出。</p>
        </div>
        <button type="button" className="account-chip primary" onClick={() => setOpen(true)}>
          管理活动库
        </button>
      </div>
      {open ? <LibraryManager onClose={() => setOpen(false)} /> : null}
    </section>
  )
}
