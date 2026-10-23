# 执行报告：订单数据结构与行程界面调整

日期：2026-10-23  
范围：Order / ItineraryDay / OrderActivity 三层结构调整、文档、迁移、API、前端  
状态：本轮目标已完成

---

## 1. 已完成的功能

- 订单主体改为系统订单号、平台订单号、来源公司、起始日期、游客人数、备注。不再使用订单标题和订单状态。
- 系统订单号由后端生成（`TL-{yyyyMMdd}-{hex6}`），前端不能指定。
- 结束日期和行程天数从每日行程日期计算，不落库。
- 行程日新增结束地点；同一订单同一天仍最多一条行程。
- 新增活动项目表与 CRUD API；订单详情一次返回主体、行程和活动。
- 整单派单和按天改司机仍只写 `itinerary_days.driver_id`。
- 电子票本阶段只保存 `ticket_path`，无独立文件管理。
- 司机 CRUD 未改字段。
- 未创建派单历史、订单修改历史、权限、状态机、调度或 AI 功能。
- 未创建收费 AWS 资源，未部署生产环境。

---

## 2. 修改的文件

权威文档：

- `docs/PRD.md`
- `docs/DATABASE_CONTRACT.md`
- `docs/API_CONTRACT.md`
- `docs/FRONTEND_DESIGN.md`（新增）
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT_PLAN.md`

后端新增：

- `backend/Trailink.Api/Models/OrderActivity.cs`
- `backend/Trailink.Api/Controllers/OrderActivitiesController.cs`
- `backend/Trailink.Api/Data/Migrations/20261023091011_AdjustOrderStructure*`

后端更新：

- `backend/Trailink.Api/Models/Order.cs`
- `backend/Trailink.Api/Models/ItineraryDay.cs`
- `backend/Trailink.Api/Data/TrailinkDbContext.cs`
- `backend/Trailink.Api/DTOs/OrderDtos.cs`
- `backend/Trailink.Api/DTOs/ItineraryDayDtos.cs`
- `backend/Trailink.Api/Controllers/OrdersController.cs`
- `backend/Trailink.Api/Controllers/ItineraryDaysController.cs`
- `backend/Trailink.Api.Tests/CrudApiTests.cs`
- `backend/Trailink.Api.Tests/DataModelTests.cs`

前端更新：

- `frontend/src/types.ts`
- `frontend/src/api/orders.ts`
- `frontend/src/pages/OrdersPage.tsx`
- `frontend/src/pages/OrderEditPage.tsx`

司机控制器和司机前端页面未改。

---

## 3. 数据库迁移结果

新增迁移 `20261023091011_AdjustOrderStructure`，未覆盖 `20261023083458_InitialCreate`。

| 项 | 结果 |
|----|------|
| 已应用迁移 | `InitialCreate`、`AdjustOrderStructure` |
| `orders` | 去掉 `title`/`status`/`end_date`；`source` 改名为 `source_company`；新增 `order_no`（唯一）、`platform_order_no`、`guest_count` |
| `itinerary_days` | 去掉 `start_time`/`notes`；新增 `end_location` |
| `order_activities` | 新建，删除行程/订单时级联删除 |
| `drivers` / `order_files` | 结构未改 |

已有测试订单 `dec8d5cc-...` 保留：系统订单号写成 `TL-20261112-DEC8D5`，3 条行程日期保留，`guest_count` 置 0。

无法无损映射、已丢弃的字段：

- `orders.title`
- `orders.status`
- `orders.end_date`
- `itinerary_days.start_time`
- `itinerary_days.notes`

`source` 已写入 `source_company`。该行来源公司此前被 PowerShell 控制台编码写成 `??`，不是本轮迁移逻辑错误。

---

## 4. 测试结果

### 后端

命令：`dotnet test Trailink.slnx`（SDK 10.0.402）

首次失败：活动 `booking_time` 带 `+13:00` 写入 `timestamptz` 时 Npgsql 返回 500。  
处理：保存前将时间转为 UTC。

复测：**8 通过 / 0 失败 / 0 跳过**。

覆盖：

1. 创建订单自动生成系统订单号。
2. 平台订单号允许为空。
3. 创建三日行程。
4. 修改某一天结束地点。
5. 同一天添加多个活动。
6. 修改承办方和预约时间。
7. 删除活动项目。
8. 整单派单和单日换司机。
9. 删除订单后行程和活动不可再访问。
10. 游客人数为负返回 400；司机 CRUD 仍可用。

首次失败的用例在修复前留下一笔订单 `TL-20261023-925877`（3 天行程）。该数据未删除，可供界面核对。

### 前端构建

命令：`npm run build`

**成功。** Vite 仍提示 Ant Design 包体积偏大，不影响本轮验收。

### 浏览器核对

- `/orders`：系统订单号、平台订单号、来源公司、开始日期、行程天数、游客人数、操作。
- `/orders/{id}`：日期缩略卡片显示结束地点、司机、活动数量；点开后可编辑描述、地点、司机、活动，并有电子票路径输入。
- 在 11-12 行程中通过界面新增活动「湖边散步」，接口确认已写入。
- `/drivers`：原司机列表仍可用。

---

## 5. 未完成事项

- 日历 API 与日历页面
- 订单附件上传、本地/S3 存储
- 电子票实际文件上传（目前只保存路径）
- 独立司机账号与权限
- 收费 AWS 资源与生产部署

---

## 6. 下一步建议

1. 实现 `GET /api/calendar` 和调度员/司机月历，不新建日历表。
2. 实现订单附件与电子票上传：先本地存储接口，配置可切换到 S3，不提前创建正式 AWS 资源。
3. 如需清理，可删除首次测试失败留下的订单 `TL-20261023-925877`；迁移保留的 `TL-20261112-DEC8D5` 建议继续留作样本。

当前本地服务：

- API：`http://localhost:5168`
- 前端：`http://localhost:5173`
- PostgreSQL：`localhost:5432` / 库 `trailink`
