# 执行报告：司导日程拖回订单区取消行程

## 目标

调度员把司导日历卡片里的某一天拖到订单区域，即可取消该司导的行程：拆单只取消当天，未拆单取消整单。不新建接口或表。

## 改动

1. 对应现有模块：调度台 `DispatcherPage`，复用 `PUT /api/orders/{id}/days/{dayId}` 与 `PUT /api/orders/{id}/driver`。
2. 司导卡片日期拖拽标记 `from: 'driver'`；落到订单区后：`isSplitOrder` 为真则当天 `driverId` 置空，否则整单解绑。
3. 订单区增加 `data-order-pane` 与 `.dispatcher-pane.drop` 高亮。
4. 同步 `docs/FRONTEND_DESIGN.md`、`docs/PRD.md`、`docs/API_CONTRACT.md`。
5. 不新增实体、不另开取消 API、不关闭卡片。

## 命令结果

- 浏览器：打开张师傅卡片，将 `507F92` 11 月 13 日（拆单）拖到订单区，仅当天解绑，11 月 14 日仍归张师傅。
- 浏览器：将 `536F7B` 12 月 13 日（整单四天均属张师傅）拖到订单区，四天全部解绑，该单回到未分配列表。
- 司导卡片保持打开；11 月 14 日、12 月 11 日等其余行程仍在卡片上。
- ReadLints：无新增问题。

## 未做

- 无新后端接口或测试。

## 阻塞

无。

## 下一步

无。
