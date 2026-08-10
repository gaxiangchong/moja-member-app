import { dashboardOverviewView } from './dashboard-overview.template';
import { dashboardActivityView } from './dashboard-activity.template';
import { dashboardEmployeesView } from './dashboard-employees.template';
import { customersListView } from './customers-list.template';
import { customerOrdersView } from './customer-orders.template';
import { customersSegmentsView } from './customers-segments.template';
import { customersMergeView } from './customers-merge.template';
import { walletBalancesView } from './wallet-balances.template';
import { walletTransactionsView } from './wallet-transactions.template';
import { walletAdjustmentView } from './wallet-adjustment.template';
import { walletRulesView } from './wallet-rules.template';
import { loyaltyBalancesView } from './loyalty-balances.template';
import { loyaltyTransactionsView } from './loyalty-transactions.template';
import { loyaltyRulesView } from './loyalty-rules.template';
import { loyaltyCampaignsView } from './loyalty-campaigns.template';
import { voucherCampaignsView } from './voucher-campaigns.template';
import { voucherRedeemView } from './voucher-redeem.template';
import { giftRewardsView } from './gift-rewards.template';
import { campaignsSegmentsView } from './campaigns-segments.template';
import { campaignsPushVoucherView } from './campaigns-push-voucher.template';
import { campaignsPushPointsView } from './campaigns-push-points.template';
import { campaignsPushWalletView } from './campaigns-push-wallet.template';
import { campaignsHistoryView } from './campaigns-history.template';
import { mailerCampaignsView } from './mailer-campaigns.template';
import { dataImportView } from './data-import.template';
import { dataExportView } from './data-export.template';
import { dataTemplatesView } from './data-templates.template';
import { dataImportHistoryView } from './data-import-history.template';
import { reportsCustomersView } from './reports-customers.template';
import { reportsSalesView } from './reports-sales.template';
import { financeOverviewView } from './finance-overview.template';
import { financeTransactionsView } from './finance-transactions.template';
import { financeDailyView } from './finance-daily.template';
import { financeSyncView } from './finance-sync.template';
import { settingsSystemView } from './settings-system.template';
import { settingsShoppingCatalogView } from './settings-shopping-catalog.template';
import { bentoOverviewView } from './bento-overview.template';
import { bentoSalesView } from './bento-sales.template';
import { bentoOperationsView } from './bento-operations.template';
import { bentoPricingView } from './bento-pricing.template';
import { bentoMenuView } from './bento-menu.template';
import { bentoVouchersView } from './bento-vouchers.template';
import { bentoOrdersView } from './bento-orders.template';
import { settingsShopLayoutView } from './settings-shop-layout.template';
import { settingsPopularItemsView } from './settings-popular-items.template';
import { settingsHomeAdsView } from './settings-home-ads.template';
import { auditView } from './audit.template';
import { auditLoginsView } from './audit-logins.template';

export const ADMIN_DASHBOARD_VIEWS = {
  'dashboard-overview': dashboardOverviewView,
  'dashboard-activity': dashboardActivityView,
  'dashboard-employees': dashboardEmployeesView,
  'customers-list': customersListView,
  'customer-orders': customerOrdersView,
  'customers-segments': customersSegmentsView,
  'customers-merge': customersMergeView,
  'wallet-balances': walletBalancesView,
  'wallet-transactions': walletTransactionsView,
  'wallet-adjustment': walletAdjustmentView,
  'wallet-rules': walletRulesView,
  'loyalty-balances': loyaltyBalancesView,
  'loyalty-transactions': loyaltyTransactionsView,
  'loyalty-rules': loyaltyRulesView,
  'loyalty-campaigns': loyaltyCampaignsView,
  'voucher-campaigns': voucherCampaignsView,
  'voucher-redeem': voucherRedeemView,
  'gift-rewards': giftRewardsView,
  'campaigns-segments': campaignsSegmentsView,
  'campaigns-push-voucher': campaignsPushVoucherView,
  'campaigns-push-points': campaignsPushPointsView,
  'campaigns-push-wallet': campaignsPushWalletView,
  'campaigns-history': campaignsHistoryView,
  'mailer-campaigns': mailerCampaignsView,
  'data-import': dataImportView,
  'data-export': dataExportView,
  'data-templates': dataTemplatesView,
  'data-import-history': dataImportHistoryView,
  'reports-customers': reportsCustomersView,
  'reports-sales': reportsSalesView,
  'finance-overview': financeOverviewView,
  'finance-transactions': financeTransactionsView,
  'finance-daily': financeDailyView,
  'finance-sync': financeSyncView,
  'settings-system': settingsSystemView,
  'settings-shopping-catalog': settingsShoppingCatalogView,
  'bento-overview': bentoOverviewView,
  'bento-sales': bentoSalesView,
  'bento-operations': bentoOperationsView,
  'bento-pricing': bentoPricingView,
  'bento-menu': bentoMenuView,
  'bento-vouchers': bentoVouchersView,
  'bento-orders': bentoOrdersView,
  'settings-shop-layout': settingsShopLayoutView,
  'settings-popular-items': settingsPopularItemsView,
  'settings-home-ads': settingsHomeAdsView,
  audit: auditView,
  'audit-logins': auditLoginsView,
} as const;

export function renderAdminDashboardViews(): string {
  const views = Object.values(ADMIN_DASHBOARD_VIEWS);
  return views
    .map((view, index) => (index < views.length - 2 ? view + '\n' : view))
    .join('');
}
