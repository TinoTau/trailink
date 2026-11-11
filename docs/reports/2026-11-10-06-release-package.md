# 打包 2026-11-10 发布

## 范围

2026-11-09 那版发布包之后的全部改动：

- 司导卡片里拖动不再派单。
- 透明度控制条：
  - 可以停在屏幕左右 × 上中下 6 个位置；
  - 我的行程多一档「车牌」。
- 调度台日历：
  - 上下两张日历一起滑；
  - 点订单日期先打开当天的司导，两张日历同一天对齐。
- 公司信息「订单记录」：
  - 表格、按角色过滤（全部 / 调度 / 司导）；
  - 长按：编辑 / 调整日期 / 抢单状态 / 退回公司。
- 订单新增车型、南/北岛：
  - AI 建单会识别，识别不出来按南岛；
  - 编辑订单可改人数、车型、南/北岛（南/北岛一个按钮切换）。
- 所有「保存」移到关闭按钮左边；弹框打开时后面的页面不再跟着滑。

## 数据库

- 有一处结构改动：迁移 `20261109105857_AddOrderVehicleTypeIsland`，给 `orders` 加 `vehicle_type VARCHAR(50)`、`island VARCHAR(10)` 两列。
  - 都可以为空、没有默认值，不改、不删已有数据。
  - 已有订单这两列都是空的：车型显示「—」，南/北岛按南岛显示。
- `trailink-schema-20261110.sql`：
  - EF 生成的幂等脚本，按迁移记录判断，加过就跳过；
  - 和 `update-dev-db.cmd` 给本机库用的是同一个文件。

## 发布文件（`release/`，都是新文件名）

- `trailink-api-20261110.tar.gz`：后端源码（不含 bin、obj、App_Data、Properties、appsettings.Development.json、.http）。
- `trailink-web-20261110.tar.gz`：前端 dist，入口 `index-D4BAokbj.js`。
- `trailink-schema-20261110.sql`：结构补齐。
- `apply-schema-20261110.sh`：
  - 执行前后打印迁移记录和订单数（应相同）；
  - 执行后打印两列是否存在、是否可空，以及已有订单的新列（应全部为空）；
  - 可以重复执行。
- `update-trailink-20261110.sh`：
  - 先只读检查 orders 已有两列，没有就停下、不做任何改动；
  - 沿用服务器上的 `claude.env`；
  - 后端旧源码改名备份，保留 `appsettings.Production.json`，只重建、重启 api 容器；
  - 前端替换 dist，只重启 web 容器；
  - 最后检查：健康检查、订单记录接口和改日期接口（未登录应为 401）、api 是否读到 AI 密钥（只显示开头）。

## 发布步骤

1. 上传五个文件到服务器家目录：两个包、`trailink-schema-20261110.sql`、`apply-schema-20261110.sh`、`update-trailink-20261110.sh`。
2. `sh apply-schema-20261110.sh`：看最后几行，迁移记录第一条是 `20261109105857_AddOrderVehicleTypeIsland`，两列都在，订单数前后一样。
3. `sh update-trailink-20261110.sh`

## 验证

- 打包前整仓核对：沙盒和本机项目文件夹内容一致（本机多的只是 `start-dev.*`、`update-dev-db.cmd`、`fake-weather.mjs` 这些开发用脚本，不进包）。
- `dotnet test`：
  - 第一次 128/129，`GrabTests.Confirm_rechecks_conflicts_and_blocked_claims_disappear` 失败；
  - 单独重跑 3 次都通过，全部重跑 129/129；
  - 这个测试以前就偶尔失败（报告里记过），和这次的改动无关。
- 前端 `tsc -b`、lint（0 个错误）、生产构建通过。
- 后端包解开后 Release publish 通过；包里没有密钥。
- 用临时库演练两个脚本：
  - 建一个停在上一版结构（`AddOrderClaims`）的临时库；
  - 用假的 docker，把脚本里的 psql 命令真的对这个库执行，其他 docker / curl 只打印；
  - 结果：
    - 还没加列就跑更新：停下，没有做任何改动；
    - `apply-schema`：两列加上（都可为空），迁移记录第一条是 `20261109105857_AddOrderVehicleTypeIsland`；再跑一次没有报错、没有重复；
    - 更新：通过结构检查，保留 `appsettings.Production.json`，旧源码改名备份，前端入口 `index-D4BAokbj.js`，旧 assets 清掉。
- 临时库里没有订单，所以「订单数前后一样」是在空表上验证的。加列是 `ALTER TABLE ... ADD`（可空、无默认值），不会改已有行。

## 注意

- 结构改动按这次的要求只加列；除了 `apply-schema` 加两列，脚本不改动云端库的数据。
- 没有提交，没有上传到服务器。
