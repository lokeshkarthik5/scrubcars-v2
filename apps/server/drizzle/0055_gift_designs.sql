-- Gift card designs: store the card the buyer picked.
--
-- 0049 allowed three designs ('shine', 'midnight', 'fresh'). The redesign
-- has six cards: Shine, Midnight, Pearl and three occasions (Birthday,
-- Diwali, Thank you). Until now they were saved as one of the three and the
-- occasion rode only in the link's fragment; from here the gift row holds
-- the card itself, so a new link, "Gifts you sent" and admin all show it.
--
-- Additive: the CHECK only widens. 'fresh' stays valid for rows bought
-- before this (it is drawn as Pearl); new purchases store 'pearl'. Nothing
-- is rewritten.
--
-- NUMBERING: a parallel branch (printed coupons) also took 0055; it is
-- renumbered to 0056 when the branches are lined up.

ALTER TABLE "gifts" DROP CONSTRAINT IF EXISTS "gifts_design_check";--> statement-breakpoint
ALTER TABLE "gifts" ADD CONSTRAINT "gifts_design_check"
  CHECK ("design" IN ('shine', 'midnight', 'fresh', 'pearl', 'birthday', 'diwali', 'thank_you'));
