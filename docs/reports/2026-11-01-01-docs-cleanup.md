# 整理文档

## 目标

项目从 Cursor 交接过来，停在稳定版本 `6ea6533`。先整理文档：基线文档按主题拆开，去掉重复，写清实际部署方式；移除其他项目的早期文档。不改代码、不改数据库、不改业务规则。

## 改动

- 删除根目录 6 份早期文档（用户确认是其他项目的）：`trailink_project_architecture_spec_v_1.md`、`AI化升级演化路径.md`、`autonomous_enterprise_runtime_multimodal_and_societal_extension.md`、`多子代理并行协作策略.md`、`构建一个完整应用`、`Trailink_旅游行业协同补充文档.md`。
- `vibe coding代码规范`：保留。最后一句原本引用已删除的《多子代理并行协作策略》，改成一句独立的子代理核查要求。
- `docs/PRD.md`：重写为业务规则，按日期时间、账户与人员关系、订单、派单、车辆、日历分节。按钮、手势、颜色等界面细节移到 FRONTEND_DESIGN，PRD 不再重复。写明：
  - 「今天」按新西兰时间（`Pacific/Auckland`）。
  - 占位单的用途，以及真实订单覆盖占位单是双方沟通后的操作，系统不再确认。
  - 按订单归属的数据权限放到下一阶段。
- `docs/FRONTEND_DESIGN.md`：原来每节一大段，拆成全局约定、订单信息卡、当日行程、日历通用、我的行程、调度台（布局、列表、订单卡、司导卡、拖拽、创建订单、司导名单、车辆）、派给调度、登录 / 公司 / 个人信息。重复出现的规则（按住 0.5 秒、两步确认、点空白关闭、照片查看、冲突图案）各只写一次。
- 用户确认：本机开发只用本机库；云端部署不许动云端库，除非用户明确说明要备份或导入数据。已写进 ARCHITECTURE 第 8 节。
- `docs/ARCHITECTURE.md`：去掉与前端设计重复的长段落；新增「业务概念由哪段代码负责」对照表、「日期与今天」一节；部署一节改成实际情况（Google Cloud 虚拟机 + Docker Compose + Caddy + Cloudflare DNS），并写明发布红线。
- `docs/DEVELOPMENT_PLAN.md`：进度压缩成清单；新增上线状态表（车辆和驾照照片的接口与表还没发布到线上）；新增本轮整理清单和下一阶段的数据权限。
- `docs/DATABASE_CONTRACT.md`：`orders` 表结构里补上漏写的 `shared_notes`；长段落拆成条目。
- `docs/API_CONTRACT.md`：长段落按句拆成条目，内容不变。
- `README.md`：重写启动、测试、本机数据命令（标明不能在云端运行）、发布入口。

## 命令结果

- 只改文档，没有构建或测试。

## 发现但未处理

- 后端测试通过 `WebApplicationFactory` 直接连 `appsettings.json` 里的本机开发库，会往开发库写数据。用户确认本机开发就用本机库，保持不变。
- 后端 4 处 `DateTime.Today`（`CompanyDeskController`、`OrderDriverAssignment` 两处、`ExpiredAttachmentCleanup`）按服务器时区算「今天」，云端容器是 UTC。已列入整理清单。

## 未做

- 没有改代码。
- 没有提交，由用户手动提交和推送。

## 阻塞

- 云端环境和本机命令行环境都下载不了 npm、NuGet 和 .NET SDK，暂时无法构建和测试，代码整理要等环境能用。

## 下一步

环境能用后，先跑一遍测试和前端构建作为基线，再按 `DEVELOPMENT_PLAN.md` 第 3 节整理代码。
