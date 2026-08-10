export const settingsShopLayoutView = `        <section id="settings-shop-layout" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Shop layout (moja-sites)</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshShopLayoutBtn">Refresh</button>
                <button type="button" class="btn-primary" id="saveShopLayoutBtn">Save layout</button>
              </div>
            </div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Controls the public shop site home featured products and <code>/shop</code> section groupings. Product data comes from Shopping catalog.
            </div>
            <p class="field-hint" id="shopLayoutSaveResult" style="padding:0 20px"></p>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head"><h2>Home featured products</h2></div>
            <div style="padding:12px 20px 4px 20px;color:#64748b;font-size:13px">
              Shown on the moja-sites home page “Best sellers” grid. Drag order with arrows.
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:72px">Order</th><th style="width:64px">Image</th><th>Name</th><th>Category</th><th style="width:140px">Move</th><th style="width:90px">Remove</th></tr></thead>
                <tbody id="slFeaturedSelectedBody"></tbody>
              </table>
            </div>
            <div style="padding:10px 20px">
              <input type="text" id="slFeaturedFilter" placeholder="Search catalog to add…" style="width:100%" />
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:64px">Image</th><th>Name</th><th>Category</th><th style="width:110px">Add</th></tr></thead>
                <tbody id="slFeaturedAvailableBody"></tbody>
              </table>
            </div>
          </div>

          <div class="sheet" style="margin-top:16px">
            <div class="sheet-head">
              <h2>Shop page sections</h2>
              <div class="sheet-actions"><button type="button" class="btn-outline" id="slAddSectionBtn">Add section</button></div>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th>Section ID</th><th>Title</th><th>Products</th><th style="width:160px">Actions</th></tr></thead>
                <tbody id="slSectionsBody"></tbody>
              </table>
            </div>
          </div>

          <div id="slSectionPanel" class="sheet hidden" style="margin-top:16px">
            <div class="sheet-head"><h2>Edit section</h2></div>
            <div style="padding:16px 20px;max-width:720px">
              <div class="form-row-2">
                <div class="form-section"><label for="slSectionId">Section ID (URL anchor)</label><input type="text" id="slSectionId" placeholder="premium-cake" /></div>
                <div class="form-section"><label for="slSectionTitle">Title</label><input type="text" id="slSectionTitle" /></div>
              </div>
              <div class="form-section"><label for="slSectionDesc">Description</label><textarea id="slSectionDesc"></textarea></div>
              <p class="field-hint">Changes apply when you click <strong>Save layout</strong> above.</p>
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:72px">Order</th><th style="width:64px">Image</th><th>Name</th><th style="width:140px">Move</th><th style="width:90px">Remove</th></tr></thead>
                <tbody id="slSectionSelectedBody"></tbody>
              </table>
            </div>
            <div style="padding:10px 20px">
              <input type="text" id="slSectionFilter" placeholder="Search catalog to add to this section…" style="width:100%" />
            </div>
            <div class="table-wrap">
              <table class="data">
                <thead><tr><th style="width:64px">Image</th><th>Name</th><th style="width:110px">Add</th></tr></thead>
                <tbody id="slSectionAvailableBody"></tbody>
              </table>
            </div>
          </div>
        </section>
`;
