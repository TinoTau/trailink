# Trailink V1

轻量级旅游包车订单管理系统。当前阶段为 V1 MVP 第一阶段。

目标框架已锁定为 **.NET 10 LTS（net10.0）**，不使用 .NET 9。

## 技术栈

后端：

- C# / ASP.NET Core 10 Web API
- Entity Framework Core 10.0.13
- Npgsql.EntityFrameworkCore.PostgreSQL 10.0.3
- PostgreSQL 16
- OpenAPI

前端：

- React + TypeScript + Vite
- Ant Design

本地基础设施：

- Docker Compose 运行 PostgreSQL
- 应用镜像使用 `mcr.microsoft.com/dotnet/sdk:10.0` 与 `mcr.microsoft.com/dotnet/aspnet:10.0`

云平台规划（未经批准不创建收费资源）：

- Amazon RDS for PostgreSQL
- Amazon S3
- AWS App Runner
- Amazon CloudWatch

## 环境要求

- .NET SDK 10.0.402 或同 feature band 更高版本
- Node.js LTS（前端阶段使用）
- Docker Desktop（本地 PostgreSQL）

当前仓库根目录的 `global.json` 会强制使用 .NET 10 SDK。

如果本机默认 `dotnet` 仍是 9.x，请先安装 .NET 10 SDK，或使用用户目录中的 SDK：

```powershell
& "$env:LOCALAPPDATA\Microsoft\dotnet\dotnet.exe" --version
```

## 本地启动

```powershell
docker compose up -d postgres
cd backend
dotnet restore Trailink.slnx
dotnet ef database update --project Trailink.Api --startup-project Trailink.Api
dotnet test Trailink.slnx
dotnet run --project Trailink.Api
```

另开终端：

```powershell
cd frontend
npm install
npm run dev
```

启动后：

- 前端：`http://localhost:5173`
- 健康检查：`http://localhost:5168/api/health`
- OpenAPI：`http://localhost:5168/openapi/v1.json`

本地数据库连接串使用开发占位值，不包含真实密钥。AWS 密钥不得提交到 Git。

## 当前范围

第一阶段仅实现：司机 CRUD、订单 CRUD、每日行程 CRUD、附件管理、整单/按天派单、订单与司机日历。

不实现派单历史、权限、AI、财务和自动调度。
