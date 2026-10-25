# 执行报告：司导图标下方优先显示备注

## 目标

调度台司导头像下方展示调度员给该司导写的备注；没有备注时才显示姓名。

## 对应模块与改动

现有调度台司导图标和 `drivers.notes`，不另开字段。

- `frontend/src/orderFlags.ts`：新增 `driverDisplayLabel`，与订单图标共用 12 字截断。
- `frontend/src/pages/dispatcher/DispatcherPage.tsx`：图标和拖拽幽灵用该标签；圆圈字、卡片标题、恢复隐藏仍用姓名。
- `frontend/src/pages/dispatcher/dispatcher.css`：图标文字单行省略。
- 文档：`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 命令结果

浏览器 `/dispatcher`：给王司导写入「北岛常驻备注」后，头像下为该备注、圆圈仍是「王」；无备注的孙司导仍显示「孙司导」。打开王司导卡片后行程区正常。验证后已把王司导备注清空。

## 未做

- 未重播种、未提交。
