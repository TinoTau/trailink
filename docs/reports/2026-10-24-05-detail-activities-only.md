# 司机日历：详情只保留活动

## 目标

行程详情去掉标题、目的地、描述，只展示已添加活动和「添加活动」。

## 改动

- `frontend/src/pages/driver/DriverDayEditor.tsx`：移除卡片头、目的地、描述及对应编辑逻辑。
- `frontend/src/pages/driver/DriverCalendarPage.tsx`：再点同一天收起卡片。
- `frontend/src/pages/driver/driver-calendar.css`：去掉已无用的标题和文本字段样式。
- `docs/FRONTEND_DESIGN.md`、`docs/PRD.md`：同步司机日历详情范围。

## 验证

- 打开 11 月 1 日：卡片文本为「观鲸4 / 删除 / 添加活动」。
- 无标题、无「目的地」、无「行程描述」、无关闭按钮。

## 未做

- 调度端订单页仍可编辑目的地和描述。
- 未改后端字段。

## 下一步

无阻塞。
