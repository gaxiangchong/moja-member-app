export const dataImportView = `        <section id="data-import" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Import data</h2></div>
            <div class="coming-soon">
              Guided import wizard is pending. Backend is live via <code>POST /admin/import/preview/:kind</code> then <code>POST /admin/import/batches/:batchId/commit</code>. Recommended control pattern: template download, validation preview, explicit commit.
            </div>
          </div>
        </section>
`;
