# 天气默认改用 MET Norway

## 目标

用户要求：天气默认改用 MET Norway，MetService 和 Open-Meteo 的实现保留。页面上原来写降水概率的地方，后端给什么就显示什么。进入宣传阶段之前避免所有法律风险。

## 为什么选 MET Norway

| 来源 | 免费档能否用于线上 |
|------|------|
| MetService 免费 Starter 档 | 不能。条款只允许原型、测试、概念验证，上线至少 Basic 档（30 美元/月） |
| Open-Meteo 免费版 | 不能。条款禁止商用，商业产品、支撑业务运营的系统大概率算商用 |
| MET Norway | 能。数据按 CC BY 4.0 / NLOD 授权，免费使用，注明来源即可 |

MET Norway 的使用条款：

- User-Agent 写应用名和网站。
- 坐标最多 4 位小数。
- 每秒不超过 20 次。
- 不在 `Expires` 之前重复请求。

现有的刷新节奏（每 3 小时一轮，每个地点 1 次请求）满足这些要求。

## 改动

### 后端

- 新增 `Services/Weather/MetNorwayClient.cs`：
  - 每个地点请求一次 `locationforecast/2.0/compact`。
  - 每个时刻取 `next_1_hours`，没有就取 `next_6_hours`；已经被上一段覆盖的时刻跳过。
  - 6 小时段的降水平均摊到每小时，再交给 `WeatherText.Summarize` 汇总，和 MetService 用同一套规则。
  - 符号含 `thunder` 记雷暴，`fog` 记雾。
  - 今天只剩几个小时时照样汇总；其他日期不足 20 小时（预报末尾）不写。
- `WeatherText`：
  - `Hour` 新增 `Thunder`。降水 ≥ 1 mm 且有雷暴时写「雷雨Xmm」。
  - `Summarize` 新增 `fullDay` 参数，用于今天。
  - 白天已经过去时，用剩下的小时算云量。
- `WeatherOptions`：
  - 默认来源改为 `MetNorway`。
  - 「能否查询」移到 `IWeatherSource.Ready`：MET Norway 不需要密钥，另外两个仍要密钥。
- `WeatherRefresh`、`WeatherController` 改用 `source.Ready`。
- 测试的 `ApiFactory` 移除天气定时刷新。原因是默认来源不需要密钥，不移除的话每次跑测试都会请求外部接口。
- `appsettings.json` 中 `Weather:Source` 改为 `MetNorway`。

### 前端

不用改。日期格本来就照后端给的短词原样显示；来源说明读 `/api/weather/source`，现在显示「天气数据：MET Norway」。

### 文档

同步修改 `README.md`、`PRD.md`（第 8 节）、`ARCHITECTURE.md`（第 9 节和代码分工表）、`API_CONTRACT.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

### 本机启动脚本（不进 Git）

`start-dev.ps1` 新增 `-Weather` 参数，默认 `MetNorway`，直接查真实数据：

- `MetService`：用 `weather.key` 里的密钥。
- `Fake`：用本机假接口。

## 命令结果

- `dotnet build`：0 错误。只有 `VehicleTests` 里原有的 2 条可空警告。
- `dotnet test`：99 个全部通过，新增 MET Norway 解析测试，覆盖：
  - 今天的部分时段。
  - 6 小时段跨日。
  - 被覆盖的时刻跳过。
  - 雷雨、降雪。
  - 预报末尾不完整的一天。
- 沙盒和本机命令行都连不上 `api.met.no`（网络白名单限制），所以真实请求在用户电脑上验证：用 `start-dev.cmd` 启动后，后端日志显示「天气已更新（MET Norway）：90 个地点日」，即 10 个地点 × 9 天。

## 未做

- 没有用 `If-Modified-Since` 做条件请求。每 3 小时一轮，已经晚于 `Expires`。
- 没有改云端库，没有发布，没有提交。

## 下一步

- 发布后后端会自动开始查 MET Norway，不需要设置密钥。云端服务器要能访问 `api.met.no`。
