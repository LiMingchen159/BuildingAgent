export interface BmsSourcePayload {
  project_id: string;
  building_id: string;
  name: string;
  vendor_type: string;
  protocol_type: string;
  base_url: string | null;
  host: string | null;
  port: number | null;
  auth_type: string;
  read_only: boolean;
  config: Record<string, unknown>;
}

export interface BmsSourceSummary extends BmsSourcePayload {
  source_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  last_connection_test?: BmsConnectionTestResponse | undefined;
  last_ingestion_job_id?: string | undefined;
}

export interface BmsCapabilitySet {
  discover_points: boolean;
  read_latest: boolean;
  read_history: boolean;
  write_point: boolean;
}

export interface BmsConnectionTestResponse {
  source_id: string;
  success: boolean;
  message: string;
  capabilities: BmsCapabilitySet;
  tested_at: string;
}

export interface BmsPointSummary {
  id: string;
  point_name: string;
  vendor_point_id: string;
  api_path?: string | null;
  unit: string;
  equipment_name: string;
  system_name: string;
  location: string;
  point_type: string;
  writable: boolean;
  semantic_class: string;
  status: string;
  description?: string;
  warnings?: string[];
  raw_row?: Record<string, string>;
}

export interface BmsDiscoverPointsResponse {
  source_id: string;
  points: BmsPointSummary[];
  count: number;
}

export interface BmsMinimalIngestionRequest {
  source_id: string;
  point_ids: string[];
  sample_count: number;
  interval_seconds: number;
}

export interface BmsIngestionJobStatusResponse {
  job_id: string;
  source_id: string;
  status: "running" | "completed" | "failed";
  sample_count: number;
  interval_seconds: number;
  total_expected_records: number;
  inserted_records: number;
  success_rate: number;
  started_at: string;
  finished_at: string | null;
  errors: string[];
}

export interface BmsIngestionResultsResponse {
  job_id: string;
  series: Array<{
    point_id: string;
    point_name: string;
    unit: string;
    values: Array<{
      timestamp: string;
      value: number;
      quality: "good" | "bad" | "uncertain";
    }>;
  }>;
}
