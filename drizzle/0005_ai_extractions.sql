CREATE TABLE "extractions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"field" text NOT NULL,
	"kind" text,
	"label" text,
	"value" text,
	"due_at_utc" timestamp with time zone,
	"original_text" text,
	"original_tz" text,
	"zone_assumed" boolean DEFAULT false NOT NULL,
	"quote" text NOT NULL,
	"source_url" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"extracted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ai_extracted_hash" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "ai_extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "extractions" ADD CONSTRAINT "extractions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extractions_event_idx" ON "extractions" USING btree ("event_id","field");