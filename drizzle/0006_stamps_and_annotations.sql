CREATE TYPE "public"."annotation_type" AS ENUM('stamp', 'signature', 'ink', 'date', 'text');--> statement-breakpoint
CREATE TYPE "public"."stamp_kind" AS ENUM('seal', 'mention', 'header', 'custom');--> statement-breakpoint
CREATE TABLE "annotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"created_by_signer_id" uuid,
	"type" "annotation_type" NOT NULL,
	"ref_id" uuid,
	"page" integer NOT NULL,
	"x" numeric(6, 3) NOT NULL,
	"y" numeric(6, 3) NOT NULL,
	"w" numeric(6, 3) NOT NULL,
	"h" numeric(6, 3) NOT NULL,
	"rotation" numeric(5, 2) DEFAULT 0 NOT NULL,
	"z_index" integer DEFAULT 0 NOT NULL,
	"ink_color" text,
	"value_text" text,
	"stroke_data" jsonb,
	"applied_to_all_pages" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stamp_permissions" (
	"stamp_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"can_apply" boolean DEFAULT true NOT NULL,
	"granted_by" uuid NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stamp_permissions_stamp_id_user_id_pk" PRIMARY KEY("stamp_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "stamps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" "stamp_kind" DEFAULT 'seal' NOT NULL,
	"default_ink" text DEFAULT '#1B3FA8' NOT NULL,
	"requires_countersignature" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_created_by_signer_id_document_signers_id_fk" FOREIGN KEY ("created_by_signer_id") REFERENCES "public"."document_signers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamp_permissions" ADD CONSTRAINT "stamp_permissions_stamp_id_stamps_id_fk" FOREIGN KEY ("stamp_id") REFERENCES "public"."stamps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamp_permissions" ADD CONSTRAINT "stamp_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamp_permissions" ADD CONSTRAINT "stamp_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stamps" ADD CONSTRAINT "stamps_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "annotations_document_page_idx" ON "annotations" USING btree ("document_id","page");