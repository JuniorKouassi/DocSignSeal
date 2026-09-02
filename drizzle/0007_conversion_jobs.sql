CREATE TYPE "public"."conversion_status" AS ENUM('queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TABLE "conversion_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"source_file_id" uuid NOT NULL,
	"target_format" text NOT NULL,
	"status" "conversion_status" DEFAULT 'queued' NOT NULL,
	"result_file_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "conversion_jobs" ADD CONSTRAINT "conversion_jobs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_jobs" ADD CONSTRAINT "conversion_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_jobs" ADD CONSTRAINT "conversion_jobs_source_file_id_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversion_jobs" ADD CONSTRAINT "conversion_jobs_result_file_id_files_id_fk" FOREIGN KEY ("result_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversion_jobs_org_created_idx" ON "conversion_jobs" USING btree ("organization_id","created_at");