# 代码整理：业务规则收口、去重、拆分大文件

## 目标

按 `2026-11-01-02-code-review.md` 的清单重构。用户确认：

- 完全重构，不考虑接口兼容。
- 照片压缩去掉主线程后备，浏览器不支持就报错，项目默认在手机上用。
- 置顶图标统一用斜放的图钉。

不新增数据库迁移，不碰云端库。

## 改动

### 后端

- 新增 `Services/BusinessDate.cs`：「今天」统一按 `Pacific/Auckland`。原来 4 处 `DateTime.Today`（服务器时区）全部改用它。
- 新增 `Services/OrderRules.cs`：订单规则只定义一次。
  - 派出人回退。
  - 结束日期、已结束、进行中。
  - 历史单：写成表达式，数据库查询和内存判断用同一份。
  - 拆单、真实订单、占位单条件、订单显示名。
  - 原来散在 `OrderScheduling`、`OrderDriverAssignment`、`ItineraryDaysController`、`CompanyDeskController` 里的 6 处写法都改用它。
- 新增 `Services/OrderPresenter.cs`：订单和行程日的接口响应只从这里生成。
  - 包括字段映射、规则结果、当前用户自己的调度备注和公司简称。
  - 调度台查看别人订单时的隐藏也在这里，隐藏时连 `label` 一并去掉。
  - 原来散在 `OrdersController`（`ToSummary` / `PresentDetailAsync` / `HideOutsideDesk`）、`ItineraryDaysController.ToRead`、`OrderActivitiesController.ToRead` 里。
- 接口新增字段（见 `API_CONTRACT.md`）：
  - 订单：`label`、`isSplit`、`isFinished`、`isInProgress`、`isHistorical`、`hasDriverConflict`。
  - 行程日：`hasDriverConflict`、`hasVehicleConflict`。
  - 公司信息的订单缩略：`label`。
  - 行程日 `assignedBy*`：后端已经回退到建单人。
- `OrderScheduling.FindOverlapsAsync`：一次查询算出同一司导、同一辆车同一天被两张以上订单占用的位置。
- 新增 `Data/OrderQueries.cs`：订单和行程日的 Include 链原来复制了 2 份，现在只定义一次。
- 合并备注写入：
  - 订单调度备注的读写从控制器挪进 `ViewerNotes`。
  - 公司简称的写入挪进 `CompanyNotes`。
- 新增 `Controllers/ControllerResults.cs`：
  - 统一校验错误、无权限、排期冲突三种错误响应，代替 57 处手写的 `Problem(...)`。
  - 统一「打开已存文件」，代替 7 个控制器里各自的写法。
- `AppFileStore.StoredName`：上传文件名的截断，车辆照片、驾照照片、订单截图共用。
- `Program.cs`：OpenAPI 文档用和控制器相同的数字设置。生成的前端类型里不再出现 `number | string`。
- 删除死代码：`OrderScheduling.IsDriverPlaceholder`、`VehiclesController.OwnAsync`。
- 车辆绑定、解绑改为先调接口，再重新读取调度台，不再在页面里局部改数据。这样冲突标记始终以后端为准。

### 前端

- 重新生成 `src/api/generated/`。原来那份是手工改过的：车辆、驾照的类型是手写的，接口函数也缺。`types.ts` 去掉数字类型的转换。
- `orderFlags.ts`：
  - 删掉前端自己算的规则：拆单、历史单、未完成、进行中、结束日期、派出人回退、冲突订单。
  - 改为直接读后端返回的结果。
  - `orderDisplayLabel` 只负责截断。
- 新增 `pages/PhotoViewer.tsx`：车辆照片和驾照照片原来各写了一整套大图查看，现在共用一份。
  - 包括左右滑动、横杠、点空白关闭、两步删除、下载。
  - `LicenseGallery.tsx` 重写，`VehicleBoard.tsx` 改用它。
- 照片压缩只保留后台线程一条路径。删掉主线程后备和其中重复的缩放代码，同时修好 Worker 的类型错误。
- 新增 `useCalendarRangePick.ts`：「我的行程」框选建单和调度台「创建订单」原来各写了一套按住、拖选、贴边滚动，现在共用一份。
- 新增 `localPrefs.ts`：本机偏好的键名和读写只在这里，原来散在 4 个文件。键名不变，用户已有的设置不丢。
- 新增 `pages/icons.tsx`：
  - 收拢便签、垃圾桶、关闭、置顶图标。
  - 两个形状不同的置顶图标合成一个斜放图钉。
- `localDate.todayLocal()`：按新西兰日期计算。
- 删除没有使用的 `calendarDateFromDrag`。
- `calendarTrip` 合并了调度台和我的行程各自拼装日历行程的代码。
- 调度台拆分：
  - `boardLayout.ts`：图标排列、置顶、本机布局。
  - `boardDrag.ts`：拖拽状态、落点。
  - `boardCalendar.ts`：几张日历的滚动对齐。
  - `BoardParts.tsx`：头像、说明折叠。
  - `paneLift.ts` 的 `usePaneLift`：司导卡片拉高、收回。
  - `useOrderInfoDraft.ts`：订单信息编辑草稿、绑定公司、保存。
  - `DispatcherPage.tsx` 从 2721 行减到约 2100 行。
  - `DriverCalendarPage.tsx` 从 1063 行减到约 900 行。

### 测试与仓库

- `DataModelTests` 的表清单补上车辆和驾照的 3 张表。驾照功能上线时漏改了这个测试，原来在失败。
- 测试里的「今天」改用 `BusinessDate.Today`。
- 新增 `OrderRulesTests`：覆盖「今天」按新西兰、拆单、结束、历史单、显示名，以及列表接口返回的冲突和车辆冲突标记。
- 删除误提交的 `TestResults/` 覆盖率文件，加进 `.gitignore`。

### 文档

- 同步修改 `API_CONTRACT.md`、`ARCHITECTURE.md`（代码分工表、日期一节）、`PRD.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 行为变化

1. **冲突判断范围变大。** 原来前端只在已经读到的订单里找冲突。现在后端按全库判断：只要这位司导同一天还有任何别的订单，这张单就会出现在「未分配」里，并且标红角。即使另一张单是别的调度员派的，也算冲突。
2. **照片压缩没有后备了。** 浏览器不支持后台线程压缩时，上传直接报错。
3. **「今天」改按新西兰日期。** 电脑或手机时区不是新西兰时，日历的「今天」和已完成配色也按新西兰算。
4. **车辆置顶图标** 改成和司导一样的斜放图钉。

## 命令结果

- 基线（整理前，`6ea6533`）：
  - `dotnet test`：64 个测试通过 63 个，`DataModelTests` 失败。
  - `npm run build`：失败，`LicenseGallery.tsx` 有 4 个类型错误，`photoImage.worker.ts` 有 1 个，所以 10-31 的版本当时打不了包。
  - `npm run lint`：32 条警告。
- 整理后：
  - `dotnet build`：0 错误。
  - `dotnet test`：67 个全部通过。
  - `npm run build`：成功。
  - `npm run lint`：29 条警告，没有错误。剩下的大多是「一个文件里同时导出组件和函数」的提示。
- 浏览器冒烟测试：在临时沙盒里，用全新的空库和 Chromium 手机宽度视口（420×900）跑。
  - 公司账户注册后进调度台，框选 3 天创建订单：成功。
  - 拖订单到自己的司导图标：整单派出成功。第二张同日订单派出后，两张都返回冲突标记、都有红角，司导日历当天标红。
  - 我的行程：显示同样的三天，冲突日标红，「今天」显示为 11 月 1 日（新西兰日期；沙盒时钟是 UTC 10 月 31 日）。
  - 添加车辆并上传 2400×1600 的照片：压成 1 张后保存成功。打开车辆详情看大图，删除第一次只套红框，点详情框空白处关闭大图，详情保留。
  - 个人信息上传驾照正面：成功。打开大图，点空白处关闭。
  - 公司信息页：正常打开。
  - 全程浏览器控制台没有错误。

## 未做

- 没有连接、迁移或改动云端库。
- 没有改用户本机的开发库。测试和冒烟都在临时沙盒的空库里跑。
- 没有打包，没有发布，没有提交，没有推送。
- `DispatcherPage.tsx` 里全局拖拽监听和日历联动仍在一个组件里，已记入 `DEVELOPMENT_PLAN.md`。
- 按订单归属的数据权限仍留到下一阶段。

## 阻塞

无。

## 下一步

- 用户在本机构建、试用，确认后自己提交。
- 线上要用这个版本，需要同时发布前端和后端（接口字段变了）。车辆、驾照两张新表还没在云端建过，发布前要单独决定怎么处理云端库。
