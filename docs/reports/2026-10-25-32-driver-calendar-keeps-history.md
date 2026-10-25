# 司导日历保留过期订单

日期：2026-10-25

## 目标

本人已经跑完且过期的订单继续留在「我的行程」日历对应日期上。

## 改动

- 在现有 `DriverCalendarPage` 原位移除历史订单过滤；仍只画登录用户 `driver_id` 名下的行程日。
- 过期日期继续使用现有「已完成」颜色，日期详情和活动入口不变。
- 同步 `PRD.md`、`API_CONTRACT.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。
- 测试补充确认司导的 `GET /api/orders` 同时返回过去和未来订单。
- 构建时修正已有的 TypeScript 类型错误：多余的 `>`、可空订单字段、菜单联合类型收窄、可空用户与公司 ID。

## 验证

- `dotnet test --filter Company_desk_lists_only_handled_historical_orders`：通过 1。
- `npm run build`：通过；Vite 仅提示主包大于 500 kB。
- 浏览器以 `wang` 打开 `/driver/calendar`：10 月 1–2、14–17 等过期行程以「已完成」颜色显示；点击 10 月 1 日可展开「10月1日 至 10月2日 · 2 天」详情。

## 未做

- 未新增表、Controller、接口或平行日历。
- 未提交代码。
