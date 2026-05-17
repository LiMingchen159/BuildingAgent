# BMS 采集 API 变更摘要（2026-05-17）

> 基址示例：`http://117.72.185.234:8765` / 本机 `http://127.0.0.1:8765`

## 核心变更

| 之前 | 现在 |
|------|------|
| `source=poll` / `history` / `merged` | **不再需要 `source`** |
| `/api/v1/readings?source=poll` | **`GET /api/v1/timeseries`** |
| 响应含 `source` | **无 `source` 字段** |

## 推荐调用

```http
GET /api/v1/points?q=WCC_1&limit=50
GET /api/v1/timeseries?name=WCC_1_Chilled_Water_Temp&from=2026-05-10T00:00:00Z&limit=5000&order=asc
```

实时当前值仍走 enteliWEB `:20800`，见 `bms_data_access.md`。

完整说明：`/root/BMS-database/docs/前端接口更新说明.md`
