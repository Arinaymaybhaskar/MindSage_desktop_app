import ExportSettings from "../components/settings/ExportSettings";

// The standalone route Settings used to link to. It shows the same import and
// export panels, so old links keep working.
const DataExportPage = () => (
  <div className="max-w-3xl mx-auto px-4 py-8">
    <ExportSettings />
  </div>
);

export default DataExportPage;
