export const settingsPopularItemsView = `        <section id="settings-popular-items" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Popular items</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshPopularBtn">Refresh</button>
                <button type="button" class="btn-primary" id="savePopularBtn">Save</button>
              </div>
            </div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Pick up to <strong id="popularMaxHint">5</strong> shop catalog items to feature on the member home screen. Drag the numbered order or use the arrows to reorder.
            </div>
            <div style="padding:12px 20px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">
              <div class="form-section" style="margin:0">
                <label for="popularMax">Maximum items shown</label>
                <input type="number" id="popularMax" min="1" max="5" step="1" value="5" style="width:120px" />
              </div>
              <p class="field-hint" id="popularSaveResult" style="margin:0"></p>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Selected items</h2></div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:72px">Order</th><th style="width:64px">Image</th><th>Name</th><th>Category</th><th>Price</th><th style="width:140px">Move</th><th style="width:90px">Remove</th></tr></thead>
                <tbody id="popularSelectedBody"></tbody>
              </table>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Available catalog items</h2></div>
            <div style="padding:10px 20px">
              <input type="text" id="popularFilter" placeholder="Search by name or category…" style="width:100%" />
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:64px">Image</th><th>Name</th><th>Category</th><th>Price</th><th style="width:110px">Add</th></tr></thead>
                <tbody id="popularAvailableBody"></tbody>
              </table>
            </div>
          </div>
        </section>
`;
