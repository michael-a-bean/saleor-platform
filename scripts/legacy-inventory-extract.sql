-- Extract inventory from Shuffle & Cut (S&C) database for import into Saleor.
--
-- Database: sncadmin_sacdata (MySQL 5.0)
-- Run via phpMyAdmin or mysql CLI, export as CSV.
--
-- This query joins cards → card_prices → card_edition → card_condition
-- to produce one row per card × condition × foil with stock per warehouse.
--
-- Key fields:
--   bbid         = BrainBurst ID = TCGPlayer product ID (verified offset=0
--                  for all sets 5ED through 10E; LRW has slight drift)
--   cnumber      = Collector number (only ~14% populated in S&C, concentrated
--                  in sets from 9ED/MRD/CHK era)
--   card_id      = S&C internal card PK (cards.id)
--   usccode      = S&C internal SKU (not useful for external matching)
--
-- Feed the CSV output into: scripts/legacy-inventory-transform.py --enrich

SELECT
    c.name AS card_name,
    e.edition_nick AS set_code,
    c.cnumber AS collector_number,
    c.bbid,
    cc.condition_nick,
    cp.foil,
    cp.stock,
    cp.stock_frank,
    cp.stock_rc,
    cp.price_buy AS buy_price,
    c.id AS card_id,
    cp.usccode
FROM card_prices cp
JOIN cards c ON cp.card_id = c.id
JOIN card_edition e ON c.edition = e.edition_id
JOIN card_condition cc ON cp.condition = cc.condition_id
WHERE c.game = 1
    AND (cp.stock > 0 OR cp.stock_frank > 0 OR cp.stock_rc > 0)
ORDER BY c.name, e.edition_nick;
