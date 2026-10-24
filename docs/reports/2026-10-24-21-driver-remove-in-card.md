# 执行报告：司导移除移到卡片

## 目标

司导图标上的移除按钮改到司导卡片里，放在备注按钮右侧并留间距，避免误触。

## 改动

1. 对应现有调度台：`DispatcherPage`、`DispatcherCalendarCard`。
2. 图标右上角只留置顶；移除作为卡片可选按钮，仅司导卡传入 `onRemove`。
3. 移除与备注间距约 18px（标题 gap 6px + `margin-left` 12px）。
4. 仍写现有 `localStorage` 隐藏列表；点移除后关闭该卡片。
5. 同步 `docs/FRONTEND_DESIGN.md`、`docs/PRD.md`、`docs/DEVELOPMENT_PLAN.md`。

## 命令结果

- 浏览器：司导图标上不再有移除，只剩置顶。
- 打开张师傅卡片：名字旁是备注，右侧是移除，关闭仍在卡片右上角。
- 点移除后张师傅进入已隐藏，卡片关闭；恢复后图标回来。
- 订单卡片没有移除按钮。
- ReadLints：无新增问题。

## 未做

- 无。

## 阻塞

无。

## 下一步

无。
