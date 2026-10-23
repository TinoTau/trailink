# 执行报告：清理死代码并统一整单司机分配

## 目标

删除已确认未引用的示例资源与死代码；把 AssignDriver 与 Claim 的整单覆盖分配抽到同一业务服务；精简分配查询；去掉当日编辑里重复的 flatMap。

## 改动

删除（源码/配置/测试均未引用）：

- `frontend/src/App.css`
- `frontend/src/assets/hero.png`、`react.svg`、`vite.svg`
- `localDate.ts` 的 `parseLocalDate`、`formatLocalDateTime`（`OrderEditPage` 自有同名函数未动）
- `driver-calendar.css` 的 `.driver-detail-desc`、`.driver-activity`、`.driver-activity:last-child`、`.driver-activity.selected`

重构：

- 新增 `OrderDriverAssignment`，覆盖全部行程日 `DriverId`、查冲突、保存。`OrdersController.AssignDriver` 与 `DriverCalendarController.Claim` 共用。`CreateRange` 仍自建行程日，不并入。
- AssignDriver 只加载订单和行程日，不再带 Driver / Activities。`LoadOrderAsync` 仍给详情读写用。
- `DriverDayEditor.load()`：订单号去重请求，一次展开成 `itineraryDayId` Map，再按 `day.items` 顺序取值。

## 命令结果

- `npm run lint`：通过。仅有既有 warning。
- `npm run build`：`tsc -b && vite build` 通过。
- 首次 `dotnet test` 因运行中的 `Trailink.Api.exe` 锁文件失败。停止进程后复跑筛选测试：通过 4（整单派单、冲突 warning + null 解绑、Claim、Claim 重叠 warning）。
- 测试后已用 `--no-build` 重新拉起 API。

## 未做

- 仓库无 `AGENTS.md`，按 SSOT / 执行报告执行。
- 未改数据库、迁移、API 契约。
- 未把未调用的后端公开 API 当死代码删除。
- 未合并 OrderEditPage 的日期函数。

## 阻塞

无。

## 下一步

跑前端 lint/build 与整单分配 / Claim / 解绑 / 冲突 warning 测试。
