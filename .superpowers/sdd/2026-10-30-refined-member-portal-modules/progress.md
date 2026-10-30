# SDD ledger — plan: docs/superpowers/plans/2026-10-30-refined-member-portal-modules.md

Pre-flight: no shared interfaces conflicts detected.

Task 1: completed
- database.sql updated with gold balances, shop_products stock/points_reward, and settings seeds.
- api/index.php ensureTablesExist updated with column migrations and default settings.
- scratch/test_schema_expansion.cjs verified 100% PASS.

Task 2: completed
- api/index.php get_asset_data returns dual Perak & Emas datasets with separated liquid, savings, and contract balances, plus 7-day price chart history and minting fees.
- buy_silver_asset and buy_gold_asset calculate shortfall on insufficient balance for one-click deposit.
- sell_silver_asset and sell_gold_asset strictly bounded by liquid balances.
- admin_save_asset_prices updates dual asset prices, minting fees, and chart history.
- admin_save_shop_product and admin_delete_shop_product enable full Toko Online product CRUD.
- order_shop_product deducts stock and awards +10 points reward to user points balance.
- scratch/test_backend_modules.cjs verified 100% PASS.

Task 3: completed
- Dual Asset tab switcher (Tab Perak & Tab Emas) with metallic styling and 3D realistic SVG bullion illustrations.
- Rincian Likuiditas Portofolio clearly segregates Saldo Siap Jual (Likuid), Saldo Tabungan Fisik, and Saldo Kontrak Aktif.
- Interactive SVG price trend charts with 7-day historical prices and high/low stats.
- Buy modal with realtime wallet balance check and one-click deposit shortcut with exact shortfall.
- Sell modal strictly bounded by liquid balance with "Jual Semua" helper.
- Dynamic minting fee in Cetak Fisik modal.
- Strict member access gate enforcing authentication on boot.
- scratch/test_aset_page.cjs verified 100% PASS.

Task 4: completed
- toko.html rebranded completely to Toko Online.
- Product cards support dynamic image_url rendering with high-quality fallback icons.
- Added stock badge and out-of-stock validation disabling checkout when stock <= 0.
- Added "+10 Poin Reward" tags and awarded points confirmation dialog.
- Strict member access gate enforcing authentication on boot.
- scratch/test_toko_page.cjs verified 100% PASS.

Task 5: in_progress
