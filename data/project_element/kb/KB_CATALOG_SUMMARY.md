# Element KB Catalog Summary

> **Path:** `data/project_element/kb/`  
> **Updated:** 2026-06-09 (`scripts/regenerate_kb_catalog_summary.py`)  
> **Purpose:** Quick index of KB files and BMS point layers — read before blind exploration.  
> **Agent:** Read §1 + §5 first; use HL / PM / Plant naming layers. **Do not** search only `WCC_{n}_*` HL for COP and other Plant points.

---

## 1. KB overview

| Category | Path | Count | Notes |
| --- | --- | --- | --- |
| Brick semantic model | `brick_model.ttl` | 1552 entities / 1523 point relations | Full plant: chillers, pumps, valves, ice rink; `urn:hensen_chiller_plant#` |
| Plant API point list | `Elements Chiller Plant API.xlsx` | 4420 unique names / 7 sheets | enteliWEB export; HL / PM / MCC / sea-water plant |
| BMS data guide | `bms_guide.md` | 1 file | Agent quick ref + live/history APIs + tools |
| POC drawings & manuals | `Poc Project-20260517T050008Z-3-001/` | 46 PDFs | ELEMENTS mall MVAC / sea-water cooling / chillers / safety rules |

### 1.1 Three-layer chiller point model (read first)

Each chiller **117** points = **59 HL** + **33 PM** + **25 Plant**. Plant total **936** (8×117).

| Layer | Name pattern | Source sheet | Per chiller | Plant total | Notes |
| --- | --- | --- | --- | --- | --- |
| **HL (high-level)** | `WCC_{1-8}_TLKW`, `WCC_3_Run_Status` | `DDC-GF-01(HL)` | 59 | 472 | Chiller controller HL interface; default for live ops queries |
| **PM (power)** | `GF_2000A_WCC_L1_01_AMP_L1` etc. | `DDC-GF-01(PM)` / `(MCC2PM)` | 33 | 264 | MCC metering; L1 unit numbering |
| **Plant (room DDC)** | `WCC-L1-01-CHWST`, `WCC-L1-03_COP` | `DDC-GF-01` / `02` / `03` | 25 | 200 | Dry-contact DDC hydraulics/status; **COP lives here, not HL** |

### 1.2 Per-chiller scale

| Chiller | HL | PM | Plant | Total | HL prefix | Plant prefix |
| --- | --- | --- | --- | --- | --- | --- |
| `WCC_1` / `WCC_01` | 59 | 33 | 25 | 117 | `WCC_1_*` | `WCC-L1-01*` |
| `WCC_2` / `WCC_02` | 59 | 33 | 25 | 117 | `WCC_2_*` | `WCC-L1-02*` |
| `WCC_3` / `WCC_03` | 59 | 33 | 25 | 117 | `WCC_3_*` | `WCC-L1-03*` |
| `WCC_4` / `WCC_04` | 59 | 33 | 25 | 117 | `WCC_4_*` | `WCC-L1-04*` |
| `WCC_5` / `WCC_05` | 59 | 33 | 25 | 117 | `WCC_5_*` | `WCC-L1-05*` |
| `WCC_6` / `WCC_06` | 59 | 33 | 25 | 117 | `WCC_6_*` | `WCC-L1-06*` |
| `WCC_7` / `WCC_07` | 59 | 33 | 25 | 117 | `WCC_7_*` | `WCC-L1-07*` |
| `WCC_8` / `WCC_08` | 59 | 33 | 25 | 117 | `WCC_8_*` | `WCC-L1-08*` |

### 1.3 Special points index (easy to miss)

These **cannot** be found with HL-only `WCC_{n}_*` search patterns.

| Topic | Name pattern | Layer | Not in HL? | How to find |
| --- | --- | --- | --- | --- |
| COP (coefficient of performance) | `WCC-L1-01_COP` … `WCC-L1-08_COP` | Plant | Yes (not in HL) | `bms_points_query(q="COP")` or §2.3.1 |
| Plant cooling / power / delta-T | `WCC-L1-0n_DeltaT` / `_P` / `_Q` | Plant | Yes | §2.3.2 |
| Live motor power | `WCC_{1-8}_TLKW` | HL | No | `bms_live_read` / `?q=TLKW` |
| Leaving chilled-water temp | `WCC_{1-8}_Chilled_Water_Temp` (primary); `SUWT` is HL alias | HL | No | §2.1 |
| MCC amps / energy | `GF_2000A_WCC_L1_01_*` etc. | PM | Yes | §2.2 |
| Chilled-water pumps | `CHP-1P-D01-S` etc. | CHP | — | §2.4 |
| Sea-water pumps | `SWP_01_*` etc. | SWP | — | §2.5 |

**Data links:**

- HL (472) maps 1:1 to BMS-database `points.name` and enteliWEB.
- Plant layer has **8 direct COP points** (`WCC-L1-0n_COP`) plus `_DeltaT` / `_P` / `_Q`.
- CHP / SWP / ice rink have **no** COP points.
- **Values:** >3 points / history / batch → local BMS-database (`bms_points_query` / `bms_timeseries_query` per `skill_element_bms_data`); ≤3 live/alarm → `bms_live_read`. Names/catalog → this doc or `bms_points_query` once.

**Excel sheets:**

| Sheet | Unique names |
| --- | --- |
| `DDC-GF-01` | 192 |
| `DDC-GF-01(HL)` | 954 |
| `DDC-GF-01(MCC2PM)` | 1528 |
| `DDC-GF-01(PM)` | 868 |
| `DDC-GF-02` | 199 |
| `DDC-GF-03` | 308 |
| `DDC-SW-01` | 374 |

---

## 2. Full-plant Brick model (`brick_model.ttl`)

| Item | Value |
|------|-------|
| Format | Turtle (`.ttl`) |
| Namespace | `bldg:` = `urn:hensen_chiller_plant#` |
| Entities | **1552** |
| Point relations | **1523** `brick:isPointOf` |
| Chiller HL | **8 × 59 = 472** |
| Chiller PM | **8 × 33 = 264** |
| Chiller Plant | **8 × 25 = 200** |

**Equipment entities:**

- `Chilled_Water_Pump` × 10
- `HVAC_System` × 1
- `Heat_Exchanger` × 1
- `Water_Cooled_Chiller` × 8

**Point counts per parent:**

| Equipment / parent | Points |
| --- | --- |
| WCC_01 | 117 |
| WCC_02 | 117 |
| WCC_03 | 117 |
| WCC_04 | 117 |
| WCC_05 | 117 |
| WCC_06 | 117 |
| WCC_07 | 117 |
| WCC_08 | 117 |
| CHP_1P_01 | 38 |
| CHP_1P_02 | 38 |
| CHP_1P_03 | 38 |
| CHP_1P_04 | 38 |
| CHP_1P_05 | 38 |
| CHP_1P_06 | 38 |
| CHP_1P_07 | 38 |
| CHP_1P_08 | 38 |
| CHP_1P_09 | 38 |
| CHP_1P_10 | 38 |
| SWP_01 | 37 |
| SWP_02 | 36 |
| SWP_03 | 37 |
| SWP_04 | 37 |
| SWP_05 | 37 |
| Ice_Rink_Chiller_Plant | 23 |

**BMS naming (three layers — do not mix):**

| Layer | Brick equipment ID | BMS name example | Agent note |
|-------|-------------------|------------------|------------|
| HL | `WCC_01` … `WCC_08` | `WCC_1_TLKW` (single digit 1–8) | Run/temp/power; **no COP** |
| PM | same | `GF_2000A_WCC_L1_01_KWH` | MCC / L1 unit numbering |
| Plant | same | `WCC-L1-03_COP`, `WCC-L1-01-CHWST` | Room DDC; COP / flow / valves |

- Do not use `WCC_01_TLKW` (two-digit Brick ID ≠ BMS name).
- Do not search `WCC_3_COP` for COP — correct name is `WCC-L1-03_COP`.

---

## 2.1 Chiller HL points (59 per unit, full list)

All **59** High-Level points for **WCC_1** (`DDC-GF-01(HL)`).
For **WCC_2** … **WCC_8**, replace `WCC_1` with `WCC_n` (plant total **472**). **HL has no COP.**

| BMS name | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| WCC_1_AV_17 | Differential_Pressure_Sensor | Oil Pump Delta P | DDC-GF-01(HL) |
| WCC_1_Active_Delta_P | Differential_Pressure_Sensor | Active Delta T | DDC-GF-01(HL) |
| WCC_1_Active_Delta_T | Water_Differential_Temperature_Sensor | Surge Line Delta T | DDC-GF-01(HL) |
| WCC_1_Active_Demand_Limit | Demand_Setpoint | Active Demand Limit | DDC-GF-01(HL) |
| WCC_1_Actual_Guide_Vane_Pos | Damper_Position_Sensor | Actual Guide Vane Pos | DDC-GF-01(HL) |
| WCC_1_Actual_Line_Current | Current_Sensor | Actual Line Current | DDC-GF-01(HL) |
| WCC_1_Actual_Line_Voltage | Voltage_Sensor | Actual Line Voltage | DDC-GF-01(HL) |
| WCC_1_Average_Line_Current | Current_Sensor | Average Line Current | DDC-GF-01(HL) |
| WCC_1_Average_Line_Voltage | Voltage_Sensor | Average Line Voltage | DDC-GF-01(HL) |
| WCC_1_COMPSALM | Alarm | Alarm Relay | DDC-GF-01(HL) |
| WCC_1_Calc_Evap_Sat_Temp | Temperature_Sensor | Evaporator Pressure | DDC-GF-01(HL) |
| WCC_1_Chilled_Water_Flow | On_Off_Status | Chilled Water Flow | DDC-GF-01(HL) |
| WCC_1_Chilled_Water_Pump | Pump_Status | Chilled Water Pump | DDC-GF-01(HL) |
| WCC_1_Chilled_Water_Temp | Chilled_Water_Temperature_Sensor | Chilled Water Temp | DDC-GF-01(HL) |
| WCC_1_Chiller_Start_Stop | Start_Stop_Command | Chiller Start/Stop | DDC-GF-01(HL) |
| WCC_1_Comp_Discharge_Temp | Temperature_Sensor | Comp Discharge Temp | DDC-GF-01(HL) |
| WCC_1_Comp_Motor_Winding_Temp | Temperature_Sensor | Entering Chilled Water | DDC-GF-01(HL) |
| WCC_1_Comp_Thrust_Brg_Temp | Temperature_Sensor | Comp Motor Winding Temp | DDC-GF-01(HL) |
| WCC_1_Comp_Thrust_Lvg_Oil_Temp | Temperature_Sensor | Comp Thrust Brg Temp | DDC-GF-01(HL) |
| WCC_1_Compressor_Ontime | Run_Time_Sensor | Compressor Ontime | DDC-GF-01(HL) |
| WCC_1_Compressor_Start_Relay | Status | Compressor Start Relay | DDC-GF-01(HL) |
| WCC_1_Condenser_Approach | Temperature_Sensor | Active Delta P | DDC-GF-01(HL) |
| WCC_1_Condenser_Refrig_Temp | Condenser_Water_Temperature_Sensor | Condenser Pressure | DDC-GF-01(HL) |
| WCC_1_Condenser_Water_Flow | On_Off_Status | Condenser Water Flow | DDC-GF-01(HL) |
| WCC_1_Condenser_Water_Pump | Pump_Status | Condenser Water Pump | DDC-GF-01(HL) |
| WCC_1_Control_Mode | Mode_Status | Control Mode | DDC-GF-01(HL) |
| WCC_1_Control_Point | Temperature_Setpoint | Control Point | DDC-GF-01(HL) |
| WCC_1_DAT | Temperature_Sensor | Condenser Refrig Temp | DDC-GF-01(HL) |
| WCC_1_DISCP | Water_Pressure_Sensor | Condenser Approach | DDC-GF-01(HL) |
| WCC_1_DWT | Temperature_Sensor | Calc Evap Sat Temp | DDC-GF-01(HL) |
| WCC_1_ECW_Setpoint | Entering_Condenser_Water_Temperature_Setpoint | ECW Setpoint | DDC-GF-01(HL) |
| WCC_1_Evap_Refrig_Liquid_Temp | Temperature_Sensor | Evaporator Approach | DDC-GF-01(HL) |
| WCC_1_Evaporator_Approach | Water_Differential_Temperature_Sensor | Entering Condenser Water | DDC-GF-01(HL) |
| WCC_1_Guide_Vane_Delta | Position_Sensor | Guide Vane Delta | DDC-GF-01(HL) |
| WCC_1_LCW_Setpoint | Leaving_Chilled_Water_Temperature_Setpoint | LCW Setpoint | DDC-GF-01(HL) |
| WCC_1_Line_Current_Phase_1 | Current_Sensor | Line Current Phase 1 | DDC-GF-01(HL) |
| WCC_1_Line_Current_Phase_2 | Current_Sensor | Line Current Phase 2 | DDC-GF-01(HL) |
| WCC_1_Line_Current_Phase_3 | Current_Sensor | Line Current Phase 3 | DDC-GF-01(HL) |
| WCC_1_Line_Voltage_Phase_1 | Voltage_Sensor | Line Voltage Phase 1 | DDC-GF-01(HL) |
| WCC_1_Line_Voltage_Phase_2 | Voltage_Sensor | Line Voltage Phase 2 | DDC-GF-01(HL) |
| WCC_1_Line_Voltage_Phase_3 | Voltage_Sensor | Line Voltage Phase 3 | DDC-GF-01(HL) |
| WCC_1_Motor_Percent_Kilowatts | Power_Sensor | Motor Percent Kilowatts | DDC-GF-01(HL) |
| WCC_1_Oil_Heater_Relay | On_Off_Status | Oil Heater Relay | DDC-GF-01(HL) |
| WCC_1_Oil_Pump_Delta_P | Differential_Pressure_Sensor | Oil Pump Delta P | DDC-GF-01(HL) |
| WCC_1_Oil_Pump_Relay | On_Off_Status | Oil Pump Relay | DDC-GF-01(HL) |
| WCC_1_Oil_Sump_Temp | Temperature_Sensor | Oil Sump Temp | DDC-GF-01(HL) |
| WCC_1_Remote_Start_Contact | Start_Stop_Command | Remote Start Contact | DDC-GF-01(HL) |
| WCC_1_Run_Status | Run_Status | Run Status | DDC-GF-01(HL) |
| WCC_1_SUAT | Leaving_Condenser_Water_Temperature_Sensor | Leaving Condenser Water | DDC-GF-01(HL) |
| WCC_1_SUP | Pressure_Sensor | Evap Refrig Liquid Temp | DDC-GF-01(HL) |
| WCC_1_SUWT | Leaving_Chilled_Water_Temperature_Sensor | Leaving Chilled Water | DDC-GF-01(HL) |
| WCC_1_Start_Inhibit_Timer | On_Timer_Sensor | Start Inhibit Timer | DDC-GF-01(HL) |
| WCC_1_Starts_in_12_Hours | Start_Stop_Status | Starts in 12 Hours | DDC-GF-01(HL) |
| WCC_1_Surge_Line_Delta_T | Water_Differential_Temperature_Sensor | Average Line Current | DDC-GF-01(HL) |
| WCC_1_TLHR | Run_Time_Sensor | Service Ontime | DDC-GF-01(HL) |
| WCC_1_TLKW | Electric_Power_Sensor | Motor Kilowatts | DDC-GF-01(HL) |
| WCC_1_TLKWH | Energy_Sensor | Motor Kilowatt-Hours | DDC-GF-01(HL) |
| WCC_1_Target_Guide_Vane_Pos | Damper_Position_Setpoint | Target Guide Vane Pos | DDC-GF-01(HL) |
| WCC_1_Total_Compressor_Starts | Total_Compressor_Starts_Sensor | Total Compressor Starts | DDC-GF-01(HL) |

### 2.1.1 HL suffix quick ref (WCC_1 template)

Prefix each suffix with `WCC_{n}_` for chiller *n*. For leaving CHW temperature queries, prefer **`Chilled_Water_Temp`**; use **`SUWT`** only when the user or documentation names it explicitly.


| HL suffix | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| AV_17 | Differential_Pressure_Sensor | Oil Pump Delta P | DDC-GF-01(HL) |
| Active_Delta_P | Differential_Pressure_Sensor | Active Delta T | DDC-GF-01(HL) |
| Active_Delta_T | Water_Differential_Temperature_Sensor | Surge Line Delta T | DDC-GF-01(HL) |
| Active_Demand_Limit | Demand_Setpoint | Active Demand Limit | DDC-GF-01(HL) |
| Actual_Guide_Vane_Pos | Damper_Position_Sensor | Actual Guide Vane Pos | DDC-GF-01(HL) |
| Actual_Line_Current | Current_Sensor | Actual Line Current | DDC-GF-01(HL) |
| Actual_Line_Voltage | Voltage_Sensor | Actual Line Voltage | DDC-GF-01(HL) |
| Average_Line_Current | Current_Sensor | Average Line Current | DDC-GF-01(HL) |
| Average_Line_Voltage | Voltage_Sensor | Average Line Voltage | DDC-GF-01(HL) |
| COMPSALM | Alarm | Alarm Relay | DDC-GF-01(HL) |
| Calc_Evap_Sat_Temp | Temperature_Sensor | Evaporator Pressure | DDC-GF-01(HL) |
| Chilled_Water_Flow | On_Off_Status | Chilled Water Flow | DDC-GF-01(HL) |
| Chilled_Water_Pump | Pump_Status | Chilled Water Pump | DDC-GF-01(HL) |
| Chilled_Water_Temp | Chilled_Water_Temperature_Sensor | Chilled Water Temp | DDC-GF-01(HL) |
| Chiller_Start_Stop | Start_Stop_Command | Chiller Start/Stop | DDC-GF-01(HL) |
| Comp_Discharge_Temp | Temperature_Sensor | Comp Discharge Temp | DDC-GF-01(HL) |
| Comp_Motor_Winding_Temp | Temperature_Sensor | Entering Chilled Water | DDC-GF-01(HL) |
| Comp_Thrust_Brg_Temp | Temperature_Sensor | Comp Motor Winding Temp | DDC-GF-01(HL) |
| Comp_Thrust_Lvg_Oil_Temp | Temperature_Sensor | Comp Thrust Brg Temp | DDC-GF-01(HL) |
| Compressor_Ontime | Run_Time_Sensor | Compressor Ontime | DDC-GF-01(HL) |
| Compressor_Start_Relay | Status | Compressor Start Relay | DDC-GF-01(HL) |
| Condenser_Approach | Temperature_Sensor | Active Delta P | DDC-GF-01(HL) |
| Condenser_Refrig_Temp | Condenser_Water_Temperature_Sensor | Condenser Pressure | DDC-GF-01(HL) |
| Condenser_Water_Flow | On_Off_Status | Condenser Water Flow | DDC-GF-01(HL) |
| Condenser_Water_Pump | Pump_Status | Condenser Water Pump | DDC-GF-01(HL) |
| Control_Mode | Mode_Status | Control Mode | DDC-GF-01(HL) |
| Control_Point | Temperature_Setpoint | Control Point | DDC-GF-01(HL) |
| DAT | Temperature_Sensor | Condenser Refrig Temp | DDC-GF-01(HL) |
| DISCP | Water_Pressure_Sensor | Condenser Approach | DDC-GF-01(HL) |
| DWT | Temperature_Sensor | Calc Evap Sat Temp | DDC-GF-01(HL) |
| ECW_Setpoint | Entering_Condenser_Water_Temperature_Setpoint | ECW Setpoint | DDC-GF-01(HL) |
| Evap_Refrig_Liquid_Temp | Temperature_Sensor | Evaporator Approach | DDC-GF-01(HL) |
| Evaporator_Approach | Water_Differential_Temperature_Sensor | Entering Condenser Water | DDC-GF-01(HL) |
| Guide_Vane_Delta | Position_Sensor | Guide Vane Delta | DDC-GF-01(HL) |
| LCW_Setpoint | Leaving_Chilled_Water_Temperature_Setpoint | LCW Setpoint | DDC-GF-01(HL) |
| Line_Current_Phase_1 | Current_Sensor | Line Current Phase 1 | DDC-GF-01(HL) |
| Line_Current_Phase_2 | Current_Sensor | Line Current Phase 2 | DDC-GF-01(HL) |
| Line_Current_Phase_3 | Current_Sensor | Line Current Phase 3 | DDC-GF-01(HL) |
| Line_Voltage_Phase_1 | Voltage_Sensor | Line Voltage Phase 1 | DDC-GF-01(HL) |
| Line_Voltage_Phase_2 | Voltage_Sensor | Line Voltage Phase 2 | DDC-GF-01(HL) |
| Line_Voltage_Phase_3 | Voltage_Sensor | Line Voltage Phase 3 | DDC-GF-01(HL) |
| Motor_Percent_Kilowatts | Power_Sensor | Motor Percent Kilowatts | DDC-GF-01(HL) |
| Oil_Heater_Relay | On_Off_Status | Oil Heater Relay | DDC-GF-01(HL) |
| Oil_Pump_Delta_P | Differential_Pressure_Sensor | Oil Pump Delta P | DDC-GF-01(HL) |
| Oil_Pump_Relay | On_Off_Status | Oil Pump Relay | DDC-GF-01(HL) |
| Oil_Sump_Temp | Temperature_Sensor | Oil Sump Temp | DDC-GF-01(HL) |
| Remote_Start_Contact | Start_Stop_Command | Remote Start Contact | DDC-GF-01(HL) |
| Run_Status | Run_Status | Run Status | DDC-GF-01(HL) |
| SUAT | Leaving_Condenser_Water_Temperature_Sensor | Leaving Condenser Water | DDC-GF-01(HL) |
| SUP | Pressure_Sensor | Evap Refrig Liquid Temp | DDC-GF-01(HL) |
| SUWT | Leaving_Chilled_Water_Temperature_Sensor | Leaving Chilled Water | DDC-GF-01(HL) |
| Start_Inhibit_Timer | On_Timer_Sensor | Start Inhibit Timer | DDC-GF-01(HL) |
| Starts_in_12_Hours | Start_Stop_Status | Starts in 12 Hours | DDC-GF-01(HL) |
| Surge_Line_Delta_T | Water_Differential_Temperature_Sensor | Average Line Current | DDC-GF-01(HL) |
| TLHR | Run_Time_Sensor | Service Ontime | DDC-GF-01(HL) |
| TLKW | Electric_Power_Sensor | Motor Kilowatts | DDC-GF-01(HL) |
| TLKWH | Energy_Sensor | Motor Kilowatt-Hours | DDC-GF-01(HL) |
| Target_Guide_Vane_Pos | Damper_Position_Setpoint | Target Guide Vane Pos | DDC-GF-01(HL) |
| Total_Compressor_Starts | Total_Compressor_Starts_Sensor | Total Compressor Starts | DDC-GF-01(HL) |

---

## 2.2 Chiller PM / MCC power points (33 per unit)

All **33** PM / MCC points for **WCC_01**. Other chillers are isomorphic by L1 unit number (plant total **264**).

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| GF_2000A_WCC_L1_01_AMP_L1 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_AMP_L2 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_AMP_L3 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_AMP_N | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_Hz | Frequency_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVAR_L1 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVAR_L2 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVAR_L3 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVA_L1 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVA_L2 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVA_L3 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KVA_T | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KWH | Energy_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KW_L1 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KW_L2 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KW_L3 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_KW_T | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_PF_L1 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_PF_L2 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_PF_L3 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_PF_T | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_V_L1 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_V_L12 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_V_L2 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_V_L23 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_V_L3 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_01_V_L31 | Voltage_Sensor | — | DDC-GF-01(PM) |

### 2.2.1 PM suffix quick ref (WCC_01 / L1-01 template)

| PM name pattern (NN = unit no.) | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| GF_2000A_WCC_L1_NN_AMP_L1 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_AMP_L2 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_AMP_L3 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_AMP_N | Current_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_Hz | Frequency_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVAR_L1 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVAR_L2 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVAR_L3 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVA_L1 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVA_L2 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVA_L3 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KVA_T | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KWH | Energy_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KW_L1 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KW_L2 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KW_L3 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_KW_T | Power_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_PF_L1 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_PF_L2 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_PF_L3 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_PF_T | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_V_L1 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_V_L12 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_V_L2 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_V_L23 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_V_L3 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_2000A_WCC_L1_NN_V_L31 | Voltage_Sensor | — | DDC-GF-01(PM) |

---

## 2.3 Chiller Plant (room DDC) points

Plant points come from dry-contact DDC (`DDC-GF-01` / `02` / `03`), **not** `DDC-GF-01(HL)`.

### 2.3.1 Plant COP points (8, full list)

One direct COP reading per chiller; Brick type `Coefficient_Of_Performance_Sensor` (custom `bldg:` namespace).

| Chiller | BMS name | Brick type | Description | sourceSheet | Semantic note |
| --- | --- | --- | --- | --- | --- |
| WCC_01 | WCC-L1-01_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 | coefficient of performance |
| WCC_02 | WCC-L1-02_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 | coefficient of performance |
| WCC_03 | WCC-L1-03_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 | coefficient of performance |
| WCC_04 | WCC-L1-04_COP | Coefficient_Of_Performance_Sensor | WCC-04-COP | DDC-GF-01 | coefficient of performance |
| WCC_05 | WCC-L1-05_COP | Coefficient_Of_Performance_Sensor | WCC-04-COP | DDC-GF-01 | coefficient of performance |
| WCC_06 | WCC-L1-06_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 | coefficient of performance |
| WCC_07 | WCC-L1-07_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 | coefficient of performance |
| WCC_08 | WCC-L1-08_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 | coefficient of performance |

**BMS search:** `GET /api/v1/points?q=COP`

### 2.3.2 Plant calc-related points (COP / DeltaT / P / Q — 32 total)

| Chiller | BMS name | Brick type | Description | sourceSheet |
| --- | --- | --- | --- | --- |
| WCC_01 | WCC-L1-01_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 |
| WCC_01 | WCC-L1-01_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-02 |
| WCC_01 | WCC-L1-01_P | Power_Sensor | — | DDC-GF-02 |
| WCC_01 | WCC-L1-01_Q | Cooling_Demand_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_P | Power_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_Q | Cooling_Demand_Sensor | — | DDC-GF-02 |
| WCC_03 | WCC-L1-03_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_03 | WCC-L1-03_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_03 | WCC-L1-03_P | Power_Sensor | — | DDC-GF-03 |
| WCC_03 | WCC-L1-03_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |
| WCC_04 | WCC-L1-04_COP | Coefficient_Of_Performance_Sensor | WCC-04-COP | DDC-GF-01 |
| WCC_04 | WCC-L1-04_DeltaT | Differential_Entering_Leaving_Water_Temperature_Sensor | WCC-04-Delta T | DDC-GF-01 |
| WCC_04 | WCC-L1-04_P | Cooling_Demand_Sensor | Energy Cooling Load | DDC-GF-01 |
| WCC_04 | WCC-L1-04_Q | Cooling_Demand_Sensor | Water Cooling Load | DDC-GF-01 |
| WCC_05 | WCC-L1-05_COP | Coefficient_Of_Performance_Sensor | WCC-04-COP | DDC-GF-01 |
| WCC_05 | WCC-L1-05_DeltaT | Differential_Entering_Leaving_Water_Temperature_Sensor | WCC-04-Delta T | DDC-GF-01 |
| WCC_05 | WCC-L1-05_P | Cooling_Demand_Sensor | Energy Cooling Load | DDC-GF-01 |
| WCC_05 | WCC-L1-05_Q | Cooling_Demand_Sensor | Water Cooling Load | DDC-GF-01 |
| WCC_06 | WCC-L1-06_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_06 | WCC-L1-06_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_06 | WCC-L1-06_P | Power_Sensor | — | DDC-GF-03 |
| WCC_06 | WCC-L1-06_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_P | Power_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_P | Power_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |

### 2.3.3 Plant suffix quick ref (WCC-L1-01 template, 25 suffixes)

Replace `WCC-L1-01` with `WCC-L1-0n` (n = 01…08) for each chiller's Plant names.

| Plant suffix | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| -ACB-S | On_Off_Status | WCC-01-ACB On/Off Status | DDC-GF-02 |
| -ACB-TALM | Alarm | WCC-01-ACB Trip Alarm | DDC-GF-02 |
| -AMS | Mode_Status | WCC-01-Auto/Local Status | DDC-GF-02 |
| -CHWFWR | Chilled_Water_Flow_Sensor | WCC-01-CHW Flowrate | DDC-GF-02 |
| -CHWFWS | Status | WCC-01-CHW Flow Status | DDC-GF-02 |
| -CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-01-CHW Return Pressure | DDC-GF-02 |
| -CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-01-CHW Return Temperature | DDC-GF-02 |
| -CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-01-CHW Supply Pressure | DDC-GF-02 |
| -CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-01-CHW Supply Temperature | DDC-GF-02 |
| -CHWVLVS | Valve_Status | WCC-01-CHW Valve Status | DDC-GF-02 |
| -CWFWR | Condenser_Water_Flow_Sensor | WCC-01-CW Flowrate | DDC-GF-02 |
| -CWFWS | Status | WCC-01-CW Flow Status | DDC-GF-02 |
| -CWRPRESS | Entering_Water_Pressure_Sensor | WCC-01-CW Return Pressure | DDC-GF-02 |
| -CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-01-CHW Return Temperature | DDC-GF-02 |
| -CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-01-CW Supply Pressure | DDC-GF-02 |
| -CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-01-CHW Supply Temperature | DDC-GF-02 |
| -CWVLVS | Valve_Status | WCC-01-CW Valve Status | DDC-GF-02 |
| -PWR | Status | WCC-01-Power Status | DDC-GF-02 |
| -R134A-Detector | Gas_Sensor | WCC-01-QTS-1830 for R134a Detector | DDC-GF-02 |
| -S | On_Off_Status | WCC-01-On/Off Status | DDC-GF-02 |
| -TALM | Alarm | WCC-01-Trip Alarm | DDC-GF-02 |
| _COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 |
| _DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-02 |
| _P | Power_Sensor | — | DDC-GF-02 |
| _Q | Cooling_Demand_Sensor | — | DDC-GF-02 |

### 2.3.4 WCC_01 Plant full list (25 points, example)

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| WCC-L1-01-ACB-S | On_Off_Status | WCC-01-ACB On/Off Status | DDC-GF-02 |
| WCC-L1-01-ACB-TALM | Alarm | WCC-01-ACB Trip Alarm | DDC-GF-02 |
| WCC-L1-01-AMS | Mode_Status | WCC-01-Auto/Local Status | DDC-GF-02 |
| WCC-L1-01-CHWFWR | Chilled_Water_Flow_Sensor | WCC-01-CHW Flowrate | DDC-GF-02 |
| WCC-L1-01-CHWFWS | Status | WCC-01-CHW Flow Status | DDC-GF-02 |
| WCC-L1-01-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-01-CHW Return Pressure | DDC-GF-02 |
| WCC-L1-01-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-01-CHW Return Temperature | DDC-GF-02 |
| WCC-L1-01-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-01-CHW Supply Pressure | DDC-GF-02 |
| WCC-L1-01-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-01-CHW Supply Temperature | DDC-GF-02 |
| WCC-L1-01-CHWVLVS | Valve_Status | WCC-01-CHW Valve Status | DDC-GF-02 |
| WCC-L1-01-CWFWR | Condenser_Water_Flow_Sensor | WCC-01-CW Flowrate | DDC-GF-02 |
| WCC-L1-01-CWFWS | Status | WCC-01-CW Flow Status | DDC-GF-02 |
| WCC-L1-01-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-01-CW Return Pressure | DDC-GF-02 |
| WCC-L1-01-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-01-CHW Return Temperature | DDC-GF-02 |
| WCC-L1-01-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-01-CW Supply Pressure | DDC-GF-02 |
| WCC-L1-01-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-01-CHW Supply Temperature | DDC-GF-02 |
| WCC-L1-01-CWVLVS | Valve_Status | WCC-01-CW Valve Status | DDC-GF-02 |
| WCC-L1-01-PWR | Status | WCC-01-Power Status | DDC-GF-02 |
| WCC-L1-01-R134A-Detector | Gas_Sensor | WCC-01-QTS-1830 for R134a Detector | DDC-GF-02 |
| WCC-L1-01-S | On_Off_Status | WCC-01-On/Off Status | DDC-GF-02 |
| WCC-L1-01-TALM | Alarm | WCC-01-Trip Alarm | DDC-GF-02 |
| WCC-L1-01_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 |
| WCC-L1-01_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-02 |
| WCC-L1-01_P | Power_Sensor | — | DDC-GF-02 |
| WCC-L1-01_Q | Cooling_Demand_Sensor | — | DDC-GF-02 |

### 2.3.5 Full-plant Plant hydraulic points (8×25 = 200)

| Chiller | BMS name | Brick type | Description | sourceSheet |
| --- | --- | --- | --- | --- |
| WCC_01 | WCC-L1-01-ACB-S | On_Off_Status | WCC-01-ACB On/Off Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-ACB-TALM | Alarm | WCC-01-ACB Trip Alarm | DDC-GF-02 |
| WCC_01 | WCC-L1-01-AMS | Mode_Status | WCC-01-Auto/Local Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWFWR | Chilled_Water_Flow_Sensor | WCC-01-CHW Flowrate | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWFWS | Status | WCC-01-CHW Flow Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-01-CHW Return Pressure | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-01-CHW Return Temperature | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-01-CHW Supply Pressure | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-01-CHW Supply Temperature | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CHWVLVS | Valve_Status | WCC-01-CHW Valve Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWFWR | Condenser_Water_Flow_Sensor | WCC-01-CW Flowrate | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWFWS | Status | WCC-01-CW Flow Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-01-CW Return Pressure | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-01-CHW Return Temperature | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-01-CW Supply Pressure | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-01-CHW Supply Temperature | DDC-GF-02 |
| WCC_01 | WCC-L1-01-CWVLVS | Valve_Status | WCC-01-CW Valve Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-PWR | Status | WCC-01-Power Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-R134A-Detector | Gas_Sensor | WCC-01-QTS-1830 for R134a Detector | DDC-GF-02 |
| WCC_01 | WCC-L1-01-S | On_Off_Status | WCC-01-On/Off Status | DDC-GF-02 |
| WCC_01 | WCC-L1-01-TALM | Alarm | WCC-01-Trip Alarm | DDC-GF-02 |
| WCC_01 | WCC-L1-01_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 |
| WCC_01 | WCC-L1-01_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-02 |
| WCC_01 | WCC-L1-01_P | Power_Sensor | — | DDC-GF-02 |
| WCC_01 | WCC-L1-01_Q | Cooling_Demand_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02-ACB-S | On_Off_Status | WCC-02-ACB On/Off Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-ACB-TALM | Alarm | WCC-02-ACB Trip Alarm | DDC-GF-02 |
| WCC_02 | WCC-L1-02-AMS | Mode_Status | WCC-02-Auto/Local Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWFWR | Chilled_Water_Flow_Sensor | WCC-02-CHW Flowrate | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWFWS | Status | WCC-02-CHW Flow Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-02-CHW Return Pressure | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-02-CHW Return Temperature | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-02-CHW Supply Pressure | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-02-CHW Supply Temperature | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CHWVLVS | Valve_Status | WCC-02-CHW Valve Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWFWR | Condenser_Water_Flow_Sensor | WCC-02-CW Flowrate | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWFWS | Status | WCC-02-CW Flow Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-02-CW Return Pressure | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-02-CHW Return Temperature | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-02-CW Supply Pressure | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-02-CHW Supply Temperature | DDC-GF-02 |
| WCC_02 | WCC-L1-02-CWVLVS | Valve_Status | WCC-02-CW Valve Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-PWR | Status | WCC-02-Power Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-R134A-Detector | Flow_Sensor | WCC-02-QTS-1830 for R134a Detector | DDC-GF-02 |
| WCC_02 | WCC-L1-02-S | On_Off_Status | WCC-02-On/Off Status | DDC-GF-02 |
| WCC_02 | WCC-L1-02-TALM | Alarm | WCC-02-Trip Alarm | DDC-GF-02 |
| WCC_02 | WCC-L1-02_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_P | Power_Sensor | — | DDC-GF-02 |
| WCC_02 | WCC-L1-02_Q | Cooling_Demand_Sensor | — | DDC-GF-02 |
| WCC_03 | WCC-L1-03-ACB-S | On_Off_Status | WCC-03-CHW Return Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-ACB-TALM | Alarm | WCC-03-CHW Supply Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-AMS | Manual_Auto_Status | WCC-03-CW Return Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWFWR | Chilled_Water_Flow_Sensor | WCC-03-CHW Flowrate | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWFWS | Status | WCC-03-CHW Return Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-03-CHW Return Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-03-CHW Return Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-03-CHW Supply Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-03-CHW Supply Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CHWVLVS | Valve_Status | WCC-03-CHW Valve Status | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWFWR | Condenser_Water_Flow_Sensor | WCC-03-CW Flowrate | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWFWS | Status | WCC-03-CHW Supply Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-03-CW Return Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-03-CHW Return Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-03-CW Supply Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-03-CHW Supply Temperature | DDC-GF-03 |
| WCC_03 | WCC-L1-03-CWVLVS | Valve_Status | WCC-03-CW Valve Status | DDC-GF-03 |
| WCC_03 | WCC-L1-03-PWR | Status | WCC-03-CHW Supply Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03-R134A-Detector | Flow_Sensor | WCC-03-QTS-1830 for R134a Detector | DDC-GF-03 |
| WCC_03 | WCC-L1-03-S | On_Off_Status | WCC-03-On/Off Status | DDC-GF-03 |
| WCC_03 | WCC-L1-03-TALM | Alarm | WCC-03-CW Supply Pressure | DDC-GF-03 |
| WCC_03 | WCC-L1-03_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_03 | WCC-L1-03_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_03 | WCC-L1-03_P | Power_Sensor | — | DDC-GF-03 |
| WCC_03 | WCC-L1-03_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |
| WCC_04 | WCC-L1-04-ACBS | On_Off_Status | WCC-04-ACB On/Off Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-ACBTALM | Alarm | WCC-04-ACB Trip Alarm | DDC-GF-01 |
| WCC_04 | WCC-L1-04-AMS | Mode_Status | WCC-04-Auto/Local Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWFWR | Chilled_Water_Flow_Sensor | WCC-04-CHW Flowrate | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWFWS | Status | WCC-04-CHW Flow Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-04-CHW Return Pressure | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-04-CHW Return Temperature | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-04-CHW Supply Pressure | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-04-CHW Supply Temperature | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CHWVLVS | Valve_Status | WCC-04-CHW Valve Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWFWR | Condenser_Water_Flow_Sensor | WCC-04-CW Flowrate | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWFWS | Status | WCC-04-CW Flow Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-04-CW Return Pressure | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-04-CHW Return Temperature | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-04-CW Supply Pressure | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-04-CHW Supply Temperature | DDC-GF-01 |
| WCC_04 | WCC-L1-04-CWVLVS | Valve_Status | WCC-04-CW Valve Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-PWR | Status | WCC-04-Power Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-R134A-Detector | Flow_Sensor | WCC-04-QTS-1830 for R134a Detector | DDC-GF-01 |
| WCC_04 | WCC-L1-04-S | On_Off_Status | WCC-04-On/Off Status | DDC-GF-01 |
| WCC_04 | WCC-L1-04-TALM | Alarm | WCC-04-Trip Alarm | DDC-GF-01 |
| WCC_04 | WCC-L1-04_COP | Coefficient_Of_Performance_Sensor | WCC-04-COP | DDC-GF-01 |
| WCC_04 | WCC-L1-04_DeltaT | Differential_Entering_Leaving_Water_Temperature_Sensor | WCC-04-Delta T | DDC-GF-01 |
| WCC_04 | WCC-L1-04_P | Cooling_Demand_Sensor | Energy Cooling Load | DDC-GF-01 |
| WCC_04 | WCC-L1-04_Q | Cooling_Demand_Sensor | Water Cooling Load | DDC-GF-01 |
| WCC_05 | WCC-L1-05-ACBS | On_Off_Status | WCC-05-ACB On/Off Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-ACBTALM | Alarm | WCC-05-ACB Trip Alarm | DDC-GF-01 |
| WCC_05 | WCC-L1-05-AMS | Mode_Status | WCC-05-Auto/Local Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWFWR | Chilled_Water_Flow_Sensor | WCC-05-CHW Flowrate | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWFWS | Status | WCC-05-CHW Flow Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-05-CHW Return Pressure | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-05-CHW Return Temperature | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-05-CHW Supply Pressure | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-05-CHW Supply Temperature | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CHWVLVS | Valve_Status | WCC-05-CHW Valve Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWFWR | Condenser_Water_Flow_Sensor | WCC-05-CW Flowrate | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWFWS | Status | WCC-05-CW Flow Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-05-CW Return Pressure | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-05-CHW Return Temperature | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-05-CW Supply Pressure | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-05-CHW Supply Temperature | DDC-GF-01 |
| WCC_05 | WCC-L1-05-CWVLVS | Valve_Status | WCC-05-CW Valve Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-PWR | Status | WCC-05-Power Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-R134A-Detector | Gas_Sensor | WCC-05-QTS-1830 for R134a Detector | DDC-GF-01 |
| WCC_05 | WCC-L1-05-S | On_Off_Status | WCC-05-On/Off Status | DDC-GF-01 |
| WCC_05 | WCC-L1-05-TALM | Alarm | WCC-05-Trip Alarm | DDC-GF-01 |
| WCC_05 | WCC-L1-05_COP | Coefficient_Of_Performance_Sensor | WCC-04-COP | DDC-GF-01 |
| WCC_05 | WCC-L1-05_DeltaT | Differential_Entering_Leaving_Water_Temperature_Sensor | WCC-04-Delta T | DDC-GF-01 |
| WCC_05 | WCC-L1-05_P | Cooling_Demand_Sensor | Energy Cooling Load | DDC-GF-01 |
| WCC_05 | WCC-L1-05_Q | Cooling_Demand_Sensor | Water Cooling Load | DDC-GF-01 |
| WCC_06 | WCC-L1-06-ACB-S | On_Off_Status | WCC-06-ACB On/Off Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-ACB-TALM | Alarm | WCC-06-ACB Trip Alarm | DDC-GF-03 |
| WCC_06 | WCC-L1-06-AMS | Mode_Status | WCC-06-Auto/Local Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWFWR | Chilled_Water_Flow_Sensor | WCC-06-CHW Flowrate | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWFWS | Status | WCC-06-CHW Flow Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-06-CHW Return Pressure | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-06-CHW Return Temperature | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-06-CHW Supply Pressure | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-06-CHW Supply Temperature | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CHWVLVS | Valve_Status | WCC-06-CHW Valve Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWFWR | Condenser_Water_Flow_Sensor | WCC-06-CW Flowrate | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWFWS | Status | WCC-06-CW Flow Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-06-CW Return Pressure | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-06-CHW Return Temperature | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-06-CW Supply Pressure | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-06-CHW Supply Temperature | DDC-GF-03 |
| WCC_06 | WCC-L1-06-CWVLVS | Valve_Status | WCC-06-CW Valve Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-PWR | Status | WCC-06-Power Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-R134A-Detector | Gas_Sensor | WCC-06-QTS-1830 for R134a Detector | DDC-GF-03 |
| WCC_06 | WCC-L1-06-S | On_Off_Status | WCC-06-On/Off Status | DDC-GF-03 |
| WCC_06 | WCC-L1-06-TALM | Alarm | WCC-06-Trip Alarm | DDC-GF-03 |
| WCC_06 | WCC-L1-06_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_06 | WCC-L1-06_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_06 | WCC-L1-06_P | Power_Sensor | — | DDC-GF-03 |
| WCC_06 | WCC-L1-06_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07-ACB-S | On_Off_Status | WCC-07-ACB On/Off Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-ACB-TALM | Alarm | WCC-07-ACB Trip Alarm | DDC-GF-03 |
| WCC_07 | WCC-L1-07-AMS | Mode_Status | WCC-07-Auto/Local Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWFWR | Chilled_Water_Flow_Sensor | WCC-07-CHW Flowrate | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWFWS | Status | WCC-07-CHW Flow Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-07-CHW Return Pressure | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-07-CHW Return Temperature | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-07-CHW Supply Pressure | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWST | Entering_Chilled_Water_Temperature_Sensor | WCC-07-CHW Return Temperature | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CHWVLVS | Valve_Status | WCC-07-CHW Valve Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWFWR | Condenser_Water_Flow_Sensor | WCC-07-CW Flowrate | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWFWS | Status | WCC-07-CW Flow Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-07-CW Return Pressure | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-07-CHW Supply Temperature | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-07-CW Supply Pressure | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-07-CHW Supply Temperature | DDC-GF-03 |
| WCC_07 | WCC-L1-07-CWVLVS | Valve_Status | WCC-07-CW Valve Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-PWR | Status | WCC-07-Power Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-R134A-Detector | Gas_Sensor | WCC-07-QTS-1830 for R134a Detector | DDC-GF-03 |
| WCC_07 | WCC-L1-07-S | On_Off_Status | WCC-07-On/Off Status | DDC-GF-03 |
| WCC_07 | WCC-L1-07-TALM | Alarm | WCC-07-Trip Alarm | DDC-GF-03 |
| WCC_07 | WCC-L1-07_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_P | Power_Sensor | — | DDC-GF-03 |
| WCC_07 | WCC-L1-07_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08-ACB-S | On_Off_Status | WCC-08-ACB On/Off Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-ACB-TALM | Alarm | WCC-08-ACB Trip Alarm | DDC-GF-03 |
| WCC_08 | WCC-L1-08-AMS | Mode_Status | WCC-08 Auto/Local Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWFWR | Chilled_Water_Flow_Sensor | WCC-08-CHW Flowrate | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWFWS | Status | WCC-08-CHW Flow Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWRPRESS | Entering_Water_Pressure_Sensor | WCC-08-CW Return Pressure | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWRT | Entering_Chilled_Water_Temperature_Sensor | WCC-08-CHW Return Temperature | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWSPRESS | Leaving_Water_Pressure_Sensor | WCC-08-CHW Supply Pressure | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWST | Leaving_Chilled_Water_Temperature_Sensor | WCC-08-CHW Supply Temperature | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CHWVLVS | Valve_Status | WCC-08-CHW Valve Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWFWR | Condenser_Water_Flow_Sensor | WCC-08-CW Flowrate | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWFWS | Status | WCC-08-CW Flow Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWRPRESS | Entering_Water_Pressure_Sensor | WCC-08-CHW Return Pressure | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWRT | Entering_Condenser_Water_Temperature_Sensor | WCC-08-CHW Return Temperature | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWSPRESS | Leaving_Water_Pressure_Sensor | WCC-08-CW Supply Pressure | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWST | Leaving_Condenser_Water_Temperature_Sensor | WCC-08-CHW Supply Temperature | DDC-GF-03 |
| WCC_08 | WCC-L1-08-CWVLVS | Valve_Status | WCC-08-CW Valve Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-PWR | Run_Status | WCC-08 Auto/Local Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-R134A-Detector | Flow_Sensor | WCC-08-QTS-1830 for R134a Detector | DDC-GF-03 |
| WCC_08 | WCC-L1-08-S | On_Off_Status | WCC-08-On/Off Status | DDC-GF-03 |
| WCC_08 | WCC-L1-08-TALM | Alarm | WCC-08-Trip Alarm | DDC-GF-03 |
| WCC_08 | WCC-L1-08_COP | Coefficient_Of_Performance_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_DeltaT | Water_Differential_Temperature_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_P | Power_Sensor | — | DDC-GF-03 |
| WCC_08 | WCC-L1-08_Q | Cooling_Demand_Sensor | — | DDC-GF-03 |

---

## 2.4 Chilled-water pumps CHP (38 per unit × 10)

### CHP_1P_01 — full point list

**38** points. `CHP_1P_02` … `CHP_1P_10` each have **38** isomorphic points.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| CHP-1P-D01-AMS | Mode_Status | CHP-1P-01-Auto/Local Status | DDC-GF-02 |
| CHP-1P-D01-PWR | Status | CHP-1P-01-Power Status | DDC-GF-02 |
| CHP-1P-D01-RT | Run_Time_Sensor | — | DDC-GF-02 |
| CHP-1P-D01-S | On_Off_Status | CHP-1P-01-On/Off Status | DDC-GF-02 |
| CHP-1P-D01-TALM | Alarm | CHP-1P-01-Trip Alarm | DDC-GF-02 |
| GF_300A_CHP_1P_D01_AMP_L1 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_AMP_L2 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_AMP_L3 | Current_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_AMP_N | Current_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_Hz | Frequency_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVAR_L1 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVAR_L2 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVAR_L3 | Reactive_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVA_L1 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVA_L2 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVA_L3 | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KVA_T | Electric_Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KWH | Energy_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KW_L1 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KW_L2 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KW_L3 | Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_KW_T | Power_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_PF_L1 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_PF_L2 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_PF_L3 | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_PF_T | Power_Factor_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_V_L1 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_V_L12 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_V_L2 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_V_L23 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_V_L3 | Voltage_Sensor | — | DDC-GF-01(PM) |
| GF_300A_CHP_1P_D01_V_L31 | Voltage_Sensor | — | DDC-GF-01(PM) |


| CHP unit | Points |
| --- | --- |
| CHP_1P_01 | 38 |
| CHP_1P_02 | 38 |
| CHP_1P_03 | 38 |
| CHP_1P_04 | 38 |
| CHP_1P_05 | 38 |
| CHP_1P_06 | 38 |
| CHP_1P_07 | 38 |
| CHP_1P_08 | 38 |
| CHP_1P_09 | 38 |
| CHP_1P_10 | 38 |

---

## 2.5 Sea-water pumps SWP, ice rink & system-level

### SWP_01 — full point list (37 points)

**37** points. Sea-water pump power and status; **no COP**.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| SWP-01-AMS | Manual_Auto_Status | Sea Water Pump-01 -Auto/Manual Status | DDC-SW-01 |
| SWP-01-S | On_Off_Status | Sea Water Pump-01 -On/Off Status | DDC-SW-01 |
| SWP-01-TALM | Alarm | Sea Water Pump-01-Trip Alarm | DDC-SW-01 |
| SWP_01-RT | Run_Time_Sensor | Sea Water Pump 01 - Running Time | DDC-SW-01 |
| SWP_01_AMP_L1 | Current_Sensor | — | DDC-SW-01 |
| SWP_01_AMP_L2 | Current_Sensor | — | DDC-SW-01 |
| SWP_01_AMP_L3 | Current_Sensor | — | DDC-SW-01 |
| SWP_01_AMP_N | Current_Sensor | — | DDC-SW-01 |
| SWP_01_Hz | Frequency_Sensor | — | DDC-SW-01 |
| SWP_01_KVAR_L1 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KVAR_L2 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KVAR_L3 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KVA_L1 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KVA_L2 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KVA_L3 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KVA_T | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_01_KWH | Energy_Sensor | — | DDC-SW-01 |
| SWP_01_KW_L1 | Power_Sensor | — | DDC-SW-01 |
| SWP_01_KW_L2 | Power_Sensor | — | DDC-SW-01 |
| SWP_01_KW_L3 | Power_Sensor | — | DDC-SW-01 |
| SWP_01_KW_T | Power_Sensor | — | DDC-SW-01 |
| SWP_01_PF_L1 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_01_PF_L2 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_01_PF_L3 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_01_PF_T | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_01_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_01_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_01_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_01_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_01_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_01_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_01_V_L1 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_01_V_L12 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_01_V_L2 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_01_V_L23 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_01_V_L3 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_01_V_L31 | Voltage_Sensor | — | DDC-SW-01 |


### SWP_02 — full point list (36 points)

**36** points. Sea-water pump power and status; **no COP**.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| SWP-02-AMS | Manual_Auto_Status | Sea Water Pump-02 - Auto/Manual_Status | DDC-SW-01 |
| SWP-02-S | On_Off_Status | Sea Water Pump-02 - On/Off Status | DDC-SW-01 |
| SWP-02-TALM | Alarm | Sea Water Pump-02-Trip Alarm | DDC-SW-01 |
| SWP_02-RT | Run_Time_Sensor | Sea Water Pump 02 - Running Time | DDC-SW-01 |
| SWP_02_AMP_L1 | Current_Sensor | — | DDC-SW-01 |
| SWP_02_AMP_L2 | Current_Sensor | — | DDC-SW-01 |
| SWP_02_AMP_L3 | Current_Sensor | — | DDC-SW-01 |
| SWP_02_AMP_N | Current_Sensor | — | DDC-SW-01 |
| SWP_02_Hz | Frequency_Sensor | — | DDC-SW-01 |
| SWP_02_KVAR_L1 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KVAR_L2 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KVAR_L3 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KVA_L1 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KVA_L2 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KVA_L3 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KVA_T | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_02_KW_L1 | Power_Sensor | — | DDC-SW-01 |
| SWP_02_KW_L2 | Power_Sensor | — | DDC-SW-01 |
| SWP_02_KW_L3 | Power_Sensor | — | DDC-SW-01 |
| SWP_02_KW_T | Power_Sensor | — | DDC-SW-01 |
| SWP_02_PF_L1 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_02_PF_L2 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_02_PF_L3 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_02_PF_T | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_02_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_02_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_02_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_02_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_02_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_02_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_02_V_L1 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_02_V_L12 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_02_V_L2 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_02_V_L23 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_02_V_L3 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_02_V_L31 | Voltage_Sensor | — | DDC-SW-01 |


### SWP_03 — full point list (37 points)

**37** points. Sea-water pump power and status; **no COP**.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| SWP-03-AMS | Manual_Auto_Status | Sea Water Pump-03-Auto/Manual Status | DDC-SW-01 |
| SWP-03-S | On_Off_Status | Sea Water Pump-03 - On/Off Status | DDC-SW-01 |
| SWP-03-TALM | Alarm | Sea Water Pump-03-Trip Alarm | DDC-SW-01 |
| SWP_03-RT | Run_Time_Sensor | Sea Water Pump 03 - Running Time | DDC-SW-01 |
| SWP_03_AMP_L1 | Current_Sensor | — | DDC-SW-01 |
| SWP_03_AMP_L2 | Current_Sensor | — | DDC-SW-01 |
| SWP_03_AMP_L3 | Current_Sensor | — | DDC-SW-01 |
| SWP_03_AMP_N | Current_Sensor | — | DDC-SW-01 |
| SWP_03_Hz | Frequency_Sensor | — | DDC-SW-01 |
| SWP_03_KVAR_L1 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KVAR_L2 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KVAR_L3 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KVA_L1 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KVA_L2 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KVA_L3 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KVA_T | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_03_KWH | Energy_Sensor | — | DDC-SW-01 |
| SWP_03_KW_L1 | Power_Sensor | — | DDC-SW-01 |
| SWP_03_KW_L2 | Power_Sensor | — | DDC-SW-01 |
| SWP_03_KW_L3 | Power_Sensor | — | DDC-SW-01 |
| SWP_03_KW_T | Power_Sensor | — | DDC-SW-01 |
| SWP_03_PF_L1 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_03_PF_L2 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_03_PF_L3 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_03_PF_T | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_03_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_03_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_03_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_03_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_03_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_03_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_03_V_L1 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_03_V_L12 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_03_V_L2 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_03_V_L23 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_03_V_L3 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_03_V_L31 | Voltage_Sensor | — | DDC-SW-01 |


### SWP_04 — full point list (37 points)

**37** points. Sea-water pump power and status; **no COP**.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| SWP-04-AMS | Manual_Auto_Status | Sea Water Pump-04 - Auto/Manual_Status | DDC-SW-01 |
| SWP-04-S | Status | Sea Water Pump-04 - Auto/Manual_Status | DDC-SW-01 |
| SWP-04-TALM | Alarm | Sea Water Pump-04-Trip Alarm | DDC-SW-01 |
| SWP_04-RT | Run_Time_Sensor | Sea Water Pump 04 - Running Time | DDC-SW-01 |
| SWP_04_AMP_L1 | Current_Sensor | — | DDC-SW-01 |
| SWP_04_AMP_L2 | Current_Sensor | — | DDC-SW-01 |
| SWP_04_AMP_L3 | Current_Sensor | — | DDC-SW-01 |
| SWP_04_AMP_N | Current_Sensor | — | DDC-SW-01 |
| SWP_04_Hz | Frequency_Sensor | — | DDC-SW-01 |
| SWP_04_KVAR_L1 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KVAR_L2 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KVAR_L3 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KVA_L1 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KVA_L2 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KVA_L3 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KVA_T | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_04_KWH | Energy_Sensor | — | DDC-SW-01 |
| SWP_04_KW_L1 | Power_Sensor | — | DDC-SW-01 |
| SWP_04_KW_L2 | Power_Sensor | — | DDC-SW-01 |
| SWP_04_KW_L3 | Power_Sensor | — | DDC-SW-01 |
| SWP_04_KW_T | Power_Sensor | — | DDC-SW-01 |
| SWP_04_PF_L1 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_04_PF_L2 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_04_PF_L3 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_04_PF_T | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_04_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_04_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_04_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_04_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_04_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_04_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_04_V_L1 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_04_V_L12 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_04_V_L2 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_04_V_L23 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_04_V_L3 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_04_V_L31 | Voltage_Sensor | — | DDC-SW-01 |


### SWP_05 — full point list (37 points)

**37** points. Sea-water pump power and status; **no COP**.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| SWP-05-AMS | Manual_Auto_Status | Sea Water Pump-05 - Auto/Manual_Status | DDC-SW-01 |
| SWP-05-S | On_Off_Status | Sea Water Pump-05-On/Off Status | DDC-SW-01 |
| SWP-05-TALM | Alarm | Sea Water Pump-05-Trip Alarm | DDC-SW-01 |
| SWP_05-RT | Run_Time_Sensor | Sea Water Pump 05 - Running Time | DDC-SW-01 |
| SWP_05_AMP_L1 | Current_Sensor | — | DDC-SW-01 |
| SWP_05_AMP_L2 | Current_Sensor | — | DDC-SW-01 |
| SWP_05_AMP_L3 | Current_Sensor | — | DDC-SW-01 |
| SWP_05_AMP_N | Current_Sensor | — | DDC-SW-01 |
| SWP_05_Hz | Frequency_Sensor | — | DDC-SW-01 |
| SWP_05_KVAR_L1 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KVAR_L2 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KVAR_L3 | Reactive_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KVA_L1 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KVA_L2 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KVA_L3 | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KVA_T | Electric_Power_Sensor | — | DDC-SW-01 |
| SWP_05_KWH | Energy_Sensor | — | DDC-SW-01 |
| SWP_05_KW_L1 | Power_Sensor | — | DDC-SW-01 |
| SWP_05_KW_L2 | Power_Sensor | — | DDC-SW-01 |
| SWP_05_KW_L3 | Power_Sensor | — | DDC-SW-01 |
| SWP_05_KW_T | Power_Sensor | — | DDC-SW-01 |
| SWP_05_PF_L1 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_05_PF_L2 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_05_PF_L3 | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_05_PF_T | Power_Factor_Sensor | — | DDC-SW-01 |
| SWP_05_THDAMP_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_05_THDAMP_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_05_THDAMP_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_05_THDV_L1 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_05_THDV_L2 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_05_THDV_L3 | Total_Harmonic_Distortion_Sensor | — | DDC-SW-01 |
| SWP_05_V_L1 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_05_V_L12 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_05_V_L2 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_05_V_L23 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_05_V_L3 | Voltage_Sensor | — | DDC-SW-01 |
| SWP_05_V_L31 | Voltage_Sensor | — | DDC-SW-01 |


### Ice_Rink_Chiller_Plant — full point list

**23** points. Ice-rink chiller plant; **no COP**.

| BMS name / label | Brick type | Description | sourceSheet |
| --- | --- | --- | --- |
| IR-CP-01-CWRT | Entering_Water_Temperature_Sensor | IceRink-Chiller Pump-01-CW Return Temperature | DDC-GF-03 |
| IR-CP-01-CWST | Leaving_Water_Temperature_Sensor | IceRink-Chiller Pump-01-CW Supply Temperature | DDC-GF-03 |
| IR-CP-01-ESTOP | Emergency_Power_Off_System_Status | IceRink-Chiller Pump-01-E-Stop | DDC-GF-03 |
| IR-CP-01-PWR | Status | IceRink-Chiller Pump-01-Power Status | DDC-GF-03 |
| IR-CP-01-RPRESS | Entering_Water_Pressure_Sensor | IceRink-Chiller Pump-01-Return Pressure | DDC-GF-03 |
| IR-CP-01-S | On_Off_Status | IceRink-Chiller Pump-01-On/Off Status | DDC-GF-03 |
| IR-CP-01-SPRESS | Water_Pressure_Sensor | IceRink-Chiller Pump-01-Supply Pressure | DDC-GF-03 |
| IR-CP-01-TALM | Alarm | IceRink-Chiller Pump-01-Trip Alarm | DDC-GF-03 |
| IR-CP-02-CWRT | Entering_Water_Temperature_Sensor | IceRink-Chiller Pump-02-'CW Return Temperature | DDC-GF-03 |
| IR-CP-02-CWST | Leaving_Water_Temperature_Sensor | IceRink-Chiller Pump-02-'CW Supply Temperature | DDC-GF-03 |
| IR-CP-02-ESTOP | Emergency_Power_Off_System_Status | IceRink-Chiller Pump-02-'E-Stop | DDC-GF-03 |
| IR-CP-02-PWR | Status | IceRink-Chiller Pump-02-Power Status | DDC-GF-03 |
| IR-CP-02-RPRESS | Entering_Water_Pressure_Sensor | IceRink-Chiller Pump-02-'Return Pressure | DDC-GF-03 |
| IR-CP-02-S | On_Off_Status | IceRink-Chiller Pump-02-On/Off Status | DDC-GF-03 |
| IR-CP-02-SPRESS | Water_Pressure_Sensor | IceRink-Chiller Pump-02-'Supply Pressure | DDC-GF-03 |
| IR-CP-02-TALM | Alarm | IceRink-Chiller Pump-02-'Trip Alarm | DDC-GF-03 |
| IR-WCC-L1-01-CWRT | Entering_Condenser_Water_Temperature_Sensor | IceRink-WCC-01-CW Return Temperature | DDC-GF-03 |
| IR-WCC-L1-01-DPRESS | Differential_Pressure_Sensor | IceRink-WCC-01-Differenal Pressure | DDC-GF-03 |
| IR-WCC-L1-01-TALM | Alarm | IceRink-WCC-01-Trip Alarm | DDC-GF-03 |
| IR-WCC-L1-02-CWRT | Entering_Condenser_Water_Temperature_Sensor | IceRink-WCC-01-CW Supply Temperature | DDC-GF-03 |
| IR-WCC-L1-02-DPRESS | Differential_Pressure_Sensor | IceRink-WCC-01-Differenal Pressure | DDC-GF-03 |
| IR-WCC-L1-02-TALM | Alarm | IceRink-WCC-01-Trip Alarm | DDC-GF-03 |
| IR-WCC-L1-03-TALM | Alarm | IceRink-WCC-01-Trip Alarm | DDC-GF-03 |


---

## 2.6 Brick type stats (top 30)

| Brick type | Count |
| --- | --- |
| Voltage_Sensor | 178 |
| Total_Harmonic_Distortion_Sensor | 138 |
| Current_Sensor | 132 |
| Power_Sensor | 106 |
| Electric_Power_Sensor | 100 |
| Power_Factor_Sensor | 92 |
| Temperature_Sensor | 80 |
| Reactive_Power_Sensor | 69 |
| On_Off_Status | 64 |
| Alarm | 44 |
| Status | 44 |
| Run_Time_Sensor | 31 |
| Energy_Sensor | 30 |
| Water_Differential_Temperature_Sensor | 30 |
| Differential_Pressure_Sensor | 26 |
| Mode_Status | 25 |
| Frequency_Sensor | 23 |
| Entering_Water_Pressure_Sensor | 18 |
| Leaving_Condenser_Water_Temperature_Sensor | 16 |
| Leaving_Water_Pressure_Sensor | 16 |
| Pump_Status | 16 |
| Start_Stop_Command | 16 |
| Valve_Status | 16 |
| Leaving_Chilled_Water_Temperature_Sensor | 15 |
| Cooling_Demand_Sensor | 10 |
| Entering_Condenser_Water_Temperature_Sensor | 10 |
| Water_Pressure_Sensor | 10 |
| Entering_Chilled_Water_Temperature_Sensor | 9 |
| Run_Status | 9 |
| Chilled_Water_Flow_Sensor | 8 |
| … | +22 more types |

---

## 3. BMS integration docs

| File | Contents |
| --- | --- |
| `bms_guide.md` | §0 Agent quick ref；§1–4 live/history APIs & tools；Appendix A timeseries migration |

---

## 4. POC project PDFs (`Poc Project-20260517T050008Z-3-001/Poc Project/`)

Hong Kong **ELEMENTS** mall MEP document pack, grouped by subsystem. Descriptions below are **inferred from filenames** (not full OCR).

### 4.1 Chiller system (4 files)

| File | Likely content |
|------|----------------|
| `Equipment Schedule_Chiller.pdf` | Chiller equipment schedule: model, capacity, qty, location |
| `Equipment Schedule_Chilled Water Pump.pdf` | Chilled-water pump schedule |
| `Equipment Schedule_Condenser Water Pump.pdf` | Condenser-water pump schedule |
| `Chiller Control Panel Line Diagram.pdf` | Chiller plant control panel / logic diagram |

### 4.2 Sea-water cooling system (22 files)

Sea-water cooling, plate heat exchangers, plant room layouts — related to SWP BMS points.

| File | Likely content |
|------|----------------|
| `Overall Equipment Schedule_Sea Water System.pdf` | Sea-water system equipment schedule |
| `Overall Equipment Specification_Sea Water System.pdf` | Sea-water equipment specifications |
| `Seawater System Scenario.pdf` | Operating scenarios / modes |
| `(Schematic) Overall Schematic Diagram_Sea Water System.pdf` | Overall sea-water schematic |
| `(Schematic) Sea Water Plant Room (1).pdf` / `(2).pdf` | Sea-water pump room schematics |
| `(Schematic) Chiller Plant Room.pdf` | Chiller plant room schematic |
| `(Layout) Underground Plant Room.pdf` | Underground plant room layout |
| `(Layout) Chiller Plant Room.pdf` | Chiller plant room layout |
| `(Layout) Heat Exchanger Room (1).pdf` / `(2).pdf` | Heat exchanger room layouts |
| `(Layout) Typical Sea Water Pump.pdf` | Typical sea-water pump layout |
| `(Control Philosophy) main AC plant.pdf` | Main AC plant control philosophy |
| `(Control Philosophy) Seawater Cooling Plant.pdf` | Sea-water plant control philosophy |
| `(As-fit Drawing) 03-14-2008_Seawater_Cooling_Plant.pdf` | 2008 as-built sea-water plant |
| `(O&M) Auto Backwash Strainer.pdf` | Auto backwash strainer O&M |
| `【1】O&M Manual/Sea Water Plant - OnM Manual Vol. 1~3.pdf` | Sea-water plant O&M manual (3 vols) |
| `【2】Heat Exchanger/Equipment - Plate Heat Exchanger.pdf` | Plate heat exchanger equipment data |
| `【2】Heat Exchanger/Heat Exchanger_Product Manual.pdf` | Heat exchanger product manual |
| `【2】Heat Exchanger/Heat Exchanger_Name Plate.pdf` | Heat exchanger nameplate |

### 4.3 AHU, PAU & FCU — air side (10 files)

Air side: AHUs, PAUs, fan coil units.

| File | Likely content |
|------|----------------|
| `Equipment Schedule_AHU & PAU.pdf` | AHU / PAU equipment schedule |
| `Equipment Schedule_Fan Coil Unit.pdf` | FCU equipment schedule |
| `(As-fitted) MVAC-01 V4.pdf` / `MVAC-02.pdf` | As-fitted MVAC drawings 01 / 02 |
| `【Air Side】Mall Schematic/2373-M-S06_09-Layout1_S06~S09.pdf` | Mall duct schematic zones S06–S09 |
| `【Air Side】Mall Schematic/2373-M-S10-Layout1.pdf` / `S11-Layout1.pdf` | Mall duct schematic S10 / S11 |

### 4.4 ELEMENTS House Rule & Safety Control (6 files)

Property safety and work-permit rules — **not BMS data**; use for compliance / site access.

| File | Likely content |
|------|----------------|
| `App A - PS- EleRules.pdf` | MEP rules |
| `App B - Permit-to-Work Guideline (2025).pdf` | Permit-to-work guideline |
| `App C - Risk Assessment and Control.pdf` | Risk assessment and control |
| `App D - PS - Safety and Health Rules.pdf` | Safety and health rules |
| `MMRW_5.0_20240501R_.pdf` | MEP maintenance regulations |
| `SafM_6.0_20250101_.pdf` | Safety manual |

### 4.5 MVAC & Sea Water Plant O&M (4 files)

| File | Likely content |
|------|----------------|
| `O&M Manual for MVAC system.pdf` | Building-wide MVAC O&M manual (large) |
| `Sea Water Plant - OnM Manual Vol. 1~3.pdf` | Sea-water O&M (may overlap §4.2; use newer copy) |

---

## 5. Task → file routing

| Task | Open first |
| --- | --- |
| KB structure & naming | This doc §1.1–§1.3 |
| WCC HL points (59/unit) | §2.1 or §2.1.1 |
| Chiller COP (direct points) | §2.3.1; API `?q=COP`; **do not** search HL for `WCC_n_COP` |
| Plant flow / pressure / valve status | §2.3.3–§2.3.5 |
| Chiller PM / MCC power | §2.2–§2.2.1 |
| CHP / SWP point names | §2.4–§2.5 |
| Point history / trend | `bms_guide.md` §3 → `/api/v1/timeseries` |
| Live chiller temp / power (≤3 points) | `bms_live_read`; >3 or batch → `bms_points_query` local DB first |
| Chiller / pump equipment specs | `Chiller System_* / Equipment Schedule_*.pdf` |
| Sea-water system design | `Sea Water Cooling System_*` |
| Site access / compliance | `ELEMENTS House Rule & Safety Control/*` |

---

## 6. Maintenance

- After updating `brick_model.ttl` or `Elements Chiller Plant API.xlsx`, run:
  ```bash
  python3 scripts/regenerate_kb_catalog_summary.py
  ```
- New PDFs: add under POC subfolders, then manually update §4.
- Removed redundancies: `Element Chiller High Level API.xlsx`, original POC zip.

---

*Auto-generated by `scripts/regenerate_kb_catalog_summary.py` from `brick_model.ttl` and `Elements Chiller Plant API.xlsx` (2026-06-09).*
