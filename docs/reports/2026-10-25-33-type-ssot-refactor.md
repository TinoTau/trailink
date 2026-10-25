# 类型与 SSOT 重构执行报告

## 目标

- 收紧订单、行程日、活动和司导备注的后端契约。
- 以 OpenAPI 生成类型替代前端手写 transport DTO。
- 统一路由权限、菜单与登录态访问方式。
- 清理重复 UI 投影、兼容回退、死代码和 lint 警告。
- 保持现有订单、活动、公司和司导实现路径，不新增平行 Controller、API、数据表或页面。

## SSOT 核对

1. 对应现有 `OrdersController`、`ItineraryDaysController`、`OrderActivitiesController`、`DriversController`、现有 DTO、前端 API 层和页面。
2. 修改均落在上述现有模块；仅新增生成类型目录、认证状态模块、导航配置和删除字段的增量 Migration。
3. 已检查类似功能并合并到现有入口；司导备注保留唯一专用写入口。
4. 未产生第二个订单、活动、权限或备注事实来源。
5. 未新增业务数据库实体；只删除无消费方的 `orders.source_company`。
6. 已同步 API 契约、调用方和测试；明确收紧无外部旧客户端依赖的字段。

## 本轮改动

- 从订单运行时模型、DTO、Controller 和前端类型移除 `sourceCompany`；新增并应用 `RemoveUnusedOrderSourceCompany` 增量 Migration。
- 从订单读契约移除 `assignedDriverId`，以 `assignedDayCount` 和行程日分配数据为准。
- 从行程日读契约移除 `activityCount`，活动数量直接来自 `activities`。
- 从活动写契约移除 `ticketPath`，电子票只允许通过现有上传接口写入。
- 调度员可用 `companyId: null` 明确解除订单公司绑定。
- 将司导基础资料写 DTO 与备注写 DTO 分离；备注唯一写入口为 `PUT /api/drivers/{id}/notes`。
- 后端 JSON 数字解析改为严格模式；OpenAPI 文档允许匿名读取以支持本地类型生成。
- 使用 `@hey-api/openapi-ts` 生成 `frontend/src/api/generated`；前端 transport 类型统一从生成结果派生。
- 新增统一导航权限配置，路由守卫、账号菜单和登录后首页共用同一来源。
- 拆分 nullable `useAuth` 与受保护页面使用的 `useAuthenticatedAuth`。
- 将调度台人员卡片改为局部 `BoardPerson` 投影，删除伪装为完整 `Driver` 的对象。
- 删除旧字段回退、无消费方 API 方法、冗余状态同步和未使用 UI 字段；lint 警告清零。
- 同步 `API_CONTRACT.md`、`DATABASE_CONTRACT.md`、`ARCHITECTURE.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

## 验证结果

- `dotnet ef database update`：成功，数据库已删除 `orders.source_company`。
- `dotnet test`：36/36 通过，0 失败，0 跳过。
- `npm run api:types`：成功生成 2 个类型文件。
- `npm run lint`：通过，0 warning。
- `npm run build`：通过；仅有现存的单 chunk 超过 500 kB 提示。
- `git diff --check`：通过；仅提示两个现有工作区文件的 CRLF/LF 转换信息，无空白错误。
- `npm audit --omit=dev`：0 漏洞。
- 完整 `npm audit`：生成器依赖链中的 `js-yaml` 报告 4 个 high；仅影响开发依赖。自动修复要求强制降级 `@hey-api/openapi-ts` 到破坏性版本，因此本轮未执行 `npm audit fix --force`。
- 残留搜索：运行时代码和权威文档中没有旧 `sourceCompany`、`assignedDriverId`、`activityCount`、活动写 `ticketPath` 或旧认证 hook 引用；历史 Migration 和追溯报告按规则保留。

## 浏览器回归

- `wang` 登录成功，调度员账号菜单仅显示其允许入口。
- 司导日历仍显示 2026-10-01～10-02、2026-10-14～10-17 的历史行程。
- 司导备注保存请求确认为 `PUT /api/drivers/{id}/notes`，返回 200，重新载入后仍存在；测试后已恢复原备注。
- 公司页、调度台、订单公司绑定及“退回公司”入口正常加载，未执行破坏性操作。
- 行程日活动编辑器和电子票上传入口正常加载。
- 当前测试账号不是公司角色，因此未独立操作公司侧“派给调度”；对应页面权限由统一导航配置和现有自动化测试覆盖。

## 未做事项与风险

- 未执行破坏性删除、实际解绑、活动新增或文件上传。
- 未强制修复仅存在于 OpenAPI 生成器开发依赖链的漏洞，避免引入不兼容降级；后续等待上游发布兼容修复后升级。
- 未处理前端大 chunk 提示，该项不属于本轮类型与 SSOT 重构范围。

## 下一步

- 上游生成器发布兼容的 `js-yaml` 修复后，升级锁定版本并重新执行类型生成、构建与完整审计。
- 后续新增或修改 API DTO 时，先更新后端契约，再执行 `npm run api:types` 并提交生成结果。
