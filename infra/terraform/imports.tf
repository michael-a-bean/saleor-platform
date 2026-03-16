# Terraform Import Configuration
#
# Import blocks are TEMPORARY — used only to bring existing AWS resources
# into Terraform state. Once imported (terraform apply succeeds), the block
# should be REMOVED from this file.
#
# All resources below were successfully imported during prior migrations
# (VPC alignment Jan 2026, HTTPS migration Feb 2026, Route53/scaling Mar 2026).
# The import blocks were kept as documentation but cause errors in CI
# (Terraform 1.5: "Cannot import to non-existent resource address" for
# count/for_each resources during plan).
#
# Historical import records are preserved in git history:
# - VPC + ALB + security groups: 2026-01-27
# - RDS + ElastiCache: removed (recreated during VPC migration 2026-01-22)
# - SSM parameters: 2026-02-12
# - Route53 + HTTPS listeners: 2026-03-06
# - Auto-scaling targets: 2026-03-06
#
# If you need to import a NEW resource, add an import block here,
# run `terraform apply`, then remove the block and commit.
