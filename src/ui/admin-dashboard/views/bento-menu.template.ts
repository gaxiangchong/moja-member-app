export const bentoMenuView = `        <section id="bento-menu" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento weekly menu</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="bentoMenuTemplateBtn">Download template</button>
                <button type="button" class="btn-outline" id="bentoMenuImportBtn">Import file</button>
                <input type="file" id="bentoMenuImportFile" accept=".xlsx,.csv" style="display:none" />
                <button type="button" class="btn-outline" id="refreshBentoMenuBtn">Refresh</button>
                <button type="button" class="btn-primary" id="bentoMenuSaveBtn">Save menu</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">
                <div class="seg" style="display:inline-flex;gap:4px;background:#f1f5f9;padding:4px;border-radius:10px">
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="0" style="border:none">Week 1</button>
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="1" style="border:none">Week 2</button>
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="2" style="border:none">Week 3</button>
                  <button type="button" class="btn-outline bentoMenuWeekBtn" data-week="3" style="border:none">Week 4</button>
                </div>
                <span class="field-hint" id="bentoMenuWeekLabel" style="margin:0;font-weight:600"></span>
              </div>
              <p class="field-hint" style="margin-top:0">
                Week 1 is the current calendar week; Week 2–4 are the following weeks. Pick a week above to edit it in the table, or use the 4-sheet Excel template (<strong>Week 1</strong> … <strong>Week 4</strong> tabs) for bulk edit. Enter English dish names first, then Chinese (中文) below each field. Tick <strong>Closed</strong> to block scheduling on that weekday — closed days are shared across all weeks. Separate from the cake-sales catalog.
              </p>
              <p class="field-hint" style="margin-top:0;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px">
                <strong>Bulk edit:</strong> <strong>Download template</strong> gets one Excel file with four sheets (Week 1–4). Edit each sheet, then <strong>Import file</strong> — all sheets load into the matching week tabs for review. Click <strong>Save menu</strong> on each week tab to publish (or switch tabs after import to check Week 2–4 before saving).
              </p>
              <p class="field-hint" id="bentoMenuImportResult" style="margin-top:0"></p>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Day</th>
                      <th>Lunch &mdash; Vegetarian</th>
                      <th>Lunch &mdash; Regular</th>
                      <th>Dinner &mdash; Vegetarian</th>
                      <th>Dinner &mdash; Regular</th>
                      <th style="text-align:center">Closed</th>
                    </tr>
                  </thead>
                  <tbody id="bentoMenuBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="bentoMenuSaveResult"></p>
            </div>
          </div>
        </section>
`;
