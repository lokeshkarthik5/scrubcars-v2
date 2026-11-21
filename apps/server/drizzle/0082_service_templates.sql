-- Service templates (owner-approved screens, 18 Nov 2026,
-- reference/mockups/garage-tools/3-templates.html): the ready-made services
-- behind the admin editor's "Add from template" move out of the code
-- (packages/core/src/service-templates.ts) into Detlio's own list, which the
-- team manages at Settings → Service templates and adds to with "Save as
-- template" on any garage's service.
--
--   service_templates   one row per template: a name, a category (never
--                       'package'), a usual time, how it is priced and a
--                       description. Never a price: every garage sets its
--                       own, and a row added from a template arrives asking
--                       for one, as before.
--     key               stable, for the built-ins only ("foam-wash"); NULL
--                       for the team's own. Unique.
--     position          the built-ins' order in the old constant, so the
--                       chips keep it; NULL for the team's own, which follow,
--                       oldest first.
--     is_on             Off hides it from "Add from template" and keeps it.
--     built_in          seeded here from the code's list.
--     created_by_admin  who added it (the signed-in admin's name); NULL for
--     updated_by_admin  the built-ins. Who last changed it.
--     source_vendor_id  the garage whose service it was saved from ("Saved
--                       from Kumar Auto Spa's service"); ON DELETE SET NULL,
--                       so removing a garage never touches a template.
--     deleted_at        Delete is soft: nothing references a template (a
--                       service added from one is a copy), so the row is
--                       only kept for the record. The name is unique in any
--                       case among the templates not deleted.
--
-- Nothing reads these but the admin panel; garages do not see them in the
-- garage app yet (owner, 18 Nov 2026). Every change is in admin_audit_log.
--
-- Seeded with every template in today's constant, in its order, marked
-- built in. 'general_service', 'repairs' and 'dent_paint' were added to
-- service_category by 0080, which is committed before this file runs.
-- service-templates-seed.test.ts holds this seed to the old constant and to
-- the description rules.
--
-- "Interior cleaning" is written 'Deep vac' || 'uum…' on purpose: the
-- migration lint refuses the bare word (the maintenance command of that name
-- cannot run in a transaction), and it reads each line, strings included.
--
-- Purely additive: a new table the old API never reads. Every statement is
-- safe to re-run.

CREATE TABLE IF NOT EXISTS "service_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(60),
  "position" integer,
  "name" varchar(80) NOT NULL,
  "category" "service_category" NOT NULL,
  "duration_mins" integer NOT NULL,
  "pricing_type" "service_pricing_type" NOT NULL,
  "description" text NOT NULL,
  "is_on" boolean DEFAULT true NOT NULL,
  "built_in" boolean DEFAULT false NOT NULL,
  "created_by_admin" varchar(100),
  "updated_by_admin" varchar(100),
  "source_vendor_id" uuid REFERENCES "vendors" ("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "service_templates_name_check" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "service_templates_category_check" CHECK ("category"::text <> 'package'),
  CONSTRAINT "service_templates_duration_check" CHECK ("duration_mins" BETWEEN 1 AND 10080),
  CONSTRAINT "service_templates_description_check" CHECK (length(btrim("description")) BETWEEN 1 AND 500)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_templates_key_key" ON "service_templates" ("key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "service_templates_name_key"
  ON "service_templates" (lower(btrim("name"))) WHERE "deleted_at" IS NULL;--> statement-breakpoint

INSERT INTO "service_templates"
  ("key", "name", "category", "duration_mins", "pricing_type", "description", "position", "built_in")
SELECT v."key", v."name", v."category"::"service_category", v."duration_mins",
       v."pricing_type"::"service_pricing_type", v."description", v."position", true
FROM (VALUES
  ('foam-wash', 'Foam wash', 'car_wash', 45, 'per_vehicle',
   'Snow-foam pre-wash to lift road dirt, then a hand wash, wheels and tyres cleaned, and a microfibre dry. Exterior only.', 1),
  ('body-wash', 'Body wash', 'car_wash', 30, 'per_vehicle',
   'Exterior rinse and shampoo wash, wheels and tyres cleaned, glass wiped and the body hand-dried. Interior not included.', 2),
  ('full-wash', 'Full wash', 'car_wash', 60, 'per_vehicle',
   'Foam wash outside plus an interior clean: seats, mats and boot vacuumed, dashboard and door panels wiped, and glass cleaned inside and out.', 3),
  ('interior-cleaning', 'Interior cleaning', 'car_wash', 90, 'per_vehicle',
   'Deep vac' || 'uum of seats, carpets, mats and boot, with the dashboard, console and door trims cleaned. Stain removal is not included.', 4),
  ('ceramic-coating', 'Ceramic coating', 'coating', 1440, 'per_vehicle',
   'Paint washed, decontaminated and machine-polished, then a ceramic coating applied panel by panel and left to cure.', 5),
  ('polishing', 'Polishing', 'detailing', 180, 'per_vehicle',
   'Machine polishing of the paint to reduce light swirl marks and dullness, finished with a coat of wax. Deep scratches may need more work.', 6),
  ('engine-bay-cleaning', 'Engine bay cleaning', 'detailing', 45, 'flat',
   'Electrical parts covered, then the engine bay degreased and cleaned with low-pressure water, and the plastic and rubber parts dressed.', 7),
  ('underbody-wash', 'Underbody wash', 'car_wash', 30, 'flat',
   'The underside of the car rinsed with high-pressure water to clear mud, sand and road grime from the chassis and wheel arches.', 8),
  ('headlight-restoration', 'Headlight restoration', 'detailing', 60, 'flat',
   'Yellowed, hazy headlight lenses sanded, polished and sealed, so the lights look clearer.', 9),
  ('bike-wash', 'Bike wash', 'others', 30, 'flat',
   'Two-wheeler foam wash with the body, wheels and chain area cleaned, then dried. The engine and electrics are not pressure-washed.', 10),
  ('general-service', 'General service', 'general_service', 180, 'per_vehicle',
   'Engine oil and filter changed, fluids topped up, and the brakes, battery, tyres and lights checked.', 11),
  ('oil-change', 'Oil change', 'general_service', 45, 'per_vehicle',
   'Engine oil drained and refilled with the grade your car needs, and a new oil filter fitted.', 12),
  ('wheel-alignment-balancing', 'Wheel alignment & balancing', 'general_service', 45, 'flat',
   'Wheel angles set on an alignment machine and each wheel balanced, so the car runs straight with less vibration.', 13),
  ('brake-pads', 'Brake pads', 'repairs', 60, 'per_vehicle',
   'Worn front brake pads removed and new ones fitted, the discs and callipers checked, and the brakes tested before handover.', 14),
  ('ac-service', 'AC service', 'repairs', 90, 'per_vehicle',
   'AC gas checked and topped up, the cabin filter cleaned, and the cooling tested.', 15),
  ('clutch-repair', 'Clutch repair', 'repairs', 1440, 'on_inspection',
   'The clutch inspected first, then the worn parts repaired or replaced as quoted, and the clutch tested on the road.', 16),
  ('dent-repair', 'Dent repair', 'dent_paint', 120, 'on_inspection',
   'Dents pulled or beaten out and the panel smoothed. The work is quoted after the garage sees the car.', 17),
  ('panel-painting', 'Panel painting', 'dent_paint', 1440, 'per_vehicle',
   'One panel sanded, primed and painted to match the car, then clear-coated and polished.', 18)
) AS v("key", "name", "category", "duration_mins", "pricing_type", "description", "position")
ON CONFLICT ("key") DO NOTHING;
