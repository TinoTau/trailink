# 司机日历：已有活动只读展示

## 目标

当日行程编辑里只保留一套添加活动模块；已保存活动只展示已填文本，空字段不以占位符输入框出现。

## 改动

- `frontend/src/pages/driver/DriverDayEditor.tsx`：已有活动改为 `SavedActivity` 文本行（内容、已填承办方/时间、有票才显示「电子票」），底部只渲染一套 `ActivityComposer`。
- `frontend/src/pages/driver/driver-calendar.css`：补充已存活动行与删除按钮样式。
- `docs/FRONTEND_DESIGN.md`：同步「已有活动只展示已填文本，底部一套添加模块」。

## 验证

- 浏览器打开 `/driver/calendar`，点击 2026-11-01。
- DOM：`driver-saved-activity` × 1（文本「缆车」），`driver-activity-form` × 1；已存活动无空占位输入。
- 截图确认底部只有一套添加表单。

## 未做

- 未改后端 API 或活动实体。
- 未做调度员日历。

## 下一步

无阻塞。若需要改已有活动，可再加点击进入编辑，而不是默认展开整套表单。
