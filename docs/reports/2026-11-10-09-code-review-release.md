# Code review 与打包 2026-11-10（第二版，文件名带 b）

## 范围

20261110 那版发布包之后的全部改动：

- 车辆标签「未配车 N单」。
- 电脑网页适配：
  - 日历卡片最宽 720px，居中；
  - 「我的行程」日历居中；
  - 公司信息正文放宽到 800px。
- 订单记录跳到调度台：
  - 点司导打开订单和司导；
  - 点车牌打开车辆和司导；
  - 点「未派单」打开订单；
  - 派了司导、没配车的单，点「未配车」打开车辆管理里的这位司导；
  - 公司账户不在自己调度台上的单，到「派给调度」打开。
- 订单记录的选中和返回：
  - 选中的行是灰底，能跳的格子是一块圆角白面；
  - 点表格外面取消选中；
  - 调度台左上角浮着一个返回按钮，点了回到原来那条订单记录。
- 调度台日历显示天气，页头注明天气来源。
- 调度台创建订单的按钮改回蓝色实心的「创建订单」（这次打包前按你的要求改的）。

## Code review

逐个看了这些改动涉及的文件：

- 后端：`CompanyDeskController.Orders`、`AuthDtos`。
- 前端：`CompanyOrderRecords`、`DispatcherPage` 里的跳转和返回、`dispatcherJump`、`OrderPane`、`DispatcherCalendarCard`。
- 样式：`dispatcher.css`、`order-records.css`、`account.css`、`driver-calendar.css`。

发现并改了这些：

1. 返回时滚动页面的延时回调：用户 0.4 秒内离开了公司信息页的话，回调还会执行。表格已经不在页面上，位置算出来是 0，页面会被滚到奇怪的地方。现在先看这一行还在不在页面上，不在就不滚。
2. 司导、车牌名字上还留着一个已经不用的 `data-jump-kind` 属性和对应参数，删掉了。
3. 两处过时的注释（「底色加线框」「创建订单的添加」）改成现在的样子。

上一轮已经改过的：

- 只有点了返回按钮回来才恢复选中，避免自己再打开公司信息时上次的选中还在、一点就跳走。

确认没有问题的：

- 权限：
  - 后端的 `onDesk` 用的是原来的 `OrderRules.IsOnDesk`，`canReturn` 的判断规则没变；
  - 只是自己跑的单 `canEdit`、`onDesk` 都是 false，不会出现跳转。
- 跳转到「派给调度」只发生在公司账户自己公司的单上：调度员的 `canEdit` 一定伴随 `onDesk`。
- 跳转信息只用一次：调度台第一次读完数据后打开，并从浏览器记录里去掉，刷新不会再跳。
- 后端没有带新字段（旧版本）时，订单记录照常显示，只是不能跳。
- 返回按钮 `z-index: 30`，不会盖住 antd 的弹框和提示（1000 以上）。
- 宽屏的限宽只在宽度 ≥ 900px 时生效，手机不变。

## 测试

- `dotnet test`：第一次 128/129，第二次全部重跑 129/129，又单独跑了 3 次 `GrabTests.Confirm_rechecks_conflicts_and_blocked_claims_disappear` 都通过。这是以前就记过的偶发失败，和这次的改动无关。
- 前端：`tsc -b` 通过，lint 0 个错误，生产构建通过。
- 创建订单按钮（Playwright，1366 宽）：
  - 框选日期后，头上出现蓝色（#1677ff）白字、高 36px 的「创建订单」；
  - 点了以后订单从 0 张变成 1 张；没有页面报错。
- 跳转、返回、取消选中、天气、宽屏：都在电脑 1366 宽和 iPhone 13 上测过，见报告 2026-11-10-08。

## 打包（`release/`，都是新文件名）

- 打包前把本机项目文件夹和沙盒逐个文件核对了一遍：
  - 文件一样多；
  - 有差别的只有换行符（本机是 CRLF），去掉 CR 后内容相同；
  - 唯一真正的差别是这次 review 改的 `CompanyOrderRecords.tsx`，已经同步。
- `trailink-api-20261110b.tar.gz`：
  - 后端源码，排除规则和上一版相同（不含 bin、obj、App_Data、Properties、appsettings.Development.json、.http）；
  - 文件清单和 20261110 那版完全一样（163 项）；
  - 包里没有密钥（只有注释里提到密钥的格式）；
  - 解开后 Release publish 通过。
- `trailink-web-20261110b.tar.gz`：前端 dist，入口 `index-BrQNLmSI.js`，没有 sourcemap。
- `update-trailink-20261110b.sh`：
  - 和上一版的发布脚本一样：
    - 先只读检查 orders 表已有车型、南/北岛两列，没有就停下、不做任何改动；
    - 沿用 `claude.env`；
    - 后端旧源码改名备份，保留 `appsettings.Production.json`，只重建、重启 api；
    - 前端替换 dist，只重启 web。
  - 最后多检查一个天气来源接口。
- 这一版没有数据库结构改动，没有新的 SQL。

## 发布步骤

- 服务器已经发过 20261110 那版：
  1. 上传 `trailink-api-20261110b.tar.gz`、`trailink-web-20261110b.tar.gz`、`update-trailink-20261110b.sh` 到家目录；
  2. 执行 `sh update-trailink-20261110b.sh`。
- 还没发过 20261110：
  1. 再上传 `trailink-schema-20261110.sql`、`apply-schema-20261110.sh`；
  2. 先执行 `sh apply-schema-20261110.sh`；
  3. 再执行 `sh update-trailink-20261110b.sh`。

## 脚本演练

用一个假的家目录、假的 docker 和 curl（只打印，不真的执行）演练了发布脚本：

- 数据库已有两列时：
  - 旧源码改名备份，`appsettings.Production.json` 保留；
  - 前端入口是 `index-BrQNLmSI.js`，旧的 assets 清掉；
  - 检查步骤都执行了。
- 数据库缺这两列时：提示先执行 apply-schema，然后停下，没有做任何改动（没有生成新的备份目录）。

## 注意

- 发布不改动云端数据库。
- 没有提交，没有上传到服务器。

## 补充：创建订单按钮写出起止日期，重新打包（文件名带 c）

- 需求：调度台创建订单的按钮和司导界面一致，写出起止日期。
- 改法：
  - 框选日期后，头上的蓝色按钮写「添加 11月15日–11月17日」，只选一天时写「添加 11月15日」。
  - 「仅日期」移到底部说明里：
    - 手机上第一版按钮带着「仅日期」有 235px 宽，把标题挤成了竖排；
    - 去掉以后 188px，标题「创建订单」一行放得下。
  - 卡片头不再写拖选说明。这句和底部说明是重复的，而且头上空间不够。
- 测试（电脑 1366 宽、iPhone 13）：
  - 按钮蓝底白字、高 36px、不换行，标题一行；
  - 点了以后订单从 0 张变成 1 张；
  - 没有页面报错。
- 发布包改用新文件名（带 c），20261110b 那组不要用：
  - `trailink-api-20261110c.tar.gz`：后端，和 b 内容相同；
  - `trailink-web-20261110c.tar.gz`：前端，入口 `index-DhSuZ17S.js`；
  - `update-trailink-20261110c.sh`：
    - 只改了包名和入口文件名，其他步骤和 b 一样；
    - 演练过：保留 `appsettings.Production.json`，前端入口对得上。
- 发布步骤同上，把 b 换成 c：
  - 上传 `trailink-api-20261110c.tar.gz`、`trailink-web-20261110c.tar.gz`、`update-trailink-20261110c.sh`；
  - 执行 `sh update-trailink-20261110c.sh`；
  - 没发过 20261110 的，先执行 `sh apply-schema-20261110.sh`。
