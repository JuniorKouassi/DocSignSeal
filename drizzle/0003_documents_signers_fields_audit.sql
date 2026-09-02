CREATE TYPE "public"."document_routing" AS ENUM('sequential', 'parallel');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('draft', 'sent', 'in_progress', 'completed', 'declined', 'voided', 'expired');--> statement-breakpoint
CREATE TYPE "public"."signer_auth_method" AS ENUM('link_only', 'email_otp', 'sms_otp', 'password', 'qes');--> statement-breakpoint
CREATE TYPE "public"."signer_status" AS ENUM('pending', 'viewed', 'signed', 'declined');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"signer_id" uuid,
	"event" text NOT NULL,
	"actor" text,
	"ip" "inet",
	"user_agent" text,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"signer_id" uuid NOT NULL,
	"page" integer NOT NULL,
	"x" numeric(6, 3) NOT NULL,
	"y" numeric(6, 3) NOT NULL,
	"w" numeric(6, 3) NOT NULL,
	"h" numeric(6, 3) NOT NULL,
	"type" "field_type" NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"value_text" text,
	"value_file_id" uuid,
	"signed_at" timestamp with time zone,
	"stroke_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "document_signers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"order_index" integer NOT NULL,
	"name" text NOT NULL,
	"email" "citext" NOT NULL,
	"phone" text,
	"role_label" text NOT NULL,
	"token_hash" text,
	"auth_method" "signer_auth_method" DEFAULT 'link_only' NOT NULL,
	"status" "signer_status" DEFAULT 'pending' NOT NULL,
	"viewed_at" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"ip" "inet",
	"user_agent" text,
	"decline_reason" text
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"template_id" uuid,
	"created_by" uuid NOT NULL,
	"title" text NOT NULL,
	"source_file_id" uuid NOT NULL,
	"completed_file_id" uuid,
	"routing" "document_routing" DEFAULT 'sequential' NOT NULL,
	"status" "document_status" DEFAULT 'draft' NOT NULL,
	"expires_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"content_sha256" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_signer_id_document_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."document_signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_signer_id_document_signers_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."document_signers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_fields" ADD CONSTRAINT "document_fields_value_file_id_files_id_fk" FOREIGN KEY ("value_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_signers" ADD CONSTRAINT "document_signers_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_template_id_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_file_id_files_id_fk" FOREIGN KEY ("source_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_completed_file_id_files_id_fk" FOREIGN KEY ("completed_file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_document_idx" ON "audit_events" USING btree ("document_id","id");--> statement-breakpoint
CREATE INDEX "document_fields_document_page_idx" ON "document_fields" USING btree ("document_id","page");--> statement-breakpoint
CREATE UNIQUE INDEX "document_signers_document_order_unique" ON "document_signers" USING btree ("document_id","order_index");--> statement-breakpoint
CREATE UNIQUE INDEX "document_signers_token_hash_unique" ON "document_signers" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "documents_org_status_created_idx" ON "documents" USING btree ("organization_id","status","created_at");