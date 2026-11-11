import { useEffect, useRef, useState } from 'react'
import { message } from 'antd'
import { updateOrderInfo } from '../../api/orders'
import type { Order } from '../../types'
import { orderBasicsFields, orderBasicsOf, type OrderBasicsValue } from '../OrderInfoFields'
import { keepDraft, syncDraft } from '../../usePageLoad'

/**
 * 调度台订单卡片里正在编辑的公司订单号、调度备注、共用备注和所属公司。
 * 重新读取订单时，已经改过、还没保存的输入保持不动；换一张订单时重新开始。
 * 所属公司点选后立即写入，不等保存。
 */
export function useOrderInfoDraft(
  orders: Order[],
  selectedOrderId: string | null,
  { reload, onSaved }: { reload: () => Promise<void>; onSaved: () => void },
) {
  const [platformNo, setPlatformNo] = useState('')
  const [notes, setNotes] = useState('')
  const [sharedNotes, setSharedNotes] = useState('')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [basics, setBasics] = useState<OrderBasicsValue>({ guestCount: '', vehicleType: '', island: null })
  const basicsRef = useRef<OrderBasicsValue>(basics)
  const loadedBasicsKey = useRef('')
  const platformNoRef = useRef('')
  const notesRef = useRef('')
  const sharedNotesRef = useRef('')
  const companyIdRef = useRef<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const companyBindGen = useRef(0)
  const loadedRef = useRef({
    id: null as string | null,
    platform: '',
    notes: '',
    sharedNotes: '',
    companyId: null as string | null,
  })

  useEffect(() => {
    selectedIdRef.current = selectedOrderId
    const order = orders.find((item) => item.id === selectedOrderId)
    const nextPlatform = order?.platformOrderNo ?? ''
    const nextNotes = order?.notes ?? ''
    const nextSharedNotes = order?.sharedNotes ?? ''
    const nextCompanyId = order?.companyId ?? null
    const nextCompanyName = order?.companyName ?? ''
    const loaded = loadedRef.current
    const switched = loaded.id !== selectedOrderId
    syncDraft(platformNoRef, setPlatformNo, loaded.platform, nextPlatform, switched)
    syncDraft(notesRef, setNotes, loaded.notes, nextNotes, switched)
    syncDraft(sharedNotesRef, setSharedNotes, loaded.sharedNotes, nextSharedNotes, switched)
    const kept = keepDraft(companyIdRef.current, switched ? undefined : loaded.companyId, nextCompanyId)
    if (Object.is(kept, nextCompanyId)) {
      companyIdRef.current = nextCompanyId
      // oxlint-disable-next-line react/set-state-in-effect
      setCompanyId(nextCompanyId)
      setCompanyName(nextCompanyName)
    }
    // 人数、车型、南/北岛：换订单或重新读到不同的值时，没改过就跟着更新。
    const nextBasics = order ? orderBasicsOf(order) : { guestCount: '', vehicleType: '', island: null }
    const nextBasicsKey = JSON.stringify(nextBasics)
    if (switched || JSON.stringify(basicsRef.current) === loadedBasicsKey.current) {
      basicsRef.current = nextBasics
      setBasics(nextBasics)
    }
    loadedBasicsKey.current = nextBasicsKey
    loadedRef.current = {
      id: selectedOrderId,
      platform: nextPlatform,
      notes: nextNotes,
      sharedNotes: nextSharedNotes,
      companyId: nextCompanyId,
    }
  }, [orders, selectedOrderId])

  function setCompany(id: string | null, name: string) {
    companyIdRef.current = id
    setCompanyId(id)
    setCompanyName(name)
  }

  function currentOrder() {
    return orders.find((item) => item.id === selectedOrderId)
  }

  return {
    platformNo,
    notes,
    sharedNotes,
    companyId,
    companyName,
    basics,
    changeBasics(next: OrderBasicsValue) {
      basicsRef.current = next
      setBasics(next)
    },
    changePlatformNo(value: string) {
      platformNoRef.current = value
      setPlatformNo(value)
    },
    changeNotes(value: string) {
      notesRef.current = value
      setNotes(value)
    },
    changeSharedNotes(value: string) {
      sharedNotesRef.current = value
      setSharedNotes(value)
    },
    async changeCompany(nextId: string, nextName: string) {
      const order = currentOrder()
      const orderId = order?.id ?? null
      const previousId = order?.companyId ?? null
      const previousName = order?.companyName ?? ''
      const gen = ++companyBindGen.current
      setCompany(nextId, nextName)
      if (!order || previousId === nextId) {
        return
      }
      const stillCurrent = () => gen === companyBindGen.current && selectedIdRef.current === orderId
      try {
        const saved = await updateOrderInfo(order, { companyId: nextId })
        if (!stillCurrent()) {
          return
        }
        setCompany(saved.companyId ?? null, saved.companyName ?? nextName)
        message.success(saved.companyName ? `已绑定${saved.companyName}` : '已绑定公司')
        await reload()
      } catch (error) {
        if (stillCurrent()) {
          setCompany(previousId, previousName)
        }
        message.error(error instanceof Error ? error.message : '绑定公司失败')
      }
    },
    async save() {
      const order = currentOrder()
      if (!order) {
        return
      }
      try {
        const saved = await updateOrderInfo(order, {
          platformOrderNo: platformNoRef.current,
          notes: notesRef.current,
          sharedNotes: sharedNotesRef.current,
          companyId: companyIdRef.current,
          ...orderBasicsFields(basicsRef.current),
        })
        basicsRef.current = orderBasicsOf(saved)
        loadedBasicsKey.current = JSON.stringify(basicsRef.current)
        setBasics(basicsRef.current)
        platformNoRef.current = saved.platformOrderNo ?? ''
        notesRef.current = saved.notes ?? ''
        sharedNotesRef.current = saved.sharedNotes ?? ''
        setPlatformNo(platformNoRef.current)
        setNotes(notesRef.current)
        setSharedNotes(sharedNotesRef.current)
        setCompany(saved.companyId ?? null, saved.companyName ?? '')
        message.success('订单已保存')
        onSaved()
        await reload()
      } catch (error) {
        message.error(error instanceof Error ? error.message : '保存订单失败')
      }
    },
  }
}
