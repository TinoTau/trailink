# 复查一行按钮和取消选择

## 目标

复查去掉「奥」、按钮改成一行，以及再点已选按钮清空住宿位置。确认没有第二套选择、保存或日历取字。

## 改动

没有改代码。

## 命令结果

- 常用地点只在 `PLACE_PRESETS`：基、凯、特、瓦、皇、蒂、但。按钮只由 `PlaceMarkBar` 渲染，一行样式只在 `.place-mark-bar`。
- 再点已选的常用按钮，或再点已经变成汉字的「...」，都调用同一个 `onSelect('')`。保存仍是 `savePlace` → `itineraryDayWrite`。空值由 `TextValue.NullIfBlank` 写成 null。
- 未选中的「...」只负责打开输入框。确定后仍调用同一个 `onSelect`。
- 订单日历、派给调度、司导日历、我的行程和冲突日期都用 `placeMark` 取第一个字，再用 `CalendarDayCaption` 绘制。地点为空时不画字。

## 未做

- 没有打包，没有提交。

## 阻塞

无。

## 下一步

无。
