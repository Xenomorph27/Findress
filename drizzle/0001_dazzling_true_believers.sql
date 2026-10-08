CREATE TABLE "source_items" (
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_items_source_source_id_pk" PRIMARY KEY("source","source_id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cfp_topics" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "geocoded_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "source_items_dedupe_idx" ON "source_items" USING btree ("dedupe_key");