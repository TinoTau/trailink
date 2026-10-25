# 执行报告：第二人写司导备注撞唯一约束

## 目标

第二个调度员也能给已被别人备注过的司导写自己的备注。不另开第二张备注表。

## 原因

`driver_notes` 已按人隔离。第一次写备注时，卡片失焦和点保存会同时 `INSERT` 同一 `(driver_id, user_id)`，PostgreSQL 报 `23505`。林调度那条「1111」是迁移写入的，再改是更新，所以只有第二人第一次写会炸。

## 改动

- `DriversController`：写入改为 `ON CONFLICT (driver_id, user_id) DO UPDATE`。
- 调度台：备注用 ref + 锁，避免连点两次。
- 测试：同一用户并发两次 PUT 都 200。

## 命令结果

- `dotnet test`：28 通过。

## 未做

- 未重播种、未提交。
- 未再开平行备注表。
