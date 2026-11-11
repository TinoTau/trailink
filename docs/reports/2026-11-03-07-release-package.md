# 打包 2026-11-03 发布

## 发布内容

自上次线上版本以来的全部改动，后端和前端一起更新：

- 抢单（订单等级、抢单页、调度员确认），以及界面收色、橙色标出抢单日期。
- AI 建单（Claude Haiku 5.5，活动库匹配、手机紧凑核对页）。
- 车辆「未配车」筛选。
- 拆单整单拖给司导只派空日期。
- 调度员在我的行程看到别人派给自己的行程（`GET /api/orders?mine=true`）。

## 发布文件（在 `release/`，文件名都是新的）

- `trailink-api-20261103.tar.gz`：后端源码（不含 bin、obj、App_Data、Properties、appsettings.Development.json、.http），服务器用 Dockerfile 编译；新依赖 PdfPig 在编译时下载。
- `trailink-web-20261103.tar.gz`：前端 dist，入口 `index-DDl2fAtn.js`。
- `update-trailink-20261103.sh`：
  - 先检查云端库已有 `order_claims` 表，没有就停下并提示先执行 `apply-schema-20261102b.sh`，不做任何改动。
  - 家目录有 `trailink-claude.key` 时：检查是 `sk-ant-` 开头，写入 `~/trailink/claude.env`（权限 600），删掉上传的密钥文件；没有 `docker-compose.override.yml` 时新建一个，让 api 容器从 `claude.env` 读 `Recognition__ApiKey`。服务器原来的 compose 文件不动。已有 override 文件但没引用 `claude.env` 时只提示、不改。
  - 后端旧源码改名备份，保留服务器上的 `appsettings.Production.json`；只重建、重启 api 容器；前端替换 dist 后只重启 web 容器。
  - 最后检查健康检查、抢单和 AI 建单接口（未登录 401），以及 api 容器是否读到密钥（只显示开头 7 个字符）。
- 数据库结构沿用 `apply-schema-20261102b.sh` + `trailink-schema-20261102b.sql`（20261102b 之后没有新迁移，可重复执行，只加列加表）。

## 验证

- `dotnet test` 124/124 通过；前端 `tsc -b`、生产构建通过。
- 打包前整仓核对：沙盒和本机项目文件夹 600 个文件内容完全一致。
- 后端包按 Dockerfile 的步骤解开、restore、Release publish 通过，输出含 PdfPig、SkiaSharp。
- 更新脚本在沙盒里用假的 docker / curl 演练三种情况：缺表时停止且不改动；密钥格式不对时停止；正常时生成 `claude.env`（600）和 override 文件、删除上传的密钥、保留 `appsettings.Production.json`、前端入口正确。

## 注意

- 数据库：脚本不连接、不改动数据，只读一次 `order_claims` 表是否存在。
- 上传大小：AI 建单一次最多约 40MB。Caddy 默认不限制请求大小，如果服务器的 Caddyfile 里加过 `request_body` 限制，需要放宽。
- 没有提交，没有上传到服务器。
