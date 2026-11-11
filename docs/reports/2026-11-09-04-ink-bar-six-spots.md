# 透明度控制条：屏幕左右 × 上中下 6 个位置 2026-11-09

## 需求

所有界面的竖向透明度控制条（调度台司导卡片、我的行程日历）能拖到屏幕左侧或右侧的上、中、下，一共 6 个位置，而不是固定在功能区域的垂直居中、只能左右换边。

## 改动（只改前端）

- `calendarInk.tsx`：
  - 控制条用 `createPortal` 挂到 body 下，`position: fixed`，按整个屏幕定位，不受卡片滚动和动画影响。卡片关了控制条跟着消失。
  - 新增 `CalendarInkLevel`（top / middle / bottom），`useCalendarInk` 返回 `level` 和 `setPlace(side, level)`。位置记在 `trailink.calendar.inkLevel`（新增），左右沿用 `trailink.calendar.inkSide`。
  - `CalendarInkBar` 改为接收整份 `ink`。
  - 操作：
    - 上下拖调透明度，点一下调到点的位置（不变）；
    - 按住约 0.5 秒（滑条放大一点、手机轻震）再往任何方向拖，或鼠标按下横着拖：滑条跟着手指走。
    - 松手时按屏幕中线定左右，按屏幕高度三等分定上中下，停到那一格。
    - 键盘：左右键换侧，Shift+上下键换上中下。
- `calendarDay.css`：6 个位置。
  - 上：离顶 84px，让开页面标题和右上角按钮；
  - 中：屏幕垂直居中；
  - 下：离底 24px；
  - 左右离边 12px；
  - 都加 iPhone 安全区。
  - 还有按住时的放大和移动中的样式。
- `DispatcherPage.tsx`：点空白处关卡片时排除 `.calendar-ink-bar`。控制条挂到 body 后，已不在卡片里面了，不排除的话点一下控制条会把司导卡片关掉（测试中发现，已修）。
- `DriverCalendarPage.tsx`、`DispatcherCalendarCard.tsx`：改用新的 `CalendarInkBar ink={ink}`。
- `localPrefs.ts`：新增偏好键。
- 文档：FRONTEND_DESIGN 透明度一节。

## 验证

- `tsc -b`、lint 通过（calendarInk.tsx 只有原来就有的提示类警告）。
- 沙盒，调度台打开司导卡片，桌面 1366×900（鼠标）和 iPhone 13 模拟（触屏，CDP 触摸事件）各跑一遍：
  - 按住再拖到左上、左中、左下、右上、右中、右下，每次都停到对应的格。
    - 桌面：x=12 或 1326；y=84、384、744。
    - 手机：x=12 或 350；y=84、266、508。
  - 控制条在 body 下。
  - 点一下控制条：数值变了，司导卡片还在。
  - 上下拖：20 → 92，位置不动。
  - 刷新页面再打开司导卡片：停在上次的位置。
  - 关掉司导卡片：控制条消失。
  - 司导自己的「我的行程」页：控制条显示在右中（新账户默认）。
  - 页面没有报错。
