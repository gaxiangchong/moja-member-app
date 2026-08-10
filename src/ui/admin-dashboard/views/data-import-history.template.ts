export const dataImportHistoryView = `        <section id="data-import-history" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Import history</h2><div class="sheet-actions"><button type="button" class="btn-outline" id="refreshImportHistoryBtn">Refresh</button></div></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Created</th><th>Kind</th><th>Status</th><th>Rows</th><th>Error</th></tr></thead>
                <tbody id="importHistoryBody"></tbody>
              </table>
            </div>
          </div>
        </section>
`;
