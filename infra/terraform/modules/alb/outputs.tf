# ALB Module Outputs

output "alb_arn" {
  description = "ARN of the ALB"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "DNS name of the ALB"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the ALB (for Route53 alias records)"
  value       = aws_lb.main.zone_id
}

output "alb_security_group_id" {
  description = "Security group ID of the ALB"
  value       = aws_security_group.alb.id
}

output "ecs_frontend_security_group_id" {
  description = "Security group ID for frontend ECS tasks"
  value       = aws_security_group.ecs_frontend.id
}

output "ecs_backend_security_group_id" {
  description = "Security group ID for backend ECS tasks"
  value       = aws_security_group.ecs_backend.id
}

output "ecs_internal_security_group_id" {
  description = "Security group ID for internal ECS tasks"
  value       = aws_security_group.ecs_internal.id
}

# Target Group ARNs
output "api_target_group_arn" {
  description = "ARN of API target group"
  value       = aws_lb_target_group.api.arn
}

output "storefront_target_group_arn" {
  description = "ARN of storefront target group"
  value       = aws_lb_target_group.storefront.arn
}

output "dashboard_target_group_arn" {
  description = "ARN of dashboard target group"
  value       = aws_lb_target_group.dashboard.arn
}

output "stripe_app_target_group_arn" {
  description = "ARN of Stripe app target group"
  value       = aws_lb_target_group.stripe_app.arn
}

output "inventory_ops_app_target_group_arn" {
  description = "ARN of Inventory Ops app target group"
  value       = aws_lb_target_group.inventory_ops_app.arn
}

output "buylist_app_target_group_arn" {
  description = "ARN of Buylist app target group"
  value       = aws_lb_target_group.buylist_app.arn
}

output "pos_app_target_group_arn" {
  description = "ARN of POS app target group"
  value       = aws_lb_target_group.pos_app.arn
}

output "https_listener_arn" {
  description = "ARN of HTTPS listener"
  value       = length(aws_lb_listener.https) > 0 ? aws_lb_listener.https[0].arn : null
}
