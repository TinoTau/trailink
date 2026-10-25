# Trailink V1 API 契约

版本：V1 MVP 第一阶段  
日期：2026-10-23

统一前缀：`/api`  
统一使用 JSON。  
错误响应采用 ASP.NET Core ProblemDetails。  
除 `/api/health`、`/api/auth/register`、`/api/auth/login` 和 `/openapi/v1.json` 外，接口需要登录 Cookie `trailink.auth`。前端 API transport types 由该 OpenAPI 文档生成到 `frontend/src/api/generated/`，不手写第二套 DTO。

---

## 0. Auth / Company API

```http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/avatar
GET  /api/auth/avatar
PUT  /api/auth/assigned-color
PUT  /api/auth/name
PUT  /api/auth/username
PUT  /api/auth/password
PUT  /api/auth/contact
GET  /api/companies?name=
POST /api/companies/applications
GET  /api/company?companyId=
PUT  /api/company
POST /api/company/qr
GET  /api/company/{companyId}/qr
POST /api/company/applications/{applicationId}/approve
DELETE /api/company/dispatchers/{userId}
PUT  /api/company/dispatchers/{userId}/notes
GET  /api/dispatchers?name=
POST /api/dispatchers/applications
GET  /api/dispatchers/applications
POST /api/dispatchers/applications/{applicationId}/approve
```

注册：

```json
{
  "username": "driver1",
  "password": "Passw0rd!",
  "name": "张师傅",
  "accountType": "driver"
}
```

公司注册另传 `"accountType": "company"` 和 `companyName`。成功后写入登录 Cookie。

`accountType` 只能是 `driver` 或 `company`。调度员不能直接注册，须由司导申请、公司批准。

`GET /api/auth/me` 返回角色、所属公司列表、本人 `driverId`、`hasAvatar`、`assignedColor`、待批准的调度员申请，以及待批准的司导申请。角色以数据库为准。一人可属于多家公司。公司与调度员若还没有司机身份，登录或 `me` 时会补一条 `drivers` 记录，与司导共用行程日历。`assignedColor` 是当前用户自己的已分配颜色，写在 `users.assigned_color`，未选过时为默认浅绿。`PUT /api/auth/assigned-color` 只改自己这一条，必须是调度台提供的色板之一；其他人读不到、也改不了。`PUT /api/auth/name` 改当前用户 `users.name`，1 到 100 字。若已有本人 `driver_id`，同时把对应 `drivers.name` 写成同一姓名。`PUT /api/auth/username` 只改当前用户 `users.username`，3 到 50 个字符，忽略大小写后不能与其他人重复，改完仍保持登录。`PUT /api/auth/password` 须提交当前密码和新密码，新密码至少 8 位；当前密码不对时不修改，改完仍保持登录。`PUT /api/auth/contact` 改当前用户 `users.contact`，可空，最长 200 字，清空即删除。`GET /api/auth/me` 带回这条联系方式。公司信息的调度员名单在姓名后显示 `dispatchers[].contact`，不是登录用户名。`GET /api/drivers` 不是全员名册。调度员只看到向自己申请、且已批准的司导；待批准的人只出现在申请列表。公司账户只看到本公司 `company_members.role=driver` 的司导，看不到别的公司，也看不到调度员账号自带的司导档案。司导只看到自己。已绑定账号的司导优先返回 `users.name`，避免改名后调度台卡片仍显示旧档案名。未绑定账号的司导档案仍读 `drivers.name`，不出现在这三份名单里。

`POST /api/auth/avatar` 上传本人头像，`GET /api/auth/avatar` 读取。只接受 8MB 以内的 jpg / png / webp。服务端缩小到最长边 256 并压成 JPEG 后再写入 `App_Data/files/avatars/`，`users.avatar_path` 存相对路径。覆盖上传时删除该用户旧头像（含不同扩展名）。读取带 `Cache-Control: private, max-age=86400`。

`GET /api/companies?name=` 需登录，按名称模糊查找，最多 20 条。司导和调度员都可以申请成为某家公司的调度员。已经是该公司司导成员的仍可申请升为调度员；已经是调度员则不能再申请。`GET /api/dispatchers?name=` 只用于按姓名查找并提交申请，不是公司或调度台的人员名单。司导和调度员可以申请成为某位调度员的司导；即使已经属于同一家公司，仍要向这位调度员单独申请。批准后保留这条关系，并写入该调度员所在公司的 `company_members`，`role=driver`。调度员在个人信息页只看到待批准申请；批准前调度台看不到这位司导，另一位调度员也不会因为同公司就看到。`GET /api/company` 返回可查看的公司列表和当前公司桌面，多家公司用同一下拉切换，选项文字是 `companies[].notes`（当前用户自己的公司简称）。`desk.name` 是公司全名。能看到的公司包括自己所属的，以及接过订单的：创建过、被指派为调度、派过行程日，或行程日 `driver_id` 是自己。桌面含公司全名、负责人、联系方式、二维码、本人公司简称，以及订单缩略。缩略不展示系统订单号：有公司订单号用公司订单号，否则司导用司导备注、调度员和公司账户用自己的订单备注。图标再显示起始日期和天数。点开后每个行程日先展示该日活动内容，多个活动用 `-` 连接，活动后再展示当天司导姓名（`itinerary_days.driver_id`）。没派司导时前端写未分配。活动输入不放占位文字，弹框不再另写一行公司订单号；公司、调度员、司导都改 `order_activities.content`，不另存一份。公司账户只看本公司已派完、且最后一天早于今天的历史单。司导看自己当前跑着的单，调度员看自己当前跑着的和自己当前分配的单（行程日 `assigned_by_user_id` 是自己）；已结束（最后一天早于今天）和尚未结束的都在内。只创建或只被指派为调度、但没有自己跑或分配的单不出现。分配改掉后，当前行程日不再属于自己，这张单就不再出现。与公司建立联系后若还没有简称，写入公司账户已保存的简称；公司还没有简称时，写入公司名前两个字。用户可再改自己的，不会改掉公司的简称，公司之后再改也不会覆盖已经写好的个人简称。清空个人简称则回到公司当前保存的简称。公司账户可 `PUT /api/company` 修改公司全名和联系方式，上传二维码，并批准或移除调度员。名称 1 到 200 字，不能与其他公司重复；请求不带 `name` 时不改名称，不带 `contact` 时不改联系方式。已有公司简称不随全名改写。`canManage`、申请列表和调度员名单只给公司账户；调度员和司导读同一接口时这三项为空。`GET /api/company` 的 `dispatchers[].notes` 是当前公司账户给该调度员写的备注，落在 `dispatcher_notes`，调度员读同一接口看不到这些人。`PUT /api/company/dispatchers/{userId}/notes` 只给本公司调度员写这条备注，清空即删除自己这一行。二维码走同一套本地存储，写入 `App_Data/files/qr/`，`companies.qr_path` 存相对路径；旧的 `company-qr/` 路径仍可读取。`POST /api/orders` 可带 `companyId`，写入当前公司。调度台「所有订单」在前端排除历史单，仍读 `GET /api/orders`。

---

## 1. Drivers API

```http
GET    /api/drivers
GET    /api/drivers/{id}
POST   /api/drivers
PUT    /api/drivers/{id}
PUT    /api/drivers/{id}/notes
DELETE /api/drivers/{id}
```

创建 / 档案更新请求：

```json
{
  "name": "张师傅",
  "phone": "0210000000"
}
```

备注请求：

```json
{ "notes": "基督城常驻" }
```

`PUT /api/drivers/{id}/notes` 是 `driver_notes` 的唯一写入口；备注只属于当前登录用户，其他人读取同一司导时看不到。清空备注即删除自己这一行。`PUT /api/drivers/{id}` 只改司导档案的姓名和电话；已绑定登录账号时不覆盖其 `users.name`。已绑定账号的司导，`contact` 读该用户自己填写的 `users.contact`，不读 `drivers.phone`。调度台司导详情用这一条。

---

## 2. Orders API

```http
GET    /api/orders
GET    /api/orders/{id}
POST   /api/orders
PUT    /api/orders/{id}
DELETE /api/orders/{id}
PUT    /api/orders/{orderId}/dispatcher
```

支持简单查询参数：

```http
GET /api/orders?startDate=2026-11-01&endDate=2026-11-30
```

创建 / 更新请求：

```json
{
  "platformOrderNo": "P-1001",
  "startDate": "2026-11-12",
  "guestCount": 6,
  "notes": "",
  "driverNotes": ""
}
```

`orderNo` 由后端生成，请求中指定无效。  
`platformOrderNo` 可为空。  
`startDate` 为当地日期 `YYYY-MM-DD`，不做时区换算。  
`GET /api/orders/{id}` 返回订单主体、每日行程、每日活动项目和订单截图列表。  
`GET /api/orders` 可用 `orderNo` 精确匹配系统订单号或平台订单号。没有 `orderNo` 时，调度员只看到 `assignedDispatcherUserId` 是自己的单；公司账户只看到 `companyId` 是本公司的单；司导只看到行程日 `driver_id` 是自己的单，不按结束日过滤，已结束的单仍返回，我的行程日历照常画格。
`endDate` 和 `dayCount` 由行程日期计算，只读。
`createdByUserId` / `createdByName` 为创建派出人，只读。公司信息页「自己派出」仍看它。
`companyId` / `companyName` 是订单所属公司。公司账户建单时强制写本公司，不能改绑。调度员和司导建单都不默认绑所属公司，即使只属于一家；不传 `companyId` 则保持空。调度员可指定任意已有公司。调度台点选公司后立即用同一套 `PUT /api/orders/{id}` 写入或改绑；调度员更新时明确传 `companyId: null` 表示解绑。改绑后原公司列表不再出现，新公司能看到。
`assignedDispatcherUserId` / `assignedDispatcherName` / `assignedDispatcherContact` 是公司把整单交给哪位调度员，只读摘要。联系方式读该用户的 `users.contact`。调度员建单时默认写成自己。
`DELETE /api/orders/{id}`：调度员对分给自己且已绑公司的单只做退回公司池（与 `PUT /dispatcher` 传 `null` 同一套清空），不删行；未绑公司则真正删除该单和附件。公司账户删除订单和附件。司导 403。只能处理分给自己的单。
行程日另有 `assignedByUserId` / `assignedByName` / `assignedByContact`：当前是谁把这天派给司导，联系方式读该用户的 `users.contact`。我的行程点开某一天，在公司订单号下面显示这位调度员的姓名和联系方式。调度台司导日历和我的行程日期框优先用它显示姓名；没有时回退 `createdByName`。我的行程在订单已绑公司时，把公司名称和这位调度员的姓名连在一起；连起来超过 6 个字，且当前用户给这家公司写了缩写，则显示「缩写-调度员姓名」。缩写是 `companyNote`，来自 `company_notes`，只当前用户自己看得到。调度台仅自己分配的日期显示姓名并可拖回取消。列表和详情的行程日都带 `driverId` / `driverName`；公司在派给调度点开订单日历时，日期按有没有司导着色，标注司导姓。
`notes` 为当前登录用户自己的备注，落在 `order_notes`，其他人读同一单看不到。公司、调度员各写各的；司导身份读取时 `notes` 恒为 null，也看不到公司或调度备注。司导写入不能改这条。`driverNotes` 仍是司导备注，写在 `orders.driver_notes`。调度台只改调度员自己的 `notes`，派给调度里公司改自己的 `notes`，我的行程只改 `driverNotes`，共用 `PUT /api/orders/{id}`。司导提交的公司订单号被忽略，原值保留。

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
`driverId` 可以为 `null`，表示取消分配。调度员或公司账户把已派日期置空时，仅该日 `assignedByUserId`（旧数据回退订单 `createdByUserId`）是本人，或该日 `driverId` 就是本人司导身份，才允许；否则 403。司导取消自己名下行程不受此限。派单成功时写入 `assignedByUserId`。
`failOnConflict` 仅更新接口使用，默认 `false`：冲突只进 `warnings`，仍保存。调度台按天拖拽传 `true`：该司机当日已被其他订单占用时返回 409，不保存。  
已绑定公司的真实订单派给司导时，不把该司导自己创建且未绑公司的占位单算作冲突；重叠的占位单整单删除，即使天数与真实订单不一致。未绑定公司的调度员自建单不能覆盖占位单，仍按普通冲突处理。  
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
`driverId` 可以为 `null`，表示取消整单分配。调度员或公司账户整单解绑时，仅各天 `assignedByUserId`（旧数据回退 `createdByUserId`）都是本人，或全部已派日期都属于本人司导身份，才允许；否则 403。司导取消自己名下行程不受此限。派单成功时各天写入 `assignedByUserId`。司导用本人 `driverId` 领取已分给调度员的订单时，`assignedByUserId` 写成该订单的 `assignedDispatcherUserId`，调度台按自己分配的单解除绑定。
`failOnConflict` 默认为 `false`：冲突只进 `warnings`，仍保存。调度台拖拽传 `true`：存在其他订单同日占用该司机时返回 409，不保存。  
已绑定 `companyId` 的真实订单整单派给司导时，覆盖并删除该司导自己创建、未绑公司、且日期有重叠的占位单；天数不符也整单删除。未绑定公司的订单不能这样做。  
公司账户，或该公司 `company_members.role=dispatcher` 的调度员，把这家公司的订单派给已有账号的司导时，若司导还不是该公司成员，写入 `company_members`，`role=driver`。整单派发和单日派发都写这一行。司导领取已分给该调度员的公司订单同样写入。已有成员行（含调度员）不改角色，也不另建批准步骤。未绑定公司的订单、派出人不是该公司或其调度员、以及没有账号的司导档案，都不写成员。

订单列表摘要增加：
- `assignedDayCount`：已绑定司机的行程日数量
- `days`：精简行程日（含 `id`、`serviceDate`、`description`、`endLocation`、`driverId`，不含活动）

不提供额外的司导派单记录接口。拆单只改各行程日的 `driverId`。

公司把整单交给调度员：

```http
PUT /api/orders/{orderId}/dispatcher
```

```json
{
  "dispatcherUserId": "UUID"
}
```

分给调度员只改 `orders.assigned_dispatcher_user_id`，不拆天。同一时间只能有一个调度员；再分配即覆盖。`dispatcherUserId` 为 `null` 表示整单收回公司池：同时清空各行程日 `driver_id` / `assigned_by_user_id`，司导日历上这单会消失。再分给调度员后从没有司导开始。仅公司账户可写，且目标必须是本公司 `company_members.role=dispatcher`。不是第二套订单 CRUD。

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
  "checkinTime": "2026-11-13T08:30:00"
}
```

必须验证活动属于指定行程日，且该行程日属于指定订单。  
`bookingTime` / `checkinTime` 为当地日期时间 `YYYY-MM-DDTHH:mm:ss`，读写保持原值。  
包含 `Z` 或显式时区偏移的输入返回 400，不得静默转换。  
活动写接口不接受 `ticketPath`；电子票只能走下方文件上传接口。
活动列表按 `sortOrder` 返回，不按预订时间排序。新建活动排到当天末尾。

```http
PUT /api/orders/{orderId}/days/{dayId}/activities/reorder
```

```json
{ "activityIds": ["活动ID1", "活动ID2"] }
```

必须正好包含当天全部活动且不重复，否则 400。顺序写入 `order_activities.sort_order`。

---

## 6. 司机日历写入

司机日历页面读 `GET /api/orders`，按登录用户 `driverId` 过滤行程日。调度台另读 `GET /api/drivers` 做派单。不提供 `GET /api/driver-calendar/preview` 或 `GET /api/calendar`。

司机日历写操作复用同一套 `orders` / `itinerary_days`，不另建表。页面上的领取走 `PUT /api/orders/{orderId}/driver`，框选建单走前端共用的 `createOrderWithDays`（内部仍是 `POST /api/orders` 与 `POST /api/orders/{orderId}/days`），取消只把当前司导的行程日 `driverId` 置空。调度台「创建订单」走同一套函数，行程日不传 `driverId`。不提供 `POST /api/driver-calendar/claim`、`/range`。请求不得把 `driverId` 当作登录身份。司导分配只写 `itinerary_days.driver_id`。公司把整单交给调度员另写 `orders.assigned_dispatcher_user_id`，不另建订单表。

当日行程编辑、电子票、领取和取消走现有：

```http
PUT  /api/orders/{orderId}/days/{dayId}
POST /api/orders/{orderId}/days/{dayId}/activities
POST /api/orders/{orderId}/days/{dayId}/activities/{activityId}/ticket
GET  /api/orders/{orderId}/days/{dayId}/activities/{activityId}/ticket
DELETE /api/orders/{orderId}/days/{dayId}/activities/{activityId}/ticket
PUT  /api/orders/{orderId}/driver
```

领取整单时调用 `PUT /api/orders/{orderId}/driver`，与调度台派单共用 `OrderDriverAssignment`。已绑定公司的真实订单领取成功时，同样覆盖并删除该司导自建、未绑公司、日期有重叠的占位单，天数不符也整单删除，不报「当日已有行程」。未绑定公司的订单领取仍按普通冲突处理。订单已经分给调度员时，领取把各天分配人记成该调度员，调度台可以解除这次绑定。取消当前司导在该单上的日期时，对该司导名下的每一天 `PUT` `driverId: null`，不覆盖其他司导的行程日，也不看出是谁派的。调度台从司导日历拖一天到订单区：拆单（多司导、多分配人、或未派完）只清空当天，未拆单则整单 `driverId: null`。整单解绑要求这些已派天都是当前用户派出的。不另建取消接口。
调度台订单卡片和司导点日期展开的订单信息都走 `PUT /api/orders/{id}` 与共用的 `updateOrderInfo` / `OrderInfoFields`。调度台写入 `notes`，我的行程写入 `driverNotes`，互不可见。我的行程不改公司订单号；司导即使在请求里带上公司订单号，也保持原值。`DELETE /api/orders/{id}` 按角色分叉：调度员把已绑公司、分给自己的单退回公司池（清空 `assigned_dispatcher_user_id` 和各行程日 `driver_id` / `assigned_by_user_id`，与公司 `PUT /dispatcher` 传 `null` 同一套收回）；未绑公司则真正删除该单和附件。公司账户删除订单和附件。司导 403。点某一天编辑行程复用现有活动接口，与司导日历同一套 `DriverDayEditor`。不另建退回接口。

电子票上传写入 `App_Data/files/tickets/`，`order_activities.ticket_path` 存相对路径。活动内容更新不再改写 `ticketPath`。只接受 8MB 以内的 jpg / png / webp / pdf。

---

## 7. Order Files API

```http
GET    /api/orders/{orderId}/files
POST   /api/orders/{orderId}/files
GET    /api/orders/{orderId}/files/{fileId}
DELETE /api/orders/{orderId}/files/{fileId}
```

上传采用 `multipart/form-data`，字段名 `file`。订单截图写入 `App_Data/files/orders/`，`order_files` 存文件名和相对路径。只接受 8MB 以内的 jpg / png / webp。四种上传（二维码、头像、电子票、订单截图）共用 `AppFileStore`，不另开存储路径。

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

司机同一天已有其他行程时，派单接口可在响应中返回冲突提示信息，但不阻止保存。提示里写公司订单号；没有公司订单号时，司导看到司导备注，其他人看到自己的订单备注。不写系统订单号。  
例外：已绑定公司的真实订单覆盖司导自建且未绑公司的占位单时不报冲突，并删除该占位单。

---

## 9. 本阶段记录的假设

1. API 使用 camelCase JSON。
2. 登录使用 Cookie，角色为公司、调度员、司导。不实现 JWT 刷新或权限矩阵。
3. 订单详情一次返回行程和活动，减少前端往返。
4. 司机日历预览按当地日期闭区间查询；司导页面以登录 `driverId` 为准。
