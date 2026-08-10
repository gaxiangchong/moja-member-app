export const giftRewardsView = `        <section id="gift-rewards" class="tab-panel hidden">
          <div class="sheet">
            <div class="sheet-head">
              <h2>Gift rewards</h2>
              <div class="sheet-actions">
                <button type="button" class="btn-outline" id="refreshGiftRewardsBtn">Refresh</button>
              </div>
            </div>
            <div style="padding:12px 20px;max-width:1040px">
              <p class="field-hint" style="margin-top:0">
                Gift rewards let members spend their points. Create a reward, set the points cost, and link it to a voucher campaign. When a member redeems, the linked voucher lands in their wallet automatically.
              </p>
              <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-bottom:16px">
                <h3 style="margin:0 0 10px;font-size:14px">New reward</h3>
                <div class="form-row-2" style="gap:12px;max-width:680px">
                  <div>
                    <label for="grName">Reward name</label>
                    <input type="text" id="grName" placeholder="e.g. RM10 voucher (100 pts)" />
                  </div>
                  <div>
                    <label for="grPoints">Points cost</label>
                    <input type="text" id="grPoints" inputmode="numeric" placeholder="100" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:12px;max-width:680px;margin-top:8px">
                  <div>
                    <label for="grType">Reward type</label>
                    <select id="grType">
                      <option value="DISCOUNT_VOUCHER">Discount voucher</option>
                      <option value="FREE_ITEM">Free item</option>
                    </select>
                  </div>
                  <div id="grCampaignWrap">
                    <label for="grCampaign">Linked voucher campaign</label>
                    <select id="grCampaign"><option value="">&mdash; select a campaign &mdash;</option></select>
                  </div>
                </div>
                <div style="margin-top:8px;max-width:680px">
                  <label for="grTnc">Terms (optional)</label>
                  <input type="text" id="grTnc" placeholder="Shown to members" />
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="grCreateBtn">Create reward</button>
                  <span class="field-hint" id="grCreateResult" style="margin:0"></span>
                </div>
              </div>
              <div class="table-wrap">
                <table class="data">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Points</th>
                      <th>Type</th>
                      <th>Linked voucher</th>
                      <th style="text-align:center">Active</th>
                      <th style="text-align:center">Actions</th>
                    </tr>
                  </thead>
                  <tbody id="giftRewardsBody"></tbody>
                </table>
              </div>
              <p class="field-hint" id="giftRewardsListResult"></p>

              <div id="grEditPanel" style="display:none;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 16px;margin-top:14px">
                <h3 style="margin:0 0 10px;font-size:14px">Edit reward</h3>
                <input type="hidden" id="grEditId" />
                <div class="form-row-2" style="gap:12px;max-width:680px">
                  <div>
                    <label for="grEditName">Reward name</label>
                    <input type="text" id="grEditName" />
                  </div>
                  <div>
                    <label for="grEditPoints">Points cost</label>
                    <input type="text" id="grEditPoints" inputmode="numeric" />
                  </div>
                </div>
                <div class="form-row-2" style="gap:12px;max-width:680px;margin-top:8px">
                  <div>
                    <label for="grEditActive">Status</label>
                    <select id="grEditActive">
                      <option value="true">Active</option>
                      <option value="false">Hidden</option>
                    </select>
                  </div>
                  <div>
                    <label for="grEditCampaign">Linked voucher campaign</label>
                    <select id="grEditCampaign"><option value="">&mdash; select a campaign &mdash;</option></select>
                  </div>
                </div>
                <div style="margin-top:8px;max-width:680px">
                  <label for="grEditTnc">Terms (optional)</label>
                  <input type="text" id="grEditTnc" />
                </div>
                <div style="margin-top:12px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
                  <button type="button" class="btn-primary" id="grEditSaveBtn">Save changes</button>
                  <button type="button" class="btn-outline" id="grEditCancelBtn">Cancel</button>
                  <span class="field-hint" id="grEditResult" style="margin:0"></span>
                </div>
              </div>
            </div>
          </div>
        </section>
`;
