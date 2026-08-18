/* Generated from the five user-provided DOCX FDD libraries. Do not edit individual rows by hand. */
export const IMPORTED_EQUIPMENT_FDD_CATALOG = {
  "schemaVersion": 1,
  "sources": [
    {
      "equipmentType": "vav",
      "fileName": "VAV_Box_FDD_Library.docx",
      "sha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45",
      "variables": [
        {
          "symbol": "VAV_{cmd}",
          "description": "VAV box控制命令"
        },
        {
          "symbol": "DAM_{cmd}",
          "description": "风阀命令"
        },
        {
          "symbol": "DAM_{pos}",
          "description": "风阀实际开度"
        },
        {
          "symbol": "AFLOW",
          "description": "实际送风量"
        },
        {
          "symbol": "AFLOW_{sp}",
          "description": "送风量设定值"
        },
        {
          "symbol": "AFLOW_{min}",
          "description": "最小风量设定值"
        },
        {
          "symbol": "AFLOW_{max}",
          "description": "最大风量设定值"
        },
        {
          "symbol": "T_{zone}",
          "description": "区域温度"
        },
        {
          "symbol": "T_{zone_sp}",
          "description": "区域温度设定值"
        },
        {
          "symbol": "T_{da}",
          "description": "VAV出风温度"
        },
        {
          "symbol": "T_{sa}",
          "description": "AHU送风温度"
        },
        {
          "symbol": "SP",
          "description": "风管静压"
        },
        {
          "symbol": "RHV",
          "description": "再热阀开度"
        },
        {
          "symbol": "HWST",
          "description": "热水供水温度"
        },
        {
          "symbol": "OCC",
          "description": "占用状态"
        },
        {
          "symbol": "CO_{2}",
          "description": "区域CO₂浓度"
        }
      ]
    },
    {
      "equipmentType": "pump",
      "fileName": "Pump_FDD_Library.docx",
      "sha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0",
      "variables": [
        {
          "symbol": "PUMP_{cmd}",
          "description": "水泵启停命令"
        },
        {
          "symbol": "PUMP_{sts}",
          "description": "水泵运行状态"
        },
        {
          "symbol": "PUMP_{speed}",
          "description": "水泵频率/转速"
        },
        {
          "symbol": "PUMP_{power}",
          "description": "水泵功率"
        },
        {
          "symbol": "PUMP_{current}",
          "description": "水泵电流"
        },
        {
          "symbol": "FLOW",
          "description": "水流量(包括冷冻水和冷却水流量)"
        },
        {
          "symbol": "DP",
          "description": "水泵前后压差(包括冷冻水和冷却水)"
        },
        {
          "symbol": "DP_{sp}",
          "description": "水泵前后压差设定值(包括冷冻水和冷却水)"
        },
        {
          "symbol": "P_{in}",
          "description": "泵入口压力"
        },
        {
          "symbol": "P_{out}",
          "description": "泵出口压力"
        },
        {
          "symbol": "VALVE_{pos}",
          "description": "相关阀门开度"
        },
        {
          "symbol": "VFD_{alm}",
          "description": "变频器报警"
        },
        {
          "symbol": "PUMP_{alm}",
          "description": "水泵报警"
        }
      ]
    },
    {
      "equipmentType": "fcu",
      "fileName": "FCU_FDD_Library.docx",
      "sha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8",
      "variables": [
        {
          "symbol": "FCU_{cmd}",
          "description": "FCU启停命令"
        },
        {
          "symbol": "FCU_{sts}",
          "description": "FCU运行状态"
        },
        {
          "symbol": "FAN_{cmd}",
          "description": "风机命令"
        },
        {
          "symbol": "FAN_{sts}",
          "description": "风机状态"
        },
        {
          "symbol": "FAN_{speed}",
          "description": "风机档位/风速"
        },
        {
          "symbol": "FAN_{power}",
          "description": "风机功率"
        },
        {
          "symbol": "T_{zone}",
          "description": "房间温度"
        },
        {
          "symbol": "T_{zone,sp}",
          "description": "房间温度设定值"
        },
        {
          "symbol": "T_{sa}",
          "description": "FCU出风温度"
        },
        {
          "symbol": "T_{ra}",
          "description": "FCU回风温度/房间回风温度"
        },
        {
          "symbol": "CWV",
          "description": "冷水阀开度"
        },
        {
          "symbol": "HWV",
          "description": "热水阀开度"
        },
        {
          "symbol": "CHWST",
          "description": "冷冻水供水温度"
        },
        {
          "symbol": "HWST",
          "description": "热水供水温度"
        },
        {
          "symbol": "OCC",
          "description": "占用状态"
        },
        {
          "symbol": "COND_{h}",
          "description": "冷凝水盘水位"
        },
        {
          "symbol": "FILTER_{dp}",
          "description": "过滤网压差"
        }
      ]
    },
    {
      "equipmentType": "cooling_tower",
      "fileName": "Cooling_Tower_FDD_Library.docx",
      "sha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619",
      "variables": [
        {
          "symbol": "CT_{cmd}",
          "description": "冷却塔启停命令"
        },
        {
          "symbol": "CT_{sts}",
          "description": "冷却塔运行状态"
        },
        {
          "symbol": "CT_{fan_cmd}",
          "description": "冷却塔风机命令"
        },
        {
          "symbol": "CT_{fan_sts}",
          "description": "冷却塔风机状态"
        },
        {
          "symbol": "CT_{fan_speed}",
          "description": "冷却塔风机频率/转速"
        },
        {
          "symbol": "CT_{fan_power}",
          "description": "冷却塔风机功率"
        },
        {
          "symbol": "CT_{tin}",
          "description": "进入冷却塔的冷却水温度"
        },
        {
          "symbol": "CT_{tout}",
          "description": "离开冷却塔的冷却水温度"
        },
        {
          "symbol": "CW_{flow}",
          "description": "冷却水流量"
        },
        {
          "symbol": "T_{oat}",
          "description": "室外干球温度"
        },
        {
          "symbol": "T_{oawb}",
          "description": "室外湿球温度"
        },
        {
          "symbol": "CT_{basin_t}",
          "description": "冷却塔水盘温度"
        },
        {
          "symbol": "CT_{basin_h}",
          "description": "冷却塔水盘水位"
        },
        {
          "symbol": "CT_{valve}",
          "description": "冷却塔旁通阀开度"
        },
        {
          "symbol": "CT_APPROACH",
          "description": "冷却塔逼近温差，CW_OUT_CT - OAWB"
        },
        {
          "symbol": "CT_{∆t}",
          "description": "冷却塔温降，CT_{tin}-CT_{tout}"
        }
      ]
    },
    {
      "equipmentType": "ahu",
      "fileName": "AHU_FDD_Library.docx",
      "sha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c",
      "variables": [
        {
          "symbol": "AHU_{cmd}",
          "description": "AHU启停命令"
        },
        {
          "symbol": "AHU_{sts}",
          "description": "AHU运行状态"
        },
        {
          "symbol": "FAN_{cmd}",
          "description": "送风机命令"
        },
        {
          "symbol": "FAN_{sts}",
          "description": "送风机状态"
        },
        {
          "symbol": "FAN_{speed}",
          "description": "送风机频率"
        },
        {
          "symbol": "FAN_{power}",
          "description": "送风机功率"
        },
        {
          "symbol": "T_{sa}",
          "description": "送风温度"
        },
        {
          "symbol": "T_{sa_sp}",
          "description": "送风温度设定值"
        },
        {
          "symbol": "T_{ma}",
          "description": "混风温度"
        },
        {
          "symbol": "T_{ra}",
          "description": "回风温度"
        },
        {
          "symbol": "T_{oa}",
          "description": "新风温度"
        },
        {
          "symbol": "∅_{sa}",
          "description": "送风湿度"
        },
        {
          "symbol": "∅_{ra}",
          "description": "回风湿度"
        },
        {
          "symbol": "∅_{oa}",
          "description": "新风湿度"
        },
        {
          "symbol": "SP",
          "description": "风管静压"
        },
        {
          "symbol": "SP_{sp}",
          "description": "风管静压设定值"
        },
        {
          "symbol": "CCV",
          "description": "冷却盘管阀门开度"
        },
        {
          "symbol": "HCV",
          "description": "加热盘管阀门开度"
        },
        {
          "symbol": "OAD",
          "description": "新风阀开度"
        },
        {
          "symbol": "RAD",
          "description": "回风阀开度"
        },
        {
          "symbol": "EAD",
          "description": "排风阀开度"
        },
        {
          "symbol": "FILTER_{dp}",
          "description": "过滤器压差"
        },
        {
          "symbol": "CHWST",
          "description": "冷冻水供水温度"
        },
        {
          "symbol": "CHWRT",
          "description": "冷冻水回水温度"
        },
        {
          "symbol": "HWST",
          "description": "热水供水温度"
        },
        {
          "symbol": "HWRT",
          "description": "热水回水温度"
        },
        {
          "symbol": "CO_{2}",
          "description": "回风或区域 CO₂ 浓度"
        }
      ]
    }
  ],
  "rules": [
    {
      "id": "VAV-01",
      "equipmentType": "vav",
      "category": "区域温度控制",
      "name": "区域温度过高",
      "requiredPointsRaw": "MODE, T_{zone}, T_{zone_sp}",
      "diagnosticRule": "If MODE=Cooling, and T_{zone}-T_{zone_{sp}}>∆T_{zone} for N samples, then high zone temperature.",
      "tunableParametersRaw": "∆T_{zone} (2°C), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{zone}: brick:Zone_Air_Temperature_SensorT_{zone_sp}: brick:Zone_Air_Temperature_Setpoint",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-02",
      "equipmentType": "vav",
      "category": "区域温度控制",
      "name": "区域温度过低",
      "requiredPointsRaw": "MODE, T_{zone}, T_{zone_sp}",
      "diagnosticRule": "If MODE=Heating, and T_{zone_sp}-T_{zone}>∆T_{zone} for N samples, then low zone temperature.",
      "tunableParametersRaw": "∆T_{zone} (2°C), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{zone}: brick:Zone_Air_Temperature_SensorT_{zone_sp}: brick:Zone_Air_Temperature_Setpoint",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-03",
      "equipmentType": "vav",
      "category": "区域温度控制",
      "name": "制冷能力不足",
      "requiredPointsRaw": "MODE, T_{zone}, T_{zone_sp}, DAM_{cmd} or DAM_{fb}, AFLOW, AFLOW_{sp}",
      "diagnosticRule": "If MODE=Cooling, DAM_{cmd} or DAM_{fb}>DAM_{high}, AFLOW<R×AFLOW_{sp}, and T_{zone}-T_{zone_sp}>∆T_{zone} for N samples, then insufficient VAV cooling performance.",
      "tunableParametersRaw": "DAM_{high} (95%), R (0.7), ∆T_{zone} (2°C), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{zone}: brick:Zone_Air_Temperature_SensorT_{zone_sp}: brick:Zone_Air_Temperature_Setpoint DAM_{cmd}: brick:Damper_Position_CommandDAM_{fb}: brick:Damper_Position_SensorAFLOW: brick:Supply_Air_Flow_SensorAFLOW_{sp}: brick:Supply_Air_Flow_Setpoint",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-04",
      "equipmentType": "vav",
      "category": "风量控制",
      "name": "实际风量低于设定值",
      "requiredPointsRaw": "AFLOW, AFLOW_{sp}",
      "diagnosticRule": "If AFLOW_{sp}-AFLOW>∆AFLOW_{thr_low} for N samples, then low discharge airflow.",
      "tunableParametersRaw": "∆AFLOW_{thr_low} (0.3*AFLOW_{sp}), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "AFLOW: brick:Supply_Air_Flow_SensorAFLOW_{sp}: brick:Supply_Air_Flow_Setpoint",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-05",
      "equipmentType": "vav",
      "category": "风量控制",
      "name": "实际风量高于设定值",
      "requiredPointsRaw": "AFLOW, AFLOW_{sp}",
      "diagnosticRule": "If AFLOW-AFLOW_{sp}>∆AFLOW_{thr_high} for N samples, then high discharge airflow.",
      "tunableParametersRaw": "∆AFLOW_{thr_high} (1.3*AFLOW_{sp}), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "AFLOW: brick:Supply_Air_Flow_SensorAFLOW_{sp}: brick:Supply_Air_Flow_Setpoint",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-06",
      "equipmentType": "vav",
      "category": "风阀",
      "name": "风阀命令与反馈不一致",
      "requiredPointsRaw": "DAM_{cmd}, DAM_{fb}",
      "diagnosticRule": "If |DAM_{cmd}-DAM_{fb}|>∆DAM_{thr} for N samples, then damper command and feedback mismatch.",
      "tunableParametersRaw": "∆DAM_{thr} (5%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DAM_{cmd}: brick:Damper_Position_CommandDAM_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-07",
      "equipmentType": "vav",
      "category": "风阀",
      "name": "风阀未按命令开启",
      "requiredPointsRaw": "DAM_{cmd}, DAM_{fb}",
      "diagnosticRule": "If DAM_{cmd}>DAM_{cmd_high} but DAM_{fb}<DAM_{fb_low} for N samples, then the damper fails to open.",
      "tunableParametersRaw": "DAM_{cmd_high} (95%), DAM_{fb_low} (5%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DAM_{cmd}: brick:Damper_Position_CommandDAM_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-08",
      "equipmentType": "vav",
      "category": "风阀",
      "name": "风阀未按命令关闭",
      "requiredPointsRaw": "DAM_{cmd}, DAM_{fb}",
      "diagnosticRule": "If DAM_{cmd}<DAM_{cmd_low} but DAM_{fb}>DAM_{fb_high} for N samples, then the damper fails to close.",
      "tunableParametersRaw": "DAM_{cmd_low} (5%), DAM_{fb_high} (95%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DAM_{cmd}: brick:Damper_Position_CommandDAM_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-09",
      "equipmentType": "vav",
      "category": "风阀",
      "name": "风阀关闭时仍有明显风量",
      "requiredPointsRaw": "DAM_{cmd}, DAM_{fb}, AFLOW",
      "diagnosticRule": "If DAM_{cmd}<DAM_{cmd_low}, DAM_{fb}<DAM_{fb_low}, and AFLOW>R_{leak}×AFLOW_{max} for N samples, then unexpected airflow with the damper closed.",
      "tunableParametersRaw": "DAM_{cmd_low} (5%), DAM_{fb_low} (5%), R_{leak} (0.1), AFLOW_{max}, N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DAM_{cmd}: brick:Damper_Position_CommandDAM_{fb}: brick:Damper_Position_SensorAFLOW: brick:Supply_Air_Flow_SensorAFLOW_{sp}: brick:Supply_Air_Flow_Setpoint",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-10",
      "equipmentType": "vav",
      "category": "风量设定值",
      "name": "风量设定值不合理",
      "requiredPointsRaw": "AFLOW_{sp}",
      "diagnosticRule": "If AFLOW_{sp}<AFLOW_{min} or AFLOW_{sp}>AFLOW_{max} for N samples, then airflow setpoint limit violation.",
      "tunableParametersRaw": "AFLOW_{min}, AFLOW_{max}, N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "AFLOW_{sp}: brick:Supply_Air_Flow_SetpointAFLOW_{min}: brick:Min_Air_Flow_Setpoint_LimitAFLOW_{max}: brick:Max_Air_Flow_Setpoint_Limit",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-11",
      "equipmentType": "vav",
      "category": "再热",
      "name": "再热阀未按命令开启",
      "requiredPointsRaw": "RHV_{cmd}, RHV_{fb}",
      "diagnosticRule": "If RHV_{cmd}>RHV_{cmd_high} but RHV_{fb}<RHV_{fb_low} for N samples, then the reheat valve fails to open.",
      "tunableParametersRaw": "RHV_{cmd_high} (95%), RHV_{fb_low} (5%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "RHV_{cmd}: brick:Valve_Position_CommandRHV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-12",
      "equipmentType": "vav",
      "category": "再热",
      "name": "再热阀未按命令关闭",
      "requiredPointsRaw": "RHV_{cmd}, RHV_{fb}",
      "diagnosticRule": "If RHV_{cmd}<RHV_{cmd_low} but RHV_{fb}>RHV_{fb_high} for N samples, then the reheat valve fails to close.",
      "tunableParametersRaw": "RHV_{cmd_low} (5%), RHV_{fb_high} (95%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "RHV_{cmd}: brick:Valve_Position_CommandRHV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-13",
      "equipmentType": "vav",
      "category": "再热",
      "name": "再热阀关闭时仍有明显加热",
      "requiredPointsRaw": "RHV_{cmd}, RHV_{fb}, T_{da}, T_{sa}",
      "diagnosticRule": "If RHV_{cmd}<RHV_{cmd_low}, RHV_{fb}<RHV_{fb_low}, and T_{da}-T_{sa}>∆T_{heat_min} for N samples, then unexpected heating with the reheat valve closed.",
      "tunableParametersRaw": "RHV_{cmd_low} (5%), RHV_{fb_low} (5%), ∆T_{heat_min} (3℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "RHV_{cmd}: brick:Valve_Position_CommandRHV_{fb}: brick:Valve_Position_Sensor T_{da}: brick:Discharge_Air_Temperature_SensorT_{sa}: brick:Supply_Air_Temperature_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-14",
      "equipmentType": "vav",
      "category": "再热",
      "name": "再热能力不足",
      "requiredPointsRaw": "MODE, T_{zone}, T_{zone_sp}, T_{da}, T_{sa}, RHV_{cmd} or RHV_{fb}",
      "diagnosticRule": "If MODE=Heating, RHV_{cmd} or RHV_{fb}>RHV_{high}, T_{zone_sp}-T_{zone}>∆T_{zone}, T_{da}-T_{sa}>∆T_{heat_min} for N samples, then insufficient reheat performance.",
      "tunableParametersRaw": "RHV_{high} (95%), ∆T_{zone} (2℃), ∆T_{heat_min} (3℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{zone}: brick:Zone_Air_Temperature_SensorT_{zone_sp}: brick:Zone_Air_Temperature_SetpointT_{da}: brick:Discharge_Air_Temperature_SensorT_{sa}: brick:Supply_Air_Temperature_SensorRHV_{cmd}: brick:Valve_Position_CommandRHV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-15",
      "equipmentType": "vav",
      "category": "传感器",
      "name": "风量传感器故障",
      "requiredPointsRaw": "AFLOW",
      "diagnosticRule": "If AFLOW is physically unreasonable (AFLOW<AFLOW_{min} or AFLOW>AFLOW_{max}), or stuck (|(AFLOW_{i}-AFLOW_{i-1})/(t_{i}-t_{i-1})|<S_{AFLOW}) for N samples, then AFLOW sensor fault",
      "tunableParametersRaw": "AFLOW_{min}, AFLOW_{max}, S_{AFLOW} (1m3/min), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "AFLOW: brick:Supply_Air_Flow_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-16",
      "equipmentType": "vav",
      "category": "传感器",
      "name": "区域温度传感器故障",
      "requiredPointsRaw": "T_{zone}",
      "diagnosticRule": "If T_{zone} is physically unreasonable (T_{zone}<T_{zone_min} or T_{zone}>T_{zone_max}), or stuck (|(T_{zone_i}-T_{zone_i-1})/(t_{i}-t_{i-1})|<S_{T_zone}) for N samples, then T_{zone} sensor fault",
      "tunableParametersRaw": "T_{zone_min}, T_{zone_max}, S_{T_zone} (0.01℃/min), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{zone}: brick:Zone_Air_Temperature_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "VAV-17",
      "equipmentType": "vav",
      "category": "传感器",
      "name": "VAV出风温度传感器故障",
      "requiredPointsRaw": "T_{da}",
      "diagnosticRule": "If T_{da} is physically unreasonable (T_{da}<T_{da_min} or T_{da}>T_{da_max}), or stuck (|(T_{da_i}-T_{da_i-1})/(t_{i}-t_{i-1})|<S_{T_da}) for N samples, then T_{da} sensor fault",
      "tunableParametersRaw": "T_{da_min}, T_{da_max}, S_{T_da} (0.01℃/min), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{da}: brick:Discharge_Air_Temperature_Sensor",
      "sourceSha256": "9577d893a39e221f7f28f4a887e438d6cd30b890d2d719244b6883c10bedff45"
    },
    {
      "id": "PMP-01",
      "equipmentType": "pump",
      "category": "运行状态",
      "name": "水泵有命令但未运行",
      "requiredPointsRaw": "PUMP_{cmd}, PUMP_{sts}, PUMP_{power}",
      "diagnosticRule": "If PUMP_{cmd}=ON but PUMP_{sts}=OFF and PUMP_{power}<0.1kW for N samples, then fault.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "PUMP_{cmd}: brick:Start_Stop_CommandPUMP_{sts}: brick:Pump_On_Off_StatusPUMP_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-02",
      "equipmentType": "pump",
      "category": "运行状态",
      "name": "水泵无命令但仍运行",
      "requiredPointsRaw": "PUMP_{cmd}, PUMP_{sts}, PUMP_{power}",
      "diagnosticRule": "If PUMP_{cmd}=OFF but PUMP_{sts}=ON and PUMP_{power}>0.1kW for N samples, then unexpected operation.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "PUMP_{cmd}: brick:Start_Stop_CommandPUMP_{sts}: brick:Pump_On_Off_StatusPUMP_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-03",
      "equipmentType": "pump",
      "category": "水力性能",
      "name": "水泵运行但无流量",
      "requiredPointsRaw": "PUMP_{power}, FLOW",
      "diagnosticRule": "If PUMP_{power}>0.1kW but FLOW=0 for N samples, then no flow fault.",
      "tunableParametersRaw": "N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "PUMP_{power}: brick:Active_Power_SensorFLOW: brick:Water_Flow_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-04",
      "equipmentType": "pump",
      "category": "水力性能",
      "name": "水泵压差不足",
      "requiredPointsRaw": "DP, DP_{sp}",
      "diagnosticRule": "If DP_{sp}-DP>∆P_{thr_low} for N samples, then insufficient differential pressure.",
      "tunableParametersRaw": "∆P_{thr_low}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP: brick:Differential_Pressure_SensorDP_{sp}: brick:Differential_Pressure_Setpoint",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-05",
      "equipmentType": "pump",
      "category": "水力性能",
      "name": "水泵压差过高",
      "requiredPointsRaw": "DP, DP_{sp}",
      "diagnosticRule": "If DP-DP_{sp}>∆P_{thr_high} for N samples, then excessive differential pressure.",
      "tunableParametersRaw": "∆P_{thr_high}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP: brick:Differential_Pressure_SensorDP_{sp}: brick:Differential_Pressure_Setpoint",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-06",
      "equipmentType": "pump",
      "category": "控制",
      "name": "水泵差压控制振荡",
      "requiredPointsRaw": "DP, DP_{sp}",
      "diagnosticRule": "If DP repeatedly crosses DP_{sp} with large σ_{DP} for N samples, then unstable pump control.",
      "tunableParametersRaw": "σ_{DP}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP: brick:Differential_Pressure_SensorDP_{sp}: brick:Differential_Pressure_Setpoint",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-07",
      "equipmentType": "pump",
      "category": "控制",
      "name": "水泵变频器异常",
      "requiredPointsRaw": "VFD_{alm}, PUMP_{speed_command}, PUMP_{speed_act}",
      "diagnosticRule": "If VFD_{alm}=ON or PUMP_{speed_command}≠PUMP_{speed_act} for N samples, then VFD fault.",
      "tunableParametersRaw": "N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "VFD_{alm}: brick:Failure_AlarmPUMP_{speed_command}: brick:Frequency_CommandPUMP_{speed_act}: brick:Frequency_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-08",
      "equipmentType": "pump",
      "category": "压力异常",
      "name": "水泵入口压力过低",
      "requiredPointsRaw": "P_{in}",
      "diagnosticRule": "If P_{in}<P_{in_min} for N samples, then low inlet pressure fault.",
      "tunableParametersRaw": "P_{in_min}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{in}: brick: Entering_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-09",
      "equipmentType": "pump",
      "category": "压力异常",
      "name": "水泵入口压力过高",
      "requiredPointsRaw": "P_{in}",
      "diagnosticRule": "If P_{in}>P_{in_max} for N samples, then high inlet pressure fault.",
      "tunableParametersRaw": "P_{in_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{in}: brick: Entering_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-10",
      "equipmentType": "pump",
      "category": "压力异常",
      "name": "水泵出口压力过低",
      "requiredPointsRaw": "P_{out}",
      "diagnosticRule": "If P_{out}<P_{out_min} for N samples, then low outlet pressure fault.",
      "tunableParametersRaw": "P_{out_min}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{out}: brick: Leaving_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-11",
      "equipmentType": "pump",
      "category": "压力异常",
      "name": "水泵出口压力过高",
      "requiredPointsRaw": "P_{out}",
      "diagnosticRule": "If P_{out}>P_{out_max} for N samples, then low outlet pressure fault.",
      "tunableParametersRaw": "P_{out_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{out}: brick: Leaving_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-12",
      "equipmentType": "pump",
      "category": "压力异常",
      "name": "泵进出口压力方向异常",
      "requiredPointsRaw": "P_{in}, P_{out}",
      "diagnosticRule": "If P_{out}<P_{in} for N samples for N samples, then pressure sensor fault, reverse flow, or pump fault.",
      "tunableParametersRaw": "N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{in}: brick: Entering_Water_Pressure_SensorP_{out}: brick: Leaving_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-13",
      "equipmentType": "pump",
      "category": "阀门",
      "name": "止回阀泄漏",
      "requiredPointsRaw": "PUMP_{sts}, FLOW",
      "diagnosticRule": "If PUMP_{sts}=OFF but FLOW>0.1m^{3}/h for N samples, then check valve leakage.",
      "tunableParametersRaw": "N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "PUMP_{sts}: brick:Pump_On_Off_StatusFLOW: brick:Water_Flow_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-14",
      "equipmentType": "pump",
      "category": "阀门",
      "name": "隔离阀未打开",
      "requiredPointsRaw": "PUMP_{sts}, FLOW, Valve_{isolation}",
      "diagnosticRule": "If PUMP_{sts}=ON but FLOW<0.1m^{3}/h and Valve_{isolation}=0for N samples, then isolation valve fault or wrong operation.",
      "tunableParametersRaw": "N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "PUMP_{sts}: brick:Pump_On_Off_StatusFLOW: brick:Water_Flow_Sensor Valve_{isolation}: brick:Valve_Position_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-15",
      "equipmentType": "pump",
      "category": "传感器",
      "name": "冷冻水泵进口压力传感器故障",
      "requiredPointsRaw": "P_{in}",
      "diagnosticRule": "If P_{in} is physically unreasonable (P_{in}<P_{in_min} or P_{in}>P_{in_max}), or stuck (|(P_{in, i}-P_{in,i-1})/(t_{i}-t_{i-1})|<S_{P_in}) for N samples, then inlet pressure sensor fault.",
      "tunableParametersRaw": "P_{in_min}, P_{in_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{in}: brick: Entering_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-16",
      "equipmentType": "pump",
      "category": "传感器",
      "name": "冷冻水泵出口压力传感器故障",
      "requiredPointsRaw": "P_{out}",
      "diagnosticRule": "If P_{out} is physically unreasonable (P_{out}<P_{out_min} or P_{out}>P_{out_max}), or stuck (|(P_{out, i}-P_{out,i-1})/(t_{i}-t_{i-1})|<S_{P_out}) for N samples, then outlet pressure sensor fault.",
      "tunableParametersRaw": "P_{out_min}, P_{out_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "P_{out}: brick: Leaving_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-17",
      "equipmentType": "pump",
      "category": "",
      "name": "水泵转速传感器故障",
      "requiredPointsRaw": "PUMP_{speed}",
      "diagnosticRule": "If PUMP_{speed} is physically unreasonable (PUMP_{speed}<PUMP_{speed_min} or PUMP_{speed}>PUMP_{speed_max}) for N samples, then fan speed sensor fault.",
      "tunableParametersRaw": "PUMP_{speed_min}, PUMP_{speed_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "PUMP_{speed_command}: brick:Frequency_Command",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "PMP-18",
      "equipmentType": "pump",
      "category": "传感器",
      "name": "压差传感器异常",
      "requiredPointsRaw": "DP, P_{in}, P_{out}",
      "diagnosticRule": "If (P_{out}-P_{in})/(DP)<σ_{dp} or DP remains constant for N samples, then DP sensor fault.",
      "tunableParametersRaw": "σ_{dp}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP: brick:Differential_Pressure_SensorP_{in}: brick: Entering_Water_Pressure_SensorP_{out}: brick: Leaving_Water_Pressure_Sensor",
      "sourceSha256": "25f225a288ab584dfe30742ff4ad01d41bf5faec9a530fad428785b32eb015e0"
    },
    {
      "id": "FCU-01",
      "equipmentType": "fcu",
      "category": "运行状态",
      "name": "FCU有命令但未运行",
      "requiredPointsRaw": "FCU_{cmd}, FCU_{sts}, Fan_{power}",
      "diagnosticRule": "If FCU_{cmd}=ON and FCU_{sts}=OFF or Fan_{power}<0.1kW for N samples, then FCU start failure.",
      "tunableParametersRaw": "N (5min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "FCU_{cmd}: brick:Start_Stop_Command FCU_{sts}: brick:Run_Status Fan_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-02",
      "equipmentType": "fcu",
      "category": "运行状态",
      "name": "FCU无命令但仍运行",
      "requiredPointsRaw": "FCU_{cmd}, FCU_{sts}, Fan_{power}",
      "diagnosticRule": "If FCU_{cmd}=OFF and either FCU_{sts}=ON or Fan_{power}>0.1kW for N samples, then unexpected FCU operation.",
      "tunableParametersRaw": "N (5min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "FCU_{cmd}: brick:Start_Stop_Command FCU_{sts}: brick:Run_Status Fan_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-03",
      "equipmentType": "fcu",
      "category": "风机",
      "name": "风机速度命令与反馈不一致",
      "requiredPointsRaw": "Fan_{speed_cmd}, Fan_{speed_fb}",
      "diagnosticRule": "If |Fan_{speed_{cmd}}-Fan_{speed_{fb}}|>∆Fan_{speed} for N samples, then fan speed command and feedback mismatch.",
      "tunableParametersRaw": "N (5min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{speed_cmd}: brick:Fan_Speed_Command Fan_{speed_fb}: brick:Speed_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-04",
      "equipmentType": "fcu",
      "category": "温度控制",
      "name": "房间温度过高",
      "requiredPointsRaw": "T_{zone}, T_{zone_sp}",
      "diagnosticRule": "If T_{zone}-T_{zone_{sp}}>∆T_{zone} for N samples, then high zone temperature.",
      "tunableParametersRaw": "∆T_{zone} (2℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{zone}: brick:Zone_Air_Temperature_Sensor T_{zone_sp}: brick:Zone_Air_Temperature_Setpoint",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-05",
      "equipmentType": "fcu",
      "category": "温度控制",
      "name": "房间温度过低",
      "requiredPointsRaw": "T_{zone}, T_{zone_sp}",
      "diagnosticRule": "If T_{zone_sp}-T_{zone}>∆T_{zone} for N samples, then low zone temperature.",
      "tunableParametersRaw": "∆T_{zone} (2℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{zone}: brick:Zone_Air_Temperature_Sensor T_{zone_sp}: brick:Zone_Air_Temperature_Setpoint",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-06",
      "equipmentType": "fcu",
      "category": "温度控制",
      "name": "最大输出时温度需求仍未满足",
      "requiredPointsRaw": "MODE, T_{zone}, T_{zone_sp}, Fan_{speed_cmd} or Fan_{speed_fb}, CCV_{cmd} or CCV_{fb}",
      "diagnosticRule": "If MODE=Cooling, CCV_{cmd} or CCV_{fb}>CCV_{high}, Fan_{speed_cmd} or Fan_{speed_fb}>R_{high}×Fan_{speed_max}, and T_{zone}-T_{zone_{sp}}>∆T_{zone} for N samples, then unmet temperature demand at maximum FCU output.",
      "tunableParametersRaw": "CCV_{high} (95%), R_{high} (0.95), ∆T_{zone} (2℃), N (10min), Fan_{speed_max}",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_Status T_{zone}: brick:Zone_Air_Temperature_Sensor T_{zone_sp}: brick:Zone_Air_Temperature_Setpoint Fan_{speed_cmd}: brick:Fan_Speed_Command Fan_{speed_fb}: brick:Speed_Sensor CCV_{cmd}: brick:Valve_Position_Command CCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-07",
      "equipmentType": "fcu",
      "category": "温度控制",
      "name": "最大输出时温度需求仍未满足",
      "requiredPointsRaw": "MODE, T_{zone}, T_{zone_sp}, Fan_{speed_cmd} or Fan_{speed_fb}, HCV_{cmd} or HCV_{fb}",
      "diagnosticRule": "If MODE=Heating, HCV_{cmd} or HCV_{fb}>HCV_{high}, Fan_{speed_cmd} or Fan_{speed_fb}>R_{high}×Fan_{speed_max}, and T_{zone_sp}-T_{zone}>∆T_{zone} for N samples, then unmet temperature demand at maximum FCU output.",
      "tunableParametersRaw": "HCV_{high} (95%), R_{high} (0.95), ∆T_{zone} (2℃), N (10min), Fan_{speed_max}",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_Status T_{zone}: brick:Zone_Air_Temperature_Sensor T_{zone_sp}: brick:Zone_Air_Temperature_Setpoint Fan_{speed_cmd}: brick:Speed_Setpoint Fan_{speed_fb}: brick:Speed_SensorHCV_{cmd}: brick:Valve_Position_Command HCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-08",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "冷水阀高开度时出风降温不足",
      "requiredPointsRaw": "MODE, T_{ra}, T_{da}, CCV_{cmd} or CCV_{fb}",
      "diagnosticRule": "If MODE=Cooling, CCV_{cmd} or CCV_{fb}>CCV_{high}, and T_{ra}-T_{da}<∆T_{cool_min} for N samples, then insufficient FCU cooling performance.",
      "tunableParametersRaw": "CCV_{high} (95%), ∆T_{cool_min} (2.5℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_Status T_{ra}: brick:Return_Air_Temperature_Sensor T_{da}: brick:Discharge_Air_Temperature_Sensor CCV_{cmd}: brick:Valve_Position_Command CCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-09",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "冷水阀关闭时仍有明显冷却",
      "requiredPointsRaw": "T_{ra}, T_{da}, CCV_{cmd}, CCV_{fb}",
      "diagnosticRule": "If CCV_{cmd}<CCV_{cmd_low}, CCV_{fb}<CCV_{fb_low}, and T_{ra}-T_{da}>∆T_{cool_leak} for N samples, then unexpected cooling with the cooling valve closed.",
      "tunableParametersRaw": "CCV_{cmd_low} (5%), CCV_{fb_low} (5%), ∆T_{cool_leak} (2.5℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ra}: brick:Return_Air_Temperature_Sensor T_{da}: brick:Discharge_Air_Temperature_Sensor CCV_{cmd}: brick:Valve_Position_Command CCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-10",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "热水阀高开度时出风升温不足",
      "requiredPointsRaw": "MODE, T_{ra}, T_{da}, HCV_{cmd} or HCV_{fb}",
      "diagnosticRule": "If MODE=Heating, HCV_{cmd} or HCV_{fb}>HCV_{high}, T_{da}-T_{ra}<∆T_{heat_min} for N samples, then insufficient FCU heating performance.",
      "tunableParametersRaw": "HCV_{high} (95%), ∆T_{heat_min} (3℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_Status T_{ra}: brick:Return_Air_Temperature_Sensor T_{da}: brick:Discharge_Air_Temperature_Sensor HCV_{cmd}: brick:Valve_Position_Command HCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-11",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "热水阀关闭时仍有明显加热",
      "requiredPointsRaw": "T_{ra}, T_{da}, HCV_{cmd}, HCV_{fb}",
      "diagnosticRule": "If HCV_{cmd}<HCV_{cmd_low}, HCV_{fb}<HCV_{fb_low}, and T_{da}-T_{ra}>∆T_{heat_leak} for N samples, then unexpected heating with the heating valve closed.",
      "tunableParametersRaw": "HCV_{cmd_low} (5%), HCV_{fb_low} (5%), ∆T_{heat_leak} (3℃), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ra}: brick:Return_Air_Temperature_Sensor T_{da}: brick:Discharge_Air_Temperature_Sensor HCV_{cmd}: brick:Valve_Position_Command HCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-12",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "冷热水阀同时开启",
      "requiredPointsRaw": "CCV_{cmd} or CCV_{fb}HCV_{cmd} or HCV_{fb}",
      "diagnosticRule": "If CCV_{cmd} or CCV_{fb}>CCV_{high} and HCV_{cmd} or HCV_{fb}>HCV_{high} for N samples, then simultaneous heating and cooling.",
      "tunableParametersRaw": "CCV_{high} (95%), HCV_{high} (95%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CCV_{cmd}/HCV_{cmd}: brick:Valve_Position_Command CCV_{fb}/HCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-13",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "冷水阀未按命令开启",
      "requiredPointsRaw": "CCV_{cmd}, CCV_{fb}",
      "diagnosticRule": "If CCV_{cmd}>CCV_{cmd_high} but CCV_{fb}<CCV_{fb_low} for N samples, then the cooling valve fails to open as commanded.",
      "tunableParametersRaw": "CCV_{cmd_high} (95%), CCV_{fb_low} (5%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CCV_{cmd}: brick:Valve_Position_Command CCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-14",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "冷水阀未按命令关闭",
      "requiredPointsRaw": "CCV_{cmd}, CCV_{fb}",
      "diagnosticRule": "If CCV_{cmd}<CCV_{cmd_low} but CCV_{fb}>CCV_{fb_high} for N samples, then the cooling valve fails to close as commanded.",
      "tunableParametersRaw": "CCV_{cmd_low} (5%), CCV_{fb_high} (95%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CCV_{cmd}: brick:Valve_Position_Command CCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-15",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "热水阀未按命令开启",
      "requiredPointsRaw": "HCV_{cmd}, HCV_{fb}",
      "diagnosticRule": "If HCV_{cmd}>HCV_{cmd_high} but HCV_{fb}<HCV_{fb_low} for N samples, then the heating valve fails to open as commanded.",
      "tunableParametersRaw": "HCV_{cmd_high} (95%), HCV_{fb_low} (5%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "HCV_{cmd}: brick:Valve_Position_Command HCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-16",
      "equipmentType": "fcu",
      "category": "冷却/加热阀",
      "name": "热水阀未按命令关闭",
      "requiredPointsRaw": "HCV_{cmd}, HCV_{fb}",
      "diagnosticRule": "If HCV_{cmd}<HCV_{cmd_low} but HCV_{fb}>HCV_{fb_high} for N samples, then the heating valve fails to close as commanded.",
      "tunableParametersRaw": "HCV_{cmd_low} (5%), HCV_{fb_high} (95%), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "HCV_{cmd}: brick:Valve_Position_Command HCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-17",
      "equipmentType": "fcu",
      "category": "过滤器",
      "name": "过滤网堵塞",
      "requiredPointsRaw": "DP_{filter}",
      "diagnosticRule": "If DP_{filter}>DP_{filter_high} for N samples, then filter clogging.",
      "tunableParametersRaw": "DP_{filter_high}, N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP_{filter}: brick:Filter_Differential_Pressure_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-18",
      "equipmentType": "fcu",
      "category": "传感器",
      "name": "出风温度传感器故障",
      "requiredPointsRaw": "T_{da}",
      "diagnosticRule": "If T_{da} is physically unreasonable (T_{da}<T_{da_min} or T_{da}>T_{da_max}), or stuck (|(T_{da_i}-T_{da_i-1})/(t_{i}-t_{i-1})|<S_{T_da}) for N samples, then T_{da} sensor fault",
      "tunableParametersRaw": "T_{da_min}, T_{da_max}, S_{T_da} (0.01℃/min), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{da}: brick:Discharge_Air_Temperature_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-19",
      "equipmentType": "fcu",
      "category": "传感器",
      "name": "回风温度传感器故障",
      "requiredPointsRaw": "T_{ra}",
      "diagnosticRule": "If T_{ra} is physically unreasonable (T_{ra}<T_{ra_min} or T_{ra}>T_{ra_max}), or stuck (|(T_{ra_i}-T_{ra_i-1})/(t_{i}-t_{i-1})|<S_{T_ra}) for N samples, then T_{ra} sensor fault",
      "tunableParametersRaw": "N (10 min), T_{ra_min}, T_{ra_max}, S_{T_ra} (0.01℃/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ra}: brick:Return_Air_Temperature_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "FCU-20",
      "equipmentType": "fcu",
      "category": "传感器",
      "name": "房间温度传感器故障",
      "requiredPointsRaw": "T_{zone}",
      "diagnosticRule": "If T_{zone} is physically unreasonable (T_{zone}<T_{zone_min} or T_{zone}>T_{zone_max}), or stuck (|(T_{zone_i}-T_{zone_i-1})/(t_{i}-t_{i-1})|<S_{T_zone}) for N samples, then T_{zone} sensor fault",
      "tunableParametersRaw": "T_{zone_min}, T_{zone_max}, S_{T_zone} (0.01℃/min), N (10min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{zone}: brick:Zone_Air_Temperature_Sensor",
      "sourceSha256": "a390869597d82a840695cbae7f0abe8316a1eb615922bb54718c4d2f2e656dd8"
    },
    {
      "id": "CT-01",
      "equipmentType": "cooling_tower",
      "category": "运行状态",
      "name": "冷却塔有命令但未运行",
      "requiredPointsRaw": "CT_{cmd}, CT_{sts}, CT_{fan_power}",
      "diagnosticRule": "If CT_{cmd}=ON but CT_{sts}=OFF and CT_{fan_power}<0.1kW for N samples, then fault.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "CT_{cmd}: brick:Start_Stop_Command CT_{sts}: brick:Fan_On_Off_StatusCT_{fan_power}: Electric_Power_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-02",
      "equipmentType": "cooling_tower",
      "category": "运行状态",
      "name": "冷却塔无命令但仍运行",
      "requiredPointsRaw": "CT_{cmd}, CT_{sts}, CT_{fan_power}",
      "diagnosticRule": "If CT_{cmd}=OFF but CT_{sts}=ON or CT_{fan_power}>0.1kW for N samples, then fault.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "CT_{cmd}: brick:Start_Stop_Command CT_{sts}: brick:Fan_On_Off_StatusCT_{fan_power}: Electric_Power_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-03",
      "equipmentType": "cooling_tower",
      "category": "风机",
      "name": "冷却塔风机频率异常偏低",
      "requiredPointsRaw": "CT_{fan_speed}, CT_{tout}, CT_{tout_sp}",
      "diagnosticRule": "If CT_{tout}>CT_{tout_sp} but CT_{fan_speed}<CT_{fan_speed_min} for N samples, then fan speed too low or control issue.",
      "tunableParametersRaw": "CT_{tout_sp}, CT_{fan_speed_min}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{fan_speed}: Motor_Speed_SensorCT_{tout}: Entering_Condenser_Water_Temperature_SensorCT_{tout_sp}: Entering_Condenser_Water_Temperature_Setpoint",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-04",
      "equipmentType": "cooling_tower",
      "category": "风机",
      "name": "冷却塔风机频率异常偏高",
      "requiredPointsRaw": "CT_{fan_speed}, CT_{tout}, CT_{tout_sp}",
      "diagnosticRule": "If CT_{tout}<CT_{tout_sp} but CT_{fan_speed}>CT_{fan_speed_max} for N samples, then fan over-operation.",
      "tunableParametersRaw": "CT_{tout_sp}, CT_{fan_speed_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{fan_speed}: Motor_Speed_SensorCT_{tout}: Entering_Condenser_Water_Temperature_SensorCT_{tout_sp}: Entering_Condenser_Water_Temperature_Setpoint",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-05",
      "equipmentType": "cooling_tower",
      "category": "旁通与水位",
      "name": "冷却塔旁通阀异常开启",
      "requiredPointsRaw": "CT_{bypass_valve}, CT_{tout}, CT_{tout_sp}",
      "diagnosticRule": "If CT_{bypass_valve}=ON while CT_{tout}>CT_{tout_sp} for N samples, then bypass valve control fault.",
      "tunableParametersRaw": "CT_{tout_sp}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{bypass_valve}: brick:Valve_Position_SensorCT_{tout}: Entering_Condenser_Water_Temperature_SensorCT_{tout_sp}: Entering_Condenser_Water_Temperature_Setpoint",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-06",
      "equipmentType": "cooling_tower",
      "category": "旁通与水位",
      "name": "冷却塔旁通阀卡滞关闭",
      "requiredPointsRaw": "CT_{bypass_valve}, CT_{tout}, CT_{tout_sp}",
      "diagnosticRule": "If CT_{tout}<CT_{tout_sp} but CT_{bypass_valve}=OFF for N samples, then bypass valve stuck closed.",
      "tunableParametersRaw": "CT_{tout_sp}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{bypass_valve}: brick: Bypass_Valve_Position_SensorCT_{tout}: Entering_Condenser_Water_Temperature_SensorCT_{tout_sp}: Entering_Condenser_Water_Temperature_Setpoint",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-07",
      "equipmentType": "cooling_tower",
      "category": "旁通与水位",
      "name": "水盘水位过低",
      "requiredPointsRaw": "CT_{basin_h}",
      "diagnosticRule": "If CT_{basin_h}<CT_{basin_h_low} for N samples, then low basin water height fault.",
      "tunableParametersRaw": "CT_{basin_h_low}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{basin_h}: Collection_Basin_Water_Level_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-08",
      "equipmentType": "cooling_tower",
      "category": "旁通与水位",
      "name": "水盘水位过高",
      "requiredPointsRaw": "CT_{basin_h}",
      "diagnosticRule": "If CT_{basin_h}>CT_{basin_h_high} for N samples, then high basin water height fault.",
      "tunableParametersRaw": "CT_{basin_h_high}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{basin_h}: Collection_Basin_Water_Level_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-09",
      "equipmentType": "cooling_tower",
      "category": "旁通与水位",
      "name": "补水阀异常",
      "requiredPointsRaw": "CT_{basin_h}, CT_{water_valve}",
      "diagnosticRule": "If CT_{basin_h}<CT_{basin_h_low} but CT_{water_valve}=OFF, or CT_{basin_h}>CT_{basin_h_high} but CT_{water_valve}=ON for N samples, then water valve fault.",
      "tunableParametersRaw": "CT_{basin_h_low}, CT_{basin_h_high}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{basin_h}: Collection_Basin_Water_Level_SensorCT_{water_valve}: Water_Valve_Position_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-10",
      "equipmentType": "cooling_tower",
      "category": "传感器",
      "name": "室外干球温度传感器故障",
      "requiredPointsRaw": "T_{oat}",
      "diagnosticRule": "If T_{oat} is physically unreasonable (T_{oat}<T_{oat_min} or T_{oat}>T_{oat_max}), or stuck (|(T_{oat, i}-T_{oat,i-1})/(t_{i}-t_{i-1})|<S_{T_oat}) for N samples, then outdoor air temperature sensor fault.",
      "tunableParametersRaw": "T_{oat_min}, T_{oat_max}, S_{T_oat}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{oat}: Outside_Air_Temperature_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-11",
      "equipmentType": "cooling_tower",
      "category": "传感器",
      "name": "室外湿球温度传感器故障",
      "requiredPointsRaw": "T_{oawb}",
      "diagnosticRule": "If T_{oawb} is physically unreasonable (T_{oawb}<T_{oawb_min} or T_{oawb}>T_{oawb_max}), or stuck (|(T_{oawb, i}-T_{oawb,i-1})/(t_{i}-t_{i-1})|<S_{T_oawb}) for N samples, then outdoor wet bulb temperature sensor fault.",
      "tunableParametersRaw": "T_{oawb_min}, T_{oawb_max}, S_{T_oawb}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{oawb}: Outside_Air_Wet_Bulb_Temperature_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "CT-12",
      "equipmentType": "cooling_tower",
      "category": "传感器",
      "name": "冷却塔风机转速传感器故障",
      "requiredPointsRaw": "CT_{fan_speed}",
      "diagnosticRule": "If CT_{fan_speed} is physically unreasonable (CT_{fan_speed}<CT_{fan_speed_min} or CT_{fan_speed}>CT_{fan_speed_max}) for N samples, then fan speed sensor fault.",
      "tunableParametersRaw": "CT_{fan_speed_min}, CT_{fan_speed_max}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CT_{fan_speed}: Motor_Speed_Sensor",
      "sourceSha256": "2b4a1b6f9cbcbcbea8c2ae77721f8212ebbec15f1e90b074a4f1e83e8bf5e619"
    },
    {
      "id": "AHU-01",
      "equipmentType": "ahu",
      "category": "运行状态",
      "name": "AHU启动失败",
      "requiredPointsRaw": "AHU_{cmd}, AHU_{sts}",
      "diagnosticRule": "If AHU_{cmd} changes from OFF to ON, but AHU_{sts} remains OFF for N samples, then AHU start failure.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "AHU_{cmd}: brick:Start_Stop_CommandAHU_{sts}: brick:Run_Status",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-02",
      "equipmentType": "ahu",
      "category": "运行状态",
      "name": "AHU运行中异常停机",
      "requiredPointsRaw": "AHU_{cmd}, AHU_{sts}",
      "diagnosticRule": "If AHU_{sts} changes from ON to OFF while AHU_{cmd} remains ON for N samples, then unexpected AHU stop.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "AHU_{cmd}: brick:Start_Stop_CommandAHU_{sts}: brick:Run_Status",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-03",
      "equipmentType": "ahu",
      "category": "运行状态",
      "name": "AHU无命令但仍运行",
      "requiredPointsRaw": "AHU_{cmd}, AHU_{sts}, Fan_{power}",
      "diagnosticRule": "If AHU_{cmd}=OFF but AHU_{sts}=ON or Fan_{power}>0.1kW for N samples, then unexpected AHU operation.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "AHU_{cmd}: brick:Start_Stop_CommandAHU_{sts}: brick:Run_StatusFan_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-04",
      "equipmentType": "ahu",
      "category": "风机",
      "name": "送风机有命令但未运行",
      "requiredPointsRaw": "Fan_{cmd}, Fan_{sts}, Fan_{power}",
      "diagnosticRule": "If Fan_{cmd}=ON but Fan_{sts}=OFF and Fan_{power}<0.1kW for N samples, then supply fan start failure.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{cmd}: brick:Start_Stop_CommandFan_{sts}: brick:Fan_On_Off_StatusFan_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-05",
      "equipmentType": "ahu",
      "category": "风机",
      "name": "送风机无命令但运行",
      "requiredPointsRaw": "Fan_{cmd}, Fan_{sts}, Fan_{power}",
      "diagnosticRule": "If Fan_{cmd}=OFF but Fan_{sts}=ON or Fan_{power}>0.1kW for N samples, then unexpected supply fan operation.",
      "tunableParametersRaw": "N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{cmd}: brick:Start_Stop_CommandFan_{sts}: brick:Fan_On_Off_StatusFan_{power}: brick:Electric_Power_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-06",
      "equipmentType": "ahu",
      "category": "风机",
      "name": "送风机实际频率偏高",
      "requiredPointsRaw": "Fan_{freq_cmd}, Fan_{freq_fb}",
      "diagnosticRule": "If Fan_{freq_fb}-Fan_{freq_{cmd}}>∆Fan_{freq} for N samples while the fan is enabled, then fan frequency feedback is too high.",
      "tunableParametersRaw": "∆Fan_{freq}(5%), N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{freq_cmd}: brick:Frequency_CommandFan_{freq_fb}: brick:Output_Frequency_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-07",
      "equipmentType": "ahu",
      "category": "风机",
      "name": "送风机实际频率偏低",
      "requiredPointsRaw": "Fan_{freq_cmd}, Fan_{freq_fb}",
      "diagnosticRule": "If Fan_{freq_cmd}-Fan_{freq_{fb}}>∆Fan_{freq} for N samples while the fan is enabled, then fan frequency feedback is too low.",
      "tunableParametersRaw": "∆Fan_{freq}(5%), N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{freq_cmd}: brick:Frequency_CommandFan_{freq_fb}: brick:Output_Frequency_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-08",
      "equipmentType": "ahu",
      "category": "风机",
      "name": "送风机功率偏高",
      "requiredPointsRaw": "Fan_{power}",
      "diagnosticRule": "If Fan_{power}>Fan_{power_max} for N samples, then high fan power.",
      "tunableParametersRaw": "Fan_{power_max}, N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{power}: brick:Active_Power_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-09",
      "equipmentType": "ahu",
      "category": "风机",
      "name": "送风机功率偏低",
      "requiredPointsRaw": "Fan_{power}",
      "diagnosticRule": "If Fan_{power}<Fan_{power_min} for N samples, then low fan power.",
      "tunableParametersRaw": "Fan_{power_min}, N (5 min)",
      "persistenceMinutes": 5,
      "brickClassesRaw": "Fan_{power}: brick:Active_Power_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-10",
      "equipmentType": "ahu",
      "category": "静压控制",
      "name": "送风静压不足",
      "requiredPointsRaw": "SP, SP_{sp}",
      "diagnosticRule": "If SP_{sp}-SP>∆SP for N samples, then low static pressure.",
      "tunableParametersRaw": "∆SP (25Pa), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "SP: brick:Supply_Air_Static_Pressure_SensorSP_{sp}: brick:Supply_Air_Static_Pressure_Setpoint",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-11",
      "equipmentType": "ahu",
      "category": "静压控制",
      "name": "送风静压过高",
      "requiredPointsRaw": "SP, SP_{sp}",
      "diagnosticRule": "If SP-SP_{sp}>∆SP for N samples, then high static pressure.",
      "tunableParametersRaw": "∆SP (25Pa), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "SP: brick:Supply_Air_Static_Pressure_SensorSP_{sp}: brick:Supply_Air_Static_Pressure_Setpoint",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-12",
      "equipmentType": "ahu",
      "category": "送风温度控制",
      "name": "送风温度过高",
      "requiredPointsRaw": "T_{sa}, T_{sa_sp}",
      "diagnosticRule": "If T_{sa}-T_{sa_{sp}}>∆T_{thr} for N samples, then high supply air temperature.",
      "tunableParametersRaw": "∆T_{thr}(1℃), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{sa}: brick:Supply_Air_Temperature_SensorT_{sa_sp}: brick:Supply_Air_Temperature_Setpoint",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-13",
      "equipmentType": "ahu",
      "category": "送风温度控制",
      "name": "送风温度过低",
      "requiredPointsRaw": "T_{sa}, T_{sa_sp}",
      "diagnosticRule": "If T_{sa_sp}-T_{sa}>∆T_{thr} for N samples, then low supply air temperature.",
      "tunableParametersRaw": "∆T_{thr} (1℃), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{sa}: brick:Supply_Air_Temperature_SensorT_{sa_sp}: brick:Supply_Air_Temperature_Setpoint",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-14",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "冷冻水供水温度过高",
      "requiredPointsRaw": "MODE, CHWST, CHWST_{sp}",
      "diagnosticRule": "If MODE=Cooling, and CHWST-CHWST_{sp}>∆T_{chwst,high} for N samples, then high chilled water supply temperature at the AHU coil.",
      "tunableParametersRaw": "∆T_{chwst,high} (3℃), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusCHWST: brick:Entering_Chilled_Water_Temperature_SensorCHWST_{sp}: brick:Entering_Chilled_Water_Temperature_Setpoint",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-15",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "热水供水温度过低",
      "requiredPointsRaw": "MODE, HWST, HWST_{sp}",
      "diagnosticRule": "If MODE=Heating, and HWST_{sp}-HWST>∆T_{hwst,low} for N samples, then low hot water supply temperature at the AHU coil.",
      "tunableParametersRaw": "∆T_{hwst,low }(5℃), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusHWST: brick:Entering_Hot_Water_Temperature_SensorHWST_{sp}: brick:Entering_Hot_Water_Temperature_Setpoint",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-16",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "冷却性能不足",
      "requiredPointsRaw": "MODE, T_{sa}, T_{sa_sp}, CCV_{cmd} or CCV_{fb}",
      "diagnosticRule": "If MODE=Cooling, CCV_{cmd} or CCV_{fb}>CCV_{high}, and T_{sa}-T_{sa_{sp}}>∆T_{cool_max} for N samples, then insufficient cooling performance.",
      "tunableParametersRaw": "∆T_{cool_max} (3℃), N (10 min), CCV_{high} (95%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{sa}: brick:Supply_Air_Temperature_SensorT_{sa_sp}: brick:Supply_Air_Temperature_SetpointCCV_{cmd}: brick:Valve_Position_CommandCCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-17",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "冷却阀关闭时仍有明显冷却",
      "requiredPointsRaw": "MODE, T_{ma}, T_{sa}, CCV_{cmd}, CCV_{fb}",
      "diagnosticRule": "If MODE=Cooling, CCV_{cmd} or CCV_{fb}<CCV_{low}, but T_{ma}-T_{sa}>∆T_{cool_min} for N samples, then unexpected cooling with the cooling valve closed.",
      "tunableParametersRaw": "∆T_{cool_min} (3℃), N (10 min), CCV_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{ma}: brick:Mixed_Air_Temperature_SensorT_{sa}: brick:Supply_Air_Temperature_SensorCCV_{cmd}: brick:Valve_Position_CommandCCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-18",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "加热性能不足",
      "requiredPointsRaw": "MODE, T_{sa}, T_{sa_sp}, HCV_{cmd} or HCV_{fb}",
      "diagnosticRule": "If MODE=Heating, HCV_{cmd} or HCV_{fb}>HCV_{high}, and T_{sa_sp}-T_{sa}>∆T_{heat_max} for N samples, then insufficient heating performance.",
      "tunableParametersRaw": "∆T_{heat_max}(8.3℃), N (10 min), HCV_{high} (95%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{sa}: brick:Supply_Air_Temperature_SensorT_{sa_sp}: brick:Supply_Air_Temperature_SetpointHCV_{cmd}: brick:Valve_Position_CommandHCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-19",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "加热阀关闭时仍有明显加热",
      "requiredPointsRaw": "MODE, T_{ma}, T_{sa}, HCV_{cmd}, HCV_{fb}",
      "diagnosticRule": "If MODE=Heating, HCV_{cmd} or HCV_{fb}<HCV_{low}, but T_{sa}-T_{ma}>∆T_{heat_min} for N samples, then unexpected heating with the heating valve closed.",
      "tunableParametersRaw": "∆T_{heat_min}(3℃),N (10 min), HCV_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "MODE: brick:Operating_Mode_StatusT_{ma}: brick:Mixed_Air_Temperature_SensorT_{sa}: brick:Supply_Air_Temperature_SensorHCV_{cmd}: brick:Valve_Position_CommandHCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-20",
      "equipmentType": "ahu",
      "category": "盘管/水侧",
      "name": "冷却阀与加热阀同时开启",
      "requiredPointsRaw": "CCV_{cmd} or CCV_{fb}, HCV_{cmd} or HCV_{fb}",
      "diagnosticRule": "If CCV_{cmd} or CCV_{fb}>CCV_{low} and HCV_{cmd} or HCV_{fb}>HCV_{low} for N samples, then simultaneous heating and cooling.",
      "tunableParametersRaw": "N (10 min), CCV_{low} (5%), HCV_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CCV_{cmd}: brick:Valve_Position_CommandCCV_{fb}: brick:Valve_Position_SensorHCV_{cmd}: brick:Valve_Position_CommandHCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-21",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "冷却阀卡滞关闭",
      "requiredPointsRaw": "CCV_{cmd}, CCV_{fb}",
      "diagnosticRule": "If CCV_{cmd}>CCV_{high} but CCV_{fb}<CCV_{low} for N samples, then cooling valve stuck closed.",
      "tunableParametersRaw": "N (10 min), CCV_{high} (95%), CCV_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CCV_{cmd}: brick:Valve_Position_CommandCCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-22",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "冷却阀卡滞开启",
      "requiredPointsRaw": "CCV_{cmd}, CCV_{fb}",
      "diagnosticRule": "If CCV_{cmd}<CCV_{low} but CCV_{fb}>CCV_{high} for N samples, then cooling valve stuck open.",
      "tunableParametersRaw": "N (10 min), CCV_{high} (95%), CCV_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "CCV_{cmd}: brick:Valve_Position_CommandCCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-23",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "加热阀卡滞关闭",
      "requiredPointsRaw": "HCV_{cmd}, HCV_{fb}",
      "diagnosticRule": "If HCV_{cmd}>HCV_{high} but HCV_{fb}<HCV_{low} for N samples, then heating valve stuck closed.",
      "tunableParametersRaw": "N (10 min), HCV_{high} (95%), HCV_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "HCV_{cmd}: brick:Valve_Position_CommandHCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-24",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "加热阀卡滞开启",
      "requiredPointsRaw": "HCV_{cmd}, HCV_{fb}",
      "diagnosticRule": "If HCV_{cmd}<HCV_{low} but HCV_{fb}>HCV_{high} for N samples, then heating valve stuck open.",
      "tunableParametersRaw": "N (10 min), HCV_{low} (5%), HCV_{high} (95%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "HCV_{cmd}: brick:Valve_Position_CommandHCV_{fb}: brick:Valve_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-25",
      "equipmentType": "ahu",
      "category": "混风/新风",
      "name": "混风温度物理关系异常",
      "requiredPointsRaw": "T_{ma}, T_{oa}, T_{ra}",
      "diagnosticRule": "If T_{ma}<min(T_{oa}, T_{ra})-ε_{T}or T_{ma}>max(T_{oa}, T_{ra})+ε_{T} for N samples, then mixed-air temperature relationship anomaly.",
      "tunableParametersRaw": "ε_{T}(2℃), N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ma}: brick:Mixed_Air_Temperature_SensorT_{oa}: brick:Outside_Air_Temperature_SensorT_{ra}: brick:Return_Air_Temperature_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-26",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "新风阀卡滞关闭",
      "requiredPointsRaw": "OAD_{cmd}, OAD_{fb}",
      "diagnosticRule": "If OAD_{cmd}>OAD_{high} but OAD_{fb}<OAD_{low} for N samples, then outside air damper stuck closed.",
      "tunableParametersRaw": "N (10 min), OAD_{high} (95%), OAD_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "OAD_{cmd}: brick:Damper_Position_CommandOAD_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-27",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "新风阀卡滞开启",
      "requiredPointsRaw": "OAD_{cmd}, OAD_{fb}",
      "diagnosticRule": "If OAD_{cmd}<OAD_{low} but OAD_{fb}>OAD_{high} for N samples, then outside air damper stuck open.",
      "tunableParametersRaw": "N (10 min), OAD_{high} (95%), OAD_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "OAD_{cmd}: brick:Damper_Position_CommandOAD_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-28",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "回风阀卡滞关闭",
      "requiredPointsRaw": "RAD_{cmd}, RAD_{fb}",
      "diagnosticRule": "If RAD_{cmd}>RAD_{high} but RAD_{fb}<RAD_{low} for N samples, then return air damper stuck closed.",
      "tunableParametersRaw": "N (10 min), RAD_{high} (95%), RAD_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "RAD_{cmd}: brick:Damper_Position_CommandRAD_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-29",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "回风阀卡滞开启",
      "requiredPointsRaw": "RAD_{cmd}, RAD_{fb}",
      "diagnosticRule": "If RAD_{cmd}<RAD_{low} but RAD_{fb}>RAD_{high} for N samples, then return air damper stuck open.",
      "tunableParametersRaw": "N (10 min), RAD_{high} (95%), RAD_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "RAD_{cmd}: brick:Damper_Position_CommandRAD_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-30",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "排风阀卡滞关闭",
      "requiredPointsRaw": "EAD_{cmd}, EAD_{fb}",
      "diagnosticRule": "If EAD_{cmd}>EAD_{high} but EAD_{fb}<EAD_{low} for N samples, then exhaust air damper stuck closed.",
      "tunableParametersRaw": "N (10 min), EAD_{high} (95%), EAD_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "EAD_{cmd}: brick:Damper_Position_CommandEAD_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-31",
      "equipmentType": "ahu",
      "category": "执行器",
      "name": "排风阀卡滞开启",
      "requiredPointsRaw": "EAD_{cmd}, EAD_{fb}",
      "diagnosticRule": "If EAD_{cmd}<5% but EAD_{fb}>95% for N samples, then exhaust air damper stuck open.",
      "tunableParametersRaw": "N (10 min), EAD_{high} (95%), EAD_{low} (5%)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "EAD_{cmd}: brick:Damper_Position_CommandEAD_{fb}: brick:Damper_Position_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-32",
      "equipmentType": "ahu",
      "category": "混风/新风",
      "name": "新风量不足",
      "requiredPointsRaw": "T_{ma}, T_{oa}, T_{ra}, , F_{oa}",
      "diagnosticRule": "If F_{oa}<F_{oa_min} or OAF_{calc}<OAF_{min} for N samples, then insufficient outdoor air. OAF_{calc}=(T_{ma}-T_{ra})/(T_{oa}-T_{ra})",
      "tunableParametersRaw": "F_{oa_min}, OAF_{min},N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "F_{oa}: brick:Outside_Air_Flow_SensorT_{ma}: brick:Mixed_Air_Temperature_SensorT_{oa}: brick:Outside_Air_Temperature_SensorT_{ra}: brick:Return_Air_Temperature_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-33",
      "equipmentType": "ahu",
      "category": "过滤器/风管",
      "name": "过滤器堵塞",
      "requiredPointsRaw": "DP_{filter}, Fan_{freq_fb}",
      "diagnosticRule": "If Fan_{freq_fb}>Fan_{freq_fb_min} and DP_{filter}>DP_{filter_high} for N samples,then high filter differential-pressure fault.",
      "tunableParametersRaw": "Fan_{freq_fb_min}, DP_{filter_high}, N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP_{filter}: brick:Filter_Air_Differential_Pressure_SensorFan_{freq_fb}: brick:Output_Frequency_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-34",
      "equipmentType": "ahu",
      "category": "过滤器/风管",
      "name": "过滤器破损或缺失",
      "requiredPointsRaw": "DP_{filter}, Fan_{freq_fb}",
      "diagnosticRule": "If Fan_{freq_fb}>Fan_{freq_max} and DP_{filter}<DP_{filter_low} for N samples, then abnormally low filter differential-pressure fault.",
      "tunableParametersRaw": "Fan_{freq_max}, DP_{filter_low},N (10 min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP_{filter}: brick:Filter_Air_Differential_Pressure_SensorFan_{freq_fb}: brick:Output_Frequency_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-35",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "送风静压传感器故障",
      "requiredPointsRaw": "SP",
      "diagnosticRule": "If SP is physically unreasonable (SP<SP_{min} or SP>SP_{max}), or stuck (|(SP_{i}-SP_{i-1})/(t_{i}-t_{i-1})|<S_{SP}) for N samples, then SP sensor fault",
      "tunableParametersRaw": "N (10 min), SP_{min}, SP_{max}, S_{SP} (0.1Pa/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "SP: brick:Supply_Air_Static_Pressure_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-36",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "过滤器压差传感器故障",
      "requiredPointsRaw": "DP_{filter}",
      "diagnosticRule": "If DP_{filter} is physically unreasonable (DP_{filter}<DP_{filter_min} or DP_{filter}>DP_{filter_max}), or stuck (|(DP_{filter_i}-DP_{filter_i-1})/(t_{i}-t_{i-1})|<S_{DP_filter}) for N samples, then DP_{filter} sensor fault",
      "tunableParametersRaw": "N (10 min), DP_{filter_min}, DP_{filter_max}, S_{DP_filter} (0.1Pa/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "DP_{filter}: brick:Filter_Air_Differential_Pressure_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-37",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "送风温度传感器故障",
      "requiredPointsRaw": "T_{sa}",
      "diagnosticRule": "If T_{sa} is physically unreasonable (T_{sa}<T_{sa_min} or T_{sa}>T_{sa_max}), or stuck (|(T_{sa_i}-T_{sa_i-1})/(t_{i}-t_{i-1})|<S_{T_sa}) for N samples, then T_{sa} sensor fault",
      "tunableParametersRaw": "N (10 min), T_{sa_min}, T_{sa_max}, S_{T_sa} (0.01℃/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{sa}: brick:Supply_Air_Temperature_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-38",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "混风温度传感器故障",
      "requiredPointsRaw": "T_{ma}",
      "diagnosticRule": "If T_{ma} is physically unreasonable (T_{ma}<T_{ma_min} or T_{ma}>T_{ma_max}), or stuck (|(T_{ma_i}-T_{ma_i-1})/(t_{i}-t_{i-1})|<S_{T_ma}) for N samples, then T_{ma} sensor fault",
      "tunableParametersRaw": "N (10 min), T_{ma_min}, T_{ma_max}, S_{T_ma} (0.01℃/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ma}: brick:Mixed_Air_Temperature_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-39",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "回风温度传感器故障",
      "requiredPointsRaw": "T_{ra}",
      "diagnosticRule": "If T_{ra} is physically unreasonable (T_{ra}<T_{ra_min} or T_{ra}>T_{ra_max}), or stuck (|(T_{ra_i}-T_{ra_i-1})/(t_{i}-t_{i-1})|<S_{T_ra}) for N samples, then T_{ra} sensor fault",
      "tunableParametersRaw": "N (10 min), T_{ra_min}, T_{ra_max}, S_{T_ra} (0.01℃/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ra}: brick:Return_Air_Temperature_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-40",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "新风温度传感器故障",
      "requiredPointsRaw": "T_{oa}",
      "diagnosticRule": "If T_{oa} is physically unreasonable (T_{oa}<T_{oa_min} or T_{oa}>T_{oa_max}), or stuck (|(T_{oa_i}-T_{oa_i-1})/(t_{i}-t_{i-1})|<S_{T_oa}) for N samples, then T_{oa} sensor fault",
      "tunableParametersRaw": "N (10 min), T_{oa_min}, T_{oa_max}, S_{T_oa} (0.01℃/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{oa}: brick:Outside_Air_Temperature_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-41",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "送风湿度传感器故障",
      "requiredPointsRaw": "∅_{sa}",
      "diagnosticRule": "If ∅_{sa} is physically unreasonable (∅_{sa}<∅_{sa_min} or ∅_{sa}>∅_{sa_max}), or stuck (|(∅_{sa_i}-∅_{sa_i-1})/(t_{i}-t_{i-1})|<S_{∅_sa}) for N samples, then ∅_{sa} sensor fault",
      "tunableParametersRaw": "N (10 min), ∅_{sa_min}, ∅_{sa_max}, S_{∅_sa} (0.01%RH/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{sa}: brick:Supply_Air_Humidity_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-42",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "混风湿度传感器故障",
      "requiredPointsRaw": "∅_{ma}",
      "diagnosticRule": "If ∅_{ma} is physically unreasonable (∅_{ma}<∅_{ma_min} or ∅_{ma}>∅_{ma_max}), or stuck (|(∅_{ma_i}-∅_{ma_i-1})/(t_{i}-t_{i-1})|<S_{∅_ma}) for N samples, then ∅_{ma} sensor fault",
      "tunableParametersRaw": "N (10 min), ∅_{ma_min}, ∅_{ma_max}, S_{∅_ma} (0.01%RH/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ma}: brick:Mixed_Air_Humidity_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-43",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "回风湿度传感器故障",
      "requiredPointsRaw": "∅_{ra}",
      "diagnosticRule": "If ∅_{ra} is physically unreasonable (∅_{ra}<∅_{ra_min} or ∅_{ra}>∅_{ra_max}), or stuck (|(∅_{ra_i}-∅_{ra_i-1})/(t_{i}-t_{i-1})|<S_{∅_ra}) for N samples, then ∅_{ra} sensor fault",
      "tunableParametersRaw": "N (10 min), ∅_{ra_min}, ∅_{ra_max}, S_{∅_ra} (0.01%RH/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{ra}: brick:Return_Air_Humidity_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    },
    {
      "id": "AHU-44",
      "equipmentType": "ahu",
      "category": "传感器",
      "name": "新风湿度传感器故障",
      "requiredPointsRaw": "∅_{oa}",
      "diagnosticRule": "If ∅_{oa} is physically unreasonable (∅_{oa}<∅_{oa_min} or ∅_{oa}>∅_{oa_max}), or stuck (|(∅_{oa_i}-∅_{oa_i-1})/(t_{i}-t_{i-1})|<S_{∅_oa}) for N samples, then ∅_{oa} sensor fault",
      "tunableParametersRaw": "N (10 min), ∅_{oa_min}, ∅_{oa_max}, S_{∅_oa} (0.01%RH/min)",
      "persistenceMinutes": 10,
      "brickClassesRaw": "T_{oa}: brick:Outside_Air_Humidity_Sensor",
      "sourceSha256": "027fe4297404aa91167608de0bcebea6920fe55f99ec8c152bc206356d1a461c"
    }
  ]
} as const;

export type ImportedEquipmentFddRule = (typeof IMPORTED_EQUIPMENT_FDD_CATALOG.rules)[number];
