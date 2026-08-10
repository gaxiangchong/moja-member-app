export const loyaltyBalancesView = `        <section id="loyalty-balances" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Points summary</h2>
            <div class="kpi-row">
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg></div>
                <div><div class="kpi-label">Points issued (+)</div><div class="kpi-value" id="lbPtsIssued">-</div></div>
              </div>
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/></svg></div>
                <div><div class="kpi-label">Points redeemed (−)</div><div class="kpi-value" id="lbPtsRedeemed">-</div></div>
              </div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Per-member points</h2></div>
            <div class="muted-box">Member points appear in the customer list. Full balance drill-down: <code>GET /admin/customers/:id</code>.</div>
          </div>
        </section>
`;
