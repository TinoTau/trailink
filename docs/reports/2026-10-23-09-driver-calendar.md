# 执行报告：司机端连续滚动日历

日期：2026-10-23  
范围：司机端 `/driver/calendar` 开发预览  
状态：本轮目标已完成；未进入调度员 UI

---

## 1. 执行前核对

| 问题 | 结论 |
|------|------|
| 对应哪个现有模块？ | 现有行程 / 订单 / 活动只读查询 |
| 要改哪些现有文件？ | 路由、权威文档；新增预览只读 API 与司机日历页 |
| 是否已有类似功能？ | 无日历页；无登录 |
| 是否会产生第二个事实来源？ | 否。仍读 `orders` / `itinerary_days` / `order_activities` / `drivers` |
| 是否需要新增数据库实体？ | 否 |
| 是否会破坏现有 API 或数据？ | 否。未改订单 CRUD |

项目没有登录或司机身份上下文。因此没有实现“只能看自己的行程”的正式隔离。

---

## 2. 修改文件

文档：`docs/PRD.md`、`docs/API_CONTRACT.md`、`docs/FRONTEND_DESIGN.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/ARCHITECTURE.md`

后端：

- `backend/Trailink.Api/Controllers/DriverCalendarController.cs`
- `backend/Trailink.Api/DTOs/CalendarDtos.cs`
- `backend/Trailink.Api.Tests/CalendarPreviewTests.cs`

前端：

- `frontend/src/App.tsx`
- `frontend/src/types.ts`
- `frontend/src/api/driverCalendar.ts`
- `frontend/src/pages/driver/DriverCalendarPage.tsx`
- `frontend/src/pages/driver/driver-calendar.css`
- `frontend/src/pages/driver/localDate.ts`

未改订单编辑页、司机 CRUD、数据库 Migration。

---

## 3. UI 与滚动

独立手机页，不用调度端顶栏。月份按时间上下排列，默认当前月 ±2 个月，滚动到今天。接近顶部或底部再加载一个月，已加载月份不重复请求。日期本地计算，不用 `toISOString()`。

格子七列周一至周日，只显示日期数字和行程填充色。空白日期不弹详情。

---

## 4. 数据查询与身份

`GET /api/driver-calendar/preview?startDate=&endDate=` 只读现有行程表。

- `preview=true`，`identityIsolated=false`
- 预览司机由服务器 `Calendar:PreviewDriverId` 或全库派单天数最多的司机决定
- 客户端 `driverId` 被忽略
- 不提供 `GET /api/calendar?driverId=`

**司机身份隔离尚未真正实现。** 页面标明开发预览。

---

## 5. 颜色与电子票

颜色存在 `localStorage` 键 `trailink.driverCalendar.colors`，分已过去 / 今天及未来。不写业务表。

`ticket_path` 不作为 URL。有票但不可访问时提示“电子票暂不可查看”。无票只选中活动。

---

## 6. 手机端验证

宽度 320 / 375 / 430：七列，无横向滚动。375 下打开 10-23 详情，同日两单分开显示，活动时间和电子票提示正确。上滑出现 2026-07，下滑出现 2027-01。自定义颜色刷新后仍为粉/绿。

---

## 7. 测试结果

`dotnet test`：13 通过。`npm run build`：通过。

预览接口测试确认：传入其他司机 `driverId` 不会返回该司机行程；`/api/calendar?driverId=` 为 404。

---

## 8. 尚未完成

- 登录与正式司机隔离
- 调度员日历
- 电子票上传与可访问地址
- 文件存储
