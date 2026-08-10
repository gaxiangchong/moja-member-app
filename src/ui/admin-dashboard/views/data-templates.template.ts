export const dataTemplatesView = `        <section id="data-templates" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Template downloads</h2></div>
            <div style="padding:16px 20px">
              <p class="muted-hint" style="margin-top:0">Templates are downloaded through authenticated API calls to avoid exposing data tooling without authorization.</p>
              <div class="sheet-actions" style="display:flex;gap:8px;flex-wrap:wrap">
                <button type="button" class="btn-outline template-dl-btn" data-kind="CUSTOMER_MASTER">Customers template</button>
                <button type="button" class="btn-outline template-dl-btn" data-kind="WALLET_ADJUSTMENT">Wallet adjustments template</button>
                <button type="button" class="btn-outline template-dl-btn" data-kind="LOYALTY_ADJUSTMENT">Loyalty adjustments template</button>
                <button type="button" class="btn-outline template-dl-btn" data-kind="VOUCHER_ASSIGNMENT">Voucher assignments template</button>
              </div>
              <p class="field-hint" id="templateDownloadStatus" style="margin-top:12px"></p>
            </div>
          </div>
        </section>
`;
