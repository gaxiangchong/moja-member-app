export const financeTransactionsView = `        <section id="finance-transactions" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-group">
                <label for="ftFrom">From (UTC)</label>
                <input type="date" id="ftFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="ftTo">To (UTC, inclusive)</label>
                <input type="date" id="ftTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="ftChannel">Channel</label>
                <select id="ftChannel" aria-label="Channel filter">
                  <option value="" selected>All channels</option>
                  <option value="pos">In-store POS</option>
                  <option value="online_shop">Online shop</option>
                  <option value="bento">Bento</option>
                </select>
              </div>
              <div class="sa-toolbar-group">
                <label for="ftMinRm">Min amount (RM)</label>
                <input type="number" id="ftMinRm" min="0" step="0.01" placeholder="—" style="width:110px" />
              </div>
              <div class="sa-toolbar-group">
                <label for="ftMaxRm">Max amount (RM)</label>
                <input type="number" id="ftMaxRm" min="0" step="0.01" placeholder="—" style="width:110px" />
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="ftRefreshBtn">Apply</button>
                <button type="button" class="btn-outline" id="ftExportCsv">Export CSV</button>
              </div>
            </div>

            <p class="sa-substats" id="ftSummary"><strong>Filtered total:</strong> — </p>

            <div class="sa-export-block sa-panel">
              <div class="table-wrap">
                <table class="data">
                  <thead><tr><th>Channel</th><th>Date / time (UTC)</th><th>Amount</th><th>Payment</th><th>Ref</th><th>Customer</th><th>Phone</th></tr></thead>
                  <tbody id="ftBody"></tbody>
                </table>
              </div>
              <div style="display:flex;align-items:center;gap:12px;padding:12px 16px">
                <button type="button" class="btn-outline" id="ftPrevBtn">‹ Prev</button>
                <span class="muted-hint" style="margin:0;width:auto" id="ftPageInfo">—</span>
                <button type="button" class="btn-outline" id="ftNextBtn">Next ›</button>
              </div>
            </div>
          </div>
        </section>
`;
