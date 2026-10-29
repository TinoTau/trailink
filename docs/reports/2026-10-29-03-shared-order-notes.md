# 订单共用备注

## 目标

公司、调度员、司导各自的订单备注继续互不可见。另加一条三者都能看、都能改的共用备注，显示在各自备注上方。调度台、我的行程、公司信息的订单详情走同一套输入框。

## 改动

- `orders.shared_notes`，增量迁移 `20261028122754_AddOrderSharedNotes`。没有新表，没有改 `InitialCreate`。
- 现有 `PUT /api/orders/{id}` 读写 `sharedNotes`。各自的 `notes` / `driverNotes` 不变。司导日历上别人的单仍不带回这条。
- `OrderInfoFields` 把「共用备注」放在各自备注上面。调度台订单卡、我的行程当日卡片、公司信息订单弹框都用它。
- 权威文档已同步。

## 命令结果

- 本地库已执行这次迁移，给 `orders` 加了可空的 `shared_notes`。
- `dotnet test --filter Order_dispatcher_and_driver_notes_stay_separate|Dispatcher_desk_lists_a_drivers_orders_from_every_company`：2 通过。司导能改共用备注，改不了别人的调度备注；别家的共用备注在司导日历列表里为空。
- `npx tsc --noEmit`：通过。
- 公司账户调度台打开订单编辑：共用备注在公司备注上方。没有点保存。筛选项已回到未分配。

## 未做

- 正在运行的本地接口还是旧进程，浏览器里这次没有保存共用备注。重启接口后才会写入。
- 没有重新打包，没有提交。

## 阻塞

无。

## 下一步

重启本地接口后再在页面上保存共用备注。发布时这次迁移要一起上去。
