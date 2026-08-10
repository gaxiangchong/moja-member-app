export const walletBalancesView = `        <section id="wallet-balances" class="tab-panel hidden">
          <div class="kpi-panel" style="margin-top:0">
            <h2>Wallet summary</h2>
            <div class="kpi-row">
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg></div>
                <div><div class="kpi-label">Members (total)</div><div class="kpi-value" id="wbMembers">-</div></div>
              </div>
              <div class="kpi">
                <div class="kpi-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/></svg></div>
                <div><div class="kpi-label">Wallet top-ups (sum)</div><div class="kpi-value" id="wbTopUp">-</div></div>
              </div>
            </div>
          </div>
          <div class="sheet">
            <div class="sheet-head"><h2>Per-member balances</h2></div>
            <div class="muted-box">Detailed stored-wallet balances per member will use <code>GET /admin/customers/:id/wallet</code> from the profile or list actions in a later iteration.</div>
          </div>
        </section>
`;
