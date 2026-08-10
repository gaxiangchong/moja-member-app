export const bentoOverviewView = `        <section id="bento-overview" class="tab-panel hidden">
          <div class="sa-page">
            <div class="sa-toolbar">
              <div class="sa-toolbar-presets">
                <button type="button" class="btn-outline" id="boPreset7">Last 7 days</button>
                <button type="button" class="btn-outline" id="boPreset30">Last 30 days</button>
                <button type="button" class="btn-outline" id="boPresetMtd">Month to date</button>
              </div>
              <div class="sa-toolbar-group">
                <label for="boFrom">From (UTC)</label>
                <input type="date" id="boFrom" />
              </div>
              <div class="sa-toolbar-group">
                <label for="boTo">To (UTC, inclusive)</label>
                <input type="date" id="boTo" />
              </div>
              <div class="sa-toolbar-group">
                <label for="boBucket">Bucket</label>
                <select id="boBucket" aria-label="Time bucket">
                  <option value="day">Days</option>
                  <option value="week">Weeks</option>
                  <option value="month" selected>Months</option>
                </select>
              </div>
              <div class="sa-toolbar-actions">
                <button type="button" class="btn-primary" id="boRefreshBtn">Apply</button>
              </div>
            </div>

            <p class="field-hint" style="margin:0 0 12px" id="boScopeText">
              Marketing funnel for the Bento member app — every registered member vs how many actually paid for a meal plan. Totals are all-time; the date range below drives the "new in range" figures and the registrations-vs-payments chart.
            </p>

            <div class="sa-kpi-strip" id="boKpiStrip">
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Registered members</div>
                <div class="sa-kpi-card-value" id="boValMembers">—</div>
                <div class="sa-kpi-card-delta"><span id="boNewMembers">—</span> new in range</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Paid members</div>
                <div class="sa-kpi-card-value" id="boValPaid">—</div>
                <div class="sa-kpi-card-delta"><span id="boNewPaid">—</span> first paid in range</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Conversion rate</div>
                <div class="sa-kpi-card-value" id="boValConv">—</div>
                <div class="sa-kpi-card-delta">paid ÷ registered</div>
              </div>
              <div class="sa-kpi-card">
                <div class="sa-kpi-card-title">Bento revenue (paid)</div>
                <div class="sa-kpi-card-value" id="boValGmv">—</div>
                <div class="sa-kpi-card-delta"><span id="boPayTxns">—</span> payments total</div>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head">
                <h2>Registered vs paid</h2>
              </div>
              <div style="padding:16px 20px">
                <div id="boFunnelBar" style="max-width:680px"></div>
                <p class="field-hint" id="boFunnelHint" style="margin-top:10px">Apply a date range to load the funnel.</p>
              </div>
            </div>

            <div class="sheet" style="margin-top:16px">
              <div class="sheet-head">
                <h2>Registrations vs payments by period</h2>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr><th>Period</th><th>New registrations</th><th>Bento payments</th><th>Revenue (RM)</th></tr>
                  </thead>
                  <tbody id="boSeriesBody">
                    <tr><td colspan="4" class="muted-hint">Apply a date range to load.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>
`;
