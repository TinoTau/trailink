# 执行报告：司机日历添加行程与当日编辑

范围：现有司机端日历 + 现有订单 / 行程日 / 活动 / 整单派单  
状态：本轮目标已完成

## 1. 目标

右上角改为「添加行程」：可用订单号领取已有订单，或框选日期新建仅含日期的订单。领取后把行程日分配给预览司机。点击已分配日期可编辑当天行程和电子票路径。

## 2. 对应模块与改动

1. 对应现有司机日历、`OrdersController`、`ItineraryDaysController`、`OrderActivitiesController`。
2. 改动：`DriverCalendarController`、`CalendarDtos`、`OrdersController` 增加 `orderNo` 查询；前端日历页与 `DriverDayEditor`；权威文档。
3. 已有整单派单、建单、建日、活动 CRUD，日历只编排这些路径。
4. 无第二事实来源。分配只写 `itinerary_days.driver_id`。
5. 不新增实体，不建日历表或分配状态字段。
6. 不平行新建订单 CRUD。电子票仍只保存 `ticket_path` 字符串。

## 3. 本轮改动

- `POST /api/driver-calendar/claim`：按系统订单号或平台订单号找到订单，全部行程日写预览司机 `driver_id`。
- `POST /api/driver-calendar/range`：按起止日期新建订单和行程日（仅日期，最多 31 天）并分配预览司机。
- 前端右上角「添加行程」下拉输入订单号；可在日历上拖选起止日期。
- 当日卡片改为编辑目的地、描述、活动、电子票路径，不展示日期和订单号。
- 没有登录时仍由服务器选预览司机，前端 `driverId` 不是身份。

## 4. 命令结果

- `dotnet test Trailink.slnx`：15 通过（新增领取与按范围建稿测试）。
- `npm run build`：成功。
- 浏览器 `/driver/calendar`：打开「添加行程」可见订单号输入；选中 11 月 1 日并创建后，该日出现填充色，展开编辑卡片。保存目的地 Queenstown、活动「缆车」、电子票路径 `gondola-ticket` 成功。卡片无日期、无订单号。

## 5. 未做

- 未做登录隔离和电子票文件上传/下载。
- 未给订单增加独立「分配状态」字段。
- 未做调度员日历。

## 6. 阻塞

无。

## 7. 下一步

身份机制明确后再把预览司机换成当前登录司机；电子票上传仍后置。
