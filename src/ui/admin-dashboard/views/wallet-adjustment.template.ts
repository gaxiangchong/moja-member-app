export const walletAdjustmentView = `        <section id="wallet-adjustment" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head"><h2>Manual wallet adjustment</h2></div>
            <div style="padding:16px 20px;max-width:480px">
              <div class="form-section">
                <label for="waCustomerId">Customer ID</label>
                <input type="text" id="waCustomerId" placeholder="UUID" />
              </div>
              <div class="form-section">
                <label for="waType">Transaction type</label>
                <select id="waType">
                  <option value="MANUAL_ADJUSTMENT">MANUAL_ADJUSTMENT</option>
                  <option value="TOPUP">TOPUP</option>
                  <option value="PROMOTIONAL_BONUS">PROMOTIONAL_BONUS</option>
                  <option value="REFUND">REFUND</option>
                  <option value="SPEND">SPEND (negative cents)</option>
                </select>
              </div>
              <div class="form-section">
                <label for="waAmount">Amount (cents)</label>
                <input type="number" id="waAmount" step="1" />
              </div>
              <div class="form-section">
                <label for="waReason">Reason</label>
                <input type="text" id="waReason" maxlength="300" placeholder="Shown on ledger" />
              </div>
              <div class="form-section">
                <label for="waCampaign">Campaign code (optional)</label>
                <input type="text" id="waCampaign" maxlength="200" />
              </div>
              <button type="button" class="btn-primary" id="waSubmitBtn">Post adjustment</button>
              <p class="field-hint" id="waResult" style="margin-top:12px"></p>
            </div>
          </div>
        </section>
`;
