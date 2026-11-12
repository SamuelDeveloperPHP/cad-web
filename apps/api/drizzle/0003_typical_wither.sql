CREATE TABLE "merge_request_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"merge_request_id" uuid NOT NULL,
	"reviewer_id" uuid,
	"decision" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merge_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"drawing_id" uuid NOT NULL,
	"source_branch_id" uuid NOT NULL,
	"target_branch_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'open' NOT NULL,
	"author_id" uuid,
	"merge_commit_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commits" ADD COLUMN "merge_parent_id" uuid;--> statement-breakpoint
ALTER TABLE "merge_request_reviews" ADD CONSTRAINT "merge_request_reviews_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_request_reviews" ADD CONSTRAINT "merge_request_reviews_merge_request_id_merge_requests_id_fk" FOREIGN KEY ("merge_request_id") REFERENCES "public"."merge_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_request_reviews" ADD CONSTRAINT "merge_request_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_drawing_id_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_source_branch_id_branches_id_fk" FOREIGN KEY ("source_branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_target_branch_id_branches_id_fk" FOREIGN KEY ("target_branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merge_requests" ADD CONSTRAINT "merge_requests_merge_commit_id_commits_id_fk" FOREIGN KEY ("merge_commit_id") REFERENCES "public"."commits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mr_reviews_mr_idx" ON "merge_request_reviews" USING btree ("merge_request_id");--> statement-breakpoint
CREATE INDEX "mr_reviews_tenant_idx" ON "merge_request_reviews" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "merge_requests_drawing_idx" ON "merge_requests" USING btree ("drawing_id");--> statement-breakpoint
CREATE INDEX "merge_requests_tenant_idx" ON "merge_requests" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_merge_parent_id_commits_id_fk" FOREIGN KEY ("merge_parent_id") REFERENCES "public"."commits"("id") ON DELETE set null ON UPDATE no action;