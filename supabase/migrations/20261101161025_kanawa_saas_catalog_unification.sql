-- Compatibility migration retained for the deployed migration history.
-- The source-controlled baseline 20261101160853 creates the unified catalog directly
-- against ks_saas_plans and ks_subscriptions, so no second plan or subscription table
-- is introduced on a clean installation.
select 1;