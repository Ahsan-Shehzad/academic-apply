export type RecordData = Record<string, any>;
export interface Snapshot {
  settings: RecordData;
  profile: RecordData | null;
  jobs: RecordData[];
  candidates?: RecordData[];
  searchCoverage?: RecordData[];
  jobHistory?: RecordData[];
  searches: RecordData[];
  packages: RecordData[];
  applications: RecordData[];
  tasks: RecordData[];
  events: RecordData[];
  library: RecordData[];
  referees?: RecordData[];
  providers: RecordData[];
  sources: RecordData[];
  countries: Record<string, string[]>;
  countryGroups?: { id: string; label: string; countries: string[] }[];
  documentTypes: string[];
  searchSuggestions?: RecordData;
  documentPlans?: Record<string, RecordData>;
  dataRoot: string;
  version: string;
  appInfo?: RecordData;
  chromeInstalled: boolean;
  connectors: RecordData[];
}
export type Call = (
  method: string,
  args?: RecordData,
  message?: string,
) => Promise<any>;
declare global {
  interface Window {
    academic: {
      call: (
        method: string,
        args?: RecordData,
      ) => Promise<{ ok: boolean; result: any; error?: string }>;
      onEvent: (callback: (event: RecordData) => void) => () => void;
    };
  }
}
