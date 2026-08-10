export const reportsCustomersView = `        <section id="reports-customers" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Customer reports</h2>
            <div class="kpi-row">
              <div class="kpi"><div class="kpi-label">Total members</div><div class="kpi-value" id="rpMembers">-</div></div>
              <div class="kpi"><div class="kpi-label">Inactive members</div><div class="kpi-value" id="rpInactive">-</div></div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Acquisition by source</h2></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Source</th><th>Count</th></tr></thead>
                <tbody id="reportSourceBody"></tbody>
              </table>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Marketing &amp; advocacy (30 days)</h2></div>
            <p class="muted-hint" style="margin:0 20px 8px">Same signals as the dashboard overview: signups trend, top spenders, referrers, and best-selling SKUs from stored member orders.</p>
            <div class="mk-grid">
              <div class="mk-chart-wrap mk-span-2">
                <div class="mk-chart-title">New members per day (UTC) — stacked: referral vs direct</div>
                <div class="mk-legend" aria-hidden="true">
                  <span class="mk-legend-item"><span class="mk-swatch org"></span> Direct / other</span>
                  <span class="mk-legend-item"><span class="mk-swatch ref"></span> Joined via referral</span>
                </div>
                <div class="mk-chart mk-chart-signups" id="mkRpSignupBars" aria-label="Signups stacked chart reports"></div>
              </div>
              <div class="mk-chart-wrap mk-span-2">
                <div class="mk-spender-head">
                  <div class="mk-chart-title" style="margin:0">Top spenders (order totals)</div>
                  <div>
                    <label for="mkRpSpenderPeriod" class="muted-hint" style="margin-right:8px;font-size:12px">Period</label>
                    <select id="mkRpSpenderPeriod" aria-label="Top spenders period reports">
                      <option value="day">Today (UTC)</option>
                      <option value="month">This month (UTC)</option>
                      <option value="year">This year (UTC)</option>
                      <option value="all">All time</option>
                    </select>
                  </div>
                </div>
                <p class="field-hint" style="margin:0 0 8px">Ranked by sum of stored member-app orders in the selected window.</p>
                <div id="mkRpSpenderBars" class="mk-hbar-panel" aria-label="Top spenders chart reports"></div>
                <table class="data mk-mini-table"><thead><tr><th>Member</th><th>Spent</th></tr></thead><tbody id="mkRpSpenderPeriodBody"></tbody></table>
              </div>
              <div>
                <div class="mk-chart-title">Top referrers</div>
                <table class="data mk-mini-table"><thead><tr><th>Member</th><th>Referrals</th></tr></thead><tbody id="mkRpTopReferrersBody"></tbody></table>
              </div>
              <div>
                <div class="mk-chart-title">Top products (30d qty)</div>
                <table class="data mk-mini-table"><thead><tr><th>Product</th><th>Qty</th></tr></thead><tbody id="mkRpTopProductsBody"></tbody></table>
              </div>
            </div>
          </div>
        </section>
`;
