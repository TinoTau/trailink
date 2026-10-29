# 收掉冲突日期的两处重复

## 目标

我的行程不再为已经不用的图案计算冲突订单列表。弹框排序改用本页已有的订单起始日。

## 改动

- `DriverCalendarPage.tsx`：删掉 `conflictOrderIds`。冲突弹框仍调用 `conflictDateChoices`，图案参数传空列表，`patterns` 仍是 `false`。`ordersByStart` 改为按 `firstOrderDate` 排序。

调度台的图案和排序没有改。

## 验证

只是去掉重复计算，有行程日的订单起始日与原来的 `orderSpan` 相同。没有再点界面，没有打包。
