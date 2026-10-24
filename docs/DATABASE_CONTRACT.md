# Trailink V1 数据库契约

版本：V1 MVP 第一阶段  
日期：2026-10-23  
数据库：PostgreSQL  
迁移：EF Core Migrations

第一阶段核心表：`drivers`、`orders`、`itinerary_days`、`order_activities`、`order_files`、`companies`、`users`、`company_members`、`dispatcher_applications`、`driver_applications`。

---

## 1. drivers

```text
id          UUID PRIMARY KEY
name        VARCHAR(100) NOT NULL
phone       VARCHAR(50) NULL
notes       TEXT NULL
```

---

## 2. orders

```text
id                 UUID PRIMARY KEY
order_no           VARCHAR(40) NOT NULL UNIQUE
platform_order_no  VARCHAR(100) NULL
source_company     VARCHAR(200) NULL
start_date         DATE NOT NULL
guest_count        INTEGER NOT NULL
notes              TEXT NULL
company_id         UUID NULL
created_by_user_id UUID NULL
```

外键：

- `company_id` → `companies.id`（创建订单时写入当前公司；调度台「所有订单」不含已派完且已结束的单）
- `created_by_user_id` → `users.id`（公司信息页判断「自己派出」；「自己跑完」看行程日 `driver_id`。不另记派单历史）

规则：

- `order_no` 由后端自动生成，前端不得指定。
- 订单结束日期不落库，从 `itinerary_days.service_date` 的最大值计算。
- 不再保存订单标题和订单状态。
- `start_date` 为行程所在地当地日期，类型 `DATE`，不做 UTC 转换。

---

## 3. itinerary_days

```text
id            UUID PRIMARY KEY
order_id      UUID NOT NULL
service_date  DATE NOT NULL
description   TEXT NULL
end_location  VARCHAR(200) NULL
driver_id     UUID NULL
```

外键：

- `order_id` → `orders.id`
- `driver_id` → `drivers.id`

唯一约束：

- `(order_id, service_date)`

规则：

- 一个订单同一天只保留一条行程记录。
- `service_date` 为行程所在地当地日期，类型 `DATE`，不做 UTC 转换。
- 不记录每日出发时间，不恢复 `start_time`，不新增出发/接人时间字段。
- 删除订单时级联删除对应的每日行程。
- 删除已分配司机时，将关联行程的 `driver_id` 置空。
- 整单派单批量更新各行程日的 `driver_id`。
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

- 一个行程日可以有多个活动项目。
- `sort_order` 是同一行程日内的展示顺序，从 0 起。不按预订时间排序。
- 删除行程日或订单时级联删除活动。
- `booking_time`、`checkin_time` 是活动所在地的当地钟表时间，不是系统操作的 UTC 时间戳。
- 不实现实际签到打卡。
- `ticket_path` 存统一本地存储的相对路径，格式 `files/tickets/{activityId}{ext}`，允许 NULL。不存绝对路径或二进制。

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

文件实际存储在 `App_Data/files/orders/`。`file_path` 为相对路径 `files/orders/{fileId}{ext}`。删除订单时同时删除磁盘文件。

---

## 6. companies

```text
id       UUID PRIMARY KEY
name     VARCHAR(200) NOT NULL UNIQUE
contact  VARCHAR(200) NULL
qr_path  VARCHAR(500) NULL
```

公司账户注册时创建。`contact` 由公司账户编辑，可以是手机号或微信号。`qr_path` 指向统一本地存储的相对路径 `files/qr/{companyId}{ext}`；旧值 `company-qr/...` 仍可读取。调度台订单列表不按公司过滤，但已派完且结束日早于今天的单不出现在调度台。公司信息页按 `orders.company_id` 只展示这类历史订单；非公司账户再按创建人或行程日司导收窄。

---

## 7. users

```text
id             UUID PRIMARY KEY
username       VARCHAR(50) NOT NULL UNIQUE
password_hash  VARCHAR(200) NOT NULL
name           VARCHAR(100) NOT NULL
role           VARCHAR(20) NOT NULL
company_id     UUID NULL
driver_id      UUID NULL
avatar_path    VARCHAR(500) NULL
```

`role` 取值：`company`、`dispatcher`、`driver`。不建角色表。

- 公司账户：`role=company`，`company_id` 指向本公司，一人一家。
- 注册公司或司导时同时写一条 `drivers`，`driver_id` 指向该司机。已有账户若还没有司机身份，登录或 `me` 时补写。
- 调度员与司导可以同时属于多家公司，关系只写 `company_members`，不再占用 `users.company_id`。
- 批准为调度员后写入成员行，并把账户 `role` 设为 `dispatcher`；从最后一家公司移除后回到 `driver`，保留 `driver_id`。
- `avatar_path` 指向压缩后的 `files/avatars/{userId}.jpg`。再次上传时删除该用户旧头像文件。头像、二维码、电子票、订单截图都落在 `App_Data/files/` 下各自子目录，不进 `wwwroot`。

---

## 8. company_members

```text
id          UUID PRIMARY KEY
user_id     UUID NOT NULL
company_id  UUID NOT NULL
role        VARCHAR(20) NOT NULL
```

唯一约束：`(user_id, company_id)`。公司批准调度员后 `role=dispatcher`；调度员批准司导申请后写入 `role=driver`。

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
```

只保留待批准的司导申请。同一用户对同一调度员只能有一条申请。批准后删除该行，并按调度员当前所属公司写入 `company_members`。

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
4. 现有测试订单在结构调整时保留行程日期；原 `title`/`status`/`end_date`/`start_time`/`notes` 无法无损映射，予以丢弃。`source` 写入 `source_company`。
