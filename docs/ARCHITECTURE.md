# Trailink V1 技术架构文档

版本：V1 MVP 第一阶段  
日期：2026-10-23（2026-11-01 重排，补上实际部署方式）  
状态：当前架构基线

业务规则见 `PRD.md`，界面交互见 `FRONTEND_DESIGN.md`，表结构见 `DATABASE_CONTRACT.md`，接口见 `API_CONTRACT.md`。本文只写技术结构，以及每个业务概念由哪段代码负责。

---

## 1. 技术栈

后端：

- C# / ASP.NET Core 10 Web API，.NET 10 LTS（`net10.0`），不使用 .NET 9
- SDK 10.0.402（`global.json` 锁定，允许同 feature band 滚动升级）
- Entity Framework Core 10.0.13，Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3
- Microsoft.AspNetCore.OpenApi 10.0.13
- SkiaSharp（服务端头像压缩）
- PostgreSQL 16
- NuGet 只用稳定正式版，不用 Preview / RC

前端：

- React 19、TypeScript、Vite、React Router
- Ant Design 6（不用它的顶栏和第三方日历组件，日历是自绘的）
- dayjs
- 接口类型由 `@hey-api/openapi-ts` 从后端 `/openapi/v1.json` 生成，`npm run api:types`
- 代码检查 `oxlint`

---

## 2. 架构原则

单体应用：

```text
浏览器（React） → Caddy（静态文件 + 反向代理 /api） → ASP.NET Core Web API → PostgreSQL
                                                       └→ 本地文件目录 App_Data/files/
```

不使用：微服务、Kubernetes、Redis、消息队列（Kafka / RabbitMQ）、CQRS、Event Sourcing、DDD 复杂分层、通用工作流引擎、AI Agent / LLM、GraphQL、时区管理框架。

后端简单分层：`Controllers`、`Services`（只在有实际业务逻辑时）、`Data`、`Models`、`DTOs`。不为每张表机械创建 Repository / Service / Interface。

单一事实来源（SSOT）规则见 `.cursor/rules/ssot.mdc`，代码风格见根目录 `vibe coding代码规范`。要点：一个业务概念只有一个权威定义、一条实现路径；改现有代码，不另开平行的 Controller、表、页面或文档。

---

## 3. 项目目录

```text
trailink/
├── backend/
│   ├── Trailink.slnx
│   ├── Trailink.Api/
│   │   ├── Controllers/     每个资源一个控制器
│   │   ├── DTOs/            请求 / 响应结构
│   │   ├── Data/            DbContext、增量 Migrations、演示数据与清库命令
│   │   ├── Models/          EF 实体
│   │   ├── Services/        有业务逻辑的部分（见第 4 节）
│   │   ├── Dockerfile
│   │   └── Program.cs
│   └── Trailink.Api.Tests/  xUnit 集成测试（连本地 PostgreSQL）
├── frontend/
│   └── src/
│       ├── api/             接口调用；generated/ 为自动生成的类型，不手改
│       ├── auth/            登录状态
│       ├── pages/           页面；dispatcher/、driver/ 两个大页面各自一个目录
│       ├── navigation.ts    路由、菜单、角色准入的唯一定义
│       ├── types.ts         生成类型的别名和纯前端视图模型
│       └── *.ts(x)          日历格子、浮雕、冲突弹框、日期工具等共用模块
├── docs/                    六份基线文档 + reports/ 执行报告
├── docker-compose.yml       只用于本机 PostgreSQL
└── README.md
```

---

## 4. 业务概念由哪段代码负责

| 概念 | 后端 | 前端 |
|------|------|------|
| 登录、当前用户 | `AuthSession`、`AuthController` | `auth/`、`api/auth.ts` |
| 「今天」 | `BusinessDate`（`Pacific/Auckland`） | `localDate.todayLocal`（同一时区） |
| 订单规则：派出人、结束、进行中、历史单、拆单、占位单、显示名 | `OrderRules` | 读后端返回的 `label` / `isSplit` / `isFinished` / `isInProgress` / `isHistorical` / `hasDriverConflict` |
| 订单接口响应（字段映射、规则结果、各人备注、按身份隐藏） | `OrderPresenter` | — |
| 订单和行程日要带出的关联数据 | `Data/OrderQueries`（`WithSummary` / `WithDetails`） | — |
| 错误响应和文件响应格式 | `Controllers/ControllerResults` | `api/client.ts` |
| 本人司导身份、自指批准记录 | `DriverIdentity`（注册、登录、`me` 时补齐） | — |
| 调度台能看到哪些司导 | `DriverRoster.Visible`（已批准的 `driver_applications`） | `api/drivers.ts` |
| 公司成员与调度员 | `CompanyMembership`、`CompanyDeskController`、`CompaniesController` | `pages/CompanyPage.tsx` |
| 司导申请与解除 | `DispatchersController` | `pages/ProfilePage.tsx` |
| 订单与行程 CRUD | `OrdersController`、`ItineraryDaysController`、`OrderActivitiesController` | `api/orders.ts`、`OrderInfoFields`、`DriverDayEditor` |
| 派单、取消、拆单权限、退回公司池 | `OrderDriverAssignment` | `orderFlags.isOwnAssignment`（只比较后端给出的派出人） |
| 冲突检测、同日占用、占位单覆盖、附件过期 | `OrderScheduling` | `ConflictDatePopover`（只负责弹出选择） |
| 各人备注（订单 / 司导 / 调度员） | `ViewerNotes` | `OrderInfoFields`、`pages/dispatcher/useOrderInfoDraft` |
| 公司简称 | `CompanyNotes`（含写入） | `CompanyPage`、`currentCompany.ts` |
| 车辆与车辆绑定 | `VehiclesController`、`ItineraryDaysController`（`/vehicle`） | `pages/dispatcher/VehicleBoard.tsx`、`api/vehicles.ts` |
| 驾照照片 | `LicensePhotosController` | `pages/LicenseGallery.tsx`、`api/license.ts` |
| 照片大图查看（车辆、驾照、活动库共用） | — | `pages/PhotoViewer.tsx` |
| 活动库：目的地匹配、模糊搜索、防重名、评分汇总、弹框排序 | `ActivityLibrary`、`LibraryController`、`OrderActivitiesController`（`from-library`） | `api/library.ts`、`pages/library/` |
| 活动拖动排序（活动选择框、已选、当日活动共用；⋮⋮ 把手立即拖，其他位置长按约 0.5 秒） | — | `useHoldReorder.ts` |
| 常用住宿地点（含固定 Id、英文名，迁移时写入 `destinations`） | `Services/Weather/Places` | `api/places.ts` |
| 文件存储 | `AppFileStore`、`AvatarImage` | `photoImage.ts` + `photoImage.worker.ts`（只在后台线程压缩，没有后备） |
| 附件定时清理 | `ExpiredAttachmentCleanup`（启动后每 6 小时） | — |
| 常用住宿地点（名称、浮雕字） | `Services/Weather/Places`，`GET /api/places` | `api/places.ts`（`usePlaces`） |
| 天气（查询地点、按活动选地点、定时刷新、文字） | `Services/Weather/`：`ForecastPoints`、`WeatherRules`、`WeatherOptions`（选来源）、`MetNorwayClient`、`MetServiceClient`、`OpenMeteoClient`、`WeatherRefresh`、`WeatherForecasts`、`WeatherText` | 日期格 `CalendarDayCaption` 的 `weather` |
| 日历格子、浮雕、日期 | — | `calendarDay.tsx`、`calendarInk.tsx`、`placeMark.ts`、`localDate.ts` |
| 日历框选起止日期 | — | `useCalendarRangePick.ts`（我的行程和调度台创建订单共用） |
| 调度台图标排列、拖拽落点、日历对齐、卡片拉高 | — | `pages/dispatcher/boardLayout.ts`、`boardDrag.ts`、`boardCalendar.ts`、`paneLift.ts` |
| 调度台页面分工 | — | `DispatcherPage.tsx` 持有数据和各张日历的联动；`useBoardDrag.ts` 负责全局拖拽监听（按下、长按、拖动、松手落点、点击）；`OrderPane.tsx` 是订单区（订单 / 车辆切换、创建订单、打开的订单或当日卡片）；`DriverPane.tsx` 是司导区（图标、已隐藏、司导卡片、调度员订单池、驾照）。 |
| 本机偏好（键名统一在这里） | — | `localPrefs.ts` |
| 共用图标 | — | `pages/icons.tsx` |
| 页面数据刷新 | — | `usePageLoad.ts`（进入页面、回到窗口时重新读取，保留未保存输入） |

不建立的东西（防止出现第二个事实来源）：

- 派单表、派单历史表：派单只写 `itinerary_days.driver_id` + `assigned_by_user_id`；车辆只写 `itinerary_days.vehicle_id`。
- 日历表：所有日历都从 `GET /api/orders` 的行程日画出。调度台点开司导时，同一接口带 `driverId` 参数。
- 订单状态、结束日期列：由行程日期计算。
- 占位单表、覆盖接口：占位单就是普通订单（`company_id` 为空、建单人是这位司导本人），覆盖逻辑在 `OrderDriverAssignment` 里。
- 角色表、权限表：角色是 `users.role`。
- 第二套前端 DTO：类型全部来自 OpenAPI 生成。

---

## 5. 数据与文件

- 库结构只通过 EF Core 增量 Migration 改。禁止改写已应用的 Migration，禁止重建库来绕开迁移。
- 订单起始日期、行程日期：PostgreSQL `DATE` / C# `DateOnly`。
- 活动预订、签到时间：`TIMESTAMP WITHOUT TIME ZONE` / `DateTime`（`Kind=Unspecified`），表示当地钟表时间。前端禁止用 `toISOString()` 提交。
- 文件根目录 `App_Data/files/`，子目录 `qr`（公司头像）、`avatars`、`tickets`、`orders`（订单截图）、`vehicles`、`licenses`。库里只存相对路径，不进 `wwwroot`，不存二进制。旧路径 `company-qr/` 仍可读取。
  - 用户头像：服务端用 SkiaSharp 缩到最长边 256 并压成 JPEG，覆盖时删掉旧文件。
  - 车辆、驾照照片：页面里压成 jpg、最长边 1600 后上传。
  - 公司头像、电子票、订单截图：保持原图。
- 附件过期：订单最后一天起满 7 天后，删除电子票文件和订单截图文件，清掉 `ticket_path` 与 `order_files` 对应行。

---

## 6. 日期与「今天」

- 业务只在新西兰，「今天」统一按 `Pacific/Auckland` 计算，不依赖服务器或容器的时区（云端容器默认是 UTC）。
- 后端判断已结束、历史单、附件过期、解除绑定时保留哪些行程，都用同一个「业务今天」。
- 前端的「今天」同样按新西兰日期计算。
- 后端统一从 `Services/BusinessDate.cs` 取，前端统一从 `localDate.todayLocal()` 取，两边都按 `Pacific/Auckland`。

---

## 7. 安全与配置

- 登录：Cookie `trailink.auth`，HttpOnly、SameSite=Lax、滑动过期 14 天。未登录返回 401，不重定向。
- 默认所有接口都需要登录，只有健康检查、注册、登录、OpenAPI 文档例外。
- 密码：PBKDF2（HMAC-SHA256，10 万次迭代）加盐哈希。
- 角色以数据库为准，不读 Cookie 里的角色声明。
- 本阶段不做按订单归属的数据权限（见 PRD 第 2 节），下一阶段统一补上。
- 连接字符串和密钥不进 Git。仓库里的 `appsettings.json` 只有本机开发用的占位连接串；云端通过环境变量配置。
- 开发环境 CORS 只允许 `localhost:5173` / `127.0.0.1:5173`。

---

## 8. 部署（实际情况）

- 域名 `trailink.cc`，DNS 在 Cloudflare，只做 DNS 解析（`DNS only`，不走 Cloudflare 代理）。
- 一台 Google Cloud 虚拟机：e2-micro，us-west1，1 GB 内存 + 2 GB 交换空间。
- 虚拟机上用 Docker Compose 跑三个容器：
  - `postgres`：数据卷 `trailink_pgdata`，端口不对公网开放
  - `api`：用 `backend/Trailink.Api/Dockerfile` 构建，监听 8080，不对公网开放；`App_Data` 和登录密钥（Data Protection）各有数据卷
  - `web`：Caddy，提供 `frontend/dist` 静态文件并把 `/api` 反向代理到 `api`；80/443 对外，自动申请 HTTPS 证书
- 生产用的 compose 文件、Caddyfile 和发布脚本都是一次性的，不放进仓库。
- 发布方式：本机打包，通过浏览器 SSH 上传到虚拟机家目录再执行脚本。
  - 只改前端：上传 `frontend/dist` 压缩包，只重建 `web` 容器。
  - 改了后端：上传改动的后端文件，重建 `api` 镜像。
  - 改了库结构：只有用户明确说明需要时才处理云端库。到时单独写一个只新增表或列、可以重复执行的 SQL 脚本，并补写迁移历史记录；不和前端发布混在同一个脚本里。
- 备份（用户 2026-11-01 要求）：服务器上的定时任务，只读数据库，不改业务数据。
  - 脚本和数据都在 `~/trailink-backups/`。和发布脚本一样不放进仓库，安装时由 `install-backup-cron.sh` 复制。
  - crontab 每小时第 7 分钟执行 `trailink-backup.sh auto`：
    - 新西兰时间 03 点：全量。
    - 其他时间：增量。
    - 用文件锁防止重叠。
  - 全量：`pg_dump -Fc` 整库，存到 `full/`。
    - 用 `pg_restore -l` 校验通过才算成功。
    - 保留最新 7 份，多的删除。
    - 成功后删除 `incremental/` 里的全部增量，增量从这次全量开始的时刻重新算起。
  - 增量：存到 `incremental/`，没有改动不生成文件。
    - 导出订单相关五张表 `updated_at` 在上次增量之后的行（往前多取 10 分钟，防止漏掉当时未提交的事务），以及 `backup_deletions` 里同期的删除记录。
    - 每张表一个 CSV，打成一个 tar.gz。
  - 还原：`trailink-restore.sh <全量> [增量…]` 只还原到一个新建的 `trailink_restore_时间` 库，不碰正在用的库。
    - 增量按时间顺序处理：按主键覆盖改动的行，再删除记录里删掉的行。
    - 检查无误后，是否切换由人工决定。
  - 日志在 `~/trailink-backups/backup.log`。备份在同一台虚拟机上，虚拟机整机丢失时备份也会丢；需要异地副本时另行处理。
- 本机开发和测试只用本机库，不连云端库。
- 云端库定时备份（用户 2026-11-01 要求）：
  - 虚拟机上 cron 每小时第 5 分钟执行 `~/trailink-backup/trailink-backup.sh`，用 postgres 容器里的 `pg_dump -Fc` 全量导出。只读，不改数据。
  - 备份存放路径默认 `~/trailink-backups`，可在安装时指定。文件名 `trailink-YYYYMMDD-HHMM.dump`（新西兰时间），保留 7 天，滚动删除。
  - 先写临时文件，用 `pg_restore --list` 校验后再改名；失败时不删旧备份。剩余空间低于 500MB 时跳过。日志在 `~/trailink-backup/backup.log`。
  - 只备份数据库，不含上传的照片和电子票（`App_Data` 数据卷）。备份和数据库在同一块磁盘上，虚拟机整机损坏时一起丢失。
  - 脚本和发布脚本一样是一次性的，不放进仓库。恢复要另起一个临时库验证后再决定，不直接覆盖线上库。
- 发布红线（线上是真实用户和真实订单）：
  - 发布不动云端库：不连接、不迁移、不导入、不导出。只有用户明确说明需要备份或导入数据时才操作。
  - 不执行 `docker compose down -v`，不删除任何数据卷。
  - 不在云端运行 `--seed-demo`、`--wipe-data`、`--wipe-orders`。
  - 不导入本机数据库，不改写或删除已有业务数据。

---

## 9. 外部服务：天气

- 来源由 `Weather:Source` 选择。三种来源都实现 `IWeatherSource`，都返回（地点，新西兰日期）→ 短词，前端照原样显示：
  - `MetNorway`（默认，线上使用）：MET Norway Locationforecast 2.0（`https://api.met.no/weatherapi/locationforecast/2.0/compact`）。
    - 免费，CC BY 4.0 / NLOD，允许商用，不需要密钥。
    - 使用条款：User-Agent 写应用名和网站（`Trailink/1.0 (+https://trailink.cc)`，在 `Program.cs` 设置）；坐标最多 4 位小数；每秒不超过 20 次；不在 `Expires` 之前重复请求。每 3 小时一轮，每个地点 1 次请求，满足条款。
    - 前约 60 小时为逐小时，之后每 6 小时一段，共约 9–10 天。6 小时段的降水平均摊到每小时，和 MetService 共用 `WeatherText.Summarize` 汇总。符号含 `thunder` 记雷暴，`fog` 记雾。
    - 在新西兰没有降水概率。
  - `MetService`（需要密钥）：MetService Point Forecast API（`https://forecast-v2.metoceanapi.com`，`POST /point/time`，请求头 `x-api-key`）。免费 Starter 档每月 5 万单位，只允许原型测试；正式使用至少 Basic 档（30 美元/月）。
    - 一次请求查全部地点、从新西兰今天 0 点起 240 小时、4 个变量：`precipitation.rate`、`cloud.cover`、`air.temperature.at-2m`、`air.visibility`。
    - 计费 = 变量数 × 地点数 = 40 单位/次，一天 8 次，一个月约 1 万单位。
  - `OpenMeteo`（需要密钥）：Open-Meteo Forecast API 商用版（`https://customer-api.open-meteo.com`），14 天、`weather_code` 和 `precipitation_probability_max`，短词写概率（如「降雨50%」）。免费版禁止商用，不使用。
- 页面底部注明来源：前端读 `GET /api/weather/source`。
- 配置：`appsettings.json` 的 `Weather` 节放来源（`Source`，默认 `MetNorway`）和可选地址（`BaseUrl`，留空用来源的正式地址）；密钥只放服务器环境变量 `Weather__ApiKey`，不进 Git。需要密钥的来源没有密钥时不查询，日历不显示天气。
- 后端测试（`ApiFactory`）移除定时刷新，跑测试不会请求外部接口。
- 查询地点：10 个（7 个常用地点、奥马鲁、库克山机场、米尔福德峡湾游客中心，清单在 `ForecastPoints`），一次请求查全部。
- 刷新时间：启动后 1 分钟内一次；之后新西兰时间 02:17、05:17、08:17、11:17、14:17、17:17、20:17、23:17，再加 0–5 分钟随机偏移，避开整点高峰。一天 8 次。
- 失败时 5、15、45 分钟后重试，仍失败就等下一个时段，期间保留上一批数据。
- 结果只存在接口进程内存里（`WeatherForecasts`），不写数据库；订单接口在行程日上带出 `weather`。
- 一天显示哪里的天气由 `WeatherRules` 决定：住宿地，或当天的库克山、峡湾项目（见 PRD 第 8 节）。

## 10. 日志与观测

- ASP.NET Core 默认日志，云端用 `docker compose logs` 查看。
- 不引入独立日志平台或 APM，暂不做业务审计日志。
