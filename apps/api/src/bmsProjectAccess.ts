export const BMS_SOURCE_NOT_CONFIGURED = "bms_source_not_configured";
export const BMS_SOURCE_UNAVAILABLE = "bms_source_unavailable";

export interface ProjectBmsAccess {
  ok: true;
  projectId: string;
  sourceId: string;
  sourceName: string;
  baseUrl: string;
}

export interface ProjectBmsAccessError {
  ok: false;
  projectId: string;
  error: typeof BMS_SOURCE_NOT_CONFIGURED | typeof BMS_SOURCE_UNAVAILABLE;
  message: string;
  sourceId?: string;
}

export type ProjectBmsAccessResult = ProjectBmsAccess | ProjectBmsAccessError;

export type ProjectBmsAccessResolver = (projectId: string, options?: { sourceId?: string }) =>
  ProjectBmsAccessResult | Promise<ProjectBmsAccessResult>;

export function defaultProjectBmsAccess(projectId: string): ProjectBmsAccessError {
  return {
    ok: false,
    projectId,
    error: BMS_SOURCE_NOT_CONFIGURED,
    message: "No BMS source is configured for this project."
  };
}

export function projectBmsAccessErrorPayload(access: ProjectBmsAccessError): Record<string, unknown> {
  return {
    error: access.error,
    projectId: access.projectId,
    ...(access.sourceId ? { sourceId: access.sourceId } : {}),
    message: access.message
  };
}
