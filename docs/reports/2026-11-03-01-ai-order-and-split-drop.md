# AI 建单；拆单整单拖动只派空日期

## 需求

1. 修复 2026-11-02 发现的 bug：拆单（部分日期已派给别的司导）整单拖给某个司导时，会把整单所有日期都改派给新司导。应该只派还没分配的日期。
2. 实现 AI 识别订单图片：把旅行社发来的行程图和电子票交给大模型识别和分析，在 Trailink 里生成订单和活动，减少调度员操作。

## 改动

### 拆单整单拖动

- `OrderDriverAssignment.TargetDays`：整单派给司导时，订单还有未分配的日期就只派这些；全部已分配才整单改派；取消整单仍清空所有日期。冲突检查、占位单覆盖、`updatedDayCount` 都只算这次被派的日期。
- 调度台 `assignOrder`：只有「没有空日期、要整单改派」时才检查「只能移除自己分配的订单」；拆单拖动成功提示「已把未分配的 N 天派给司导」。
- 司导在「我的行程」用订单号领取也走同一接口，同样只领空日期（和抢单一致）。
- 新测试 `Whole_order_drop_on_a_split_order_assigns_only_the_open_days`：已派日期不动，新司导在已派那天另有单也不算冲突，全部已派时仍整单改派。
- API_CONTRACT 第 4 节、PRD 6.2 更新说法。

### AI 建单

后端（`Services/Recognition/`，新依赖 PdfPig 0.1.16）：

- `ImageSlicer`（上一轮已做）切长图。
- `RecognitionSources`：图片切段；有文字的 PDF 只取文字；扫描件 PDF 原样交给模型；每个文件标「文件 #序号」。
- `AnthropicDraftModel`：调 Claude Messages API，强制工具 `submit_order_draft` 返回结构化草稿；错误转成中文。
- `OrderDraftRecognizer`：系统提示含今天的新西兰日期、常用地点和活动库清单；规则包括年份推断、日期矛盾以每天为准、北岛和自由行的日子默认不导入、只列要预订的项目和酒店、匹配活动库、电子票配对、不输出客人隐私。返回结果再整理一遍。一次只处理一单。
- `OrderImport`：核对后的草稿一次写成订单、行程日、活动、电子票、订单截图；失败不留半张单。
- `RecognitionController`：`GET /api/recognition/status`、`POST /api/recognition/order-draft`、`POST /api/recognition/import`，只有调度员和公司账户能用。
- 配置 `Recognition` 节，密钥只放环境变量 `Recognition__ApiKey`。

前端：

- 调度台「AI 建单」按钮（没配密钥不显示），`AiOrderCard`：上传 → 识别中 → 核对（提醒、订单号、人数、备注、每天勾选 / 日期 / 行程 / 住宿地 / 活动 / 电子票，拿不准的标黄）→ 生成订单后自动打开这张单。
- `api/recognition.ts`、`types.ts` 草稿类型、`api.postForm`。

文档：PRD 5.7（并从「本阶段不做」里拿掉 AI 订单图片识别）、ARCHITECTURE 9b、API_CONTRACT「AI 建单」、FRONTEND_DESIGN 7.6b、DEVELOPMENT_PLAN 4e。

## 验证

- `dotnet test`：118/118 通过（新增拆单拖动 1 个、AI 建单 3 个、Claude 接口格式 4 个）。
  - AI 建单测试用假模型：检查长图切段、PDF 只交文字、活动库在提示里、结果整理（排序、合并同一天、丢掉编造的活动库 id 和越界的电子票序号、只写时间的补上日期）、一次写入（订单、活动、电子票、订单截图、备注）、权限和错误输入。
  - Claude 接口测试用假 HTTP：检查地址、请求头、图片 / PDF / 文字顺序、强制工具，以及 401 / 429 / 529 的中文提示。
- 前端 `tsc -b`、`npm run build` 通过。
- 沙盒界面测试（本地假 Claude 接口返回按样例 12 天行程整理的草稿）：桌面 1366 宽和手机 390 宽各走一遍上传 → 识别 → 核对 → 生成，生成的订单 11 天（自由行那天没勾）、活动库关联和签到 / 开始时间都正确，行程图存为订单截图，页面无报错。

## 未做 / 注意

- 还没用真实 Claude 接口试过识别效果：需要 API 密钥。拿到后用样例图比较 Haiku 5.5 和 Sonnet 5.5。
- 发布时服务器 api 容器要加环境变量 `Recognition__ApiKey`；前面的反向代理要允许约 40MB 的上传。
- 数据库结构没有改动。
