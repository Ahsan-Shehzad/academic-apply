import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  MenuItem,
  TextField,
} from "@mui/material";
import { AutoAwesomeOutlined, DescriptionOutlined } from "@mui/icons-material";
import type { RecordData, Snapshot } from "./types";
export function packageLabel(pkg: RecordData) {
  return `${pkg.name} - ${pkg.status} - ${new Date(pkg.createdAt).toLocaleDateString()} - ${pkg.id.slice(0, 6)}`;
}
export default function ApplyStart({
  data,
  application,
  busy,
  start,
  prepare,
}: {
  data: Snapshot;
  application?: RecordData;
  busy: string;
  start: (job: RecordData, pkg?: string) => Promise<void>;
  prepare: (job: RecordData, pkg?: string) => void;
}) {
  const [jobId, setJobId] = useState(application?.jobId || ""),
    [packageId, setPackageId] = useState(application?.packageId || "");
  const opportunities = [...data.jobs, ...(data.jobHistory || [])];
  const job = opportunities.find((j) => j.id === jobId),
    packages = data.packages
      .filter((p) => p.jobId === jobId)
      .sort(
        (a, b) =>
          Number(b.status === "ready") - Number(a.status === "ready") ||
          Date.parse(b.createdAt) - Date.parse(a.createdAt),
      );
  const selected = packages.find((p) => p.id === packageId) || packages[0];
  return (
    <section className="panel padded apply-start">
      <div>
        <span className="eyebrow">AI APPLICATION WORKSPACE</span>
        <h2>Select the opportunity and its submission package</h2>
        <p>
          The assistant uses this listing, its requirements, and the selected
          package throughout the application.
        </p>
      </div>
      <div className="form-stack">
        <Autocomplete
          options={opportunities.filter((j) => j.status !== "dismissed")}
          getOptionLabel={(j) =>
            `${j.institution} - ${j.title} (${j.country})${data.jobs.some((active) => active.id === j.id) ? "" : " · Archived listing"}`
          }
          value={job || null}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          onChange={(_, j) => {
            setJobId(j?.id || "");
            setPackageId("");
          }}
          renderInput={(params) => (
            <TextField {...params} label="Opportunity to apply for" />
          )}
        />
        <TextField
          select
          label="Matching submission package"
          value={selected?.id || ""}
          onChange={(e) => setPackageId(e.target.value)}
          disabled={!packages.length}
        >
          {!packages.length && (
            <MenuItem value="">No package prepared for this listing</MenuItem>
          )}
          {packages.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {packageLabel(p)}
            </MenuItem>
          ))}
        </TextField>
        {job && (
          <Alert severity={selected?.status === "ready" ? "success" : "info"}>
            {selected
              ? `${selected.documents?.filter((d: RecordData) => d.submissionEligible !== false).length || 0} documents and ${selected.attachments?.length || 0} supporting files - ${selected.status === "ready" ? "ready for application review" : "review and export the package before uploads"}.`
              : "Prepare the required documents now, or open the portal to inspect its requirements."}
          </Alert>
        )}
        <div className="tag-row">
          <Button
            startIcon={<DescriptionOutlined />}
            disabled={!!busy || !job}
            onClick={() => job && prepare(job, selected?.id)}
          >
            Prepare / review package
          </Button>
          <Button
            variant="contained"
            startIcon={<AutoAwesomeOutlined />}
            disabled={!!busy || !job || job.status === "closed"}
            onClick={() => job && start(job, selected?.id)}
          >
            Start / resume application
          </Button>
        </div>
      </div>
    </section>
  );
}
