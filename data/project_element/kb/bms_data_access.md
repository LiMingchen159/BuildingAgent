# Element 冷水机组 BMS 数据获取（智能体参考）

与 **BMS-database** 采集服务对齐。更新：**2026-05-17**（统一时序接口 `/api/v1/timeseries`）。

## 一、先选路径

| 用户要什么 | 用什么 |
|------------|--------|
| **当前值 / 实时 / 告警** | **enteliWEB** `:20800`（工具 `bms_live_read`） |
| **历史 / 趋势 / 报表 / 统计** | **`GET /api/v1/timeseries`**（本地采集库，已合并 poll+history） |
| **点位目录、api_path** | `GET /api/v1/points` |

**原则：**

- 「现在是多少」→ **实时 API**（或 `points.last_value`，约 5 分钟延迟）。
- 「昨天 / 上周 / 曲线」→ **`/api/v1/timeseries`**，**不要**再传 `source=poll` / `history` / `merged`。

---

## 二、实时数据（enteliWEB :20800）

| 项 | 值 |
|----|-----|
| 基础 URL | `http://223.197.33.165:20800/enteliweb` |
| 认证 | Demo 已预配置；优先 **`bms_live_read`** |

```bash
# 工具等价：bms_live_read point_name=WCC_1_Chilled_Water_Temp
curl -sS -u "$ENTELI_USER:$ENTELI_PASS" -H 'Accept: application/xml' \
  '<api_path from points catalog>'
```

解析 XML：`name="present-value"` 的 `value` 属性。

---

## 三、历史 / 分析数据（唯一推荐接口）

### 3.1 API 基址

| 环境 | 基址 |
|------|------|
| 采集机公网（示例） | `http://117.72.185.234:8765` |
| 本机 / BuildingAgent | `http://127.0.0.1:8765`（`BMS_DATABASE_API_URL`） |

### 3.2 点位列表

```http
GET /api/v1/points?q=WCC_1&limit=50
```

### 3.3 时序（唯一数据口）

```http
GET /api/v1/timeseries?name=WCC_1_Chilled_Water_Temp&from=2026-05-10T00:00:00Z&to=2026-05-17T12:00:00Z&limit=5000&order=asc
```

也可用别名（等价，新代码请用 `timeseries`）：

- `/api/v1/readings?...`（勿再传 `source`）
- `/api/v1/points/{id}/timeseries?...`

**查询参数：**

| 参数 | 说明 |
|------|------|
| `name` / `point_id` / `object_ref` | 三选一 |
| `from` / `to` | ISO8601 **UTC** |
| `limit` | 默认 1000，最大 50000 |
| `order` | `asc` / `desc`（默认 desc） |

**响应示例（无 `source` 字段）：**

```json
{
  "total": 250,
  "items": [
    {
      "point_id": 338,
      "name": "WCC_1_Chilled_Water_Temp",
      "object_ref": "//Elements/10101.AV5",
      "ts": "2026-05-17T03:29:07+00:00",
      "value": "10.5234",
      "value_num": 10.5234
    }
  ]
}
```

### 3.4 curl / Python

```bash
BASE=http://127.0.0.1:8765
FROM=$(date -u -d '7 days ago' +%Y-%m-%dT%H:%M:%SZ)
curl -sS "$BASE/api/v1/timeseries?name=WCC_1_Chilled_Water_Temp&from=${FROM}&limit=5000&order=asc"
```

```python
import requests
from datetime import datetime, timedelta, timezone

BASE = "http://127.0.0.1:8765"
params = {
    "name": "WCC_1_Chilled_Water_Temp",
    "from": (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "limit": 5000,
    "order": "asc",
}
rows = requests.get(f"{BASE}/api/v1/timeseries", params=params, timeout=60).json()["items"]
```

### 3.5 数据粒度说明

- 接口返回服务端**已合并**序列：设备趋势约 6 天（约 15 分钟一条）+ 采集启动后的 5 分钟轮询。
- **不要**假设「过去 N 天全是 5 分钟间隔」。
- 展示给用户时将 `ts` 转为 **Asia/Shanghai**；库内为 UTC。

### 3.6 直连 SQLite（仅 API 不可用时）

表 `readings` 仍有 `source` 列；HTTP 层已合并，**智能体优先走 timeseries**。SQL 需自行合并 poll+history 时再查多 source。

---

## 四、智能体工作流

1. 实时 → `bms_live_read`
2. 历史 → `GET /api/v1/timeseries`（`terminal` / `run_python`）
3. 分析 → pandas + 图写入 `repository/outputs/`
4. 说明数据来源（实时 vs 本地归档）与时间范围

## 五、Brick

拓扑见 `brick_model.ttl`；数值仍走本 API，TTL 不替代时序。

## 六、参考文档

- `data/project_element/kb/bms_api_changelog.md`（前端接口变更摘要）
- `/root/BMS-database/docs/数据获取说明.md`
- `/root/BMS-database/docs/前端接口更新说明.md`
