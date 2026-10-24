# Trailink V1 API 契约

版本：V1 MVP 第一阶段  
日期：2026-10-23

统一前缀：`/api`  
统一使用 JSON。  
错误响应采用 ASP.NET Core ProblemDetails。

---

## 1. Drivers API

```http
GET    /api/drivers
GET    /api/drivers/{id}
POST   /api/drivers
PUT    /api/drivers/{id}
DELETE /api/drivers/{id}
```

创建 / 更新请求：

```json
{
  "name": "张师傅",
  "phone": "0210000000",
  "notes": "基督城常驻"
}
```

---

## 2. Orders API

```http
GET    /api/orders
GET    /api/orders/{id}
POST   /api/orders
PUT    /api/orders/{id}
DELETE /api/orders/{id}
```

支持简单查询参数：

```http
GET /api/orders?startDate=2026-11-01&endDate=2026-11-30
```

创建 / 更新请求：

```json
{
  "platformOrderNo": "P-1001",
  "sourceCompany": "某平台",
  "startDate": "2026-11-12",
  "guestCount": 6,
  "notes": ""
}
```

`orderNo` 由后端生成，请求中指定无效。  
`platformOrderNo` 可为空。  
`startDate` 为当地日期 `YYYY-MM-DD`，不做时区换算。  
`GET /api/orders/{id}` 返回订单主体、每日行程及每日活动项目。  
`GET /api/orders` 可用 `orderNo` 精确匹配系统订单号或平台订单号。  
`endDate` 和 `dayCount` 由行程日期计算，只读。

---

## 3. Itinerary Days API

```http
GET    /api/orders/{orderId}/days
POST   /api/orders/{orderId}/days
PUT    /api/orders/{orderId}/days/{dayId}
DELETE /api/orders/{orderId}/days/{dayId}
```

创建 / 更新请求：

```json
{
  "serviceDate": "2026-11-12",
  "description": "基督城接客，前往特卡波。",
  "endLocation": "特卡波",
  "driverId": null,
  "failOnConflict": false
}
```

按天派单直接使用更新接口修改 `driverId`。  
`driverId` 可以为 `null`，表示取消分配。  
`failOnConflict` 仅更新接口使用，默认 `false`：冲突只进 `warnings`，仍保存。调度台按天拖拽传 `true`：该司机当日已被其他订单占用时返回 409，不保存。  
`serviceDate` 为当地日期 `YYYY-MM-DD`，不做时区换算。  
同一订单不同行程日可以绑定不同司机，不另建订单。

---

## 4. Driver Assignment API

整单派单：

```http
PUT /api/orders/{orderId}/driver
```

请求：

```json
{
  "driverId": "UUID",
  "failOnConflict": false
}
```

语义：覆盖该订单所有行程日的司机。  
`driverId` 可以为 `null`，表示取消整单分配。  
`failOnConflict` 默认为 `false`：冲突只进 `warnings`，仍保存。调度台拖拽传 `true`：存在其他订单同日占用该司机时返回 409，不保存。

订单列表摘要增加：
- `assignedDriverId`：任一行程日已有司机时取第一个，全部未派则为 `null`
- `assignedDayCount`：已绑定司机的行程日数量
- `days`：精简行程日（含 `id`、`serviceDate`、`description`、`endLocation`、`driverId`，不含活动）

不提供额外的派单记录接口。拆单只改各行程日的 `driverId`。

---

## 5. Order Activities API

```http
GET    /api/orders/{orderId}/days/{dayId}/activities
POST   /api/orders/{orderId}/days/{dayId}/activities
PUT    /api/orders/{orderId}/days/{dayId}/activities/{activityId}
PUT    /api/orders/{orderId}/days/{dayId}/activities/reorder
DELETE /api/orders/{orderId}/days/{dayId}/activities/{activityId}
```

创建 / 更新请求：

```json
{
  "content": "库克山直升机",
  "provider": "某飞行公司",
  "bookingTime": "2026-11-13T09:00:00",
  "checkinTime": "2026-11-13T08:30:00",
  "ticketPath": ""
}
```

必须验证活动属于指定行程日，且该行程日属于指定订单。  
`bookingTime` / `checkinTime` 为当地日期时间 `YYYY-MM-DDTHH:mm:ss`，读写保持原值。  
包含 `Z` 或显式时区偏移的输入返回 400，不得静默转换。  
`ticketPath` 为预留字段，本阶段仅保存字符串，格式未定。  
活动列表按 `sortOrder` 返回，不按预订时间排序。新建活动排到当天末尾。

```http
PUT /api/orders/{orderId}/days/{dayId}/activities/reorder
```

```json
{ "activityIds": ["活动ID1", "活动ID2"] }
```

必须正好包含当天全部活动且不重复，否则 400。顺序写入 `order_activities.sort_order`。

---

## 6. Driver Calendar Preview API

```http
GET /api/driver-calendar/preview?startDate=2026-11-01&endDate=2026-11-30
```

只读查询现有 `itinerary_days`、`orders`、`order_activities`、`drivers`。不建日历表。

当前没有登录认证，此接口是开发预览：

- `preview` 恒为 `true`
- `identityIsolated` 恒为 `false`
- 预览司机由服务器配置 `Calendar:PreviewDriverId` 决定；未配置时取全库派单天数最多的司机；没有已分配司机时返回空日历，不展示未分配行程
- 请求中的 `driverId` 不是身份凭证，必须忽略
- 不提供 `GET /api/calendar?driverId=` 作为正式司机隔离接口
- 不返回 `ticketPath`，只返回 `hasTicket` 和 `ticketAccessible`（本阶段后者恒为 `false`）

日期范围为当地日期闭区间。活动时间仍为 `YYYY-MM-DDTHH:mm:ss`。

司机日历页面与调度台读同一套 `GET /api/orders`、`GET /api/drivers`，按 `itinerary_days.driver_id` 过滤当前查看的司导。本预览接口仍是只读投影，不作为页面主数据源。

司机日历写操作复用同一套 `orders` / `itinerary_days`，不另建表。页面上的领取走 `PUT /api/orders/{orderId}/driver`，框选建单走前端共用的 `createOrderWithDays`（内部仍是 `POST /api/orders` 与 `POST /api/orders/{orderId}/days`），取消只把当前司导的行程日 `driverId` 置空。调度台「创建订单」走同一套函数，行程日不传 `driverId`。前端不封装 `POST /api/driver-calendar/claim`、`/range` 客户端；这两条接口仍保留在后端。请求不得把 `driverId` 当作登录身份。分配状态只写 `itinerary_days.driver_id`，没有单独的订单分配状态字段。

```http
POST /api/driver-calendar/claim
```

```json
{ "orderNo": "TL-20261023-ABCDEF" }
```

按系统订单号或平台订单号找到已有订单，把它的全部行程日分配给预览司机。找不到返回 404。

```http
POST /api/driver-calendar/range
```

```json
{ "startDate": "2026-11-01", "endDate": "2026-11-03" }
```

新建订单并生成闭区间内每一天的行程日（仅日期），同时分配给预览司机。一次最多 31 天。系统订单号仍由后端生成。

当日行程编辑、电子票、领取和取消仍走现有：

```http
PUT  /api/orders/{orderId}/days/{dayId}
POST /api/orders/{orderId}/days/{dayId}/activities
PUT  /api/orders/{orderId}/driver
```

领取整单时调用 `PUT /api/orders/{orderId}/driver`。取消当前司导在该单上的日期时，对该司导名下的每一天 `PUT` `driverId: null`，不覆盖其他司导的行程日。调度台从司导日历拖一天到订单区：拆单只清空当天，未拆单则整单 `driverId: null`。不另建取消接口。
调度台订单卡片改公司订单号和备注走 `PUT /api/orders/{id}`（写入 `platformOrderNo`、`notes`，其余字段保持原值）。删除走现有 `DELETE /api/orders/{id}`，与订单列表同一套。点某一天编辑行程复用现有活动接口，与司导日历同一套 `DriverDayEditor`。不另建订单编辑接口。

`ticketPath` 只保存字符串，本阶段不提供文件上传或下载。

---

## 7. Order Files API

```http
GET    /api/orders/{orderId}/files
POST   /api/orders/{orderId}/files
DELETE /api/orders/{orderId}/files/{fileId}
```

上传采用 `multipart/form-data`。本轮尚未实现。

---

## 8. 错误与校验

使用 ProblemDetails 返回错误。

基本校验包括：

- 活动内容不能为空
- 活动时间不得包含 `Z` 或时区偏移
- 游客人数不能为负数
- 同一订单同一天不能重复创建行程
- 活动必须属于对应订单和行程日
- 删除不存在的资源返回 404

司机同一天已有其他行程时，派单接口可在响应中返回冲突提示信息，但不阻止保存。

---

## 9. 本阶段记录的假设

1. API 使用 camelCase JSON。
2. 第一阶段不实现认证。
3. 订单详情一次返回行程和活动，减少前端往返。
4. 司机日历预览按当地日期闭区间查询；正式司机隔离须等身份机制。
