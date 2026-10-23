# 执行报告：业务时间规则与数据契约修正

日期：2026-10-23  
范围：当地日期/时间语义、活动时间列类型、权威文档  
状态：本轮目标已完成；未进入 UI 开发

---

## 1. 执行前核对

| 问题 | 结论 |
|------|------|
| 对应哪个现有模块？ | 现有 `OrderActivity` / `OrderActivitiesController` / 订单日期字段 |
| 要改哪些现有文件？ | 实体、DTO、Controller、DbContext、测试、权威文档 |
| 是否已有类似功能？ | 有。活动时间字段已存在，但语义是 timestamptz + UTC |
| 是否会产生第二个事实来源？ | 否。仍是同一套表和 API 路径 |
| 是否需要新增数据库实体？ | 否 |
| 是否会破坏现有 API 或数据？ | 请求格式收紧：带时区偏移的活动时间改为 400。现有非空时间数据为 0 行 |

未发现需要另建替代架构的冲突。

---

## 2. 数据检查

迁移前：

- `booking_time` / `checkin_time` 为 `timestamp with time zone`
- 会话时区 `Etc/UTC`
- 3 条活动记录的两个时间字段全部为 NULL
- `orders.start_date`、`itinerary_days.service_date` 已是 `date`
- 无 `start_time` / `departure_time` / `pickup_time`

因此可以将列改为 `timestamp without time zone`，不会猜测或改写已有业务时间。迁移内含非空检查：若出现非空 timestamptz，直接失败。

---

## 3. 实际修改的文件

文档：

- `docs/PRD.md`
- `docs/DATABASE_CONTRACT.md`
- `docs/API_CONTRACT.md`
- `docs/ARCHITECTURE.md`
- `docs/FRONTEND_DESIGN.md`（只改正时间契约说明）

后端：

- `backend/Trailink.Api/Models/OrderActivity.cs`
- `backend/Trailink.Api/DTOs/ItineraryDayDtos.cs`
- `backend/Trailink.Api/DTOs/LocalDateTimeJsonConverter.cs`（新增，只服务现有活动时间字段）
- `backend/Trailink.Api/Controllers/OrderActivitiesController.cs`
- `backend/Trailink.Api/Controllers/ItineraryDaysController.cs`
- `backend/Trailink.Api/Data/TrailinkDbContext.cs`
- `backend/Trailink.Api/Data/Migrations/20261023093709_UseLocalActivityTimes*`
- `backend/Trailink.Api.Tests/CrudApiTests.cs`

未改订单页面、司机 CRUD、`InitialCreate`、`AdjustOrderStructure`。

---

## 4. 数据库字段变化

| 字段 | 原类型 | 现类型 |
|------|--------|--------|
| `order_activities.booking_time` | `timestamptz` | `timestamp without time zone` |
| `order_activities.checkin_time` | `timestamptz` | `timestamp without time zone` |
| `order_activities.ticket_path` | `text` NULL | 未改；文档明确为预留字段 |
| `orders.start_date` | `date` | 未改 |
| `itinerary_days.service_date` | `date` | 未改 |

未恢复或新增出发时间字段。未新增附件表。

---

## 5. 时间处理变化

- 去掉 `ToUniversalTime()`。
- 实体和 DTO 由 `DateTimeOffset?` 改为 `DateTime?`，写入时 `Kind=Unspecified`。
- API 读写当地时间字符串 `YYYY-MM-DDTHH:mm:ss`。
- 输入含 `Z` 或显式偏移时返回 400，不静默转换。
- 日期字段继续用 `DateOnly`，不做时区调整。

---

## 6. 数据迁移结果

增量迁移 `20261023093709_UseLocalActivityTimes` 已应用。

- 未覆盖 `InitialCreate`、`AdjustOrderStructure`
- 3 条已有活动记录仍在，时间仍为 NULL
- **无数据损失**

---

## 7. 测试结果

`dotnet test Trailink.slnx`：**12 通过 / 0 失败**

覆盖：当地日期往返、当地活动时间往返且不变成 `2026-11-12T21:30:00`、`Z` / `+13:00` 返回 400、订单/行程/活动/派单/司机回归。

`npm run build`：通过。本轮未改前端页面。

---

## 8. 未完成事项

- 未开发 UI、日历、文件上传
- 现有 `OrderEditPage` 仍用 `toISOString()` 提交活动时间；按新契约，带偏移的提交会被 400。下一次改页面时再替换为当地时间字符串
- `ticket_path` 仍只是预留字段

---

## 9. 数据损失风险

当前无。已有非空活动时间为 0。若之后在 timestamptz 阶段写入过无法还原的时间，迁移会拒绝执行，而不是按会话时区换算。
