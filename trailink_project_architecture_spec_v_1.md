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

# 十三、本地 LLM 接入系统说明

Trailink 应采用：

> Local LLM First + Rule Engine + Human Confirmation

即：

- 本地 LLM 负责理解用户自然语言
- 规则引擎负责合规、权限、流程校验
- 系统负责结构化数据落库
- 人工负责关键确认
- 外部大模型只作为复杂场景兜底

Trailink 的目标不是让 AI 完全接管系统，而是：

> 用 AI 替代复杂 ERP 表单操作，让用户通过对话完成业务动作。

---

# 13.1 AI 接入目标

本地 LLM 接入后，Trailink 的用户交互方式应从：

```text
打开页面
填写表单
选择字段
提交审批
等待回复
```

转变为：

```text
用户说一句话 / 发一张图 / 发一段语音
↓
AI 理解并结构化
↓
系统生成草稿
↓
用户确认
↓
系统执行
```

核心目标：

- 降低学习成本
- 减少后台表单操作
- 减少微信群复制粘贴
- 自动生成任务
- 自动整理回复
- 自动推送通知
- 自动归档记录
- 自动生成报账草稿
- 自动识别紧急事件
- 自动总结沟通内容

---

# 13.2 AI 在系统中的位置

```text
用户输入
文字 / 语音 / 图片 / 文件
        ↓
AI Assistant Layer
        ↓
Intent Parser
        ↓
Schema Extractor
        ↓
Validation & Rule Engine
        ↓
Draft Generator
        ↓
Human Confirmation
        ↓
Business Services
Trips / Tasks / Dispatch / Expense / Chat / OCR
```

AI 不直接写核心业务表，而是先生成：

```text
draft
intent
structured_payload
confidence_score
```

再由系统校验和用户确认。

---

# 13.3 本地 LLM 可替代的 ERP 操作

## 1. 创建行程草稿

传统 ERP 操作：

```text
填写客户
填写日期
填写人数
填写路线
填写语言
填写车型
填写备注
```

AI 对话操作：

```text
下周三 6 个客人从 Christchurch 去 Tekapo，两天一晚，想看星空，需要中文司导和 8 座车。
```

LLM 输出：

```json
{
  "intent": "create_trip_draft",
  "start_location": "Christchurch",
  "destination": "Tekapo",
  "duration_days": 2,
  "passenger_count": 6,
  "language_required": "zh-CN",
  "vehicle_seat_count": 8,
  "special_requests": ["stargazing"]
}
```

系统动作：

```text
生成行程草稿
请求用户确认缺失字段
确认后创建 trip
```

---

## 2. 创建司导 / 车辆调度任务

用户输入：

```text
明天 Queenstown 缺一台 8 座车去 Wanaka，预算 500，最好会中文。
```

LLM 输出：

```json
{
  "intent": "create_vehicle_dispatch_task",
  "pickup_region": "Queenstown",
  "dropoff_region": "Wanaka",
  "vehicle_seat_count": 8,
  "budget": 500,
  "language_preference": "zh-CN",
  "date": "2026-05-17"
}
```

系统动作：

```text
生成车辆调度任务草稿
规则检查
确认后广播给匹配车方/司导
```

---

## 3. 紧急事件上报

用户输入：

```text
车坏在 Tekapo 附近了，客人还在车上，需要马上找车接走。
```

LLM 输出：

```json
{
  "intent": "report_emergency_incident",
  "incident_type": "vehicle_breakdown",
  "severity": "high",
  "location_hint": "Tekapo",
  "requires": ["replacement_vehicle", "tourist_transfer"]
}
```

系统动作：

```text
创建 incident 草稿
要求确认定位
通知调度员
搜索附近资源
生成紧急广播草稿
```

注意：

> 紧急事件可以由 AI 自动识别，但广播和派单应由人工确认，除非是预设低风险流程。

---

## 4. 协作市场发布任务

用户输入：

```text
今晚有人从 Queenstown 回 Christchurch 吗？想带一个行李箱，给 80 刀。
```

LLM 输出：

```json
{
  "intent": "create_resource_exchange_post",
  "post_type": "luggage_transfer",
  "location_from": "Queenstown",
  "location_to": "Christchurch",
  "asking_price": 80,
  "currency": "NZD",
  "time_window": "tonight"
}
```

系统动作：

```text
创建协作任务草稿
确认后发布到资源市场
推送给可能顺路人员
```

---

## 5. 报账草稿生成

用户操作：

```text
司导直接发油票图片
```

AI/OCR 动作：

```text
识别票据类型
识别金额
识别日期
识别商户
识别油量
识别是否需要里程表照片
```

LLM 输出：

```json
{
  "intent": "create_expense_item",
  "expense_type": "fuel",
  "amount": 126.50,
  "currency": "NZD",
  "merchant_name": "Z Energy",
  "requires_odometer_photo": true
}
```

系统动作：

```text
生成报账草稿
提醒补充仪表盘照片
提交财务审核
```

---

## 6. 聊天内容总结

适用场景：

- 行程群消息过多
- 紧急事件处理过程复杂
- 多人报价混乱

LLM 输出：

```text
当前结论：
1. John 可 30 分钟内到达，报价 220 NZD。
2. Lily 有 8 座车，但 1 小时后可用，报价 180 NZD。
3. 调度员尚未最终确认。
```

系统动作：

```text
生成摘要
标记待确认事项
提醒负责人处理
```

---

## 7. 自动通知生成

用户输入：

```text
通知附近司导，Tekapo 急需替补车辆，越快越好，可以加价。
```

AI 生成通知草稿：

```text
Tekapo 附近有紧急替补车辆任务。需要尽快接送游客，任务加急，可报价。请点击接受或提交 ETA 与报价。
```

系统动作：

```text
根据规则选择接收人
推送 notification
收集报价与 ETA
```

---

## 8. 多语言任务说明

本地协作人员可能使用英文，地接调度员可能使用中文。

LLM 可负责：

```text
中文任务 → 英文任务说明
英文回复 → 中文摘要
```

但任务核心字段仍必须结构化存储。

---

# 13.4 不应由 LLM 自动替代的操作

以下操作不得由 LLM 直接最终执行：

```text
确认最终派单
确认付款
确认高额报价
确认事故责任
确认合规判断
确认游客投诉结论
确认保险责任
删除关键记录
修改结算金额
解除司导资格
```

这些只能由：

```text
有权限的人类用户
```

确认。

LLM 可以：

```text
生成建议
生成草稿
总结事实
提示风险
```

但不能：

```text
承担最终业务责任
```

---

# 13.5 LLM 执行分级

## Level 0：只读辅助

```text
总结聊天
解释任务
翻译内容
生成通知草稿
```

无需强确认。

---

## Level 1：生成草稿

```text
创建行程草稿
创建任务草稿
创建报账草稿
创建协作帖子草稿
```

需要用户确认后落库。

---

## Level 2：低风险自动执行

```text
发送普通提醒
更新本人状态
标记已读
补全非关键字段
```

可在规则允许下自动执行。

---

## Level 3：高风险需人工审批

```text
紧急广播
动态加价
替换司导
替换车辆
确认报价
财务审批
```

必须人工确认。

---

# 13.6 本地 LLM 技术方案

推荐本地 AI 服务独立部署：

```text
trailink-ai-service
```

职责：

- 意图识别
- JSON 结构化输出
- 聊天摘要
- 通知草稿
- 多语言任务说明
- 简单翻译
- OCR 后处理

---

## 推荐模型运行方式

MVP 可选：

```text
Ollama + Qwen / Llama
```

后续可升级：

```text
vLLM + Qwen
```

要求：

- 支持 JSON Schema 输出
- 支持温度设为低值
- 支持 retry
- 支持日志记录
- 支持模型版本管理

---

# 13.7 AI Gateway

后端不应直接调用某个模型。

应新增：

```text
AI Gateway
```

接口：

```text
POST /ai/parse-intent
POST /ai/summarize-chat
POST /ai/generate-notification
POST /ai/extract-expense
POST /ai/translate-task
```

AI Gateway 内部可以路由到：

```text
Local LLM
Cloud LLM
OCR Service
Translation Service
```

---

# 13.8 本地 LLM 输出规范

所有 LLM 输出必须是严格 JSON。

示例：

```json
{
  "intent": "create_task",
  "confidence": 0.86,
  "requires_confirmation": true,
  "missing_fields": ["exact_time"],
  "payload": {
    "task_type": "vehicle_delivery",
    "pickup_location": "Queenstown",
    "dropoff_location": "Tekapo",
    "budget": 200
  }
}
```

必须包含：

```text
intent
confidence
requires_confirmation
missing_fields
payload
```

---

# 13.9 校验机制

LLM 输出后必须经过：

```text
JSON Schema 校验
Pydantic 校验
权限校验
地区规则校验
合规校验
业务状态校验
```

例如：

```text
没有 P 牌的人不能接 passenger_transport
高风险任务必须人工确认
报价超过阈值必须审批
跨区域任务必须检查 region rule
```

---

# 13.10 置信度控制

建议规则：

```text
confidence >= 0.85
可生成草稿

0.60 <= confidence < 0.85
生成草稿，但标记需人工复核

confidence < 0.60
不生成任务，只向用户追问
```

---

# 13.10.1 游客角色限制与调度责任

Trailink 的核心用户并不是普通游客。

系统必须默认：

> 游客在旅途中通常不会频繁使用系统，也不会主动处理复杂任务、报价、加价或紧急调度。

因此：

- 游客不应承担调度职责
- 游客不应直接参与资源广播
- 游客不应直接进行动态加价
- 游客不应直接与协作网络谈价
- 游客不应直接确认紧急调度付款

所有涉及：

```text
紧急调度
动态加价
替补车辆
替补司导
紧急支援
临时协作
送车
额外费用
```

的操作，应默认由：

```text
地接公司调度员
```

进行确认。

---

# 调度员作为系统核心角色

系统核心操作中心应是：

```text
调度员（Dispatcher）
```

而不是游客。

调度员负责：

- 接收 AI 整理后的任务
- 确认广播范围
- 确认动态加价
- 确认支付与补贴
- 确认替补资源
- 确认任务完成
- 处理异常升级

因此 Trailink 的 AI 与通知系统应优先服务：

```text
调度员
```

而不是游客端。

---

# 游客端设计原则

游客端应尽量轻量。

游客只需要：

```text
查看行程
接收通知
查看联系人
使用翻译
查看紧急联系方式
```

而不需要：

```text
复杂任务系统
调度面板
报价系统
资源市场
紧急广播
```

---

# 紧急调度正确流程

正确流程：

```text
司导/系统发现问题
↓
AI 生成 incident 草稿
↓
通知调度员
↓
调度员确认：
- 是否广播
- 广播范围
- 是否加价
- 补贴金额
↓
系统广播给资源网络
↓
收集回复
↓
AI 整理候选
↓
调度员最终确认
```

而不是：

```text
游客直接发 emergency task
游客直接加价抢人
游客直接支付协作人员
```

---

# 支付责任原则

Trailink 当前阶段应默认：

```text
地接公司
=
责任主体
```

因此：

- 调度员确认价格
- 调度员确认补贴
- 调度员确认额外费用
- 调度员确认紧急加价
- 财务最终结算

协作网络中的：

```text
送车
带物
紧急支援
住宿协助
```

都应：

```text
先由调度员确认
再进入结算
```

---

# AI 角色修正

Trailink 的 AI 不应定位成：

```text
游客 AI 助手
```

而应主要定位成：

```text
AI Dispatch Assistant
```

服务对象优先级：

```text
1. 调度员
2. 地接公司
3. 司导
4. 协作人员
5. 游客（轻量）
```

---

# 13.11 用户体验原则

AI 接入后，Trailink 的交互原则是：

## 对平台方

```text
用一句话创建行程
用聊天确认报价
用通知追踪状态
```

## 对地接调度员

```text
用自然语言发任务
系统自动找人
AI 整理回复
人工最终确认
```

## 对司导

```text
不用学习后台
只接收通知
点击接受/拒绝/报价
按 AI 指引完成步骤
```

## 对协作人员

```text
任务说明自动翻译
步骤清晰
只需按通知完成动作
```

## 对财务

```text
票据自动识别
异常自动标记
人工只处理审核
```

---

# 13.12 最低学习成本设计

系统应优先提供：

```text
聊天入口
语音入口
图片入口
通知入口
```

而不是让用户优先进入复杂后台。

后台页面主要服务：

```text
管理员
调度员
财务
审计
```

普通用户主要通过：

```text
对话 + 通知
```

完成任务。

---

# 13.13 最高运行效率设计

系统效率来自：

```text
AI 自动结构化
任务自动生成
通知自动路由
回复自动整理
状态自动更新
异常自动升级
```

最终目标：

```text
人负责判断
AI 负责整理
系统负责执行
```

---

# 13.14 本地 LLM 与外部大模型分工

## 本地 LLM

处理：

```text
高频
低风险
结构化
内部调度
中文/英文常规任务
```

## 外部大模型

处理：

```text
复杂投诉
多语言复杂沟通
高价值订单
法律/合规解释
复杂游客客服
极低置信度场景
```

---

# 13.15 推荐 MVP AI 功能

第一阶段只做：

```text
1. 自然语言创建任务草稿
2. 自然语言创建紧急事件草稿
3. 聊天摘要
4. 通知草稿生成
5. 票据图片生成报账草稿
6. 任务说明自动翻译
```

不要第一阶段做：

```text
自动派单
自动定价
自动付款
自动处理投诉
自动合规判断
```

---

# 13.16 核心结论

Trailink 接入本地 LLM 后，产品形态应变成：

> AI-native Tourism Dispatch Network

即：

```text
对用户：像聊天软件
对系统：是严格任务系统
对管理者：是实时调度后台
对行业：是资源协作网络
```

本地 LLM 的真正价值不是替代人，而是：

> 替代复杂 ERP 操作，把非结构化沟通转成可执行任务。

---

# 十四、项目核心价值

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

