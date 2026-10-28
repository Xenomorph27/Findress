CREATE TABLE "ingest_lease" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "cfp_facts" jsonb;