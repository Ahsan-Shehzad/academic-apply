import { useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  MenuItem,
  TextField,
} from "@mui/material";
import {
  AddRounded,
  AttachFileRounded,
  AutoAwesomeOutlined,
  DeleteOutlineRounded,
  MergeTypeRounded,
  OpenInNewRounded,
} from "@mui/icons-material";
import type { Call, RecordData, Snapshot } from "./types";
type Props = { pkg: RecordData; data: Snapshot; call: Call; busy: string };
export function PackageRequirements({ pkg, data, call, busy }: Props) {
  const [add, setAdd] = useState(false),
    [reference, setReference] = useState<RecordData | null>(null),
    [referees, setReferees] = useState<RecordData[]>([]);
  const coverage = pkg.coverage || [],
    complete = coverage.filter((r: RecordData) => r.fulfilled).length;
  return (
    <section className="package-requirements padded">
      <div className="flex-between">
        <h3>Required document coverage</h3>
        <Chip
          size="small"
          label={`${complete} / ${coverage.length} included`}
        />
        <Button startIcon={<AddRounded />} onClick={() => setAdd(true)}>
          Add requirement
        </Button>
      </div>
      <p className="muted">
        {pkg.requirementSource}
        {pkg.requirementWarning ? ` · ${pkg.requirementWarning}` : ""}
      </p>
      {coverage.map((r: RecordData) => (
        <div
          role="group"
          aria-label={`${r.label} requirement`}
          className={`requirement-card ${r.fulfilled ? "fulfilled" : ""}`}
          key={r.id}
        >
          <div className="flex-between">
            <b>{r.label}</b>
            <Chip
              size="small"
              color={r.fulfilled ? "success" : "default"}
              label={`${r.required ? "Required" : "Optional"} · ${r.kind === "generated" ? (r.fulfilled ? "Created" : "Not created") : `${r.count} / ${r.minimum} ${r.submissionMethod === "referee_direct" ? "confirmed separately" : "files"}`}`}
            />
          </div>
          {r.instructions && <p>{r.instructions}</p>}
          <div className="tag-row">
            {r.kind !== "generated" && (
              <TextField
                key={r.id + String(r.minimum)}
                label="Required file count"
                type="number"
                size="small"
                defaultValue={r.minimum}
                inputProps={{ min: 1, max: 20 }}
                disabled={!!busy}
                sx={{ width: 155 }}
                onBlur={(e) => {
                  const count = Number(e.target.value);
                  if (count !== r.minimum && count >= 1 && count <= 20)
                    call("package.requirementCount", {
                      id: pkg.id,
                      requirementId: r.id,
                      count,
                    });
                }}
              />
            )}
            {r.kind === "generated" && !r.fulfilled && (
              <Button
                disabled={!!busy}
                startIcon={<AutoAwesomeOutlined />}
                onClick={() =>
                  call(
                    "package.addDocument",
                    { id: pkg.id, requirementId: r.id },
                    "Document creation queued. Follow progress in Activity.",
                  )
                }
              >
                Create required document
              </Button>
            )}
            {r.draftable === "reference" && (
              <Button
                disabled={!!busy || !data.referees?.length}
                startIcon={<AutoAwesomeOutlined />}
                onClick={() => {
                  setReference(r);
                  setReferees(
                    (data.referees || [])
                      .filter(
                        (ref) =>
                          !pkg.documents.some(
                            (d: RecordData) =>
                              d.purpose === "referee_review" &&
                              d.requirementId === r.id &&
                              d.referee?.id === ref.id,
                          ),
                      )
                      .slice(0, r.minimum),
                  );
                }}
              >
                Prepare referee-review letters
              </Button>
            )}
          </div>
          {r.draftable === "reference" && (
            <small>
              Drafts are for referee editing and approval. Obtain signed
              originals for applicant uploads.{" "}
              {data.referees?.length
                ? ""
                : "Add referees to your profile and approve it to create drafts."}
            </small>
          )}
          {r.submissionMethod === "referee_direct" && (
            <ExternalSubmission
              key={r.id}
              pkg={pkg}
              requirement={r}
              call={call}
              busy={busy}
            />
          )}
        </div>
      ))}
      <Alert severity="info">
        Created narratives need PDF export and review. Degrees, transcripts,
        existing papers and signed letters are supplied as files. Referee-review
        drafts do not fulfil signed-letter requirements.
      </Alert>
      {add && (
        <AddRequirement
          data={data}
          busy={busy}
          close={() => setAdd(false)}
          save={async (requirement) => {
            if (
              await call("package.addRequirement", { id: pkg.id, requirement })
            )
              setAdd(false);
          }}
        />
      )}
      {reference && (
        <Dialog open fullWidth maxWidth="sm" onClose={() => setReference(null)}>
          <DialogTitle>Prepare referee-review letters</DialogTitle>
          <DialogContent className="form-stack">
            <p>
              {reference.label} · {reference.minimum} requested. Select the
              intended referees from your approved profile.
            </p>
            <Autocomplete
              multiple
              options={data.referees || []}
              value={referees}
              getOptionLabel={(r) =>
                `${r.name}${r.relationship ? ` — ${r.relationship}` : ""}`
              }
              isOptionEqualToValue={(a, b) => a.id === b.id}
              onChange={(_, v) => setReferees(v)}
              renderInput={(p) => (
                <TextField {...p} label="Referees for review drafts" />
              )}
            />
            <Alert severity="info">
              Letters use verified candidate facts and the supplied
              relationship. Share the draft with its referee for editing,
              letterhead and signature. These drafts are excluded from
              submission files and combined packets.
            </Alert>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setReference(null)}>Cancel</Button>
            <Button
              variant="contained"
              disabled={!!busy || !referees.length}
              onClick={async () => {
                if (
                  await call(
                    "package.referenceDrafts",
                    {
                      id: pkg.id,
                      requirementId: reference.id,
                      refereeIds: referees.map((r) => r.id),
                    },
                    "Referee letter drafts queued. Follow progress in Activity.",
                  )
                )
                  setReference(null);
              }}
            >
              Create {referees.length || ""} review drafts
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </section>
  );
}
function ExternalSubmission({
  pkg,
  requirement: r,
  call,
  busy,
}: {
  pkg: RecordData;
  requirement: RecordData;
  call: Call;
  busy: string;
}) {
  const saved = pkg.externalSubmissions?.find(
      (e: RecordData) => e.requirementId === r.id,
    ),
    [count, setCount] = useState(saved?.count || 0),
    [notes, setNotes] = useState(saved?.notes || "");
  return (
    <div className="form-stack">
      <Alert severity="info">
        The listing requests separate or confidential referee submission. Record
        confirmation after the referee submits directly. This action does not
        send a letter.
      </Alert>
      <div className="two-fields">
        <TextField
          label="Confirmed separate submissions"
          type="number"
          value={count}
          inputProps={{ min: 0, max: 20 }}
          onChange={(e) => setCount(Number(e.target.value))}
        />
        <TextField
          label="Confirmation notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <Button
        disabled={!!busy || count < 0 || count > 20}
        onClick={() =>
          call(
            "package.externalSubmission",
            { id: pkg.id, requirementId: r.id, count, notes },
            "Separate-submission confirmation saved.",
          )
        }
      >
        Record confirmation
      </Button>
    </div>
  );
}
function AddRequirement({
  data,
  busy,
  close,
  save,
}: {
  data: Snapshot;
  busy: string;
  close: () => void;
  save: (r: RecordData) => Promise<void>;
}) {
  const [form, setForm] = useState({
    label: "",
    kind: "attachment",
    type: "Application statement",
    required: true,
    instructions: "",
    minFiles: 1,
  });
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={close}>
      <DialogTitle>Add listing requirement</DialogTitle>
      <DialogContent className="form-stack">
        <TextField
          sx={{ mt: 1 }}
          label="Document or file requirement"
          value={form.label}
          onChange={(e) => setForm({ ...form, label: e.target.value })}
        />
        <TextField
          select
          label="Preparation method"
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value })}
        >
          <MenuItem value="attachment">
            Supply existing supporting files
          </MenuItem>
          <MenuItem value="generated">
            Create an applicant-authored narrative
          </MenuItem>
          <MenuItem value="form">Supply completed official form</MenuItem>
        </TextField>
        {form.kind === "generated" ? (
          <TextField
            select
            label="Narrative document type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
          >
            {data.documentTypes.map((t) => (
              <MenuItem key={t} value={t}>
                {t}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          <TextField
            label="Required file count"
            type="number"
            value={form.minFiles}
            inputProps={{ min: 1, max: 20 }}
            onChange={(e) =>
              setForm({ ...form, minFiles: Number(e.target.value) })
            }
          />
        )}
        <TextField
          multiline
          minRows={3}
          label="Listing instructions, limits and submission method"
          value={form.instructions}
          onChange={(e) => setForm({ ...form, instructions: e.target.value })}
        />
        <FormControlLabel
          label="Required by the listing"
          control={
            <Checkbox
              checked={form.required}
              onChange={(_, required) => setForm({ ...form, required })}
            />
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={
            !!busy ||
            !form.label.trim() ||
            form.minFiles < 1 ||
            form.minFiles > 20
          }
          onClick={() =>
            save({
              ...form,
              type: form.kind === "generated" ? form.type : null,
              minFiles: form.kind === "generated" ? 1 : form.minFiles,
            })
          }
        >
          Add requirement
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export default function PackageSupport({ pkg, data, call, busy }: Props) {
  const [files, setFiles] = useState<RecordData[]>([]),
    [requirementId, setRequirement] = useState(""),
    [combine, setCombine] = useState(false);
  const requirements = (pkg.coverage || []).filter(
      (r: RecordData) =>
        r.kind !== "generated" && r.submissionMethod !== "referee_direct",
    ),
    selected = requirements.find((r: RecordData) => r.id === requirementId);
  const suggest = () => {
    const text = selected?.label.toLowerCase() || "",
      pattern = /transcript/.test(text)
        ? /transcript|marksheet|academic.record/i
        : /degree|certificate|diploma/.test(text)
          ? /degree|certificate|diploma/i
          : /paper|publication|writing/.test(text)
            ? /paper|publication|article|manuscript/i
            : /reference|recommendation/.test(text)
              ? /reference|recommendation/i
              : /evaluation/.test(text)
                ? /evaluation|feedback/i
                : null;
    setFiles(
      pattern
        ? data.library
            .filter(
              (f) =>
                /\.(pdf|docx?|png|jpe?g|rtf|odt)$/i.test(f.path || f.name) &&
                pattern.test(`${f.relative || ""} ${f.name}`),
            )
            .slice(0, selected?.remaining || selected?.minimum || 1)
        : [],
    );
  };
  return (
    <section className="attachment-section form-stack">
      <div className="flex-between">
        <h3>Supporting files</h3>
        <Button
          startIcon={<MergeTypeRounded />}
          onClick={() => setCombine(true)}
          disabled={!!busy}
        >
          Build a combined PDF
        </Button>
      </div>
      <p className="muted">
        Include the degrees, transcripts, research papers and other evidence
        requested by this listing. One file can fulfil several requirements;
        duplicate copies count once per requirement.
      </p>
      <TextField
        select
        label="Assign new files to requirement"
        value={requirementId}
        onChange={(e) => {
          setRequirement(e.target.value);
          setFiles([]);
        }}
      >
        <MenuItem value="">Additional supporting files</MenuItem>
        {requirements.map((r: RecordData) => (
          <MenuItem key={r.id} value={r.id}>
            {r.label} — {r.count}/{r.minimum}
          </MenuItem>
        ))}
      </TextField>
      <Autocomplete
        multiple
        options={data.library}
        value={files}
        getOptionLabel={(f) => f.relative || f.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onChange={(_, v) => setFiles(v)}
        renderInput={(p) => (
          <TextField
            {...p}
            label="Select multiple files from evidence library"
          />
        )}
      />
      <div className="tag-row">
        <Button
          disabled={!!busy || !files.length}
          startIcon={<AttachFileRounded />}
          variant="outlined"
          onClick={async () => {
            if (
              await call(
                "package.attach",
                {
                  id: pkg.id,
                  libraryIds: files.map((f) => f.id),
                  requirementId: requirementId || undefined,
                },
                "Supporting files added to this package.",
              )
            )
              setFiles([]);
          }}
        >
          Add {files.length || ""} library files
        </Button>
        <Button
          disabled={!!busy}
          startIcon={<AddRounded />}
          onClick={() =>
            call(
              "package.addFiles",
              { id: pkg.id, requirementId: requirementId || undefined },
              "Selected files copied into the library and package.",
            )
          }
        >
          Add files from computer
        </Button>
        <Button disabled={!selected || !!busy} onClick={suggest}>
          Suggest library matches
        </Button>
      </div>
      <small>
        Suggestions use filenames only. Inspect the selected files and their
        requirement assignments.
      </small>
      {pkg.attachments.map((a: RecordData) => (
        <div className="support-file-card" key={a.id || a.path}>
          <div className="flex-between">
            <b>{a.name}</b>
            <div>
              <IconButton
                aria-label={`Open ${a.name}`}
                onClick={() => call("file.open", { path: a.path })}
              >
                <OpenInNewRounded fontSize="small" />
              </IconButton>
              <IconButton
                aria-label={`Remove ${a.name} from package`}
                disabled={!!busy}
                onClick={() =>
                  call(
                    "package.removeAttachment",
                    { id: pkg.id, attachmentId: a.id || a.path },
                    "File removed from the package. Library originals are retained.",
                  )
                }
              >
                <DeleteOutlineRounded fontSize="small" />
              </IconButton>
            </div>
          </div>
          {a.derived ? (
            <small>
              Combined packet · rebuild after source files or reviews change.
            </small>
          ) : (
            <TextField
              select
              fullWidth
              label={`Requirements fulfilled by ${a.name}`}
              value={
                a.requirementIds || (a.requirementId ? [a.requirementId] : [])
              }
              SelectProps={{ multiple: true }}
              onChange={(e) =>
                call("package.assignAttachment", {
                  id: pkg.id,
                  attachmentId: a.id || a.path,
                  requirementIds:
                    typeof e.target.value === "string"
                      ? e.target.value.split(",")
                      : e.target.value,
                })
              }
            >
              {requirements.map((r: RecordData) => (
                <MenuItem key={r.id} value={r.id}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
          )}
        </div>
      ))}
      {!pkg.attachments.length && (
        <Alert severity="info">
          No supporting files have been added to this package yet.
        </Alert>
      )}
      <Button
        disabled={!!busy}
        onClick={() =>
          call(
            "package.review",
            { id: pkg.id, documentIds: [] },
            "Package completeness checked.",
          )
        }
      >
        Check package completeness
      </Button>
      {combine && (
        <CombinedPacket
          pkg={pkg}
          call={call}
          busy={busy}
          close={() => setCombine(false)}
        />
      )}
    </section>
  );
}
function CombinedPacket({
  pkg,
  call,
  busy,
  close,
}: {
  pkg: RecordData;
  call: Call;
  busy: string;
  close: () => void;
}) {
  const options = [
      ...pkg.documents
        .filter(
          (d: RecordData) =>
            d.submissionEligible !== false && d.pdf && d.reviewed,
        )
        .map((d: RecordData) => ({
          id: d.id,
          label: d.label || d.type,
          path: d.pdf,
          document: true,
        })),
      ...pkg.attachments
        .filter((a: RecordData) => !a.derived && /\.pdf$/i.test(a.path))
        .map((a: RecordData) => ({
          id: a.id || a.path,
          label: a.name,
          path: a.path,
          document: false,
        })),
    ],
    [selected, setSelected] = useState<string[]>([]);
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={close}>
      <DialogTitle>Build a combined supporting PDF</DialogTitle>
      <DialogContent>
        <p>
          Select reviewed documents and original PDF attachments, in the order
          displayed below. Keep separate files when the portal provides separate
          upload slots.
        </p>
        {options.map((o: RecordData) => (
          <FormControlLabel
            sx={{ display: "flex" }}
            key={o.id}
            label={o.label}
            control={
              <Checkbox
                checked={selected.includes(o.id)}
                onChange={(_, checked) =>
                  setSelected(
                    checked
                      ? [...selected, o.id]
                      : selected.filter((id) => id !== o.id),
                  )
                }
              />
            }
          />
        ))}
        {!options.length && (
          <Alert severity="info">
            Add PDF supporting files or export and review narrative PDFs first.
            Referee-review drafts are excluded.
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!!busy || !selected.length}
          onClick={async () => {
            if (
              await call(
                "package.combine",
                {
                  id: pkg.id,
                  documentIds: options
                    .filter((o) => o.document && selected.includes(o.id))
                    .map((o) => o.id),
                  attachmentPaths: options
                    .filter((o) => !o.document && selected.includes(o.id))
                    .map((o) => o.path),
                },
                "Combined PDF created. Inspect it before uploading.",
              )
            )
              close();
          }}
        >
          Create combined PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
