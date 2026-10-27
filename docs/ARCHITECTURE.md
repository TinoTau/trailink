# Trailink V1 技术架构文档

版本：V1 MVP 第一阶段  
日期：2026-10-23  
状态：当前架构基线

---

## 1. 技术栈

后端：

- C#
- ASP.NET Core 10 Web API
- .NET 10 LTS（net10.0），不使用 .NET 9
- SDK：10.0.402（`global.json` 锁定，允许同 feature band 滚动升级）
- Entity Framework Core 10.0.13
- Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3
- Microsoft.AspNetCore.OpenApi 10.0.13
- PostgreSQL 16

前端：

- React
- TypeScript
- Vite
- Ant Design
- Ant Design Calendar
- API transport types 由后端 `/openapi/v1.json` 生成；`types.ts` 只做生成类型别名与纯前端视图模型
- 页面路径、菜单可见性和角色准入统一由 `navigation.ts` 定义

云平台：

- AWS

计划使用的云服务：

- Amazon RDS for PostgreSQL
- Amazon S3
- AWS App Runner（优先评估）或其他适合 .NET 容器的托管服务
- Amazon CloudWatch（基础日志）

本地开发：

- Docker Compose + `postgres:16`
- .NET 10 SDK
- Node.js LTS

部署：

- Docker 容器
- 应用镜像：`mcr.microsoft.com/dotnet/sdk:10.0`、`mcr.microsoft.com/dotnet/aspnet:10.0`
- AWS 托管部署，优先评估 App Runner

AWS 服务选型以简单、低成本、易维护为原则。正式创建收费云资源前，必须提交部署方案、预计成本和资源清单供确认。

---

## 2. 架构原则

采用单体架构：

```text
React Frontend → ASP.NET Core Web API → PostgreSQL
```

文件存储：

```text
ASP.NET Core Web API → Amazon S3
```

本地开发可将 S3 替换为本地文件系统，通过配置切换。

不使用：

- 微服务
- Kubernetes
- Redis
- Kafka
- RabbitMQ
- CQRS
- Event Sourcing
- DDD 复杂分层
- 通用工作流引擎
- AI Agent
- LLM
- GraphQL

调度台 `/dispatcher` 与司机日历一样是独立前端页。进入页面或从其他窗口回到当前页时，重新读取该页数据，未保存的输入保留。读写仍走现有 `orders` / `drivers` / `itinerary_days.driver_id`，不建派单表或日历表。公司把整单交给调度员写 `orders.assigned_dispatcher_user_id`，页面复用 `/company/assign` 的同一套调度台，不另开订单系统。订单所属公司只写 `orders.company_id`：公司建单即本公司，调度员和司导建单都不默认绑所属公司，即使只属于一家；调度员须搜索点选后立即绑定、改绑，或明确传 `null` 解绑。调度员给司导的备注写 `driver_notes`（`user_id` + `driver_id`），由 `/api/drivers/{id}/notes` 独立于司导档案写入。同一行的 `hidden` 表示当前用户在调度台隐藏了这位司导。公司给调度员的备注写 `dispatcher_notes`（`user_id` + `dispatcher_user_id`），只在派给调度里读写，调度员看不到。两个页面都从订单列表取行程日。调度台点开司导时，同一 `GET /api/orders` 带上这位司导的 `driverId`，画出他的全部行程，不限本公司，别人的日期不写公司名或调度员姓名；订单区仍不带这个参数。调度台「所有订单」排除已派完且已结束的历史单，本人日历保留这些日期并显示为已完成。`/company` 的订单：公司账户只看已派完且已结束的历史单；司导看自己当前接的单，调度员看自己当前接的和分配的单，已结束和尚未结束都在内。分配以当前行程日为准，改派后原经手人不再看到。日历按登录用户本人 `driver_id` 过滤。按天拆单只改各行程日的 `driver_id`；多分配人也按拆单处理。司导取消本人行程不看分配人。已绑定 `company_id` 的真实订单派给司导时，现有 `OrderScheduling` / `OrderDriverAssignment` 覆盖并删除该司导自建且未绑公司的占位单；未绑定公司的单不覆盖占位单。与其他真实订单重叠的日期仍写入同一司导，日历标红，点开后按天拆单移除。不另建占位表或覆盖接口。

后端采用简单分层：

- Controllers
- Services（仅在存在实际业务逻辑时使用）
- Data
- Models
- DTOs

不为每张表机械创建 Repository、Service、Interface 等多层抽象。

---

## 3. 项目目录

```text
Trailink/
├── backend/
│   ├── Trailink.Api/
│   │   ├── Controllers/
│   │   ├── Models/
│   │   ├── DTOs/
│   │   ├── Data/
│   │   ├── Services/
│   │   └── Program.cs
│   └── Trailink.slnx
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   └── types/
│   └── package.json
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE_CONTRACT.md
│   ├── API_CONTRACT.md
│   ├── FRONTEND_DESIGN.md
│   ├── DEVELOPMENT_PLAN.md
│   └── reports/
├── docker-compose.yml
└── README.md
```

允许根据实际 .NET SDK 和项目模板进行少量调整，但不得无故增加架构层次。

---

## 4. 数据与文件

- 使用 EF Core Migrations 管理数据库结构。
- 第一阶段核心表：`drivers`、`driver_notes`、`dispatcher_notes`、`orders`、`order_notes`、`itinerary_days`、`order_activities`、`order_files`、`companies`、`company_notes`、`users`、`company_members`、`dispatcher_applications`、`driver_applications`。
- 每人给公司的缩写只写 `company_notes`（`company_id` + `user_id`）。还没有记录时默认写入公司账户已保存的简称，没有则写入公司名前两个字。个人简称写好后不会被公司后来的修改覆盖。公司信息页下拉包含所属公司，以及创建过、被指派、派出或跑过的订单所属公司。司导日历在「公司名+调度员名」超过 6 个字时使用这条缩写。
- 人员名单不跨公司共享。调度台司导只来自当前登录账户已批准的 `driver_applications`（`approved_at` 非空），其中包含注册时自动批准的自指行，公司和调度员可以给自己派单。公司账户和调度员用同一张表：公司只看到向本公司账户申请并批准的司导，看不到调度员带来的司导。调度员解除绑定即删除自己这一行，不另建关系表。未完成订单中由他派出或挂在他名下的日期清空这位司导的 `driver_id`，已结束的行程保留。公司的调度员名单和派给调度只来自本公司 `company_members.role=dispatcher`，其中包含公司账户自己的那一行。注册时写入，旧账号在登录或 `me` 时补上。不能解除自己。派给调度可以隐藏调度员，隐藏写在 `dispatcher_notes.hidden`。解除别人时，未完成且分给他的本公司订单退回公司池。调度员批准司导，或公司订单派给有账号的司导时，可以写入 `company_members.role=driver`，表示司导跟着调度员进了这家公司。这不把司导放进公司账户的调度台。批准前双方都看不到对方。隐藏只读 `driver_notes.hidden`，没有记录就是显示。
- 四种上传（公司二维码、用户头像、电子票、订单截图）共用 `AppFileStore`，根目录 `App_Data/files/{qr,avatars,tickets,orders}/`。库里只存相对路径：`companies.qr_path`、`users.avatar_path`、`order_activities.ticket_path`、`order_files.file_path`。不进 `wwwroot`，不另开第二套存储。旧二维码路径 `company-qr/` 仍可读取。头像在写入前经 `AvatarImage`（SkiaSharp）缩到最长边 256 并压成 JPEG，覆盖时删掉该用户旧文件。二维码 / 电子票 / 订单截图保持原图。订单最后一天起满 7 天后，删掉该单电子票文件和订单截图文件，并清掉 `ticket_path` 与 `order_files` 对应行。活动内容、订单、头像、公司二维码都留下。程序启动后每 6 小时清一次。
- 订单起始日期和行程日期使用 PostgreSQL `DATE` / `DateOnly`。活动预订与签到时间使用 `TIMESTAMP WITHOUT TIME ZONE` / `DateTime`（`Kind=Unspecified`），表示当地钟表时间。
- 司机日历查询和领取/按日期建稿都写现有 `orders` / `itinerary_days`，不建日历表。框选建单与调度台创建订单共用前端 `createOrderWithDays`。领取与调度台派单共用 `PUT /api/orders/{id}/driver` 和同一套占位单覆盖。不提供 `claim` / `range` / preview 日历接口。分配只更新 `driver_id`。公司、调度员、司导登录后都只看自己的 `driver_id`。
- 不引入时区管理框架。正式创建收费云资源前必须另行确认。

---

## 5. 安全与配置

- 保护数据库连接字符串和 AWS 密钥。
- 不将真实密钥提交到 Git。
- 使用环境变量或本地未入库配置文件。
- 需要基本错误处理、输入校验和基础日志。
- 暂不实现业务审计日志。
- Cookie 登录。`users.role` 为 `company` / `dispatcher` / `driver`。不建角色表或权限表。角色变化以数据库为准，不依赖 Cookie 里的角色声明。本人可在个人信息修改 `users.username`、`password_hash` 和 `users.contact`，不另建账号表。公司信息的待批准申请、公司调度员名单、个人信息的司导申请、调度台司导详情，以及我的行程点开日期后的调度员姓名旁，都读 `users.contact`。调度台已分配颜色写 `users.assigned_color`，每人一条，不另建颜色表。

---

## 6. 日志与观测

- 本地使用 ASP.NET Core 默认日志。
- 云端使用 Amazon CloudWatch 收集基础应用日志。
- 不引入独立日志平台或 APM。

---

## 7. 本阶段记录的假设

1. 前端通过 Vite 开发服务器访问后端 API，开发环境开启 CORS。
2. 生产环境可由同一容器或反向代理托管前端静态文件与 API；具体部署方式在 Phase 4 说明中确定，不提前拆分服务。
3. 文件存储先用可替换的本地 `AppFileStore`，不创建正式 AWS 资源。四种文件同一根目录。
4. 技术版本已锁定为 .NET 10 LTS。NuGet 只使用稳定正式版：EF Core 10.0.13、Npgsql EF 10.0.3。不使用 Preview 或 RC。
5. 本机系统 PATH 中可能仍有 .NET 9；开发与 CI 必须以 `global.json` 指定的 .NET 10 SDK 为准。
