# Trailink V1 API 契约

版本：V1 MVP 第一阶段  
日期：2026-10-23（2026-11-01 长段落拆成条目；订单响应新增业务判断字段）

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

- `GET /api/auth/me` 返回角色、所属公司列表、本人 `driverId`、`hasAvatar`、`assignedColor`、待批准的调度员申请，以及待批准的司导申请。
- 角色以数据库为准。
- 一人可属于多家公司。
- 公司与调度员若还没有司机身份，登录或 `me` 时会补一条 `drivers` 记录，与司导共用行程日历。
- 注册时另写一条已批准的 `driver_applications`，申请人和批准人都是本人；已有账号在登录或 `me` 时补上这一行。
- 公司和调度员因此一开始就能把自己当成司导派单。
- 普通司导没有调度台。
- 公司账户注册时再给自己写一条 `company_members.role=dispatcher`，账号角色仍是公司；已有公司账号在登录或 `me` 时补上。
- 这样公司打开派给调度就能把单交给自己。
- 司导和调度员账号没有所属公司，不写这一行。
- 对外的申请接口仍拒绝向自己申请。
- `assignedColor` 是当前用户自己的已分配颜色，写在 `users.assigned_color`，未选过时为默认浅绿。
- `PUT /api/auth/assigned-color` 只改自己这一条，必须是调度台提供的色板之一；其他人读不到、也改不了。
- `PUT /api/auth/name` 改当前用户 `users.name`，1 到 100 字。
- 若已有本人 `driver_id`，同时把对应 `drivers.name` 写成同一姓名。
- `PUT /api/auth/username` 只改当前用户 `users.username`，3 到 50 个字符，忽略大小写后不能与其他人重复，改完仍保持登录。
- `PUT /api/auth/password` 须提交当前密码和新密码，新密码至少 8 位；当前密码不对时不修改，改完仍保持登录。
- `PUT /api/auth/contact` 改当前用户 `users.contact`，可空，最长 200 字，清空即删除。
- `GET /api/auth/me` 带回这条联系方式。
- 公司信息的待批准申请和调度员名单在姓名后显示 `users.contact`，没有联系方式时前端写「暂未填写」，不显示登录用户名。
- `GET /api/drivers` 不是全员名册。
- 调度员只看到向自己申请、且已批准的司导；待批准的人只出现在申请列表。
- 公司账户只看到向本公司账户申请、且已批准的司导；调度员名下的司导，以及只因派单写入 `company_members` 的司导，不会出现在公司调度台。
- 没有 `driver_notes` 行时 `hidden` 为 false，调度台默认显示。
- 隐藏只读这一列，不读浏览器。
- 司导只看到自己。
- 已绑定账号的司导优先返回 `users.name`，避免改名后调度台卡片仍显示旧档案名。
- 未绑定账号的司导档案仍读 `drivers.name`，不出现在这三份名单里。

- `POST /api/auth/avatar` 上传本人头像，`GET /api/auth/avatar` 读取。
- 只接受 8MB 以内的 jpg / png / webp。
- 服务端缩小到最长边 256 并压成 JPEG 后再写入 `App_Data/files/avatars/`，`users.avatar_path` 存相对路径。
- 覆盖上传时删除该用户旧头像（含不同扩展名）。
- 本人读取带 `Cache-Control: private, max-age=86400`。
- 调度台和派给调度显示的是同一张头像，不另存文件。
- `GET /api/drivers` 与 `GET /api/drivers/{id}` 增加 `hasAvatar`，已绑定账号且 `avatar_path` 非空时为 true。
- `GET /api/drivers/{id}/avatar` 只给能在司导名单里看到这位司导的登录用户读取，其他人与没有头像都是 404。
- `GET /api/company` 的 `dispatchers[].hasAvatar` 同样表示该调度员是否上传过头像。
- `GET /api/company/dispatchers/{userId}/avatar` 只给本公司账户读取已列入本公司调度员名单的人；非公司账户 403，不是本公司调度员或没有头像为 404。
- 这两处读取带 `Cache-Control: private, no-cache`，换头像后下次打开页面即可看到新图。

- `GET /api/companies?name=` 需登录，按名称模糊查找，最多 20 条。
- 司导和调度员都可以申请成为某家公司的调度员。
- 已经是该公司司导成员的仍可申请升为调度员；已经是调度员则不能再申请。
- `GET /api/dispatchers?name=` 只用于按姓名查找并提交申请，不是公司或调度台的人员名单。
- 可以搜到调度员，也可以搜到公司账户。
- 司导和调度员可以向某位调度员或某个公司账户申请成为司导；即使已经属于同一家公司，仍要单独申请。
- 向调度员申请并批准后，关系留在 `driver_applications`，并写入该调度员所在公司的 `company_members`，`role=driver`，司导资源跟着调度员进公司，公司账户的调度台不因此列出。
- 向公司账户申请并批准后，同一张表的 `dispatcher_user_id` 指向公司账户，公司调度台只看这一行。
- 公司和调度员都在个人信息页看到待批准申请，每行是申请人姓名和其 `users.contact`，没有联系方式时前端写「暂未填写」，不显示登录用户名。
- `DELETE /api/dispatchers/drivers/{driverId}` 删除当前账号（调度员或公司账户，按调度台算不按角色）与这位司导已批准的 `driver_applications` 行，并收回自己派给他的未完成日期；不是自己名下的司导 404，不能删除自己这一行。
- 同时收回未完成订单里分给这位司导、且由该调度员派出或挂在该调度员名下的日期：这些行程日清空 `driver_id`，有几天清几天，不删订单。
- 最后一天早于今天的订单不动。
- 不删司导账号，不改 `company_members`。
- 对方可以重新申请。
- 批准前调度台看不到这位司导，另一位调度员也不会因为同公司就看到。
- `GET /api/company` 返回可查看的公司列表和当前公司桌面，多家公司用同一下拉切换，选项文字是 `companies[].notes`（当前用户自己的公司简称）。
- `desk.name` 是公司全名。
- 能看到的公司包括自己所属的，以及接过订单的：创建过、被指派为调度、派过行程日，或行程日 `driver_id` 是自己。
- 桌面含公司全名、负责人、联系方式、公司头像、本人公司简称，以及订单缩略。
- 缩略不展示系统订单号：有公司订单号用公司订单号，否则用共用备注。
- 图标再显示起始日期和天数。
- 点开后每个行程日先展示该日活动内容，多个活动用 `-` 连接，活动后再展示当天司导姓名（`itinerary_days.driver_id`）。
- 没派司导时前端写未分配。
- 活动输入不放占位文字，弹框不再另写一行公司订单号；公司、调度员、司导都改 `order_activities.content`，不另存一份。
- 桌面不再带订单（原来的历史订单）；订单改由下面的订单记录接口给。
- `GET /api/company/orders?companyId=&scope=` 订单记录（`CompanyOrderRecordDto[]`），不管完成没有，按开始日期从早到晚。界面上 `desk` 叫「调度中」，`driver` 叫「已接单」。`scope` 跟着角色：
  - `all` 本公司全部：只有这家公司的公司账户。
  - `desk` 调度：自己调度台上的（`OrderRules.OnDesk`，调度员是分配给自己的，公司账户同它的调度台）：公司账户、调度员。
  - `driver` 司导：这家公司的单里派给自己跑的（行程日 `driver_id` 是自己）：所有人。
  - 不传用角色能选的第一项（公司账户 `all`、调度员 `desk`、司导 `driver`）；不在角色范围里的 403。
  - 每行：`id`、`orderNo`（系统订单号 TL-…）、`label`、`guestCount`、`vehicleType`、`island`、`startDate`、`endDate`、`dayCount`、`route`（共用备注）、`drivers[]`、`plates[]`（按日期先后、不重复）、`driverIds[]`、`vehicleIds[]`（和 `drivers`、`plates` 一一对应）、`onDesk`（单子在自己调度台上：公司账户、调度员，点司导、车牌跳调度台用；`canReturn` 是它再加已绑公司）、`unassignedDays`（没派司导的天数）、`noVehicleDays`（没配车的天数）、`shareLevel`。
  - 操作权限只给自己管的单：`canEdit`（公司账户管本公司全部，调度员管自己调度台上的；只是自己跑的单为 false）、`canSetShareLevel`（同订单的 `canSetShareLevel`）、`canReturn`（单子在自己调度台上且已绑公司，同调度台删除的退回）。操作仍走 `PUT /api/orders/{id}`、`PUT /api/orders/{id}/share-level`、`DELETE /api/orders/{id}?release=true`。
- `GET /api/company/orders/export?companyId=&scope=` 订单记录导出成默认样式的 Excel（.xlsx）。范围和权限同上（范围不对 403），导出这个范围的全部记录。响应头 `X-Export-Added` 是条数；文件名「订单记录-调度中-yyyyMMdd-HHmmss.xlsx」（新西兰时间）。
- `POST /api/company/orders/export?companyId=&scope=`（multipart，字段 `file`）把订单记录填进上传的表格，返回填好的 .xlsx（文件名「原文件名-yyyyMMdd-HHmmss.xlsx」，新西兰时间）。
  - 只收 .xlsx / .xlsm，最大 5MB；服务器一次只填一张表（第二个请求最多等 1 分钟）；其他格式、打不开、认不出表头时 400 并说明原因。
  - 配了 `Recognition__ApiKey` 时，把各工作表的前 25 行和最后 12 行文字（每格 30 字以内，带合并单元格和底色）交给 AI。AI 回填：工作表、表头行、各信息所在列、已有内容的最后一行、样式行、年份行、日期写法、人数是否纯数字。
  - 回答对不上表格（表不存在、行号超出、认出的列少于两列）或 AI 出错时，改按表头文字找（订单来源 / 客人 / 人数 / 负责人 / 司导 / 司机 / 车型 / 车牌 / 起止 / 日期 / 南北岛 / 行程 / 路线 / 线路）。
  - 默认表格最后一列是「系统订单号」（TL-…）。上传的表格里：
    - 先按「系统订单号」一列对单（表头写「系统订单号」，或某一列写的就是 TL-… 订单号；AI 或表头认出的列里写着别的内容时不用它）；表里没有这一列时在表头最右边加一列。
    - 没写订单号的行再按起止日期的月日数字加行程开头 6 个字（没有行程列时用负责人）对，对上的补写订单号。
    - 写着别的订单号（不在这次范围里、已删除）的行不动。一张单只对一行。
  - 对上的行就地更新：人数、负责人、车型、车牌、起止时间、南/北岛、行程路线、订单号。订单来源不改；系统里空着的（没派司导、没配车）不清空表里的字；内容一样的格子不碰。
  - 对不上的新单接在已有内容后面，下面的「合计」之类往下挪。
  - 响应头：`X-Export-Added`（新增）、`X-Export-Updated`（更新）、`X-Export-Skipped`（对上了但没有变化），以及 `X-Export-Mode`（`ai` 或 `auto`）。
- 司导看自己当前跑着的单，调度员看自己当前跑着的和自己当前分配的单（行程日 `assigned_by_user_id` 是自己）；已结束（最后一天早于今天）和尚未结束的都在内。
- 只创建或只被指派为调度、但没有自己跑或分配的单不出现。
- 分配改掉后，当前行程日不再属于自己，这张单就不再出现。
- 与公司建立联系后若还没有简称，写入公司账户已保存的简称；公司还没有简称时，写入公司名前两个字。
- 用户可再改自己的，不会改掉公司的简称，公司之后再改也不会覆盖已经写好的个人简称。
- 清空个人简称则回到公司当前保存的简称。
- 公司账户可 `PUT /api/company` 修改公司全名和联系方式，上传公司头像，并批准或移除调度员。
- 名称 1 到 200 字，不能与其他公司重复；请求不带 `name` 时不改名称，不带 `contact` 时不改联系方式。
- 已有公司简称不随全名改写。
- `canManage`、申请列表和调度员名单只给公司账户；调度员和司导读同一接口时这三项为空。
- `GET /api/company` 的 `dispatchers[].notes` 是当前公司账户给该调度员写的备注，落在 `dispatcher_notes`，调度员读同一接口看不到这些人。
- `PUT /api/company/dispatchers/{userId}/notes` 只给本公司调度员写这条备注，清空备注且未隐藏则删除自己这一行。
- `PUT /api/company/dispatchers/{userId}/hidden` 只给本公司调度员写 `dispatcher_notes.hidden`，没有这一行时视为显示。
- `DELETE /api/company/dispatchers/{userId}` 不能删除公司账户自己。
- 删掉别人时，未完成且分给他的本公司订单清空 `assigned_dispatcher_user_id`，并清空各行程日司导；最后一天早于今天的订单保留。
- 公司头像走同一套本地存储，写入 `App_Data/files/qr/`，`companies.qr_path` 存相对路径；旧的 `company-qr/` 路径仍可读取。
- `POST /api/orders` 可带 `companyId`，写入当前公司。
- 调度台「所有订单」在前端排除历史单，仍读 `GET /api/orders`。

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

- `PUT /api/drivers/{id}/notes` 只改当前用户自己的备注，其他人读不到。
- 清空备注且未隐藏时删除这一行；已经隐藏时保留空备注。
- `PUT /api/drivers/{id}/hidden` 只改同一行的 `hidden`。
- 调度台隐藏和恢复走这一条，不另建表。
- `PUT /api/drivers/{id}` 只改司导档案的姓名和电话；已绑定登录账号时不覆盖其 `users.name`。
- 已绑定账号的司导，`contact` 读该用户自己填写的 `users.contact`，不读 `drivers.phone`。
- 调度台司导详情用这一条。
- `hasAvatar` 表示该账号是否有头像。
- `GET /api/drivers/{id}/avatar` 打开 `users.avatar_path` 指向的同一文件。
- 驾照正反面写 `driver_license_photos`，`side` 为 0（正面）或 1（反面），同一用户同一面唯一。
- 只有带 `driver_id` 的账号可以上传。
- 文件在 `App_Data/files/licenses/`，jpg、png、webp，单张 8MB。
- `GET/POST /api/auth/license-photos` 管理本人照片，`POST` 带查询 `side`。
- `PUT/DELETE /api/auth/license-photos/{photoId}` 更新或删除本人某一面。
- `GET /api/drivers/{driverId}/license-photos` 与 `GET /api/drivers/{driverId}/license-photos/{photoId}` 只给能在司导名单里看到这位司导的登录用户，其他人 404。
- 上级不能改、不能删。

---

## 2. Orders API

```http
GET    /api/orders
GET    /api/orders/{id}
POST   /api/orders
PUT    /api/orders/{id}
DELETE /api/orders/{id}
PUT    /api/orders/{id}/dates
PUT    /api/orders/{orderId}/dispatcher
PUT    /api/orders/{orderId}/share-level
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
  "vehicleType": "五座车",
  "island": "south",
  "notes": "",
  "driverNotes": ""
}
```

`orderNo` 由后端生成，请求中指定无效。  
`platformOrderNo` 可为空。  
`vehicleType` 车型，自由填写，最多 50 字，可为空。`island` 只能是 `south` / `north` / `both` 或空，其他值 400。  
公司订单号、人数、车型、南/北岛只有调度员和公司账户的更新会写入；司导保存备注时这几项不变（司导看不到它们，传回的空值不能清掉）。  
`startDate` 为当地日期 `YYYY-MM-DD`，不做时区换算。  
`GET /api/orders/{id}` 返回订单主体、每日行程、每日活动项目和订单截图列表。  

- `GET /api/orders` 可用 `orderNo` 精确匹配系统订单号或平台订单号。
- `mine=true`（我的行程用）：不看账号角色，只返回行程日 `driver_id` 是当前账号自己司导身份的单；调度员、公司账户被别人派单（包括抢单后被确认）也在这里；没有司导身份返回空列表。
- `desk=true`（调度台用）：按界面不按角色，只返回自己调度台上的单，即 `assignedDispatcherUserId` 是自己的单；公司账户另外带上没分调度员、但自己已经在上面派过司导的本公司订单（旧数据）。公司账户的调度台和调度员的调度台是同一套范围。
- 没有 `orderNo` 时，调度员只看到 `assignedDispatcherUserId` 是自己的单；公司账户（派给调度用，不带 `desk`）看到 `companyId` 是本公司的全部单；司导只看到行程日 `driver_id` 是自己的单，不按结束日过滤，已结束的单仍返回，我的行程日历照常画格。
- 另可用 `driverId`：公司和调度员只能查自己调度台上已批准的司导，返回这位司导的全部订单，不限所属公司，也不限是否分给自己。
- 查不到这位司导时返回空列表。
- 订单区不带 `driverId`，范围不变。
- 别人的单不带回公司名、公司订单号、调度员姓名、备注、司导备注、游客人数、附件、行程说明和联系方式，只留下日期，用来表示这天已有行程。
- 自己派出的日期仍带回本人姓名。

`endDate` 和 `dayCount` 由行程日期计算，只读。

订单响应里的业务判断由后端统一给出，前端只显示，不再自己计算（规则定义在 `Services/OrderRules.cs`，「今天」按新西兰日期）：

- `label`：订单显示名。公司订单号第一行，否则共用备注第一行，都没有为 null。前端按图标宽度截断。公司信息的订单缩略（`CompanyOrderDto`）同样带 `label`。
- `isSplit`：拆单。多位司导、多个派出人，或已派一部分。
- `isFinished`：结束日期早于今天。
- `isInProgress`：起始日期不晚于今天，且还没结束。
- `isHistorical`：历史单。有行程日、全部已派、且已结束。
- `hasDriverConflict`：这张单有某一天的司导同一天还有别的订单（全库判断）。
- 行程日 `weather`：这一天的天气短词（例如「晴」「多云」「降雨6mm」「雷雨3mm」；切换到 Open-Meteo 时降水写概率，如「降雨50%」；前端照原样显示），地点按 PRD 第 8 节选（住宿地，或当天的库克山、峡湾项目）；没有对应地点或超出预报范围为 null。调度台查看别人订单时为 null。
- 行程日 `hasDriverConflict`：这位司导这一天还有别的订单；`hasVehicleConflict`：这辆车这一天还有别的订单。
`createdByUserId` / `createdByName` 为创建派出人，只读。公司信息页「自己派出」仍看它。

- `companyId` / `companyName` 是订单所属公司。
- 公司账户建单时强制写本公司，不能改绑。
- `onMyDesk`（只在新建时有用）：公司账户在调度台上建单传 `true`，`assignedDispatcherUserId` 写成自己，单子在自己的调度台上；在派给调度里建单不传，留在公司订单池。调度员建单始终写成自己。AI 建单 `POST /api/recognition/import` 的 `order` 里同样有 `onMyDesk`。
- 调度员和司导建单都不默认绑所属公司，即使只属于一家；不传 `companyId` 则保持空。
- 调度员可指定任意已有公司。
- 调度台点选公司后立即用同一套 `PUT /api/orders/{id}` 写入或改绑；调度员更新时明确传 `companyId: null` 表示解绑。
- 改绑后原公司列表不再出现，新公司能看到。

`assignedDispatcherUserId` / `assignedDispatcherName` / `assignedDispatcherContact` 是公司把整单交给哪位调度员，只读摘要。联系方式读该用户的 `users.contact`。调度员建单时默认写成自己。
`DELETE /api/orders/{id}`：按界面区分，不按角色。

- 调度台上删除带 `?release=true`：只能处理自己调度台上的单（同 `desk=true` 的范围），否则 403。已绑公司的单退回公司池（与 `PUT /dispatcher` 传 `null` 同一套清空），不删行，这张单上待确认的抢单（`order_claims`）一并删除；未绑公司的单真正删除该单和附件。公司账户在调度台上也一样。
- 派给调度里删除不带 `release`：公司账户真正删除本公司的订单和附件，别家公司的单 403。
- 调度员不能真删公司的单：不带 `release` 也按调度台处理。司导 403。

`PUT /api/orders/{id}/dates`：改已建订单的日期（调度台订单日历上拖动）。请求 `{ "startDate": "2026-11-20", "endDate": "2026-11-23", "shiftDays": 3 }`，结束早于开始、超过 93 天或平移超过两年返回 400。

- 原来的每一天平移 `shiftDays` 天（拖整段时不为 0，拖开头或末尾时为 0），行程说明、住宿地、活动、司导、派出人、车辆都跟着走；活动的预约和签到时间平移同样的天数。
- 平移后落在新起止范围外的日子删掉（连同活动，电子票文件在写库成功后删）。新范围里、平移后原来行程首尾以外的日期补空白日；原来中间空着的日期保持空着。前端要删掉日子时，「保存」要再点一次确认（红框）。
- 同一单同一天只能一条：整段平移时新旧日期重叠，后端先把要搬的日子挪到临时日期再一次放到新日期，全部在一个事务里。
- 平移后，这位司导在新日期已有别的订单（真实订单不算他自己的占位单，占位单照常被覆盖），这一天改回未派、去掉车辆；只有车辆被别的订单占用时，只去掉车辆。都写进 `warnings`。
- 能改：所属公司的公司账户；已绑公司的单只有分到它的调度员；未绑公司的单是建单人（含司导自己的占位单）或负责的调度员。其他人 403。订单响应的 `canReschedule` 给出当前用户能不能改。
- 返回 `{ "order": 订单, "removedDayCount": 1, "warnings": ["11-21 王司导那天已有别的行程，这天改回未派"] }`。

- 行程日另有 `assignedByUserId` / `assignedByName` / `assignedByContact`：当前是谁把这天派给司导，联系方式读该用户的 `users.contact`。旧数据没有记录派出人时，后端已经回退成建单人，前端直接用；没派司导的日期这三项为 null。
- 我的行程点开某一天，在公司订单号下面显示这位调度员的姓名和联系方式。
- 调度台司导日历和我的行程日期框优先用它，没有时回退 `createdByName`。
- 我的行程在订单已绑公司时，把公司名称和这位调度员的姓名连在一起；连起来超过 6 个字，且当前用户给这家公司写了缩写，则显示「缩写-调度员姓名」。
- 缩写是 `companyNote`，来自 `company_notes`，只当前用户自己看得到。
- 调度台点开司导时画出他的全部行程，包括已完成和进行中已过的日期，不限本公司；自己分配的日期用这一套同样的文字并可拖回取消；其他人的日期只着色，不写公司名或调度员姓名。
- 列表和详情的行程日都带 `driverId` / `driverName`；公司在派给调度点开订单日历时，日期按有没有司导着色，标注司导姓。

- `notes` 为当前登录用户自己的备注，落在 `order_notes`，其他人读同一单看不到。
- 公司、调度员各写各的；司导身份读取时 `notes` 恒为 null，也看不到公司或调度备注。
- 司导写入不能改这条。
- `driverNotes` 仍是司导备注，写在 `orders.driver_notes`。
- 调度台只改调度员自己的 `notes`，派给调度里公司改自己的 `notes`，我的行程只改 `driverNotes`，共用 `PUT /api/orders/{id}`。
- 司导提交的公司订单号被忽略，原值保留。
- `sharedNotes` 写在 `orders.shared_notes`，公司、调度员、司导都能读写，不按人拆开。
- 别人的行程在司导日历里仍不带回这条，和各自备注一样隐藏。

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

- 登录用户即可读写自己的车，不按角色拒绝。
- 司导没有调度台，所以没有入口。
- 这一天必须已有司导，且分配人（`assignedByUserId`，旧数据回退订单 `createdByUserId`）是当前用户。
- 车辆必须属于当前用户。
- `vehicleId` 有值时：整单写入这张订单里还没有车、且由当前用户分配的行程日；拆单只写入当前司导这一段里还没有车的日期。
- 这些日期都已经有车时返回 400，不写入。
- `vehicleId` 为 null 时解除绑定：`onlyDay` 为 false 解除这张订单里当前用户分配且已有车的日期，为 true 只解除这一天。
- 不改 `driverId`。
- 返回 `{ orderId, vehicleId, dayIds }`。
- 别人的车返回 404。
- 不是新的派单表。

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

语义：订单还有未分配的行程日时，只把这些日期派给该司机，拆单里已派给其他司机的日期不动；全部日期都已分配时才整单改派。冲突检查和占位单覆盖也只算这次被派的日期，`updatedDayCount` 是这次改动的天数。  

- `driverId` 可以为 `null`，表示取消整单分配。
- 调度员或公司账户整单解绑时，仅各天 `assignedByUserId`（旧数据回退 `createdByUserId`）都是本人，或全部已派日期都属于本人司导身份，才允许；否则 403。
- 司导取消自己名下行程不受此限。
- 派单成功时各天写入 `assignedByUserId`。
- 司导用本人 `driverId` 领取已分给调度员的订单时，`assignedByUserId` 写成该订单的 `assignedDispatcherUserId`，调度台按自己分配的单解除绑定。

`failOnConflict` 默认为 `false`：冲突只进 `warnings`，仍保存。调度台整单拖拽不传 `true`，重叠日期仍保存。传 `true` 时存在其他订单同日占用该司机则返回 409，不保存。  
已绑定 `companyId` 的真实订单整单派给司导时，覆盖并删除该司导自己创建、未绑公司、且日期有重叠的占位单；天数不符也整单删除。未绑定公司的订单不能这样做。  

- 公司账户，或该公司 `company_members.role=dispatcher` 的调度员，把这家公司的订单派给已有账号的司导时，若司导还不是该公司成员，写入 `company_members`，`role=driver`。
- 整单派发和单日派发都写这一行。
- 司导领取已分给该调度员的公司订单同样写入。
- 已有成员行（含调度员）不改角色，也不另建批准步骤。
- 未绑定公司的订单、派出人不是该公司或其调度员、以及没有账号的司导档案，都不写成员。

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

- 分给调度员只改 `orders.assigned_dispatcher_user_id`，不拆天。
- 同一时间只能有一个调度员；再分配即覆盖。
- `dispatcherUserId` 为 `null` 表示整单收回公司池：同时清空各行程日 `driver_id` / `assigned_by_user_id`，司导日历上这单会消失。
- 再分给调度员后从没有司导开始。
- 仅公司账户可写，且目标必须是本公司 `company_members.role=dispatcher`。
- 不是第二套订单 CRUD。

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

```http
POST /api/orders/{orderId}/days/{dayId}/activities/from-library
```

```json
{ "libraryActivityIds": ["活动库ID1", "活动库ID2"] }
```

- 按传入顺序把活动库里的活动加到这一天末尾，返回新建的活动数组。
- 活动内容取活动库当时的名称（中文名优先）。
- 每项带 `libraryActivityId`。手动填写的活动这个字段为 null；活动库删除这项后也变成 null。

---

## 6. 司机日历写入

司机日历页面读 `GET /api/orders`，按登录用户 `driverId` 过滤行程日。调度台另读 `GET /api/drivers` 做派单。不提供 `GET /api/driver-calendar/preview` 或 `GET /api/calendar`。

- 司机日历写操作复用同一套 `orders` / `itinerary_days`，不另建表。
- 页面上的领取走 `PUT /api/orders/{orderId}/driver`，框选建单走前端共用的 `createOrderWithDays`（内部仍是 `POST /api/orders` 与 `POST /api/orders/{orderId}/days`），取消只把当前司导的行程日 `driverId` 置空。
- 调度台「创建订单」走同一套函数，行程日不传 `driverId`。
- 一次最多三个月，结束日不超过开始日三个月后的同一天。
- 不提供 `POST /api/driver-calendar/claim`、`/range`。
- 请求不得把 `driverId` 当作登录身份。
- 司导分配只写 `itinerary_days.driver_id`。
- 公司把整单交给调度员另写 `orders.assigned_dispatcher_user_id`，不另建订单表。

当日行程编辑、电子票、领取和取消走现有：

```http
PUT  /api/orders/{orderId}/days/{dayId}
POST /api/orders/{orderId}/days/{dayId}/activities
POST /api/orders/{orderId}/days/{dayId}/activities/{activityId}/ticket
GET  /api/orders/{orderId}/days/{dayId}/activities/{activityId}/ticket
DELETE /api/orders/{orderId}/days/{dayId}/activities/{activityId}/ticket
PUT  /api/orders/{orderId}/driver
```

- 领取整单时调用 `PUT /api/orders/{orderId}/driver`，与调度台派单共用 `OrderDriverAssignment`。
- 已绑定公司的真实订单领取成功时，同样覆盖并删除该司导自建、未绑公司、日期有重叠的占位单，天数不符也整单删除，不报「当日已有行程」。
- 未绑定公司的订单领取仍按普通冲突处理。
- 订单已经分给调度员时，领取把各天分配人记成该调度员，调度台可以解除这次绑定。
- 取消当前司导在该单上的日期时，对该司导名下的每一天 `PUT` `driverId: null`，不覆盖其他司导的行程日，也不看出是谁派的。
- 调度台从司导日历拖一天到订单区：拆单（多司导、多分配人、或未派完）只清空当天，未拆单则整单 `driverId: null`。
- 整单解绑要求这些已派天都是当前用户派出的。
- 不另建取消接口。

- 调度台订单卡片和司导点日期展开的订单信息都走 `PUT /api/orders/{id}` 与共用的 `updateOrderInfo` / `OrderInfoFields`。
- 调度台写入 `notes`，我的行程写入 `driverNotes`，互不可见。
- 我的行程不改公司订单号；司导即使在请求里带上公司订单号，也保持原值。
- `DELETE /api/orders/{id}` 按界面分叉（见第 2 节）：调度台上（`release=true`，调度员总是按调度台）把已绑公司、在自己调度台上的单退回公司池（清空 `assigned_dispatcher_user_id` 和各行程日 `driver_id` / `assigned_by_user_id`，与公司 `PUT /dispatcher` 传 `null` 同一套收回，并删掉这张单待确认的抢单）；未绑公司则真正删除该单和附件。
- 公司账户删除订单和附件。
- 司导 403。
- 点某一天编辑行程复用现有活动接口，与司导日历同一套 `DriverDayEditor`。
- 不另建退回接口。

电子票上传写入 `App_Data/files/tickets/`，`order_activities.ticket_path` 存相对路径。活动内容更新不再改写 `ticketPath`。只接受 8MB 以内的 jpg / png / webp / pdf。订单最后一天起满 7 天后删除电子票文件并清空 `ticketPath`，活动内容仍在。

---

## 7. Order Files API

```http
GET    /api/orders/{orderId}/files
POST   /api/orders/{orderId}/files
GET    /api/orders/{orderId}/files/{fileId}
DELETE /api/orders/{orderId}/files/{fileId}
```

- 上传采用 `multipart/form-data`，字段名 `file`。
- 订单截图写入 `App_Data/files/orders/`，`order_files` 存文件名和相对路径。
- 只接受 8MB 以内的 jpg / png / webp。
- 公司头像、用户头像、电子票、订单截图、车辆照片和驾照照片共用 `AppFileStore`。
- 车辆照片在 `App_Data/files/vehicles/`，驾照在 `App_Data/files/licenses/`。
- 订单最后一天起满 7 天后删除该单截图的文件和 `order_files` 行。
- 用户头像、公司头像、车辆照片和驾照照片不按这个规则删。

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

- 写入：`plate`（去空白，最多 20 字，同一用户不可重复）、`sharedNotes`、`info`、`available`。
- `available` 为 false 表示停用，行仍在，只是不出现在可用车辆。
- `DELETE` 删除这辆车的照片文件和记录，行程日 `vehicle_id` 置空。
- 照片最多 3 张，jpg / png / webp，8MB，字段名 `file`。
- 调度台发送前把照片压成 jpg，最长边 1600，不上传原图。
- 接口仍接受 jpg、png、webp。
- 第四张返回 400。
- 替换用 `PUT` 并保持原排序。
- 未登录 401，不是自己的车 404。

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

---

## 常用住宿地点

```http
GET /api/places
```

返回常用住宿地点 `[{ "mark": "特", "name": "特卡波" }, …]`，顺序就是当日详情里地点按钮的顺序。清单只在后端 `Services/Weather/Places.cs` 定义，天气也按这份清单查询。

## 天气数据来源

```http
GET /api/weather/source
```

返回 `{ "name": "MET Norway", "url": "https://www.met.no/en" }`，「我的行程」底部用它注明来源。所选来源需要密钥但没有配置（不查天气）时返回 204。

## AI 建单

```http
GET  /api/recognition/status
POST /api/recognition/order-draft
POST /api/recognition/import
```

- 只有调度员和公司账户能用，其他人 403。`status` 返回 `{ enabled, model }`：服务器配了 `Recognition__ApiKey` 且当前用户能用时 `enabled` 为 `true`。
- `order-draft`：`multipart/form-data`，文件字段都叫 `files`，按选择顺序；jpg / png / webp / pdf，单个 10MB、合计 40MB、最多 12 个。粘贴的行程文字放在 `text`（最多 20000 字，连续空行压成一行），交给模型时放在文件后面、标成「粘贴的文字」，电子票序号只算文件。文件和文字至少一样，都没有或文字太长 400；文字里认不出日期 422。只返回草稿，不写数据库。
  - 返回 `OrderDraftDto`：`platformOrderNo`、`guestCount`、`vehicleType`（照原文简短写的车型，没写为 null）、`island`（`south` / `north` / `both`，只看要导入的日子，看不出为 null）、`notes`、`days[]`、`warnings[]`、`files[]`（上传的文件名，序号从 0 开始）、`model`、`inputTokens`、`outputTokens`。
  - `days[]`：`serviceDate`、`include`（默认是否导入）、`note`、`description`、`endLocation`、`uncertain[]`、`activities[]`。
  - `activities[]`：`content`、`kind`（`activity` / `hotel`）、`provider`、`libraryActivityId`、`bookingTime`、`checkinTime`（当地时间 `YYYY-MM-DDTHH:mm:ss`）、`ticketIndex`（指向 `files` 的序号）、`uncertain[]`。
  - 识别不出任何日期、模型出错、未配密钥时返回 422，`detail` 是中文原因。
- `import`：`multipart/form-data`。字段 `order` 是 JSON（`island` 不传或为空时按 `south` 写入）：`{ platformOrderNo, guestCount, vehicleType, island, notes, days: [{ serviceDate, description, endLocation, activities: [{ content, provider, libraryActivityId, bookingTime, checkinTime, ticketIndex }] }] }`，只放要导入的日期；文件字段 `file-{序号}` 是识别时的第几个文件。
  - 被活动 `ticketIndex` 引用的文件存为该活动的电子票（8MB 以内）；其余图片存为订单截图；其他 PDF 不保存。
  - 订单的起始日期取最早一天；建单归属和 `POST /api/orders` 一样；`notes` 写进建单人自己的备注。不存在的活动库 id 当作手填。
  - 成功返回 `{ orderId }`；同一天出现两次、没有日期等返回 400。

## 活动库

所有登录用户可以查看、搜索、评分、保存自己的顺序。标「公司账户」的接口其他身份返回 403。

```http
GET    /api/library/destinations?q=           目的地搜索（中英文名模糊匹配，常用地点在前）
POST   /api/library/destinations              新建目的地（公司账户）{ nameZh, nameEn }，同名返回已有的
GET    /api/library/activities?q=&destinationId=   活动搜索，按评分排序
GET    /api/library/pick?place=               当日详情选择框：按住宿位置找目的地，返回 { destination, activities }
PUT    /api/library/order                     保存本人在某目的地的顺序 { destinationId, activityIds }
GET    /api/library/activities/{id}           详情，含 reviews
POST   /api/library/activities                新建（公司账户）
PUT    /api/library/activities/{id}           修改（公司账户）
DELETE /api/library/activities/{id}           删除（公司账户），行程里的活动保留文字
PUT    /api/library/activities/{id}/rating    本人评分 { score: 1–5, comment }
DELETE /api/library/activities/{id}/rating    删除本人评分
POST   /api/library/activities/{id}/photos            上传图片（公司账户，最多 3 张，8MB 以内 jpg/png/webp）
PUT    /api/library/activities/{id}/photos/{photoId}  更新图片（公司账户）
DELETE /api/library/activities/{id}/photos/{photoId}  删除图片（公司账户）
GET    /api/library/activities/{id}/photos/{photoId}  查看图片（登录即可）
```

活动写入：

```json
{ "nameZh": "库克山直升机", "nameEn": "Mt Cook Heli", "sharedNotes": "提前一天确认天气", "destinationIds": ["目的地ID"] }
```

- 中英文名至少一个；至少一个目的地。
- 中文名或英文名与已有活动相同（不区分大小写）时返回 400。

活动响应：

- `id`、`nameZh`、`nameEn`、`name`（中文名优先）、`sharedNotes`、`destinations`、`photos`。
- `averageScore`：一位小数，没人评分为 null。
- `ratingCount`。
- `myScore`、`myComment`：当前用户自己的评分和评价。
- 详情另带 `reviews`：每条有 `userName`、`score`、`comment`、`updatedAt`、`mine`。

`pick` 的排序：本人在这个目的地保存过的顺序在前，其余按平均评分降序、评分人数降序、名称。住宿位置找不到目的地时，`destination` 为 null，`activities` 为空数组。

## 抢单

```http
PUT    /api/orders/{orderId}/share-level   { "shareLevel": 0 | 1 | 2 }
GET    /api/grab                           司导：能抢的单
POST   /api/grab/{orderId}                 司导：抢单 { "dayIds": ["待抢日期ID", ...] }
DELETE /api/grab/{orderId}                 司导：撤回自己的抢单
GET    /api/grab/claims                    调度员 / 公司：自己订单上待确认的抢单
POST   /api/grab/{orderId}/confirm         调度员 / 公司：确认派单 { "driverId": "..." }
```

- 订单响应新增 `shareLevel`（0 调度自留，1 公司内部，2 面向所有人）和 `canSetShareLevel`（当前用户是这张单的调度员，或所属公司的公司账户）。
- `PUT share-level`：这张单的调度员（`assignedDispatcherUserId`，没有时是建单人）或所属公司的公司账户可以改，否则 403；值不在 0–2 返回 400；订单没绑公司时只能是 0，否则 400。返回订单。公司账户把还没分调度员的单（公司订单池里的）改成 1 或 2 时，这张单同时分给公司账户自己（`assignedDispatcherUserId` 写成公司账户），由它在调度台上确认抢单。解绑公司、换调度员、退回公司池、确认抢单后回到 0。
- 待确认抢单 `GET /api/grab/claims` 和调度台订单列表（`desk=true`）同一条范围；公司账户的调度台另外带上以前已经放出去、但没分调度员的本公司订单。
- `GET /api/grab`：当前用户能抢的单，按第一天日期排序。条件：订单还有没派司导的日期且都不早于今天；不是自己当调度员的单；等级为 1 或 2 且可见（见 PRD 6.6，调度自留不出现，抢单 404）；被这张单的调度员隐藏（拉黑）的司导三种等级都看不到。每项：
  - `orderId`、`shareLevel`、`companyName`、`dispatcherName`、`guestCount`、`totalDayCount`（整张单的天数）、`claimedByMe`（自己已抢、等确认）。
  - `days`：要一起抢的日期（未派的全部日期），每天 `id`、`serviceDate`、`endLocation`、`description`、`activities`（`content`、`bookingTime`、`checkinTime`）。
  - `conflicts`：这些日期里自己已有的行程（`orderId`、`serviceDate`、`orderLabel`）。有冲突时不能抢。
  - 不带公司订单号、各人备注、共用备注、联系方式、附件。
- `POST /api/grab/{orderId}`：抢单，写一条待确认记录（`order_claims`），不派单。`dayIds` 必须正好等于当前未派的日期，否则 409（提示刷新）；有冲突 409（写明日期）；看不到这张单 404；没有司导身份 400。重复抢不报错。返回 `{ orderId, dates }`。
- `DELETE /api/grab/{orderId}`：撤回自己的抢单，没有时 404。
- `GET /api/grab/claims`：调度员（订单的调度员是自己）和公司账户（本公司订单）看到的待确认抢单，只列还有未派日期、且未派日期都不早于今天的订单；被该单调度员隐藏的司导不列。每条：`orderId`、`driverId`、`driverName`、`contact`、`hasAvatar`、`inRoster`（已在自己名单里）、`createdAt`。
  - 抢单的司导即使还不在名单里，调度员也能用 `GET /api/drivers/{id}`、`/avatar`、驾照、`GET /api/orders?driverId=` 查看，也能写备注、隐藏（拉黑）。`GET /api/drivers` 名单本身不变。
- `POST /api/grab/{orderId}/confirm`：只有能改等级的人可以确认（403）；这位司导没抢或已撤回 404；没有可派的日期或这位司导这几天已有别的行程 409。成功后未派日期的 `driverId` 是这位司导、`assignedByUserId` 是这张单的调度员；按抢单时的等级建立关系（1 级成为调度员的司导并写公司成员；2 级再成为公司账户的司导）；这张单的抢单全部删除；`shareLevel` 改回 0。返回 `{ orderId, dates }`。同一张单同时确认按订单行加锁。

