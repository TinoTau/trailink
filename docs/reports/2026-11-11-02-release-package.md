# 发布包 20261111 2026-11-11

## 文件（在 `release/`）

| 文件 | 说明 |
| --- | --- |
| `trailink-api-20261111.tar.gz` | 后端源码（不含 bin、obj、App_Data、Properties、appsettings.Development.json、*.http） |
| `trailink-web-20261111.tar.gz` | 前端 dist，入口 `index-BxsZeXC7.js` |
| `update-trailink-20261111.sh` | 发布脚本 |

文件名都是新的，不会和服务器上已有的 20261110b / 20261110c 重名。

## 这一版包含（20261110c 之后）

- 公司信息「订单记录」：
  - 过滤改名「全部 / 调度中 / 已接单」；
  - 新增「导出」：
    - 导出新表格：默认样式；
    - 填进我的表格：上传 .xlsx，有 AI 密钥时用 AI 认列；
    - 文件名是原名（或「订单记录-范围」）加新西兰日期和时分秒。
- AI 建单可以粘贴行程文字，粘贴框样式和拖入文件的框一致。
- 派给调度 / 调度台的订单图标：有订单号写订单号，没有写「人数 车型 共用备注」。
- 订单编辑：人数、车型下拉框，带「…」自定义；自定义值打开时照常显示（code review 修复）。
- code review 修复：上传表格限 5MB，同一时间只填一张表；猜表头时优先选有表头的工作表；在粘贴框里粘贴文字时不再当成截图。

## 数据库

- 没有结构改动，也不动数据。
- 脚本先检查 orders 表已有车型、南/北岛两列（20261110 已发过，应已就绪）；没有就停下，什么都不改。

## 脚本做什么

1. 检查数据库两列。
2. 沿用 `~/trailink/claude.env`（AI 密钥），不读、不显示密钥内容（只显示开头 7 个字符确认读到）。
3. 旧后端源码改名备份，解压新源码，保留 `appsettings.Production.json`。
4. `docker compose build api`（会下载 ClosedXML，比平时多几分钟），`up -d --no-deps api`，只动 api 容器。
5. 替换前端 dist，重建 web 容器。
6. 检查：health、订单记录接口 401、天气来源、改日期接口 401、**导出接口 401（新增）**、AI 密钥。

## 检查

- 本机和沙盒的 backend / frontend / docs 逐个文件比对（去掉 CR 后 md5），634 个文件完全一致。
- `dotnet test`：135 个全部通过；`npm run build` 通过。
- 后端包解压后 `dotnet publish -c Release` 成功；包里有 `Services/Export/*`，csproj 带 ClosedXML 0.105.0；没有密钥。
- 本地 api：未登录访问导出接口 GET / POST 都是 401。
- 用假的 docker、curl 在假家目录里演练脚本：检查、备份、保留配置、入口文件名、各项检查全部按预期。

## 用法

1. 把三个文件上传到服务器家目录。
2. `sh update-trailink-20261111.sh`

## 还没解决

- 生产上编辑订单偶尔 500：等 `diagnose-500-20261110.sh` 的输出再看。
