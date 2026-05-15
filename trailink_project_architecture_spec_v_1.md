# Trailink
## Tourism Operations & Dispatch Network

Version: V1.0  
Date: 2026-05-16

---

# 一、项目定义

Trailink 不是传统旅游 ERP，也不是单纯包车管理软件。

Trailink 的定位是：

> 面向旅游行业的实时调度与协作网络（Tourism Operations & Dispatch Network）

系统核心目标：

- 管理正式旅游行程
- 调度司导与车辆资源
- 处理旅游行业实时协作
- 提供紧急调度能力
- 建立旅游行业资源网络
- 替代微信群式碎片化沟通
- 为未来 AI 翻译与自动化能力预留接口

Trailink 的核心并不是游客流量，而是：

- 实时资源
- 调度能力
- 协作网络
- 行业沟通
- 动态资源池
- 紧急支援

---

# 二、系统核心角色

## 1. 平台方 / 行程发起人

负责：

- 创建行程需求
- 查看报价
- 确认方案
- 查看执行状态
- 对账与付款

---

## 2. 地接公司

负责：

- 行程管理
- 司导调度
- 车辆调度
- 紧急处理
- 财务结算
- 行业内协作

### 地接公司角色

#### 公司管理员

权限：

- 管理公司
- 管理成员
- 查看全部订单
- 管理报价规则
- 查看财务

#### 调度员

权限：

- 发布任务
- 指派司导
- 指派车辆
- 发布紧急广播
- 处理异常

#### 财务

权限：

- 审核报账
- 对账
- 结算

#### 只读人员

权限：

- 查看订单与状态

---

## 3. 正式司导（Licensed Guide / Driver）

负责：

- 正式接送
- 驾驶
- 行程执行
- 游客协调
- 正式载客责任

要求：

- P endorsement
- 合规保险
- 正式资质

---

## 4. 协作人员（Support Crew）

负责：

- 送车
- 带物
- 临时支援
- 后勤
- 机场协助
- 紧急协作

不默认承担正式载客责任。

---

## 5. 车辆提供方

车辆来源：

- 地接公司
- 司导自有车
- 第三方车行
- 临时租赁

---

# 三、系统总体架构

```text
Web 管理端
平台方 / 地接公司 / 调度 / 财务
        |
        v
REST API / WebSocket
        |
        v
Trailink Backend

├── Auth
├── Users
├── Organizations
├── Trips
├── Dispatch
├── Vehicles
├── Guides
├── Tasks
├── Chat
├── Emergency Dispatch
├── Collaboration Marketplace
├── Expense & OCR
├── Vehicle Inspection
├── Training
├── Notifications
├── Translation Layer
├── File Storage
└── Audit Logs

        |
        v
SQLite

        |
        v
Object Storage / Uploads
```

---

# 四、前端架构

## Web 管理端

面向：

- 平台方
- 地接公司
- 调度员
- 财务
- 管理员

主要页面：

- Dashboard
- 行程管理
- 派单管理
- 司导管理
- 车辆管理
- 紧急调度
- 协作市场
- 聊天系统
- 财务与报账
- OCR 审核
- 车况审核
- 培训系统

---

## 微信小程序

面向：

- 司导
- 协作人员
- 车方

主要页面：

- 我的行程
- 可抢任务
- 紧急广播
- 我的车辆
- 聊天
- 上传报账
- 上传车况
- 协作市场
- 收入结算

---

# 五、推荐技术栈

# 前端

## Web

- React
- Next.js
- TypeScript
- TailwindCSS
- Shadcn UI
- Zustand
- TanStack Query

## 微信小程序

- Taro 或原生微信小程序
- TypeScript

---

# 后端

推荐：

- Python FastAPI

理由：

- 开发效率高
- 异步能力强
- 适合 AI/OCR 集成
- WebSocket 支持良好
- 适合单体架构

主要组件：

- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- WebSocket
- APScheduler

---

# 数据库

## 当前阶段

- SQLite

原因：

- MVP 足够
- 部署简单
- 单机开发方便

## 后续升级

未来可升级：

- PostgreSQL
- PostGIS
- Redis

---

# 文件存储

当前：

- 本地 uploads

未来：

- S3
- Cloudflare R2
- MinIO

---

# 实时通信

- WebSocket

用途：

- 聊天
- 调度状态
- 紧急广播
- 实时位置

---

# AI / OCR

当前阶段：

- OCR 接口预留
- AI 接口预留

未来可接：

- OpenAI
- GPT Realtime
- Google Vision
- Azure OCR
- Whisper

---

# 六、核心模块

# 1. 行程模块（Trip System）

负责：

- 行程创建
- 行程状态
- 多日路线
- 人数
- 语言要求
- 行程生命周期

## trips

```text
id
platform_org_id
local_operator_org_id
title
start_date
end_date
pickup_location
dropoff_location
passenger_count
language_required
status
created_at
```

status：

```text
created
quoted
confirmed
dispatching
assigned
in_progress
completed
cancelled
settled
```

---

# 2. 调度模块（Dispatch System）

负责：

- 指派司导
- 指派车辆
- 发布任务
- 广播附近资源
- 替补调度

---

# 3. 统一任务系统（Task System）

系统核心抽象。

## tasks

```text
id
task_type
related_type
related_id
creator_user_id
assigned_user_id
status
priority
pickup_location
dropoff_location
start_time
end_time
reward_amount
created_at
```

## task_type

```text
trip_assignment
vehicle_dispatch
emergency_dispatch
collaboration
vehicle_delivery
expense_review
inspection
booking
```

---

# 4. 紧急调度模块（Emergency Dispatch）

负责：

- 车辆故障
- 临时缺车
- 司导失联
- 游客延误
- 紧急替补
- 附近广播

## dispatch_incidents

```text
id
trip_id
incident_type
severity
reported_by_user_id
description
latitude
longitude
status
created_at
```

## incident_type

```text
vehicle_breakdown
guide_absent
traffic_delay
accident
vehicle_unavailable
weather_issue
other
```

---

# 5. 实时定位模块（Live Location）

## live_locations

```text
id
user_id
vehicle_id
trip_id
latitude
longitude
speed
heading
accuracy
source
recorded_at
```

source：

```text
wechat_gps
manual
vehicle_device
```

---

# 6. 资源状态模块（Availability）

## guide_availability

```text
id
guide_user_id
status
current_trip_id
current_latitude
current_longitude
available_from
available_until
last_active_at
```

status：

```text
offline
idle
reserved
on_trip
emergency
resting
```

---

# 7. 协作市场（Collaboration Marketplace）

负责：

- 顺路协作
- 带物
- 送车
- 住宿互助
- 门票转让
- 行业内协作

## resource_exchange_posts

```text
id
post_type
creator_user_id
related_trip_id
title
description
location_from
location_to
start_time
end_time
asking_price
negotiable
status
created_at
```

## post_type

```text
ride_share
item_delivery
vehicle_delivery
room_share
room_transfer
room_request
ticket_transfer
ticket_request
other
```

---

# 8. 聊天系统（Chat System）

替代微信群。

特点：

- 行程绑定
- 权限隔离
- 可关联业务事件
- 支持翻译

## chat_rooms

```text
id
trip_id
room_type
title
created_at
```

room_type：

```text
dispatch
guide
vehicle
finance
client
emergency
```

## chat_messages

```text
id
room_id
sender_user_id
message_type
content
file_url
created_at
```

---

# 9. 报账系统（Expense & Reconciliation）

负责：

- 油票上传
- 门票上传
- 停车费
- OCR 识别
- 仪表盘识别
- 对账

## expense_claims

```text
id
trip_id
submitted_by_user_id
status
total_amount
created_at
```

## expense_items

```text
id
claim_id
type
amount
expense_date
merchant_name
status
```

## type

```text
fuel
ticket
parking
toll
meal
hotel
other
```

---

# 10. OCR 模块

统一 OCR 接口。

## 支持类型

```text
fuel_receipt
ticket_receipt
odometer
vehicle_damage
booking_confirmation
```

## translation_tasks

```text
id
related_type
related_id
ocr_type
input_file_id
status
result_json
created_at
```

---

# 11. 车况管理（Vehicle Inspection）

负责：

- 行程前检查
- 行程后检查
- 外观照片
- 仪表盘照片
- AI 异常识别接口预留

## vehicle_inspections

```text
id
trip_id
vehicle_id
inspection_type
submitted_by_user_id
status
created_at
```

inspection_type：

```text
before_trip
after_trip
maintenance
incident
```

---

# 12. 培训系统（Training System）

负责：

- 路线培训
- 安全培训
- 司导培训
- 协作人员培训

## training_courses

```text
id
title
category
region
status
created_at
```

## category

```text
route
safety
service
emergency
policy
```

---

# 13. 翻译层（Translation Layer）

独立能力层。

未来支持：

- 聊天翻译
- 语音翻译
- GPT Realtime
- 实时字幕

## translation_tasks

```text
id
related_type
related_id
source_language
target_language
input_text
output_text
provider
status
created_at
```

---

# 七、系统通信架构

## API

采用：

- REST API

## 实时通信

采用：

- WebSocket

用于：

- 聊天
- 紧急广播
- 实时位置
- 调度状态

---

# 八、核心接口设计

# Auth

```text
POST /auth/login
POST /auth/wechat-login
POST /auth/refresh
```

---

# Trips

```text
GET /trips
POST /trips
GET /trips/{id}
PATCH /trips/{id}
```

---

# Tasks

```text
GET /tasks
POST /tasks
POST /tasks/{id}/accept
POST /tasks/{id}/complete
```

---

# Dispatch

```text
POST /dispatch/incidents
POST /dispatch/broadcast
GET /dispatch/nearby-guides
GET /dispatch/nearby-vehicles
```

---

# Chat

```text
GET /chat/rooms
POST /chat/rooms
POST /chat/rooms/{id}/messages
```

---

# Expense

```text
POST /expense-claims
POST /expense-items
POST /expense-items/{id}/submit
POST /expense-items/{id}/approve
```

---

# OCR

```text
POST /ocr/tasks
GET /ocr/tasks/{id}
```

---

# Vehicle Inspection

```text
POST /vehicle-inspections
POST /vehicle-inspections/{id}/files
POST /vehicle-inspections/{id}/review
```

---

# Translation

```text
POST /translation/text
POST /translation/audio
POST /translation/realtime-session
```

---

# 九、系统状态流

# 行程状态

```text
created
quoted
confirmed
dispatching
assigned
in_progress
completed
cancelled
settled
```

---

# 任务状态

```text
open
broadcasting
accepted
assigned
in_progress
completed
cancelled
expired
```

---

# 紧急事件状态

```text
reported
broadcasting
matched
resolved
cancelled
```

---

# 十、MVP 开发阶段

# P0（核心系统）

必须实现：

- 登录
- 权限
- 公司管理
- 行程管理
- 司导管理
- 车辆管理
- 派单
- 任务系统
- 聊天
- 文件上传

---

# P1（调度与协作）

实现：

- 实时定位
- 紧急广播
- 紧急调度
- 协作市场
- 送车任务
- 带物任务
- 住宿互助
- 门票转让

---

# P2（财务与风控）

实现：

- 报账
- OCR
- 里程识别
- 车况检查
- 对账

---

# P3（AI 与翻译）

实现：

- GPT 翻译
- 实时语音翻译
- AI OCR
- AI 车况异常识别
- AI 自动摘要

---

# 十一、未来扩展方向

未来 Trailink 可扩展：

- PostgreSQL + PostGIS
- Redis GEO
- AI Dispatch
- ETA 预测
- 动态加价
- 自动资源推荐
- AI 行程助手
- 语音调度
- 自动翻译聊天室
- 行业内资源热力图

---

# 十二、国际化、多地区规则与 AI 曝光

Trailink 未来面向不同国家、地区和本地协作人员，因此系统必须从第一版预留国际化与地区规则能力。

---

# 12.1 国际化目标

系统需要支持：

- 多语言 UI
- 多语言通知
- 多语言聊天翻译
- 多语言培训资料
- 多语言任务说明
- 多地区货币
- 多地区时区
- 多地区合规规则
- 多地区服务类型差异

核心原则：

> 语言、地区、货币、法规、服务规则不能写死在业务代码里。

---

# 12.2 多语言内容模型

所有面向用户展示的重要内容，都应支持 translation key 或多语言内容表。

## localized_contents

```text
id
entity_type
entity_id
field_name
language_code
content
created_at
updated_at
```

示例：

```text
entity_type = training_course
entity_id = 123
field_name = title
language_code = zh-CN / en-NZ / ja-JP
```

适用对象：

- 培训课程
- 路线说明
- 任务模板
- 系统通知
- 费用类型
- 车况检查说明
- 紧急事件模板
- 协作市场分类

---

# 12.3 用户语言偏好

## user_language_profiles

```text
id
user_id
primary_language
preferred_ui_language
preferred_notification_language
spoken_languages
translation_required
created_at
```

用途：

- Web / 小程序自动选择语言
- 聊天自动翻译
- 任务说明按用户语言展示
- 通知按用户语言发送

---

# 12.4 地区配置系统

系统需要按地区控制规则。

## regions

```text
id
country_code
region_code
name
timezone
currency_code
default_language
status
```

示例：

```text
country_code = NZ
region_code = NZ-CAN
name = Canterbury
currency_code = NZD
timezone = Pacific/Auckland
```

---

# 12.5 地区规则引擎

新增模块：

> Regional Rules Engine

用于控制不同地区的业务限制。

## regional_rules

```text
id
region_id
rule_key
rule_value_json
effective_from
effective_to
status
```

规则示例：

```text
requires_p_endorsement_for_passenger_transport = true
allow_unlicensed_support_tasks = true
max_driver_work_hours_per_day = 13
fuel_reimbursement_policy = actual_receipt
currency = NZD
```

---

# 12.6 能力与合规控制

不同国家或地区对司导、司机、车辆、保险、商业运输的要求不同，因此任务派发前必须经过规则校验。

## capability_requirements

```text
id
region_id
task_type
required_capability
required_document_type
blocking_level
```

blocking_level：

```text
hard_block
warning
manual_review
```

示例：

```text
task_type = passenger_transport
required_capability = has_p_endorsement
blocking_level = hard_block
```

---

# 12.7 地区化任务模板

不同地区可启用不同任务类型。

## regional_task_templates

```text
id
region_id
task_type
title_key
description_key
enabled
requires_review
```

例如在新西兰启用：

```text
vehicle_delivery
item_delivery
emergency_support
room_transfer
ticket_transfer
```

但对 passenger_transport 类任务进行更严格限制。

---

# 12.8 货币与价格区间

价格历史必须按地区、路线、货币记录。

## regional_price_indexes

```text
id
region_id
task_type
route_hash
currency_code
price_min
price_max
price_median
sample_count
updated_at
```

用途：

- 协作任务建议报价
- 紧急调度动态加价
- 旺季价格参考
- 地接公司报价辅助

---

# 12.9 AI 可发现性与曝光入口

Trailink 未来需要允许游客、司导、车方、本地协作人员通过 AI 搜索、搜索引擎、地图、社交平台发现不同入口。

这不是普通 SEO，而是：

> AI Search Discoverability / LLM Discoverability

目标：

- 游客搜索“Queenstown 中文旅游协助”时能发现合适入口
- 本地人搜索“旅游兼职支援”时能发现加入入口
- 地接公司搜索“新西兰旅游调度系统”时能发现 B2B 入口
- AI 助手理解 Trailink 提供哪些服务

---

# 12.10 多级公开入口

系统应准备不同公开页面。

## Public Entry Pages

```text
/tourists
/operators
/guides
/vehicle-suppliers
/support-crew
/emergency-dispatch
/resource-exchange
```

对应用户：

```text
游客
平台方
地接公司
司导
车方
本地协作人员
```

---

# 12.11 结构化公开数据

公开页面需要提供结构化信息，方便搜索引擎和 AI 抓取。

建议支持：

- sitemap.xml
- robots.txt
- JSON-LD
- Open Graph
- 多语言 hreflang
- 服务区域 landing pages
- FAQ pages
- llms.txt

示例页面：

```text
/regions/new-zealand/queenstown
/regions/new-zealand/tekapo
/regions/new-zealand/christchurch
/services/emergency-dispatch
/services/vehicle-delivery
/services/guide-network
```

---

# 12.12 AI 搜索描述文件

预留：

```text
/.well-known/ai-plugin.json
/llms.txt
/llms-full.txt
```

用途：

- 向 AI 搜索说明系统能力
- 暴露公开服务说明
- 暴露不同用户入口
- 提供 API 文档摘要

---

# 12.13 公共 API 与内部 API 分离

公开曝光入口不能直接暴露内部调度系统。

应分为：

```text
Public API
Partner API
Internal API
```

## Public API

用于公开查询：

```text
GET /public/regions
GET /public/services
GET /public/entry-points
GET /public/faqs
```

## Partner API

用于合作方：

```text
POST /partner/trips
GET /partner/trips/{id}
POST /partner/quotes
```

## Internal API

用于平台内部调度：

```text
POST /dispatch/incidents
POST /tasks/{id}/accept
POST /expense-items/{id}/approve
```

---

# 12.14 国际化接口设计

## Languages

```text
GET /i18n/languages
GET /i18n/messages?language=en-NZ
PATCH /users/me/language-profile
```

## Regions

```text
GET /regions
GET /regions/{id}/rules
GET /regions/{id}/task-templates
```

## Public Exposure

```text
GET /public/entry-points
GET /public/regions/{region_code}
GET /public/services/{service_slug}
GET /public/ai-discovery
```

---

# 12.15 国际化开发要求

第一版开发时应避免：

- UI 文案写死
- 货币写死
- 时区写死
- 地区规则写死
- 任务类型规则写死
- 合规限制写死

所有核心配置应从：

```text
regions
regional_rules
localized_contents
regional_task_templates
```

读取。

---

# 12.16 本阶段建议

MVP 阶段不需要完整国际化运营，但必须实现：

- language_code 字段
- region_id 字段
- currency_code 字段
- timezone 字段
- localized content 基础表
- regional rules 基础表
- public entry pages 结构
- sitemap / JSON-LD / llms.txt 预留

这样未来扩展到不同国家和地区时，不需要重构主系统。

---

# 十三、项目核心价值

Trailink 的真正价值不是：

- 旅游官网
- OTA
- 打车平台

而是：

> 旅游行业实时资源协作网络

核心壁垒：

- 调度网络
- 实时资源
- 行业协作
- 紧急支援
- 区域资源池
- 实时沟通
- 价格沉淀
- 行业信誉体系

---

# 十三、项目定位总结

Trailink 是：

> 面向旅游行业的实时调度与协作操作系统。

英文定位：

> A real-time operational network for tourism logistics, dispatch, and collaboration.

