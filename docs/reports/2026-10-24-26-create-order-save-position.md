# 创建订单确认按钮移到右下角

## 目标

创建订单卡片的确认按钮从左下角改到右下角。

## 对应模块与改动

1. 现有模块：调度台创建订单卡片页脚。
2. 改动：`frontend/src/pages/dispatcher/dispatcher.css` 的 `.dispatcher-card-footer` 右对齐；`docs/FRONTEND_DESIGN.md` 补一句位置。
3. 无新接口、无新实体、无第二路径。

## 验证

调度台打开创建订单、点 9 月 1 日后，「添加 9月1日 仅日期」距页脚左边 425px、右边 12px，已贴在卡片右下角。

## 未做

- 未改司导界面建单按钮位置。
