# Trailink

新西兰南岛旅游包车的订单与派单系统。公司把订单交给调度员，调度员在调度台把行程派给司导，司导在「我的行程」日历里查看和管理自己的行程。

线上地址：`https://trailink.cc`（真实用户、真实订单）。

## 文档

| 文档 | 内容 |
|------|------|
| `docs/PRD.md` | 业务规则：角色、订单、派单、车辆、日历 |
| `docs/ARCHITECTURE.md` | 技术结构、代码分工、部署 |
| `docs/DATABASE_CONTRACT.md` | 表结构 |
| `docs/API_CONTRACT.md` | 接口 |
| `docs/FRONTEND_DESIGN.md` | 页面和交互 |
| `docs/DEVELOPMENT_PLAN.md` | 进度和待办 |
| `docs/reports/` | 每轮开发的执行报告，只用来追溯 |
| `vibe coding代码规范` | 代码规范 |
| `.cursor/rules/` | 单一事实来源（SSOT）和执行报告规则 |

## 技术栈

- 后端：ASP.NET Core 10（.NET 10 LTS）、EF Core 10、PostgreSQL 16
- 前端：React 19、TypeScript、Vite、Ant Design 6

## 环境要求

- .NET SDK 10.0.402 或同 feature band 更高版本（`global.json` 锁定，不能用 .NET 9）
- Node.js LTS
- Docker Desktop（本机 PostgreSQL）

如果系统 PATH 里的 `dotnet` 还是 9.x，用用户目录里的 .NET 10：

```powershell
& "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe" --version
```

## 本机启动

```powershell
docker compose up -d postgres
cd backend
dotnet restore Trailink.slnx
dotnet ef database update --project Trailink.Api --startup-project Trailink.Api
dotnet run --project Trailink.Api
```

接口要在 `backend/Trailink.Api` 目录下启动（`dotnet run --project` 或进入该目录），否则读不到 `appsettings.json` 里的连接串。

另开终端：

```powershell
cd frontend
npm install
npm run dev
```

- 前端：`http://localhost:5173`（`/api` 由 Vite 代理到后端）
- 健康检查：`http://localhost:5168/api/health`
- OpenAPI：`http://localhost:5168/openapi/v1.json`
- 改了接口后重新生成前端类型：`npm run api:types`（后端需在运行）

手机在同一局域网试用：`npm run dev -- --host 0.0.0.0`，再用电脑的局域网地址打开。

## 测试与检查

```powershell
cd backend
dotnet test Trailink.slnx

cd ../frontend
npm run build
npm run lint
```

后端测试连的是 `appsettings.json` 里的本机开发库，会往里面写测试数据。本机开发只用本机库，任何时候都不连云端库。

## 天气

「我的行程」的天气默认来自 MET Norway（挪威气象局）。它免费、允许商用、不需要密钥，页面底部注明来源即可。

另外保留两个需要付费订阅才能用于线上的来源，用环境变量切换。密钥不写进仓库：

```powershell
$env:Weather__Source = "MetService"     # 或 OpenMeteo；不设就是 MetNorway
$env:Weather__ApiKey = "你的密钥"        # 只有 MetService、OpenMeteo 需要
```

需要密钥的来源没有设置密钥时不查询天气，其他功能不受影响。

## 本机数据命令

以下命令只用于本机开发库，**绝对不能在云端运行**：

```powershell
cd backend/Trailink.Api
dotnet run -- --seed-demo     # 清空并写入演示数据（密码都是 Passw0rd!）
dotnet run -- --wipe-data     # 清空全部业务表
dotnet run -- --wipe-orders   # 只清空订单、行程、活动和订单附件，保留用户和公司
```

## 发布

线上跑在一台 Google Cloud 虚拟机上（Docker Compose：PostgreSQL + API + Caddy）。发布方式和红线见 `docs/ARCHITECTURE.md` 第 8 节。最重要的一条：**发布不动云端库**。不连接、不迁移、不导入导出，不执行 `docker compose down -v`，不在云端运行上面的数据命令；只有明确说明要备份或导入数据时才操作。
