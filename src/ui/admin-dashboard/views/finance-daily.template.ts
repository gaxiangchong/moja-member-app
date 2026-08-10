export const financeDailyView = `        <section id="finance-daily" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-export-block sa-panel" style="margin-top:0">
              <div class="sa-export-head">
                <h3>Daily close — all channels</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">UTC business day · close books when reconciled</span>
              </div>
              <div style="padding:12px 16px;display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">
                <div class="form-section" style="margin:0">
                  <label for="fdDate">Business date (UTC)</label>
                  <input type="date" id="fdDate" />
                </div>
                <button type="button" class="btn-primary" id="fdLoadBtn">Load day</button>
                <span id="fdClosedBadge" class="muted-hint" style="margin:0"></span>
                <button type="button" class="btn-outline" id="fdCloseBtn">Close day</button>
              </div>
              <div class="sa-kpi-strip" style="padding:0 16px 12px">
                <div class="sa-kpi-card is-active">
                  <div class="sa-kpi-card-title">All channels</div>
                  <div class="sa-kpi-card-value" id="fdValTotal">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountTotal">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">In-store POS</div>
                  <div class="sa-kpi-card-value" id="fdValPos">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountPos">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Online shop</div>
                  <div class="sa-kpi-card-value" id="fdValOnline">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountOnline">—</div>
                </div>
                <div class="sa-kpi-card">
                  <div class="sa-kpi-card-title">Bento</div>
                  <div class="sa-kpi-card-value" id="fdValBento">—</div>
                  <div class="sa-kpi-card-delta" id="fdCountBento">—</div>
                </div>
              </div>
              <div class="sa-export-head" style="border-top:1px solid rgba(148,163,184,0.15)">
                <h3 style="font-size:14px">Online shop items (completed orders)</h3>
                <span class="muted-hint" style="width:auto;margin:0;font-size:12px">POS item detail lives in SalesPlay receipts</span>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Product</th><th>SKU</th><th>Qty</th><th>Revenue</th></tr></thead>
                  <tbody id="fdItemsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="fdResult" style="padding:0 16px 16px;margin:0"></p>
            </div>
          </div>
        </section>
`;
