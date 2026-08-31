CREATE TYPE "public"."entry_kind" AS ENUM('expense', 'income', 'savings');--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"kind" "entry_kind" NOT NULL,
	"method" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entries_amount_positive" CHECK ("entries"."amount_minor" > 0)
);
--> statement-breakpoint
ALTER TABLE "entries" ADD CONSTRAINT "entries_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "domains_user_name_uniq" ON "domains" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE INDEX "domains_user_idx" ON "domains" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "entries_user_date_idx" ON "entries" USING btree ("user_id","occurred_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "entries_user_domain_idx" ON "entries" USING btree ("user_id","domain_id");