# Trailink V1 数据库契约

版本：V1 MVP 第一阶段  
日期：2026-10-23  
数据库：PostgreSQL  
迁移：EF Core Migrations

第一阶段核心表：`drivers`、`driver_notes`、`dispatcher_notes`、`orders`、`order_notes`、`itinerary_days`、`order_activities`、`order_files`、`companies`、`company_notes`、`users`、`company_members`、`dispatcher_applications`、`driver_applications`。

---

## 1. drivers

```text
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
phone       VARCHAR(50) NULL
```

调度员给司导的备注不写在 `drivers` 上，见 `driver_notes`。每人一条，只自己可见。

---

## 1b. driver_notes

```text
id         UUID PRIMARY KEY
driver_id  UUID NOT NULL
user_id    UUID NOT NULL
notes      TEXT NOT NULL
hidden     BOOLEAN NOT NULL DEFAULT false
```

外键：

- `driver_id` → `drivers.id`（删除司导时级联删除）
- `user_id` → `users.id`（删除用户时级联删除）

唯一约束：`(driver_id, user_id)`。`GET /api/drivers` 返回当前登录用户自己的 `notes` 和 `hidden`。`PUT /api/drivers/{id}/notes` 只改备注；备注清空且未隐藏时删除这一行，已隐藏时保留空备注。`PUT /api/drivers/{id}/hidden` 只改 `hidden`。没有备注又取消隐藏时删除这一行。不是派单表。调度台隐藏司导写在这一列，换浏览器仍然有效。排序和置顶不写在这里。

---

## 1c. dispatcher_notes

```text
id                   UUID PRIMARY KEY
dispatcher_user_id   UUID NOT NULL
user_id              UUID NOT NULL
notes                TEXT NOT NULL
hidden               BOOLEAN NOT NULL DEFAULT false
```

外键：

- `dispatcher_user_id` → `users.id`（删除该调度员账号时级联删除）
- `user_id` → `users.id`（删除写备注的公司账户时级联删除）

唯一约束：`(dispatcher_user_id, user_id)`。`GET /api/company` 的 `dispatchers[].notes` 与 `PUT /api/company/dispatchers/{userId}/notes` 只读写当前公司账户这一行，不改 `hidden`。`hidden` 由 `PUT /api/company/dispatchers/{userId}/hidden` 写入。没有这一行时视为显示。清空备注且未隐藏则删除这一行。调度员读不到。不是派单表，也不复用 `driver_notes` / `order_notes`。

---

## 2. orders

```text
id                 UUID PRIMARY KEY
order_no           VARCHAR(40) NOT NULL UNIQUE
platform_order_no  VARCHAR(100) NULL
start_date         DATE NOT NULL
guest_count        INTEGER NOT NULL
driver_notes       TEXT NULL
company_id                      UUID NULL
created_by_user_id              UUID NULL
assigned_dispatcher_user_id     UUID NULL
```

外键：

- `company_id` → `companies.id`（公司建单强制写本公司。调度员和司导建单都不默认写入，即使只属于一家；调度员可搜索任意公司绑定或改绑。公司列表只看绑到自己的单。调度台「所有订单」不含已派完且已结束的单）
- `created_by_user_id` → `users.id`（建单人。公司信息页里「自己分配」看行程日 `assigned_by_user_id`，「自己跑过」看行程日 `driver_id`。不另记派单历史）
- `assigned_dispatcher_user_id` → `users.id`（公司把整单交给哪位调度员；`NULL` 表示还在公司池。同一时间只能有一个。删除用户时置空。不是司导派单表，司导仍写 `itinerary_days.driver_id`）

规则：

- `order_no` 由后端自动生成，前端不得指定。
- 订单结束日期不落库，从 `itinerary_days.service_date` 的最大值计算。
- 不再保存订单标题和订单状态。
- `start_date` 为行程所在地当地日期，类型 `DATE`，不做 UTC 转换。
- 调度备注不写在 `orders` 上，见 `order_notes`。每人一条，只自己可见。
- `driver_notes` 是司导备注，只在「我的行程」读写。角色为司导的接口响应不返回调度备注。
- `assigned_dispatcher_user_id` 只表示公司把整单交给哪位调度员，不拆天、不另建订单。调度员建单时默认写成自己。公司改派即覆盖。

---

## 2b. order_notes

```text
id        UUID PRIMARY KEY
order_id  UUID NOT NULL
user_id   UUID NOT NULL
notes     TEXT NOT NULL
```

外键：

- `order_id` → `orders.id`（删除订单时级联删除）
- `user_id` → `users.id`（删除用户时级联删除）

唯一约束：`(order_id, user_id)`。`GET/PUT /api/orders` 的 `notes` 只读写当前登录用户这一行。不是派单表。

---

## 3. itinerary_days

```text
id                   UUID PRIMARY KEY
order_id             UUID NOT NULL
service_date         DATE NOT NULL
description          TEXT NULL
end_location         VARCHAR(200) NULL
driver_id            UUID NULL
assigned_by_user_id  UUID NULL
```

外键：

- `order_id` → `orders.id`
- `driver_id` → `drivers.id`
- `assigned_by_user_id` → `users.id`（当前是谁把这天派给该司导；解绑时清空。不是派单历史表）

唯一约束：

- `(order_id, service_date)`

规则：

- 一个订单同一天只保留一条行程记录。
- `service_date` 为行程所在地当地日期，类型 `DATE`，不做 UTC 转换。
- 不记录每日出发时间，不恢复 `start_time`，不新增出发/接人时间字段。
- 删除订单时级联删除对应的每日行程。
- 删除已分配司机时，将关联行程的 `driver_id` 置空。
- 整单派单批量更新各行程日的 `driver_id`，同时写入 `assigned_by_user_id`。司导领取已分给调度员的订单时，`assigned_by_user_id` 写成 `orders.assigned_dispatcher_user_id`。
- 已绑定 `company_id` 的真实订单派给司导时，删除该司导自建且 `company_id` 为空、日期有重叠的占位单（含附件）。未绑定公司的单不触发删除。
- 调度台按 `assigned_by_user_id`（旧数据回退 `orders.created_by_user_id`）判断谁能从司导日历取消该天。不同调度员派给同一司导也算拆单，各自只取消自己那天。
- 「我的行程」取消派给本人 `driver_id` 的日期，不看 `assigned_by_user_id`。
- 同一订单不同行程日可以绑定不同司机。拆单不新建订单、不新增派单表。

---

## 4. order_activities

```text
id                 UUID PRIMARY KEY
itinerary_day_id   UUID NOT NULL
content            TEXT NOT NULL
provider           VARCHAR(200) NULL
booking_time       TIMESTAMP WITHOUT TIME ZONE NULL
checkin_time       TIMESTAMP WITHOUT TIME ZONE NULL
ticket_path        TEXT NULL
sort_order         INTEGER NOT NULL DEFAULT 0
```

外键：

- `itinerary_day_id` → `itinerary_days.id`

规则：

- 一个行程日可以有多个活动项目。公司信息弹框把同一天的 `content` 用 `-` 连成一行。公司、调度员、司导改的都是这个字段。
- `sort_order` 是同一行程日内的展示顺序，从 0 起。不按预订时间排序。
- 删除行程日或订单时级联删除活动。
- `booking_time`、`checkin_time` 是活动所在地的当地钟表时间，不是系统操作的 UTC 时间戳。
- 不实现实际签到打卡。
- `ticket_path` 存统一本地存储的相对路径，格式 `files/tickets/{activityId}{ext}`，允许 NULL。不存绝对路径或二进制。订单最后一天起满 7 天后清成 NULL，并删除磁盘上的电子票。活动行保留。

---

## 5. order_files

```text
id          UUID PRIMARY KEY
order_id    UUID NOT NULL
file_name   VARCHAR(255) NOT NULL
file_path   TEXT NOT NULL
```

外键：

- `order_id` → `orders.id`

文件实际存储在 `App_Data/files/orders/`。`file_path` 为相对路径 `files/orders/{fileId}{ext}`。删除订单时同时删除磁盘文件。订单最后一天起满 7 天后删除这些行和磁盘文件。头像和公司二维码不在此列。

---

## 6. companies

```text
id       UUID PRIMARY KEY
name     VARCHAR(200) NOT NULL UNIQUE
contact  VARCHAR(200) NULL
qr_path  VARCHAR(500) NULL
```

公司账户注册时创建。`name` 与 `contact` 都由公司账户经 `PUT /api/company` 编辑。名称 1 到 200 字，不能与其他公司重复。`contact` 可以是手机号或微信号。每人给公司的缩写不写在 `companies` 上，改全名也不会改写已有简称，见 `company_notes`。`qr_path` 指向统一本地存储的相对路径 `files/qr/{companyId}{ext}`；旧值 `company-qr/...` 仍可读取。调度台订单列表不按公司过滤，但已派完且结束日早于今天的单不出现在调度台。公司信息页按 `orders.company_id` 列订单。公司账户只看已派完且最后一天早于今天的历史单。司导看当前 `driver_id` 是自己的单，调度员还看当前 `assigned_by_user_id` 是自己的单；已结束和尚未结束都在内。改派后按当前行程日消失，不另记一份历史。

---

## 6b. company_notes

```text
id          UUID PRIMARY KEY
company_id  UUID NOT NULL
user_id     UUID NOT NULL
notes       VARCHAR(20) NOT NULL
```

外键：

- `company_id` → `companies.id`（删除公司时级联删除）
- `user_id` → `users.id`（删除用户时级联删除）

唯一约束：`(company_id, user_id)`。这是当前用户自己给这家公司起的缩写，只自己可见。还没有这一行时，默认写成公司账户已保存的简称；公司账户还没有简称时，写成公司名前两个字。`GET /api/company` 的 `companies[].notes`、`desk.notes` 与 `PUT /api/company/notes` 读写这一行。用户改自己的简称不会回写公司账户，公司之后再改也不会覆盖已有的个人简称。清空个人简称则回到公司当前保存的简称；公司账户清空则回到公司名前两个字。下拉用简称，页内公司名称用公司全名。订单列表里的 `companyNote` 也是这一行。不复用 `driver_notes`、`dispatcher_notes` 或 `company_members`。

---

## 7. users

```text
id             UUID PRIMARY KEY
username       VARCHAR(50) NOT NULL UNIQUE
password_hash  VARCHAR(200) NOT NULL
name           VARCHAR(100) NOT NULL
contact        VARCHAR(200) NULL
role           VARCHAR(20) NOT NULL
company_id     UUID NULL
driver_id      UUID NULL
avatar_path    VARCHAR(500) NULL
assigned_color VARCHAR(7) NULL
```

`role` 取值：`company`、`dispatcher`、`driver`。不建角色表。

- 公司账户：`role=company`，`company_id` 指向本公司，一人一家。
- 注册公司或司导时同时写一条 `drivers`，`driver_id` 指向该司机。已有账户若还没有司机身份，登录或 `me` 时补写。
- 调度员与司导可以同时属于多家公司，关系只写 `company_members`，不再占用 `users.company_id`。
- 批准为调度员后写入成员行，并把账户 `role` 设为 `dispatcher`；从最后一家公司移除后回到 `driver`，保留 `driver_id`。
- `avatar_path` 指向压缩后的 `files/avatars/{userId}.jpg`。再次上传时删除该用户旧头像文件。头像、二维码、电子票、订单截图都落在 `App_Data/files/` 下各自子目录，不进 `wwwroot`。
- `assigned_color` 是该用户自己的已分配颜色（调度台 / 派给调度共用），每人一条。空则前端用默认浅绿。不另建颜色表。
- 登录用户名和密码只由本人在个人信息修改。用户名仍是 `username`，密码只存 `password_hash`。改用户名不换 `id`，登录 Cookie 仍按用户 id。
- `contact` 是该用户自己的联系方式，手机号或微信号，只由本人在个人信息修改。公司信息里待批准申请和调度员姓名后、个人信息的司导申请、调度台司导详情、以及我的行程点开日期后的调度员姓名旁，都读这一列。不读登录用户名，也不读 `companies.contact` 或 `drivers.phone`。

---

## 8. company_members

```text
id          UUID PRIMARY KEY
user_id     UUID NOT NULL
company_id  UUID NOT NULL
role        VARCHAR(20) NOT NULL
```

唯一约束：`(user_id, company_id)`。公司批准调度员后 `role=dispatcher`，公司的调度员名单和「派给调度」只看这一行。公司账户注册时为自己写一条 `role=dispatcher`，登录或 `me` 会给旧账号补上，账号角色仍是公司。不能删除自己这一行。调度员批准司导申请后写入 `role=driver`。公司账户或该公司的调度员把公司订单派给有账号的司导时，若还没有成员行，也写入 `role=driver`；已有行不改角色。公司账户的调度台不看这一行，只看向该账户申请并已批准的 `driver_applications`。调度员批准时仍按他所属公司写入 `role=driver`，司导资源跟着调度员进公司；派单也可能补这一行。这两处都不等于公司账户自己的司导。

---

## 9. dispatcher_applications

```text
id          UUID PRIMARY KEY
user_id     UUID NOT NULL
company_id  UUID NOT NULL
created_at  TIMESTAMPTZ NOT NULL
```

只保留待批准申请。同一用户对同一公司只能有一条申请。可以同时向多家公司申请。批准后删除该行。

---

## 10. driver_applications

```text
id                   UUID PRIMARY KEY
user_id              UUID NOT NULL
dispatcher_user_id   UUID NOT NULL
created_at           TIMESTAMPTZ NOT NULL
approved_at          TIMESTAMPTZ NULL
```

同一用户对同一调度员或公司账户只能有一条。注册时每个账号都有一条已批准的自指行：`user_id` 与 `dispatcher_user_id` 都是本人。已有账号在登录或 `me` 时补上。这条不能被解除绑定。对外申请接口仍拒绝向自己申请。`dispatcher_user_id` 可以指向调度员，也可以指向公司账户。`approved_at` 为空表示待批准，对方调度台还看不到这位司导。批准后写入 `approved_at`，行保留，作为「这位调度员或公司账户能看到这位司导」的依据。向调度员申请时，再按该调度员当前所属公司写入 `company_members`。同公司的另一位调度员看不到，公司账户也看不到，除非司导也向对方申请并被批准。没有 `driver_notes` 行时隐藏为 false。调度员解除绑定即删除自己这一行。未完成订单里由他派出或挂在他名下、且分给这位司导的日期清空 `driver_id`，有几天清几天。最后一天早于今天的行程保留。公司成员不动。

---

## 11. 明确不创建的表

第一阶段不创建：

- assignments
- assignment_history
- order_history
- audit_logs
- vehicles
- customers
- suppliers
- payments
- invoices
- notifications
- workflows
- roles
- permissions

---

## 12. 实体关系

```text
companies 1 ──< users            （公司账户持有者）
companies 1 ──< company_members >── users
companies 1 ──< dispatcher_applications >── users
users     1 ──< driver_applications >── users（申请人 / 调度员）
companies 1 ──< orders
drivers   1 ──  users.driver_id
drivers 1 ──< itinerary_days >── 1 orders 1 ──< order_files
                      1
                      │
                      └──< order_activities
```

日历不建独立表。

---

## 13. 本阶段记录的假设

1. 创建订单时不自动生成行程日，由调度员按日期新增。
2. 删除订单时级联删除行程、活动和订单附件记录。
3. 主键使用 UUID，由后端生成。
4. 现有测试订单在结构调整时保留行程日期；原 `title`/`status`/`end_date`/`start_time`/`notes` 无法无损映射，予以丢弃。旧 `source` 曾迁移到 `source_company`，该字段无产品消费方，现由增量 Migration `RemoveUnusedOrderSourceCompany` 删除。
