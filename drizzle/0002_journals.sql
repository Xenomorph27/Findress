CREATE TABLE "journals" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"abbreviation" text NOT NULL,
	"publisher" text,
	"issn_print" text,
	"issn_online" text,
	"issns" text[] DEFAULT '{}'::text[] NOT NULL,
	"openalex_id" text,
	"homepage" text,
	"submission_url" text,
	"scope_url" text,
	"scope_text" text,
	"scope_hash" text,
	"scope_fetched_at" timestamp with time zone,
	"subfields" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"open_access" text,
	"apc_usd" integer,
	"h_index" integer,
	"i10_index" integer,
	"two_yr_mean_citedness" real,
	"works_count" integer,
	"cited_by_count" integer,
	"metrics_as_of" timestamp with time zone,
	"counts_by_year" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"impact_metrics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rank_core_journal" text,
	"rank_ccf" text,
	"sjr_quartile" text,
	"review_model" text,
	"avg_time_to_first_decision" text,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "special_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"journal_id" integer,
	"journal_name" text,
	"title" text NOT NULL,
	"guest_editors" text[] DEFAULT '{}'::text[] NOT NULL,
	"description_text" text,
	"submission_deadline_utc" timestamp with time zone,
	"deadline_text" text,
	"deadline_tz" text,
	"url" text,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"subfields" text[] DEFAULT '{}'::text[] NOT NULL,
	"topics" text[] DEFAULT '{}'::text[] NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookmarks" DROP CONSTRAINT "bookmarks_pkey";--> statement-breakpoint
ALTER TABLE "bookmarks" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" DROP CONSTRAINT "notes_pkey";--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "event_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "journal_id" integer;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "special_issue_id" integer;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "journal_id" integer;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "special_issue_id" integer;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "id" serial PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "journal_id" integer;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "special_issue_id" integer;--> statement-breakpoint
ALTER TABLE "special_issues" ADD CONSTRAINT "special_issues_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "journals_slug_idx" ON "journals" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "journals_subfields_idx" ON "journals" USING gin ("subfields");--> statement-breakpoint
CREATE UNIQUE INDEX "special_issues_source_idx" ON "special_issues" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "special_issues_journal_idx" ON "special_issues" USING btree ("journal_id");--> statement-breakpoint
CREATE INDEX "special_issues_deadline_idx" ON "special_issues" USING btree ("submission_deadline_utc");--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_special_issue_id_special_issues_id_fk" FOREIGN KEY ("special_issue_id") REFERENCES "public"."special_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_special_issue_id_special_issues_id_fk" FOREIGN KEY ("special_issue_id") REFERENCES "public"."special_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_journal_id_journals_id_fk" FOREIGN KEY ("journal_id") REFERENCES "public"."journals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_special_issue_id_special_issues_id_fk" FOREIGN KEY ("special_issue_id") REFERENCES "public"."special_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_event_idx" ON "bookmarks" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_journal_idx" ON "bookmarks" USING btree ("journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bookmarks_special_issue_idx" ON "bookmarks" USING btree ("special_issue_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_event_idx" ON "notes" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_journal_idx" ON "notes" USING btree ("journal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notes_special_issue_idx" ON "notes" USING btree ("special_issue_id");--> statement-breakpoint
ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_one_target" CHECK (num_nonnulls("bookmarks"."event_id", "bookmarks"."journal_id", "bookmarks"."special_issue_id") = 1);--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_one_target" CHECK (num_nonnulls("notes"."event_id", "notes"."journal_id", "notes"."special_issue_id") = 1);