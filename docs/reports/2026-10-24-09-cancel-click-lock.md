# 执行报告：取消行程改为有效点击并加解绑锁

## 目标

取消态不再在 pointerdown 立即解绑；解绑入口加同步锁，避免滑动误触和并发解绑。

## 改动

- `frontend/src/pages/driver/DriverCalendarPage.tsx`：取消与详情改为 `onClick`；框选添加仍用 `pointerdown` / `pointerenter`。`unbindLock` 从请求到日历刷新结束挡住重复解绑和模式切换，失败后释放锁可重试。
- `frontend/src/pages/driver/driver-calendar.css`：取消态 `touch-action: pan-y`，处理中禁用「行程管理」。
- `docs/FRONTEND_DESIGN.md`、`docs/PRD.md`：取消由有效点击或键盘激活，滑动不解除绑定。
- 仍只调用 `ordersApi.assignDriver(orderId, null)`，不改后端。

## 命令结果

- `npm run lint`（frontend）：通过。仅有既有 warning，未改 `DriverDayEditor` 等无关文件。
- `npm run build`（frontend）：`tsc -b && vite build` 通过。
- `dotnet test --filter Claim_assigns_existing_order_days_to_preview_driver`：通过 1。
- 浏览器 `/driver/calendar`：取消态对 12 月 8 日只发 `pointerdown`/`pointerup` 时 `PUT /driver` 次数为 0；随后连续点 8、9、8 三次只发出 1 次 `PUT /api/orders/.../driver`。12 月 8、9 日色块消失，两天 `driver_id` 均为 `null`。普通点击 10 月 23 日仍展开详情卡片。

## 未做

- 仓库无 `AGENTS.md`，按现有 SSOT / 执行报告规则收尾。
- 前端无单测。未在真机触屏上滑日历；用 pointerdown 不带 click 等价验证滑动路径。
- 未在浏览器里实际按下 Enter / Space（日期格是 `button`，取消走 `onClick`，键盘会走同一处理）。未单独注入失败请求测重试，失败路径在 `finally` 释放锁。
- 未改后端，未新增取消 endpoint。

## 阻塞

无。

## 下一步

无。剩余限制见上。
