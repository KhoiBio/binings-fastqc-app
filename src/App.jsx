import { useState, useCallback, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, LineChart, Line, ReferenceLine
} from "recharts";

// ── Config ────────────────────────────────────────────────────────────────────
const API_BASE = process.env.REACT_APP_API_URL || "https://YOUR_API_GATEWAY_URL";

const PALETTE = {
  bg: "#0a0e1a", panel: "#0f1629", border: "#1e2d4a",
  accent: "#00d4ff", green: "#00ffaa", orange: "#ff8c42",
  red: "#ff4d6d", purple: "#b48aff", yellow: "#ffd166",
  muted: "#4a6080", text: "#cce0ff", textDim: "#5a7ca0",
};

// ── Upload component ──────────────────────────────────────────────────────────
function UploadZone({ onUpload, uploading }) {
  const [dragging, setDragging] = useState(false);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter(
      f => f.name.endsWith(".fastq") || f.name.endsWith(".fastq.gz") || f.name.endsWith(".fq.gz")
    );
    if (files.length) onUpload(files);
  }, [onUpload]);

  const handleFileInput = (e) => {
    const files = Array.from(e.target.files);
    if (files.length) onUpload(files);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      style={{
        border: `2px dashed ${dragging ? PALETTE.accent : PALETTE.border}`,
        borderRadius: 12, padding: "48px 32px", textAlign: "center",
        background: dragging ? PALETTE.accent + "08" : PALETTE.panel,
        transition: "all 0.2s", cursor: "pointer",
      }}
      onClick={() => document.getElementById("fileInput").click()}
    >
      <input id="fileInput" type="file" multiple accept=".fastq,.fastq.gz,.fq.gz"
        style={{ display: "none" }} onChange={handleFileInput} />

      {uploading ? (
        <div>
          <div style={{ fontSize: 36, marginBottom: 12 }}>⟳</div>
          <div style={{ color: PALETTE.accent, fontFamily: "monospace" }}>Uploading to S3 & queuing FastQC job...</div>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🧬</div>
          <div style={{ color: PALETTE.text, fontSize: 16, marginBottom: 8 }}>Drop FASTQ files here</div>
          <div style={{ color: PALETTE.textDim, fontSize: 12 }}>Accepts .fastq, .fastq.gz, .fq.gz · Up to 5GB per file</div>
          <div style={{ marginTop: 16, padding: "8px 20px", background: PALETTE.accent + "22",
            border: `1px solid ${PALETTE.accent}55`, borderRadius: 6, display: "inline-block",
            color: PALETTE.accent, fontSize: 12, fontFamily: "monospace" }}>
            Browse files
          </div>
        </div>
      )}
    </div>
  );
}

// ── Job status badge ───────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const config = {
    PENDING:   { color: PALETTE.muted,   label: "● PENDING",   anim: false },
    SUBMITTED: { color: PALETTE.yellow,  label: "● SUBMITTED", anim: true },
    STARTING:  { color: PALETTE.orange,  label: "● STARTING",  anim: true },
    RUNNABLE:  { color: PALETTE.yellow,  label: "● RUNNABLE",  anim: true },
    RUNNING:   { color: PALETTE.accent,  label: "● RUNNING",   anim: true },
    SUCCEEDED: { color: PALETTE.green,   label: "✓ COMPLETE",  anim: false },
    FAILED:    { color: PALETTE.red,     label: "✗ FAILED",    anim: false },
  }[status] || { color: PALETTE.muted, label: status, anim: false };

  return (
    <span style={{
      color: config.color, fontSize: 10, fontFamily: "monospace",
      padding: "2px 8px", borderRadius: 3,
      background: config.color + "22", border: `1px solid ${config.color}44`,
      animation: config.anim ? "pulse 2s infinite" : "none",
    }}>
      {config.label}
    </span>
  );
}

// ── QC Results viewer ─────────────────────────────────────────────────────────
function QCResults({ results }) {
  if (!results) return null;

  const modules = results.report_modules || {};
  const summary = results.summary || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Summary table */}
      <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
        <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>
          QC SUMMARY · {results.filename}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          {summary.map(({ module, status }) => (
            <div key={module} style={{
              padding: "8px 12px", borderRadius: 6,
              background: status === "pass" ? PALETTE.green + "11" : status === "warn" ? PALETTE.yellow + "11" : PALETTE.red + "11",
              border: `1px solid ${status === "pass" ? PALETTE.green : status === "warn" ? PALETTE.yellow : PALETTE.red}33`,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ fontSize: 12 }}>{status === "pass" ? "✓" : status === "warn" ? "⚠" : "✗"}</span>
              <span style={{
                color: status === "pass" ? PALETTE.green : status === "warn" ? PALETTE.yellow : PALETTE.red,
                fontSize: 10, fontFamily: "monospace"
              }}>{module}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Basic stats */}
      {results.basic_stats && (
        <div style={{ display: "flex", gap: 10 }}>
          {[
            ["Total Sequences", results.basic_stats.total_sequences?.toLocaleString(), PALETTE.accent],
            ["Sequence Length", results.basic_stats.sequence_length, PALETTE.purple],
            ["%GC", results.basic_stats.gc_content + "%", PALETTE.green],
            ["Encoding", results.basic_stats.encoding, PALETTE.yellow],
          ].map(([label, value, color]) => (
            <div key={label} style={{
              flex: 1, background: PALETTE.panel, border: `1px solid ${PALETTE.border}`,
              borderRadius: 8, padding: "12px 14px",
            }}>
              <div style={{ color: PALETTE.textDim, fontSize: 10, marginBottom: 6, letterSpacing: "0.08em" }}>{label}</div>
              <div style={{ color, fontFamily: "monospace", fontSize: 18, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Per-base quality chart */}
      {modules.per_base_quality && (
        <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>
            PER BASE SEQUENCE QUALITY
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={modules.per_base_quality}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} />
              <XAxis dataKey="base" tick={{ fill: PALETTE.muted, fontSize: 10 }} label={{ value: "Position (bp)", position: "insideBottom", fill: PALETTE.muted, fontSize: 10, dy: 10 }} />
              <YAxis domain={[0, 40]} tick={{ fill: PALETTE.muted, fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }} />
              <ReferenceLine y={28} stroke={PALETTE.yellow} strokeDasharray="4 4" label={{ value: "Q28", fill: PALETTE.yellow, fontSize: 9 }} />
              <ReferenceLine y={20} stroke={PALETTE.red} strokeDasharray="4 4" label={{ value: "Q20", fill: PALETTE.red, fontSize: 9 }} />
              <Line type="monotone" dataKey="mean" stroke={PALETTE.green} strokeWidth={2} dot={false} name="Mean Quality" />
              <Line type="monotone" dataKey="median" stroke={PALETTE.accent} strokeWidth={1} dot={false} strokeDasharray="4 4" name="Median" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* GC content */}
      {modules.per_sequence_gc_content && (
        <div style={{ background: PALETTE.panel, border: `1px solid ${PALETTE.border}`, borderRadius: 8, padding: 16 }}>
          <div style={{ color: PALETTE.textDim, fontSize: 11, letterSpacing: "0.08em", marginBottom: 12 }}>
            PER SEQUENCE GC CONTENT
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={modules.per_sequence_gc_content} barSize={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={PALETTE.border} vertical={false} />
              <XAxis dataKey="gc" tick={{ fill: PALETTE.muted, fontSize: 9 }} />
              <YAxis tick={{ fill: PALETTE.muted, fontSize: 9 }} />
              <Tooltip contentStyle={{ background: "#0f1629", border: `1px solid ${PALETTE.border}`, borderRadius: 6, color: PALETTE.text, fontSize: 11 }} />
              <Bar dataKey="count" fill={PALETTE.purple} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [selectedJob, setSelectedJob] = useState(null);
  const [error, setError] = useState(null);

  // Poll job statuses every 10s
  useEffect(() => {
    const poll = setInterval(async () => {
      const activeJobs = jobs.filter(j =>
        ["SUBMITTED", "RUNNING", "STARTING", "RUNNABLE", "PENDING"].includes(j.status)
      );
      if (!activeJobs.length) return;

      for (const job of activeJobs) {
        try {
          const res = await fetch(`${API_BASE}/job/${job.jobId}`);
          const data = await res.json();

          let results = null;
          if (data.status === "SUCCEEDED") {
            try {
              const rRes = await fetch(`${API_BASE}/results/${job.jobId}`);
              results = await rRes.json();
            } catch (e) { /* results not ready yet */ }
          }

          setJobs(prev => prev.map(j => j.jobId === job.jobId
            ? { ...j, status: data.status, results: results || j.results }
            : j
          ));

          // Auto-update selected job panel
          setSelectedJob(prev => {
            if (prev?.jobId === job.jobId) {
              return { ...prev, status: data.status, results: results || prev.results };
            }
            return prev;
          });

        } catch (e) { /* silently fail polling */ }
      }
    }, 10000);
    return () => clearInterval(poll);
  }, [jobs]);

  const handleUpload = async (files) => {
    setUploading(true);
    setError(null);
    try {
      for (const file of files) {
        // Step 1: Get presigned S3 URL
        const presignRes = await fetch(`${API_BASE}/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: file.name, filesize: file.size }),
        });
        if (!presignRes.ok) throw new Error(`Upload endpoint returned ${presignRes.status}`);
        const { uploadUrl, s3Key, jobId } = await presignRes.json();

        // Step 2: Upload directly to S3
        await fetch(uploadUrl, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": "application/octet-stream" },
        });

        // Step 3: Trigger FastQC job on AWS Batch
        await fetch(`${API_BASE}/submit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId, s3Key, filename: file.name }),
        });

        const newJob = {
          jobId, filename: file.name,
          filesize: (file.size / 1e9).toFixed(2) + " GB",
          status: "SUBMITTED",
          submittedAt: new Date().toLocaleTimeString(),
          results: null,
        };

        setJobs(prev => [newJob, ...prev]);
        setSelectedJob(newJob);
      }
    } catch (e) {
      setError("Upload failed: " + e.message + ". Check API_BASE in .env");
    } finally {
      setUploading(false);
    }
  };

  const loadResults = async (job) => {
    setSelectedJob(job);
    if (job.results || job.status !== "SUCCEEDED") return;
    try {
      const res = await fetch(`${API_BASE}/results/${job.jobId}`);
      const data = await res.json();
      setJobs(prev => prev.map(j => j.jobId === job.jobId ? { ...j, results: data } : j));
      setSelectedJob({ ...job, results: data });
    } catch (e) {
      setError("Could not load results: " + e.message);
    }
  };

  const activeStatuses = ["SUBMITTED", "RUNNING", "STARTING", "RUNNABLE", "PENDING"];

  return (
    <div style={{
      background: PALETTE.bg, color: PALETTE.text, minHeight: "100vh",
      fontFamily: "'IBM Plex Sans', 'Helvetica Neue', sans-serif", fontSize: 13,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Header */}
      <div style={{
        background: PALETTE.panel, borderBottom: `1px solid ${PALETTE.border}`,
        padding: "0 28px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 56,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 6,
            background: `linear-gradient(135deg, ${PALETTE.accent}, ${PALETTE.purple})`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
          }}>🧬</div>
          <div>
            <div style={{ fontFamily: "'Space Mono', monospace", color: PALETTE.accent, fontSize: 13, fontWeight: 700 }}>
              BiNGS · FastQC Pipeline
            </div>
            <div style={{ color: PALETTE.textDim, fontSize: 10, letterSpacing: "0.08em" }}>UPLOAD → AWS BATCH → RESULTS</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["S3 Upload", "AWS Batch", "FastQC v0.12"].map(t => (
            <span key={t} style={{
              background: PALETTE.green + "15", color: PALETTE.green,
              border: `1px solid ${PALETTE.green}33`, borderRadius: 4,
              padding: "3px 10px", fontSize: 10, fontFamily: "monospace",
            }}>✓ {t}</span>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", height: "calc(100vh - 56px)" }}>

        {/* Left panel — upload + job list */}
        <div style={{
          width: 340, borderRight: `1px solid ${PALETTE.border}`,
          display: "flex", flexDirection: "column", flexShrink: 0,
        }}>
          <div style={{ padding: 16, borderBottom: `1px solid ${PALETTE.border}` }}>
            <UploadZone onUpload={handleUpload} uploading={uploading} />
            {error && (
              <div style={{
                marginTop: 10, padding: "8px 12px", background: PALETTE.red + "15",
                border: `1px solid ${PALETTE.red}44`, borderRadius: 6,
                color: PALETTE.red, fontSize: 11,
              }}>{error}</div>
            )}
          </div>

          {/* Job list */}
          <div style={{ flex: 1, overflowY: "auto", padding: 12 }}>
            <div style={{ color: PALETTE.textDim, fontSize: 10, letterSpacing: "0.1em", marginBottom: 8, paddingLeft: 4 }}>
              JOBS ({jobs.length})
            </div>
            {jobs.length === 0 && (
              <div style={{ color: PALETTE.muted, fontSize: 12, textAlign: "center", marginTop: 40 }}>
                No jobs yet. Upload a FASTQ file to begin.
              </div>
            )}
            {jobs.map(job => (
              <div key={job.jobId} onClick={() => loadResults(job)}
                style={{
                  padding: "12px 14px", borderRadius: 6, cursor: "pointer", marginBottom: 6,
                  background: selectedJob?.jobId === job.jobId ? PALETTE.accent + "12" : PALETTE.panel,
                  border: `1px solid ${selectedJob?.jobId === job.jobId ? PALETTE.accent + "44" : PALETTE.border}`,
                  transition: "all 0.15s",
                }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <div style={{ color: PALETTE.text, fontSize: 12, fontWeight: 500, flex: 1, marginRight: 8, wordBreak: "break-all" }}>
                    {job.filename}
                  </div>
                  <StatusBadge status={job.status} />
                </div>
                <div style={{ color: PALETTE.textDim, fontSize: 10 }}>
                  {job.filesize} · Submitted {job.submittedAt}
                </div>
                <div style={{ color: PALETTE.textDim, fontSize: 9, fontFamily: "monospace", marginTop: 4 }}>
                  {job.jobId}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel — results */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {!selectedJob ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
              <div style={{ fontSize: 64, opacity: 0.3 }}>📊</div>
              <div style={{ color: PALETTE.muted, fontSize: 14 }}>Upload a FASTQ file to run FastQC</div>
              <div style={{ color: PALETTE.textDim, fontSize: 11, textAlign: "center", maxWidth: 400, lineHeight: 1.7 }}>
                Files are uploaded directly to S3 via presigned URL, then processed by FastQC running on AWS Batch.
                Results appear here automatically when complete.
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, flexWrap: "wrap", justifyContent: "center" }}>
                {["FASTQ Upload","→","S3 Bucket","→","AWS Batch","→","FastQC","→","Results"].map((s, i) => (
                  <span key={i} style={{
                    color: s === "→" ? PALETTE.muted : PALETTE.accent,
                    fontFamily: "monospace", fontSize: 11,
                    padding: s === "→" ? "0" : "4px 10px",
                    background: s === "→" ? "transparent" : PALETTE.accent + "15",
                    borderRadius: 4, border: s === "→" ? "none" : `1px solid ${PALETTE.accent}33`,
                  }}>{s}</span>
                ))}
              </div>
            </div>
          ) : activeStatuses.includes(selectedJob.status) ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 16 }}>
              <div style={{ fontSize: 48, animation: "spin 2s linear infinite" }}>⟳</div>
              <div style={{ color: PALETTE.accent, fontFamily: "monospace", fontSize: 14 }}>
                FastQC running on AWS Batch...
              </div>
              <StatusBadge status={selectedJob.status} />
              <div style={{ color: PALETTE.textDim, fontSize: 11 }}>Typical runtime: 2–8 minutes for 1–5GB FASTQ</div>
              <div style={{ color: PALETTE.textDim, fontSize: 10, fontFamily: "monospace" }}>Job: {selectedJob.jobId}</div>
              <div style={{ color: PALETTE.textDim, fontSize: 10 }}>Auto-refreshing every 10 seconds...</div>
            </div>
          ) : selectedJob.status === "FAILED" ? (
            <div style={{ padding: 24 }}>
              <div style={{ color: PALETTE.red, fontSize: 16, marginBottom: 12 }}>✗ Job Failed</div>
              <div style={{ color: PALETTE.textDim, fontSize: 12 }}>Check AWS Batch console for logs: {selectedJob.jobId}</div>
            </div>
          ) : selectedJob.results ? (
            <QCResults results={selectedJob.results} />
          ) : (
            <div style={{ color: PALETTE.muted, fontSize: 12 }}>Loading results...</div>
          )}
        </div>
      </div>
    </div>
  );
}
