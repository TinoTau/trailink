# Trailink V1 数据库契约

版本：V1 MVP 第一阶段  
日期：2026-10-23  
数据库：PostgreSQL  
迁移：EF Core Migrations

第一阶段核心表：`drivers`、`orders`、`itinerary_days`、`order_activities`、`order_files`。

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
```

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
- `ticket_path` 是未来 Web 端电子票上传的预留字段，允许 NULL。存储格式未定，不强制 S3 Object Key 或本地绝对路径。本阶段不实现上传、下载或删除。

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

文件实际存储在 S3 或本地开发存储中。本阶段附件上传可后置。

---

## 6. 明确不创建的表

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
- companies
- roles
- permissions

---

## 7. 实体关系

```text
drivers 1 ──< itinerary_days >── 1 orders 1 ──< order_files
                      1
                      │
                      └──< order_activities
```

日历不建独立表。

---

## 8. 本阶段记录的假设

1. 创建订单时不自动生成行程日，由调度员按日期新增。
2. 删除订单时级联删除行程、活动和订单附件记录。
3. 主键使用 UUID，由后端生成。
4. 现有测试订单在结构调整时保留行程日期；原 `title`/`status`/`end_date`/`start_time`/`notes` 无法无损映射，予以丢弃。`source` 写入 `source_company`。
