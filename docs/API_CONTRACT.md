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
PUT  /api/company/dispatchers/{userId}/hidden
GET  /api/company/dispatchers/{userId}/avatar
GET  /api/dispatchers?name=
POST /api/dispatchers/applications
GET  /api/dispatchers/applications
POST /api/dispatchers/applications/{applicationId}/approve
DELETE /api/dispatchers/drivers/{driverId}
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

`GET /api/auth/me` 返回角色、所属公司列表、本人 `driverId`、`hasAvatar`、`assignedColor`、待批准的调度员申请，以及待批准的司导申请。角色以数据库为准。一人可属于多家公司。公司与调度员若还没有司机身份，登录或 `me` 时会补一条 `drivers` 记录，与司导共用行程日历。注册时另写一条已批准的 `driver_applications`，申请人和批准人都是本人；已有账号在登录或 `me` 时补上这一行。公司和调度员因此一开始就能把自己当成司导派单。普通司导没有调度台。公司账户注册时再给自己写一条 `company_members.role=dispatcher`，账号角色仍是公司；已有公司账号在登录或 `me` 时补上。这样公司打开派给调度就能把单交给自己。司导和调度员账号没有所属公司，不写这一行。对外的申请接口仍拒绝向自己申请。`assignedColor` 是当前用户自己的已分配颜色，写在 `users.assigned_color`，未选过时为默认浅绿。`PUT /api/auth/assigned-color` 只改自己这一条，必须是调度台提供的色板之一；其他人读不到、也改不了。`PUT /api/auth/name` 改当前用户 `users.name`，1 到 100 字。若已有本人 `driver_id`，同时把对应 `drivers.name` 写成同一姓名。`PUT /api/auth/username` 只改当前用户 `users.username`，3 到 50 个字符，忽略大小写后不能与其他人重复，改完仍保持登录。`PUT /api/auth/password` 须提交当前密码和新密码，新密码至少 8 位；当前密码不对时不修改，改完仍保持登录。`PUT /api/auth/contact` 改当前用户 `users.contact`，可空，最长 200 字，清空即删除。`GET /api/auth/me` 带回这条联系方式。公司信息的待批准申请和调度员名单在姓名后显示 `users.contact`，没有联系方式时前端写「暂未填写」，不显示登录用户名。`GET /api/drivers` 不是全员名册。调度员只看到向自己申请、且已批准的司导；待批准的人只出现在申请列表。公司账户只看到向本公司账户申请、且已批准的司导；调度员名下的司导，以及只因派单写入 `company_members` 的司导，不会出现在公司调度台。没有 `driver_notes` 行时 `hidden` 为 false，调度台默认显示。隐藏只读这一列，不读浏览器。司导只看到自己。已绑定账号的司导优先返回 `users.name`，避免改名后调度台卡片仍显示旧档案名。未绑定账号的司导档案仍读 `drivers.name`，不出现在这三份名单里。

`POST /api/auth/avatar` 上传本人头像，`GET /api/auth/avatar` 读取。只接受 8MB 以内的 jpg / png / webp。服务端缩小到最长边 256 并压成 JPEG 后再写入 `App_Data/files/avatars/`，`users.avatar_path` 存相对路径。覆盖上传时删除该用户旧头像（含不同扩展名）。本人读取带 `Cache-Control: private, max-age=86400`。调度台和派给调度显示的是同一张头像，不另存文件。`GET /api/drivers` 与 `GET /api/drivers/{id}` 增加 `hasAvatar`，已绑定账号且 `avatar_path` 非空时为 true。`GET /api/drivers/{id}/avatar` 只给能在司导名单里看到这位司导的登录用户读取，其他人与没有头像都是 404。`GET /api/company` 的 `dispatchers[].hasAvatar` 同样表示该调度员是否上传过头像。`GET /api/company/dispatchers/{userId}/avatar` 只给本公司账户读取已列入本公司调度员名单的人；非公司账户 403，不是本公司调度员或没有头像为 404。这两处读取带 `Cache-Control: private, no-cache`，换头像后下次打开页面即可看到新图。

`GET /api/companies?name=` 需登录，按名称模糊查找，最多 20 条。司导和调度员都可以申请成为某家公司的调度员。已经是该公司司导成员的仍可申请升为调度员；已经是调度员则不能再申请。`GET /api/dispatchers?name=` 只用于按姓名查找并提交申请，不是公司或调度台的人员名单。可以搜到调度员，也可以搜到公司账户。司导和调度员可以向某位调度员或某个公司账户申请成为司导；即使已经属于同一家公司，仍要单独申请。向调度员申请并批准后，关系留在 `driver_applications`，并写入该调度员所在公司的 `company_members`，`role=driver`，司导资源跟着调度员进公司，公司账户的调度台不因此列出。向公司账户申请并批准后，同一张表的 `dispatcher_user_id` 指向公司账户，公司调度台只看这一行。公司和调度员都在个人信息页看到待批准申请，每行是申请人姓名和其 `users.contact`，没有联系方式时前端写「暂未填写」，不显示登录用户名。`DELETE /api/dispatchers/drivers/{driverId}` 删除当前调度员与这位司导已批准的 `driver_applications` 行，不能删除自己这一行。同时收回未完成订单里分给这位司导、且由该调度员派出或挂在该调度员名下的日期：这些行程日清空 `driver_id`，有几天清几天，不删订单。最后一天早于今天的订单不动。不删司导账号，不改 `company_members`。对方可以重新申请。批准前调度台看不到这位司导，另一位调度员也不会因为同公司就看到。`GET /api/company` 返回可查看的公司列表和当前公司桌面，多家公司用同一下拉切换，选项文字是 `companies[].notes`（当前用户自己的公司简称）。`desk.name` 是公司全名。能看到的公司包括自己所属的，以及接过订单的：创建过、被指派为调度、派过行程日，或行程日 `driver_id` 是自己。桌面含公司全名、负责人、联系方式、公司头像、本人公司简称，以及订单缩略。缩略不展示系统订单号：有公司订单号用公司订单号，否则用共用备注。图标再显示起始日期和天数。点开后每个行程日先展示该日活动内容，多个活动用 `-` 连接，活动后再展示当天司导姓名（`itinerary_days.driver_id`）。没派司导时前端写未分配。活动输入不放占位文字，弹框不再另写一行公司订单号；公司、调度员、司导都改 `order_activities.content`，不另存一份。公司账户只看本公司已派完、且最后一天早于今天的历史单。司导看自己当前跑着的单，调度员看自己当前跑着的和自己当前分配的单（行程日 `assigned_by_user_id` 是自己）；已结束（最后一天早于今天）和尚未结束的都在内。只创建或只被指派为调度、但没有自己跑或分配的单不出现。分配改掉后，当前行程日不再属于自己，这张单就不再出现。与公司建立联系后若还没有简称，写入公司账户已保存的简称；公司还没有简称时，写入公司名前两个字。用户可再改自己的，不会改掉公司的简称，公司之后再改也不会覆盖已经写好的个人简称。清空个人简称则回到公司当前保存的简称。公司账户可 `PUT /api/company` 修改公司全名和联系方式，上传公司头像，并批准或移除调度员。名称 1 到 200 字，不能与其他公司重复；请求不带 `name` 时不改名称，不带 `contact` 时不改联系方式。已有公司简称不随全名改写。`canManage`、申请列表和调度员名单只给公司账户；调度员和司导读同一接口时这三项为空。`GET /api/company` 的 `dispatchers[].notes` 是当前公司账户给该调度员写的备注，落在 `dispatcher_notes`，调度员读同一接口看不到这些人。`PUT /api/company/dispatchers/{userId}/notes` 只给本公司调度员写这条备注，清空备注且未隐藏则删除自己这一行。`PUT /api/company/dispatchers/{userId}/hidden` 只给本公司调度员写 `dispatcher_notes.hidden`，没有这一行时视为显示。`DELETE /api/company/dispatchers/{userId}` 不能删除公司账户自己。删掉别人时，未完成且分给他的本公司订单清空 `assigned_dispatcher_user_id`，并清空各行程日司导；最后一天早于今天的订单保留。公司头像走同一套本地存储，写入 `App_Data/files/qr/`，`companies.qr_path` 存相对路径；旧的 `company-qr/` 路径仍可读取。`POST /api/orders` 可带 `companyId`，写入当前公司。调度台「所有订单」在前端排除历史单，仍读 `GET /api/orders`。

---

## 1. Drivers API

```http
GET    /api/drivers
GET    /api/drivers/{id}
GET    /api/drivers/{id}/avatar
POST   /api/drivers
PUT    /api/drivers/{id}
PUT    /api/drivers/{id}/notes
PUT    /api/drivers/{id}/hidden
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

`PUT /api/drivers/{id}/notes` 只改当前用户自己的备注，其他人读不到。清空备注且未隐藏时删除这一行；已经隐藏时保留空备注。`PUT /api/drivers/{id}/hidden` 只改同一行的 `hidden`。调度台隐藏和恢复走这一条，不另建表。`PUT /api/drivers/{id}` 只改司导档案的姓名和电话；已绑定登录账号时不覆盖其 `users.name`。已绑定账号的司导，`contact` 读该用户自己填写的 `users.contact`，不读 `drivers.phone`。调度台司导详情用这一条。`hasAvatar` 表示该账号是否有头像。`GET /api/drivers/{id}/avatar` 打开 `users.avatar_path` 指向的同一文件。驾照正反面写 `driver_license_photos`，`side` 为 0（正面）或 1（反面），同一用户同一面唯一。只有带 `driver_id` 的账号可以上传。文件在 `App_Data/files/licenses/`，jpg、png、webp，单张 8MB。`GET/POST /api/auth/license-photos` 管理本人照片，`POST` 带查询 `side`。`PUT/DELETE /api/auth/license-photos/{photoId}` 更新或删除本人某一面。`GET /api/drivers/{driverId}/license-photos` 与 `GET /api/drivers/{driverId}/license-photos/{photoId}` 只给能在司导名单里看到这位司导的登录用户，其他人 404。上级不能改、不能删。

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
`GET /api/orders` 可用 `orderNo` 精确匹配系统订单号或平台订单号。没有 `orderNo` 时，调度员只看到 `assignedDispatcherUserId` 是自己的单；公司账户只看到 `companyId` 是本公司的单；司导只看到行程日 `driver_id` 是自己的单，不按结束日过滤，已结束的单仍返回，我的行程日历照常画格。另可用 `driverId`：公司和调度员只能查自己调度台上已批准的司导，返回这位司导的全部订单，不限所属公司，也不限是否分给自己。查不到这位司导时返回空列表。订单区不带 `driverId`，范围不变。别人的单不带回公司名、公司订单号、调度员姓名、备注、司导备注、游客人数、附件、行程说明和联系方式，只留下日期，用来表示这天已有行程。自己派出的日期仍带回本人姓名。
`endDate` 和 `dayCount` 由行程日期计算，只读。
`createdByUserId` / `createdByName` 为创建派出人，只读。公司信息页「自己派出」仍看它。
`companyId` / `companyName` 是订单所属公司。公司账户建单时强制写本公司，不能改绑。调度员和司导建单都不默认绑所属公司，即使只属于一家；不传 `companyId` 则保持空。调度员可指定任意已有公司。调度台点选公司后立即用同一套 `PUT /api/orders/{id}` 写入或改绑；调度员更新时明确传 `companyId: null` 表示解绑。改绑后原公司列表不再出现，新公司能看到。
`assignedDispatcherUserId` / `assignedDispatcherName` / `assignedDispatcherContact` 是公司把整单交给哪位调度员，只读摘要。联系方式读该用户的 `users.contact`。调度员建单时默认写成自己。
`DELETE /api/orders/{id}`：调度员对分给自己且已绑公司的单只做退回公司池（与 `PUT /dispatcher` 传 `null` 同一套清空），不删行；未绑公司则真正删除该单和附件。公司账户删除订单和附件。司导 403。只能处理分给自己的单。
行程日另有 `assignedByUserId` / `assignedByName` / `assignedByContact`：当前是谁把这天派给司导，联系方式读该用户的 `users.contact`。我的行程点开某一天，在公司订单号下面显示这位调度员的姓名和联系方式。调度台司导日历和我的行程日期框优先用它，没有时回退 `createdByName`。我的行程在订单已绑公司时，把公司名称和这位调度员的姓名连在一起；连起来超过 6 个字，且当前用户给这家公司写了缩写，则显示「缩写-调度员姓名」。缩写是 `companyNote`，来自 `company_notes`，只当前用户自己看得到。调度台点开司导时画出他的全部行程，包括已完成和进行中已过的日期，不限本公司；自己分配的日期用这一套同样的文字并可拖回取消；其他人的日期只着色，不写公司名或调度员姓名。列表和详情的行程日都带 `driverId` / `driverName`；公司在派给调度点开订单日历时，日期按有没有司导着色，标注司导姓。
`notes` 为当前登录用户自己的备注，落在 `order_notes`，其他人读同一单看不到。公司、调度员各写各的；司导身份读取时 `notes` 恒为 null，也看不到公司或调度备注。司导写入不能改这条。`driverNotes` 仍是司导备注，写在 `orders.driver_notes`。调度台只改调度员自己的 `notes`，派给调度里公司改自己的 `notes`，我的行程只改 `driverNotes`，共用 `PUT /api/orders/{id}`。司导提交的公司订单号被忽略，原值保留。`sharedNotes` 写在 `orders.shared_notes`，公司、调度员、司导都能读写，不按人拆开。别人的行程在司导日历里仍不带回这条，和各自备注一样隐藏。

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
`failOnConflict` 仅更新接口使用，默认 `false`：冲突只进 `warnings`，仍保存。调度台按天拖拽不传 `true`，重叠日期仍保存，由日历标红。传 `true` 时该司机当日已被其他订单占用则返回 409，不保存。  
已绑定公司的真实订单派给司导时，不把该司导自己创建且未绑公司的占位单算作冲突；重叠的占位单整单删除，即使天数与真实订单不一致。未绑定公司的调度员自建单不能覆盖占位单，仍按普通冲突处理。  
`serviceDate` 为当地日期 `YYYY-MM-DD`，不做时区换算。  
`endLocation` 是当天住宿位置。常用地点由当日详情点选后写入全名，其他地点写入用户输入的文字。再点已选按钮时写入空值。日历展示这个字段的第一个字。`driverId` 与原来相同才只改地点和描述，不改派单人。不在本调度台范围内的订单，这个字段只返回第一个字。  
同一订单不同行程日可以绑定不同司机，不另建订单。

绑定车辆：

```http
PUT /api/orders/{orderId}/days/{dayId}/vehicle
```

```json
{ "vehicleId": "UUID 或 null", "onlyDay": false }
```

登录用户即可读写自己的车，不按角色拒绝。司导没有调度台，所以没有入口。这一天必须已有司导，且分配人（`assignedByUserId`，旧数据回退订单 `createdByUserId`）是当前用户。车辆必须属于当前用户。`vehicleId` 有值时：整单写入这张订单里还没有车、且由当前用户分配的行程日；拆单只写入当前司导这一段里还没有车的日期。这些日期都已经有车时返回 400，不写入。`vehicleId` 为 null 时解除绑定：`onlyDay` 为 false 解除这张订单里当前用户分配且已有车的日期，为 true 只解除这一天。不改 `driverId`。返回 `{ orderId, vehicleId, dayIds }`。别人的车返回 404。不是新的派单表。

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
`failOnConflict` 默认为 `false`：冲突只进 `warnings`，仍保存。调度台整单拖拽不传 `true`，重叠日期仍保存。传 `true` 时存在其他订单同日占用该司机则返回 409，不保存。  
已绑定 `companyId` 的真实订单整单派给司导时，覆盖并删除该司导自己创建、未绑公司、且日期有重叠的占位单；天数不符也整单删除。未绑定公司的订单不能这样做。  
公司账户，或该公司 `company_members.role=dispatcher` 的调度员，把这家公司的订单派给已有账号的司导时，若司导还不是该公司成员，写入 `company_members`，`role=driver`。整单派发和单日派发都写这一行。司导领取已分给该调度员的公司订单同样写入。已有成员行（含调度员）不改角色，也不另建批准步骤。未绑定公司的订单、派出人不是该公司或其调度员、以及没有账号的司导档案，都不写成员。

订单列表摘要增加：
- `assignedDayCount`：已绑定司机的行程日数量
- `days`：精简行程日（含 `id`、`serviceDate`、`description`、`endLocation`、`driverId`，不含活动）

不提供额外的司导派单记录接口。拆单只改各行程日的 `driverId`。行程日读取带上 `vehicleId`，以及这辆车的 `vehiclePlate`、`vehicleInfo`（型号，即 `vehicles.info`）、`vehicleSharedNotes`。这三项来自 `vehicles`，不另存。没有绑定车辆时这三项为空。

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

司机日历写操作复用同一套 `orders` / `itinerary_days`，不另建表。页面上的领取走 `PUT /api/orders/{orderId}/driver`，框选建单走前端共用的 `createOrderWithDays`（内部仍是 `POST /api/orders` 与 `POST /api/orders/{orderId}/days`），取消只把当前司导的行程日 `driverId` 置空。调度台「创建订单」走同一套函数，行程日不传 `driverId`。一次最多三个月，结束日不超过开始日三个月后的同一天。不提供 `POST /api/driver-calendar/claim`、`/range`。请求不得把 `driverId` 当作登录身份。司导分配只写 `itinerary_days.driver_id`。公司把整单交给调度员另写 `orders.assigned_dispatcher_user_id`，不另建订单表。

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

电子票上传写入 `App_Data/files/tickets/`，`order_activities.ticket_path` 存相对路径。活动内容更新不再改写 `ticketPath`。只接受 8MB 以内的 jpg / png / webp / pdf。订单最后一天起满 7 天后删除电子票文件并清空 `ticketPath`，活动内容仍在。

---

## 7. Order Files API

```http
GET    /api/orders/{orderId}/files
POST   /api/orders/{orderId}/files
GET    /api/orders/{orderId}/files/{fileId}
DELETE /api/orders/{orderId}/files/{fileId}
```

上传采用 `multipart/form-data`，字段名 `file`。订单截图写入 `App_Data/files/orders/`，`order_files` 存文件名和相对路径。只接受 8MB 以内的 jpg / png / webp。公司头像、用户头像、电子票、订单截图、车辆照片和驾照照片共用 `AppFileStore`。车辆照片在 `App_Data/files/vehicles/`，驾照在 `App_Data/files/licenses/`。订单最后一天起满 7 天后删除该单截图的文件和 `order_files` 行。用户头像、公司头像、车辆照片和驾照照片不按这个规则删。

---

## 7b. Vehicles API

登录即可调用，公司账户、调度员、司导各自只看到自己的车。列表与 `GET /api/orders` 分开，车辆失败不影响订单列表。`available` 区分可用和全部，不另做第二套列表。

```http
GET    /api/vehicles
POST   /api/vehicles
PUT    /api/vehicles/{id}
DELETE /api/vehicles/{id}
POST   /api/vehicles/{id}/photos
PUT    /api/vehicles/{id}/photos/{photoId}
DELETE /api/vehicles/{id}/photos/{photoId}
GET    /api/vehicles/{id}/photos/{photoId}
```

写入：`plate`（去空白，最多 20 字，同一用户不可重复）、`sharedNotes`、`info`、`available`。`available` 为 false 表示停用，行仍在，只是不出现在可用车辆。`DELETE` 删除这辆车的照片文件和记录，行程日 `vehicle_id` 置空。照片最多 3 张，jpg / png / webp，8MB，字段名 `file`。调度台发送前把照片压成 jpg，最长边 1600，不上传原图。接口仍接受 jpg、png、webp。第四张返回 400。替换用 `PUT` 并保持原排序。未登录 401，不是自己的车 404。

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

司机同一天已有其他行程时，派单接口可在响应中返回冲突提示信息，但不阻止保存。提示里写公司订单号；没有公司订单号时写共用备注。不写系统订单号。  
例外：已绑定公司的真实订单覆盖司导自建且未绑公司的占位单时不报冲突，并删除该占位单。

---

## 9. 本阶段记录的假设

1. API 使用 camelCase JSON。
2. 登录使用 Cookie，角色为公司、调度员、司导。不实现 JWT 刷新或权限矩阵。
3. 订单详情一次返回行程和活动，减少前端往返。
4. 司机日历预览按当地日期闭区间查询；司导页面以登录 `driverId` 为准。
