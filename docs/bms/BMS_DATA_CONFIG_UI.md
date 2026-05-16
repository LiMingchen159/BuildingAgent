# BMS Data Config UI

## Purpose
This page configures real project BMS data for supported adapters. It is focused on enteliWEB, source credentials, point import, field normalization, and live read verification.

## Supported adapters
- Current supported adapter: Delta Controls enteliWEB.
- Additional vendors can be added later through the backend adapter architecture.

## Source mapping
The source form maps directly to backend adapter configuration:
- `name`
- `base_url`
- `auth_type`
- `read_only`
- `config_json.verify_ssl`
- endpoint templates for latest, history, points, and test access

## Point import mapping
Imported rows normalize into backend point fields:
- `point_name`
- `vendor_point_id`
- `api_path`
- `unit`
- `equipment_name`
- `system_name`
- `location`
- `point_type`
- `writable`
- `semantic_class`
- `description`
- `warnings`

For enteliWEB, `vendor_point_id` like `//Elements/10101.AV1` and `api_url` like `http://host:port/enteliweb/api/.bacnet/Elements/10101/AV,1` are interpreted into adapter-ready fields.

## Test Read
The page provides one clear Test First Point action for the selected imported point. It uses enteliWEB live read data when `api_path` exists or a parseable `vendor_point_id` is available.

## Security
- No credentials are stored in `localStorage` or `sessionStorage`.
- No credential values are logged.
- No vendor BMS API is called directly from the browser.

## Backend dependency
The frontend only calls the BuildingAgent backend BMS proxy surface under `/api/bms/*`.
The backend forwards to `BMS_API_BASE_URL`, for example:
- `BMS_API_BASE_URL=http://localhost:8100`

## MVP flow
1. Open `BMS Data Config` from a project.
2. Import data.
3. Keep the enteliWEB adapter selected.
4. Review and edit the generated configuration.
5. Save credentials and test the first point.
6. Start backup sync and inspect status.
