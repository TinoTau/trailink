# 执行报告：按分配人而不是创建人决定能否取消

## 目标

修复调度员把自己分配出去的单拖不回来。上一轮误用订单 `created_by` 当分配人。

## 对照

1. 现有模块：调度台司导日历解绑，`itinerary_days.driver_id`。
2. 改动：行程日增加 `assigned_by_user_id`（当前分配人，解绑清空），派单时写入；日历姓名和解绑都看它，旧数据回退 `created_by`。
3. 已有 `created_by` 表示谁创建订单，继续给公司信息页用。
4. 不是第二套派单表，也不是派单历史。
5. 不新增实体，只加行程日字段。
6. 读模型多 `assignedByUserId` / `assignedByName`；解绑权限按分配人。

## 命令结果

- `dotnet ef migrations add AddItineraryDayAssignedBy` + `database update`：已应用，已派日期回填创建人。
- `dotnet test`：26 通过（含 `Assigner_can_clear_even_if_not_creator`）。

## 未做

- 未重新 seed，未提交。
