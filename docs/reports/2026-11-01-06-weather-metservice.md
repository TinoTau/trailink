# 天气改用 MetService 免费档测试

## 目标

用户要求：天气接口先换成新西兰机构的免费版，用于测试。

## 数据源

选 MetService（新西兰气象局）Point Forecast API 的免费 Starter 档：

- 每月 5 万单位。超出后暂停到下个账期，不会自动扣费。
- 条款只允许原型测试；正式上线至少要 Basic 档（30 美元/月）。
- 最多预报 10 天，逐小时数据。
- 没有天气代码，也没有降水概率。只有降水量、云量、气温、能见度等原始变量。

## 改动

### 后端

- 新增 `Services/Weather/WeatherOptions.cs`：
  - `Weather:Source` 选来源，默认 `MetService`，也可以是 `OpenMeteo`。
  - `BaseUrl` 留空时用来源自己的正式地址。
  - 新增 `IWeatherSource` 接口，两种来源的返回格式相同。
  - 原来写死的 `ForecastDays` 改为各来源自己的常量：MetService 10 天，Open-Meteo 14 天。
- 新增 `Services/Weather/MetServiceClient.cs`：
  - `POST /point/time`，请求头 `x-api-key`。
  - 一次请求查 10 个地点、从新西兰今天 0 点起 240 小时、4 个变量（`precipitation.rate`、`cloud.cover`、`air.temperature.at-2m`、`air.visibility`）。
  - 每次计 40 单位，一天 8 次，一个月约 1 万单位，在免费额度内。
  - 按每个变量自带的维度顺序读数据，`noData` 不为 0 的值不用。地点数或数据长度不对就整批作废。
- `WeatherText.Summarize`：把一天的逐小时数据写成短词。
  - 全天累计降水 ≥ 1 mm：写「降雨 / 降雪 + 毫米数」，例如「降雨6mm」。下雨那几个小时平均气温 ≤ 1 °C 算降雪。
  - 否则白天（7–19 点）能见度低于 1000 米有 3 小时以上：写「雾」。
  - 否则按白天平均云量：低于 20% 晴，低于 50% 少云，低于 80% 多云，其余阴。
  - 降水数据不足 20 小时的那天不写。
- `OpenMeteoClient` 保留，改为实现 `IWeatherSource`，行为不变。
- `WeatherRefresh` 改用 `IWeatherSource`，日志里写出来源名称。
- 新增 `GET /api/weather/source`（`WeatherController`）：返回当前来源的名称和链接；没有配置密钥时返回 204。
- `appsettings.json` 的 `Weather` 节改为 `Source`、`BaseUrl`、`ApiKey`，密钥仍然只放环境变量 `Weather__ApiKey`。

### 前端

- 新增 `api/weather.ts`（`useWeatherSource`）：只读一次。
- 「我的行程」底部的来源说明改读接口：现在显示「天气数据：MetService」；没有配置天气时不显示。
- 重新生成 `src/api/generated/`。

### 文档

- 同步修改 `README.md`、`PRD.md`（第 8 节）、`ARCHITECTURE.md`（第 9 节和代码分工表）、`API_CONTRACT.md`、`FRONTEND_DESIGN.md`、`DEVELOPMENT_PLAN.md`。

### 本机启动脚本（不进 Git）

- `start-dev.ps1`：项目文件夹里有 `weather.key` 时，用里面的密钥查真实的 MetService；没有时启动假接口。
- `fake-weather.mjs` 改成模仿 MetService 的返回格式。假数据里库克山机场固定为「降雪8mm」，米尔福德峡湾固定为「降雨25mm」。
- `weather.key` 已加进 `.git/info/exclude`。

## 命令结果

- `dotnet build`：0 错误，0 警告。
- `dotnet test`：98 个全部通过，比上一轮多 3 个：
  - 逐小时汇总：晴、少云、多云、阴、雾、降雨、降雪，以及数据不足的一天。
  - MetService 返回解析：按新西兰日期分日、缺值、地点顺序。
  - 拒绝不完整的返回。
  - 另外，没有密钥时 `/api/weather/source` 返回 204。
- `npm run build`：成功。
- `npm run lint`：29 条警告，没有新增。
- 沙盒冒烟测试：后端接上 MetService 格式的假接口，日志显示「天气已更新（MetService）：100 个地点日」，即 10 个地点 × 10 天。

## 行为变化

- 降水从「降雨50%」（概率）变成「降雨6mm」（当天累计量）。
- 预报从 14 天缩短到 10 天。
- 没有「雷雨」。MetService 没有对应变量。

## 未做

- 没有用真实的 MetService 密钥测试。需要用户在 console.metoceanapi.com 注册拿到密钥。
- 没有改云端库，没有发布，没有提交。

## 下一步

1. 注册 MetService 账号，把密钥写进项目文件夹的 `weather.key`，重新运行 `start-dev.cmd`，确认后端日志出现「天气已更新（MetService）：100 个地点日」。
2. 上线前决定正式来源：MetService Basic，或 Open-Meteo 商用版（设 `Weather__Source=OpenMeteo`）。
