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

调度台 `/dispatcher` 与司机日历一样是独立前端页，读写仍走现有 `orders` / `drivers` / `itinerary_days.driver_id`，不建派单表或日历表。两个页面都从订单列表取行程日；「所有订单」和本人日历排除已派完且已结束的历史单。历史单只在 `/company` 展示：公司账户看本公司全部，调度员/司导看自己创建或跑过的。日历按登录用户本人 `driver_id` 过滤。按天拆单只改各行程日的 `driver_id`。

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
- 第一阶段核心表：`drivers`、`orders`、`itinerary_days`、`order_activities`、`order_files`、`companies`、`users`、`company_members`、`dispatcher_applications`、`driver_applications`。
- 四种上传（公司二维码、用户头像、电子票、订单截图）共用 `AppFileStore`，根目录 `App_Data/files/{qr,avatars,tickets,orders}/`。库里只存相对路径：`companies.qr_path`、`users.avatar_path`、`order_activities.ticket_path`、`order_files.file_path`。不进 `wwwroot`，不另开第二套存储。旧二维码路径 `company-qr/` 仍可读取。头像在写入前经 `AvatarImage`（SkiaSharp）缩到最长边 256 并压成 JPEG，覆盖时删掉该用户旧文件。二维码 / 电子票 / 订单截图保持原图。
- 订单起始日期和行程日期使用 PostgreSQL `DATE` / `DateOnly`。活动预订与签到时间使用 `TIMESTAMP WITHOUT TIME ZONE` / `DateTime`（`Kind=Unspecified`），表示当地钟表时间。
- 司机日历查询和领取/按日期建稿都写现有 `orders` / `itinerary_days`，不建日历表。框选建单与调度台创建订单共用前端 `createOrderWithDays`。不提供 `claim` / `range` / preview 日历接口。分配只更新 `driver_id`。公司、调度员、司导登录后都只看自己的 `driver_id`。
- 不引入时区管理框架。正式创建收费云资源前必须另行确认。

---

## 5. 安全与配置

- 保护数据库连接字符串和 AWS 密钥。
- 不将真实密钥提交到 Git。
- 使用环境变量或本地未入库配置文件。
- 需要基本错误处理、输入校验和基础日志。
- 暂不实现业务审计日志。
- Cookie 登录。`users.role` 为 `company` / `dispatcher` / `driver`。不建角色表或权限表。角色变化以数据库为准，不依赖 Cookie 里的角色声明。

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
