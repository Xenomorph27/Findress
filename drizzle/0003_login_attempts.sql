CREATE TABLE "login_attempts" (
	"ip" text PRIMARY KEY NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"last_failure_at" timestamp with time zone,
	"locked_until" timestamp with time zone
);
