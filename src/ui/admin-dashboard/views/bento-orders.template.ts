export const bentoOrdersView = `        <section id="bento-orders" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Bento kitchen orders</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="bentoOrdersPreviewBtn">Load orders</button>
                <button type="button" class="btn-primary" id="bentoOrdersExportBtn">Export Excel</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1100px">
              <p class="field-hint" style="margin-top:0">
                See who ordered, their pickup day and meals, grouped by date for kitchen prep. The <strong>Awaiting scheduling</strong> panel lists members who paid but haven't booked a pickup yet — select them and copy WhatsApp links to remind them. Excel export adds <strong>Daily</strong>, <strong>Weekly</strong>, <strong>Kitchen pack list</strong> and <strong>Awaiting scheduling</strong> sheets.
              </p>
              <div class="form-row-2" style="gap:12px;max-width:520px;margin-bottom:8px">
                <div>
                  <label for="bentoOrdersFrom">From</label>
                  <input type="date" id="bentoOrdersFrom" />
                </div>
                <div>
                  <label for="bentoOrdersTo">To</label>
                  <input type="date" id="bentoOrdersTo" />
                </div>
              </div>
              <p class="field-hint" id="bentoOrdersExportResult"></p>

              <div id="bentoOrdersSummary" class="bento-orders-summary" style="display:none"></div>

              <h3 style="margin:18px 0 6px">Scheduled pickups</h3>
              <p class="field-hint" style="margin-top:0">Grouped by pickup date. Each row is one member's meal for that day.</p>
              <div id="bentoOrdersScheduled">
                <p class="muted-hint" style="padding:8px 0">Click <strong>Load orders</strong> to see scheduled pickups.</p>
              </div>

              <div class="bento-await-head" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:26px 0 6px">
                <div>
                  <h3 style="margin:0">Awaiting scheduling <span id="bentoAwaitCount" class="bento-await-badge">0</span></h3>
                  <p class="field-hint" style="margin:2px 0 0">Paid members who haven't booked a pickup day. Use <strong>Schedule</strong> to book pickups on their behalf, or select people to chase and copy WhatsApp links / phone numbers.</p>
                </div>
                <div class="sheet-actions" style="flex-wrap:wrap">
                  <button type="button" class="btn-outline" id="bentoAwaitCopyWa" disabled>Copy WhatsApp links</button>
                  <button type="button" class="btn-outline" id="bentoAwaitCopyPhones" disabled>Copy phone numbers</button>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th style="width:34px"><input type="checkbox" id="bentoAwaitSelectAll" aria-label="Select all awaiting members" /></th>
                      <th>Customer</th>
                      <th>Phone</th>
                      <th>Pickup ID</th>
                      <th>Package</th>
                      <th>Meals</th>
                      <th>Credits</th>
                      <th>Purchased</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody id="bentoAwaitBody">
                    <tr><td colspan="9" class="muted-hint">Click Load orders to see who's awaiting scheduling.</td></tr>
                  </tbody>
                </table>
              </div>
              <p class="field-hint" id="bentoAwaitCopyResult"></p>
            </div>
          </div>
        </section>
`;
