# 司导界面已共用同一条滑条

## 目标

确认司导界面的控制条和调度台司导详情是同一套，不另做一条。

## 改动

- 没有改代码。我的行程 `DriverCalendarPage` 和调度台司导详情 `DispatcherCalendarCard` 都渲染 `CalendarInkBar`，状态都来自 `useCalendarInk`。透明度、左右位置、触屏长按都在 `calendarInk.tsx`。

## 命令结果

- 浏览器：QA Driver 和林调度的我的行程各有一条滑条，透明度 0.75，默认贴在日历右侧并垂直居中。调度台订单日历没有这条滑条。

## 未做事项

- 没有再打包。桌面上的 `frontend-dist-20261029-ink.tar.gz` 已经包含这条滑条。

## 阻塞

- 无。

## 下一步

- 云端若还是旧页面，执行 `sh "$HOME/update-trailink-20261029-ink.sh"`。
