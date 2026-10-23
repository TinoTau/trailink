# 司机日历：添加活动后立刻变成文本

## 目标

行程详情里点击「添加活动」保存后，新活动直接以文本出现在当日行程，不再停在输入态。

## 改动

- `frontend/src/pages/driver/DriverDayEditor.tsx`：活动列表改本地状态；保存成功立刻追加 `SavedActivity` 并收起表单。默认只显示「添加活动」按钮。
- `frontend/src/pages/driver/driver-calendar.css`：收起态按钮间距。
- `docs/FRONTEND_DESIGN.md`：同步「保存后立刻收成文本行」。

## 验证

- 浏览器打开 `/driver/calendar` 当日卡片，点「添加活动」，填写「观鲸船」后提交。
- 结果：出现文本行「观鲸船」，表单关闭，底部只剩「添加活动」按钮。无报错。

## 未做

- 未改后端 API。
- 未做已有活动的再次编辑。

## 下一步

无阻塞。
