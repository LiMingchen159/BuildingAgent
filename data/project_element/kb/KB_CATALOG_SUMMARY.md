# Element 项目知识库目录（KB Catalog Summary）

> **路径：** `data/project_element/kb/`  
> **更新：** 2026-05-17  
> **用途：** 智能体与用户快速了解 KB 里有什么、该打开哪个文件，避免每次从零探索。

---

## 1. 知识库总览

| 类别 | 路径 | 数量 | 说明 |
|------|------|------|------|
| **Brick 语义模型** | `brick_model.ttl` | 1 文件 | 8 台冷水机 WCC_1~8，共 **472** 个 BMS 点位及 Brick 类型映射 |
| **BMS 取数说明** | `bms_data_access.md` | 1 文件 | 实时 enteliWEB / 历史 timeseries API / 工具用法 |
| **API 变更摘要** | `bms_api_changelog.md` | 1 文件 | `/api/v1/timeseries` 接口迁移说明 |
| **POC 项目图纸与手册** | `Poc Project-20260517T050008Z-3-001/` | **46** 份 PDF | ELEMENTS 商场 MVAC / 海水散热 / 冰水机 / 安全规章 |
| **原始压缩包** | `Poc Project-20260517T050008Z-3-001.zip` | 1 文件 | 上述 POC 资料的 zip 原件（已解压到同名文件夹） |

**数据关联：**

- `brick_model.ttl` 中点位名（如 `WCC_1_Chilled_Water_Temp`）与 BMS-database `points.name`、enteliWEB BACnet **一一对应**（472 点）。
- 查**实时值** → enteliWEB 或工具 `bms_live_read`；查**历史趋势** → `GET /api/v1/timeseries?name=WCC_1_Chilled_Water_Temp`。
- PDF 为**设计/竣工/运维文档**，不直接对应实时数据库；用于理解系统拓扑、设备表、控制逻辑、O&M。

---

## 2. Brick 模型详解（`brick_model.ttl`）

### 2.1 文件结构

| 项 | 内容 |
|----|------|
| 格式 | Turtle (`.ttl`) |
| 命名空间 | `bldg:` = `urn:bms2brick#`；类来自 `brick:` Brick Schema |
| 设备 | **8** 台 `brick:Water_Cooled_Chiller`：`bldg:WCC_1` … `bldg:WCC_8` |
| 点位 | 每台 **59** 个 `brick:isPointOf` 关系 → **472** 点总计 |
| 时序 | **无** `brick:hasTimeseriesId`；数值来自 BMS-database / enteliWEB，不在 TTL 内 |

### 2.2 命名规则

- **设备 ID：** `WCC_{1-8}` = Water Cooled Chiller 1~8（Element 冰水机组）。
- **点位名：** `WCC_{n}_{SignalName}`，与 Excel / `points` 表 `name` 列一致。
- **BACnet 引用：** `//Elements/10101.AV5` 等（见 BMS `object_ref` / `api_path`）。
- **⚠️ 标记：** 模型中带 `rdfs:comment "warning"` 的点位共 **17 点/台**（Brick 类型映射可能不精确，分析时注意）。

### 2.3 每台冷水机点位清单（59 点，WCC_2~8 与 WCC_1 同名同构）

将 `WCC_1` 替换为 `WCC_2` … `WCC_8` 即可得到其余机组点位名。

#### 启停、模式与运行状态

| BMS 点名 | Brick 类型 | 说明 |
|----------|------------|------|
| `Chiller_Start_Stop` | Start_Stop_Command | 冷机启停命令 |
| `Compressor_Start_Relay` | Relay_Command | 压缩机启动继电器 |
| `Remote_Start_Contact` | Start_Stop_Command | 远程启动触点 |
| `Run_Status` | Run_Status | 运行状态 |
| `Control_Mode` | Mode_Status | 控制模式 |
| `Control_Point` | Command ⚠️ | 控制点 |
| `Compressor_Ontime` | On_Timer_Sensor | 压缩机运行计时 |
| `Starts_in_12_Hours` | Run_Time_Sensor | 12 小时内启动次数 |
| `Start_Inhibit_Timer` | Duration_Sensor ⚠️ | 启动禁止计时 |
| `Total_Compressor_Starts` | Sensor ⚠️ | 压缩机累计启动次数 |

#### 冷冻水 / 蒸发器侧（含控制分析常用点）

| BMS 点名 | Brick 类型 | 说明 |
|----------|------------|------|
| `Chilled_Water_Temp` | Chilled_Water_Temperature_Sensor | 冷冻水温度 |
| `Chilled_Water_Flow` | Flow_Sensor | 冷冻水流量 |
| `Chilled_Water_Pump` | Start_Stop_Status ⚠️ | 冷冻水泵状态 |
| `SUWT` | Leaving_Chilled_Water_Temperature_Sensor | **出水温度**（Supply Chilled Water Temp） |
| `LCW_Setpoint` | Leaving_Chilled_Water_Temperature_Setpoint | **出水温度设定** |
| `ECW_Setpoint` | Entering_Chilled_Water_Temperature_Setpoint | 进水温度设定 |
| `Calc_Evap_Sat_Temp` | Pressure_Sensor ⚠️ | 计算蒸发饱和温度 |
| `Evap_Refrig_Liquid_Temp` | Temperature_Sensor ⚠️ | 蒸发器制冷剂液管温度 |
| `Evaporator_Approach` | Entering_Condenser_Water_Temperature_Sensor | 蒸发器逼近度（Brick 类型待核对） |
| `Active_Delta_T` | Temperature_Sensor ⚠️ | 运行温差 |
| `Active_Delta_P` | Differential_Pressure_Sensor | 压差 |

#### 冷却水 / 冷凝器侧

| BMS 点名 | Brick 类型 | 说明 |
|----------|------------|------|
| `Condenser_Refrig_Temp` | Pressure_Sensor | 冷凝器冷媒温度 |
| `Condenser_Water_Flow` | Flow_Sensor | 冷却水流量 |
| `Condenser_Water_Pump` | Start_Stop_Status ⚠️ | 冷却水泵状态 |
| `Condenser_Approach` | Sensor ⚠️ | 冷凝器逼近度 |
| `SUAT` | Leaving_Condenser_Water_Temperature_Sensor | 冷却水出水温度 |
| `SUP` | Temperature_Sensor ⚠️ | 供水温度相关 |
| `DWT` | Temperature_Sensor ⚠️ | 温差/水温相关 |

#### 压缩机与导叶

| BMS 点名 | Brick 类型 | 说明 |
|----------|------------|------|
| `Comp_Discharge_Temp` | Discharge_Air_Temperature_Sensor | 压缩机排气温度 |
| `Comp_Motor_Winding_Temp` | Entering_Chilled_Water_Temperature_Sensor | 电机绕组温度 |
| `Comp_Thrust_Brg_Temp` | Temperature_Sensor ⚠️ | 推力轴承温度 |
| `Comp_Thrust_Lvg_Oil_Temp` | Temperature_Sensor ⚠️ | 推力轴承润滑油温度 |
| `COMPSALM` | Alarm | 压缩机报警 |
| `Actual_Guide_Vane_Pos` | Damper_Position_Sensor | 导叶实际位置 |
| `Target_Guide_Vane_Pos` | Damper_Position_Command | 导叶目标位置 |
| `Guide_Vane_Delta` | Position_Command | 导叶偏差 |
| `Surge_Line_Delta_T` | Current_Sensor | 喘振线温差（类型待核对） |
| `Oil_Sump_Temp` | Temperature_Sensor | 油槽温度 |
| `Oil_Pump_Relay` | Relay_Command | 油泵继电器 |
| `Oil_Pump_Delta_P` | Differential_Pressure_Sensor | 油泵压差 |
| `Oil_Heater_Relay` | Start_Stop_Status ⚠️ | 油加热器继电器 |

#### 电气与能耗

| BMS 点名 | Brick 类型 | 说明 |
|----------|------------|------|
| `TLKW` | Power_Sensor | **实时功率 kW** |
| `TLKWH` | Electric_Energy_Sensor | 累计电度 |
| `TLHR` | Run_Time_Sensor | 运行小时 |
| `Motor_Percent_Kilowatts` | Power_Sensor | 电机功率百分比 |
| `Active_Demand_Limit` | Demand_Setpoint ⚠️ | 主动需求限制 |
| `Actual_Line_Current` / `Average_Line_Current` | Current_Sensor | 线电流 |
| `Actual_Line_Voltage` / `Average_Line_Voltage` | Voltage_Sensor | 线电压 |
| `Line_Current_Phase_1~3` | Current_Sensor | 分相电流 |
| `Line_Voltage_Phase_1~3` | Voltage_Sensor | 分相电压 |

#### 其它 / 缩写点位

| BMS 点名 | Brick 类型 | 说明 |
|----------|------------|------|
| `AV_17` | Differential_Pressure_Sensor | 模拟量点位（需结合图纸） |
| `DAT` | Temperature_Sensor ⚠️ | 缩写点位 |
| `DISCP` | Sensor ⚠️ | 缩写点位 |
| `DISCP` / 相关 | — | 放电/压差类信号（查 O&M） |

### 2.4 Brick 类型统计（全库）

| 数量 | Brick 类型 |
|------|------------|
| 64 | Temperature_Sensor |
| 48 | Current_Sensor |
| 40 | Voltage_Sensor |
| 24 | Differential_Pressure_Sensor |
| 24 | Start_Stop_Status |
| 24 | Sensor（泛型，宜核对） |
| 16 | Pressure_Sensor / Flow_Sensor / Start_Stop_Command / Relay_Command / Power_Sensor / Run_Time_Sensor |
| 其余 | Alarm、Setpoint、Mode、Command 等 |

### 2.5 智能体使用建议

1. **查某信号含义：** 在本文档 2.3 表或 TTL 中搜 `WCC_n_` + 关键词；Brick 类型仅作语义参考。
2. **查历史曲线：** `timeseries?name=WCC_4_SUWT`，与 `LCW_Setpoint` 对比做过热分析。
3. **查是否运行：** `Compressor_Start_Relay`、`Chiller_Start_Stop` 常为 `active`/`inactive`。
4. **勿从 TTL 读数值：** 必须走 BMS API（见 `bms_data_access.md`）。

---

## 3. BMS 集成文档（简表）

| 文件 | 内容 |
|------|------|
| `bms_data_access.md` | 实时 vs 历史路径、curl/Python 示例、`bms_live_read` 工具 |
| `bms_api_changelog.md` | 统一时序口 `/api/v1/timeseries`，勿再用 `source=poll` |

---

## 4. POC 项目 PDF 资料（`Poc Project-20260517T050008Z-3-001/Poc Project/`）

香港 **ELEMENTS** 商场机电资料包，按子系统分文件夹。以下为**按文件名推断**的用途说明（未 OCR 全文）。

### 4.1 Chiller System_冰水機系統（4 份）

| 文件 | 大概内容 |
|------|----------|
| `Equipment Schedule_Chiller.pdf` | 冷水机组设备表：型号、容量、数量、安装位置 |
| `Equipment Schedule_Chilled Water Pump.pdf` | 冷冻水泵设备表 |
| `Equipment Schedule_Condenser Water Pump.pdf` | 冷却水泵设备表 |
| `Chiller Control Panel Line Diagram.pdf` | 冷水机房控制盘线路图 / 控制逻辑框图 |

### 4.2 Sea Water Cooling System_海水散熱系統（22 份）

海水冷却 / 板式换热 / 机房布置，与 BMS 海水厂点位相关。

| 文件 | 大概内容 |
|------|----------|
| `Overall Equipment Schedule_Sea Water System.pdf` | 海水系统总设备表 |
| `Overall Equipment Specification_Sea Water System.pdf` | 海水系统设备规格书 |
| `Seawater System Scenario.pdf` | 海水系统运行场景 / 模式说明 |
| `(Schematic) Overall Schematic Diagram_Sea Water System.pdf` | 海水系统总原理图 |
| `(Schematic) Sea Water Plant Room (1).pdf` / `(2).pdf` | 海水泵房原理图 |
| `(Schematic) Chiller Plant Room.pdf` | 冷水机房原理图 |
| `(Layout) Underground Plant Room.pdf` | 地下机房平面布置 |
| `(Layout) Chiller Plant Room.pdf` | 冷水机房平面 |
| `(Layout) Heat Exchanger Room (1).pdf` / `(2).pdf` | 换热机房平面 |
| `(Layout) Typical Sea Water Pump.pdf` | 典型海水泵布置 |
| `(Control Philosophy) main AC plant.pdf` | 空调机房总控制哲学 |
| `(Control Philosophy) Seawater Cooling Plant.pdf` | 海水厂控制哲学 |
| `(As-fit Drawing) 03-14-2008_Seawater_Cooling_Plant.pdf` | 2008 竣工 As-built 海水冷却厂 |
| `(O&M) Auto Backwash Strainer.pdf` | 自动反冲洗过滤器 O&M |
| `【1】O&M Manual/Sea Water Plant - OnM Manual Vol. 1~3.pdf` | 海水厂运维手册 3 卷 |
| `【2】Heat Exchanger/Equipment - Plate Heat Exchanger.pdf` | 板式换热器设备说明 |
| `【2】Heat Exchanger/Heat Exchanger_Product Manual.pdf` | 换热器产品手册 |
| `【2】Heat Exchanger/Heat Exchanger_Name Plate.pdf` | 换热器铭牌 |

### 4.3 AHU & PAU & FCU_空調系統（10 份）

空气侧：空调箱、新风、风机盘管。

| 文件 | 大概内容 |
|------|----------|
| `Equipment Schedule_AHU & PAU.pdf` | 空调箱 / 新风机组设备表 |
| `Equipment Schedule_Fan Coil Unit.pdf` | 风机盘管设备表 |
| `(As-fitted) MVAC-01 V4.pdf` / `MVAC-02.pdf` | 竣工 As-fitted 空调图纸 01 / 02 |
| `【Air Side】Mall Schematic/2373-M-S06_09-Layout1_S06~S09.pdf` | 商场风管原理 S06–S09 分区 |
| `【Air Side】Mall Schematic/2373-M-S10-Layout1.pdf` / `S11-Layout1.pdf` | 商场风管 S10 / S11 分区 |

### 4.4 ELEMENTS House Rule & Safety Control（6 份）

物业安全与施工规章，**与 BMS 数据无直接关系**，合规 / 进场作业时查阅。

| 文件 | 大概内容 |
|------|----------|
| `App A - PS- EleRules.pdf` | 机电规则 |
| `App B - Permit-to-Work Guideline (2025).pdf` | 工作许可指引 |
| `App C - Risk Assessment and Control.pdf` | 风险评估与控制 |
| `App D - PS - Safety and Health Rules.pdf` | 安全健康规则 |
| `MMRW_5.0_20240501R_.pdf` | 机电维保相关规章 |
| `SafM_6.0_20250101_.pdf` | 安全手册 |

### 4.5 MVAC & Sea Water Plant O&M（4 份）

| 文件 | 大概内容 |
|------|----------|
| `O&M Manual for MVAC system.pdf` | 全楼 MVAC 运维手册（体量较大） |
| `Sea Water Plant - OnM Manual Vol. 1~3.pdf` | 海水厂运维手册（与 4.2 中 O&M 可能重复，以较新/较全者为准） |

---

## 5. 按任务快速找文件

| 你想做什么 | 优先打开 |
|------------|----------|
| 查 WCC 点位含义 / 关联设备 | 本文档 §2.3 或 `brick_model.ttl` |
| 拉某点历史曲线 | `bms_data_access.md` → `/api/v1/timeseries` |
| 拉当前冷机温度 / 启停 | `bms_live_read` 或 enteliWEB |
| 查冷水机 / 水泵型号数量 | `Chiller System_* / Equipment Schedule_*.pdf` |
| 查海水系统原理与设备 | `Sea Water Cooling System_* / Schematic、Schedule` |
| 查控制逻辑、异常判断依据 | `Control Philosophy*.pdf`、`(Schematic)*` |
| 查 FCU/AHU 分布 | `AHU & PAU & FCU_* / Mall Schematic`、`As-fitted MVAC` |
| 进场施工 / 合规 | `ELEMENTS House Rule & Safety Control/*` |
| 运维检修步骤 | `O&M Manual*`、`Sea Water Plant - OnM Manual*` |

---

## 6. 维护说明

- 新增 PDF：放入 `kb/` 或 POC 子目录后，在 §4 补一行。
- BMS 点位变更：同步更新 `brick_model.ttl` 与本 Summary §2。
- 压缩包：原件 `Poc Project-20260517T050008Z-3-001.zip`；解压目录与之并列，**智能体 `read_file` 请指向解压后的 PDF 路径**。

---

*本 Summary 由目录与 `brick_model.ttl` 自动解析生成，PDF 描述来自文件名与路径推断。若需某份 PDF 的逐页摘要，可对单文件做 OCR 后追加章节。*
