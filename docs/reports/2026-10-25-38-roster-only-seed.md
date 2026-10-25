# 按名单清空并重建账号

## 目标

清空用户、公司、订单及关联业务数据，再按表格只重建账号。密码统一 `Passw0rd!`。

## SSOT 核对

1. 对应现有 `DemoDataSeeder.ResetAsync` 与 `dotnet run -- --seed-demo`。
2. 未另写灌数脚本，未新增表。
3. 公司归属仍写 `company_members`；刘司导向北岛申请调度员仍写 `dispatcher_applications`。
4. 备注里的「某调度名下 / 共用」在批准后没有独立归属表，只保留所属公司。

## 本轮改动

- `ResetAsync` 先 `TRUNCATE` 全部业务表，再写入表格账号，不再生成演示订单。
- 公司：north 北岛旅运、south 南岛旅运、central 中部旅运。
- 调度员：chen 北岛+中部，lin 北岛，huang 南岛+中部，wu 南岛。
- 司导 drv01–drv13 按表格所属公司入成员；drv05 另有一条向北岛的待批调度员申请。

## 验证结果

- `dotnet run -- --seed-demo` 成功，输出「账号已按名单重建，订单为空」。
- 插入 3 家公司、20 个用户、成员行和 1 条调度员申请；没有订单插入。

## 未做事项

- 未删除 `App_Data/files` 里的旧上传文件。
- 未把「调度员名下」写成第二套司导归属。
