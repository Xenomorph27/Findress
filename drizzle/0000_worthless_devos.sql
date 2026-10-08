CREATE TABLE "acceptance_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_acronym" text NOT NULL,
	"year" integer NOT NULL,
	"submitted" integer,
	"accepted" integer,
	"rate" real,
	"source_url" text,
	"source" text DEFAULT 'ccfddl' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookmarks" (
	"event_id" integer PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'interested' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scope" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"scope" text NOT NULL,
	"messages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deadlines" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"kind" text NOT NULL,
	"label" text,
	"due_at_utc" timestamp with time zone NOT NULL,
	"original_tz" text,
	"original_text" text,
	"comment" text,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_sources" (
	"event_id" integer NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"url" text,
	"fields_provided" text[] DEFAULT '{}'::text[] NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_sources_event_id_source_source_id_pk" PRIMARY KEY("event_id","source","source_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"series_key" text NOT NULL,
	"acronym" text NOT NULL,
	"name" text,
	"year" integer NOT NULL,
	"type" text DEFAULT 'conference' NOT NULL,
	"parent_event_id" integer,
	"parent_key" text,
	"subfields" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"rank_core" text,
	"rank_ccf" text,
	"mode" text,
	"location_raw" text,
	"venue" text,
	"city" text,
	"country" text,
	"country_code" text,
	"continent" text,
	"lat" double precision,
	"lng" double precision,
	"start_date" date,
	"end_date" date,
	"date_text" text,
	"website" text,
	"description" text,
	"submission_site" text,
	"page_limit" text,
	"review_type" text,
	"has_rebuttal" boolean,
	"cfp_text" text,
	"cfp_hash" text,
	"cfp_url" text,
	"cfp_fetched_at" timestamp with time zone,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"next_deadline_at" timestamp with time zone,
	"next_deadline_kind" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"search_vector" "tsvector"
);
--> statement-breakpoint
CREATE TABLE "geocode_cache" (
	"query" text PRIMARY KEY NOT NULL,
	"ok" boolean NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"city" text,
	"country" text,
	"country_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "http_cache" (
	"url" text PRIMARY KEY NOT NULL,
	"status" integer NOT NULL,
	"body" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"event_id" integer PRIMARY KEY NOT NULL,
	"body_md" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "source_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"items" integer DEFAULT 0 NOT NULL,
	"error" text,
	"stats" jsonb
);
--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadlines" ADD CONSTRAINT "deadlines_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_parent_event_id_events_id_fk" FOREIGN KEY ("parent_event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "acceptance_series_year_idx" ON "acceptance_stats" USING btree ("event_acronym","year");--> statement-breakpoint
CREATE INDEX "chat_usage_created_idx" ON "chat_usage" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chats_scope_idx" ON "chats" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "deadlines_event_idx" ON "deadlines" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "deadlines_due_idx" ON "deadlines" USING btree ("due_at_utc");--> statement-breakpoint
CREATE UNIQUE INDEX "events_slug_idx" ON "events" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "events_dedupe_key_idx" ON "events" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "events_series_idx" ON "events" USING btree ("series_key");--> statement-breakpoint
CREATE INDEX "events_parent_idx" ON "events" USING btree ("parent_event_id");--> statement-breakpoint
CREATE INDEX "events_next_deadline_idx" ON "events" USING btree ("next_deadline_at");--> statement-breakpoint
CREATE INDEX "events_start_idx" ON "events" USING btree ("start_date");--> statement-breakpoint
CREATE INDEX "events_search_idx" ON "events" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "events_subfields_idx" ON "events" USING gin ("subfields");--> statement-breakpoint
CREATE INDEX "source_runs_source_idx" ON "source_runs" USING btree ("source","started_at");