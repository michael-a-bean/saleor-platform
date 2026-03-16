# ALB Module
# Creates Application Load Balancer with target groups for each service
# Implements network segregation per Gemini review recommendations

locals {
  name_prefix       = "${var.project_name}-${var.environment}"
  short_name_prefix = "sp-${var.environment}" # For resources with 32-char limit
}

# =============================================================================
# Security Groups (Split frontend/backend per Gemini review)
# =============================================================================

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-alb-sg"
  }
}

# Frontend ECS Security Group (Storefront, Dashboard)
# Per Gemini review: separate from backend to prevent DB access
resource "aws_security_group" "ecs_frontend" {
  name        = "${local.name_prefix}-ecs-frontend-sg"
  description = "Security group for frontend ECS tasks (storefront, dashboard)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Traffic from ALB"
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Outbound to anywhere (API calls, etc)"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-ecs-frontend-sg"
    Tier = "frontend"
  }
}

# Backend ECS Security Group (API, Worker, Apps)
# This SG can access RDS and Redis
resource "aws_security_group" "ecs_backend" {
  name        = "${local.name_prefix}-ecs-backend-sg"
  description = "Security group for backend ECS tasks (api, worker, apps)"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Traffic from ALB"
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow traffic from frontend (for internal API calls if needed)
  ingress {
    description     = "Traffic from frontend tier"
    from_port       = 8000
    to_port         = 8000
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_frontend.id]
  }

  # Meilisearch traffic from backend tier (internal services)
  ingress {
    description = "Meilisearch from backend"
    from_port   = 7700
    to_port     = 7700
    protocol    = "tcp"
    self        = true
  }

  # Meilisearch traffic from frontend (storefront search)
  ingress {
    description     = "Meilisearch from frontend"
    from_port       = 7700
    to_port         = 7700
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_frontend.id]
  }

  egress {
    description = "Outbound to anywhere"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-ecs-backend-sg"
    Tier = "backend"
  }
}

# Internal services Security Group (Meilisearch - not publicly exposed)
resource "aws_security_group" "ecs_internal" {
  name        = "${local.name_prefix}-ecs-internal-sg"
  description = "Security group for internal ECS services (meilisearch)"
  vpc_id      = var.vpc_id

  # Only allow traffic from backend and frontend tiers
  ingress {
    description     = "Traffic from backend"
    from_port       = 7700
    to_port         = 7700
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_backend.id]
  }

  ingress {
    description     = "Traffic from frontend (storefront search)"
    from_port       = 7700
    to_port         = 7700
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_frontend.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-ecs-internal-sg"
    Tier = "internal"
  }
}

# =============================================================================
# Application Load Balancer
# =============================================================================

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = var.public_subnet_ids

  enable_deletion_protection = var.enable_deletion_protection
  drop_invalid_header_fields = true
  idle_timeout               = 120

  tags = {
    Name = "${local.name_prefix}-alb"
  }
}

# =============================================================================
# Target Groups
# =============================================================================

# API Target Group
resource "aws_lb_target_group" "api" {
  name        = "${local.name_prefix}-api"
  port        = 8000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/health/"
    matcher             = "200"
  }

  tags = {
    Name    = "${local.name_prefix}-api"
    Service = "api"
  }
}

# Storefront Target Group
resource "aws_lb_target_group" "storefront" {
  name        = "${local.short_name_prefix}-storefront"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/api/health"
    matcher             = "200"
  }

  tags = {
    Name    = "${local.name_prefix}-storefront"
    Service = "storefront"
  }
}

# Dashboard Target Group
resource "aws_lb_target_group" "dashboard" {
  name        = "${local.short_name_prefix}-dashboard"
  port        = 80
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/"
    matcher             = "200"
  }

  tags = {
    Name    = "${local.name_prefix}-dashboard"
    Service = "dashboard"
  }
}

# =============================================================================
# Apps Target Groups (stripe, inventory-ops, pos)
# NOTE: Health check paths include basePath since ALB preserves full request path
# =============================================================================

resource "aws_lb_target_group" "stripe_app" {
  name        = "${local.name_prefix}-stripe"
  port        = 3001
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/apps/stripe/api/health"
    matcher             = "200"
  }

  tags = {
    Name    = "${local.name_prefix}-stripe-app"
    Service = "stripe-app"
  }
}

resource "aws_lb_target_group" "inventory_ops_app" {
  name        = "${local.name_prefix}-inv-ops"
  port        = 3002
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/apps/inventory/api/health"
    matcher             = "200"
  }

  tags = {
    Name    = "${local.name_prefix}-inventory-ops-app"
    Service = "inventory-ops-app"
  }
}

resource "aws_lb_target_group" "pos_app" {
  name        = "${local.name_prefix}-pos"
  port        = 3004
  protocol    = "HTTP"
  vpc_id      = var.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/apps/pos/api/health"
    matcher             = "200"
  }

  tags = {
    Name    = "${local.name_prefix}-pos-app"
    Service = "pos-app"
  }
}

# =============================================================================
# Listeners
# =============================================================================

# HTTP Listener
# When certificate exists: redirect to HTTPS
# When no certificate (staging): forward to storefront as default
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  dynamic "default_action" {
    for_each = var.enable_https ? [1] : []
    content {
      type = "redirect"
      redirect {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }
  }

  dynamic "default_action" {
    for_each = !var.enable_https ? [1] : []
    content {
      type             = "forward"
      target_group_arn = aws_lb_target_group.storefront.arn
    }
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  count = var.enable_https ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.storefront.arn
  }
}

# =============================================================================
# Listener Rules (Host-based routing per GPT-5.2 review)
# =============================================================================

# API routing: api.{domain}
resource "aws_lb_listener_rule" "api" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    host_header {
      values = ["api.${var.domain_name}"]
    }
  }
}

# Dashboard routing: dashboard.{domain}
resource "aws_lb_listener_rule" "dashboard" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 110

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }

  condition {
    host_header {
      values = ["dashboard.${var.domain_name}"]
    }
  }
}

# Stripe app routing: apps.{domain}/apps/stripe/*
# Path must match the app's BASE_PATH=/apps/stripe set at Docker build time
resource "aws_lb_listener_rule" "stripe_app" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.stripe_app.arn
  }

  condition {
    host_header {
      values = ["apps.${var.domain_name}"]
    }
  }

  condition {
    path_pattern {
      values = ["/apps/stripe/*", "/apps/stripe"]
    }
  }
}

# Inventory ops app routing: apps.{domain}/apps/inventory/*
# Path must match the app's BASE_PATH=/apps/inventory set at Docker build time
resource "aws_lb_listener_rule" "inventory_ops_app" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 210

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.inventory_ops_app.arn
  }

  condition {
    host_header {
      values = ["apps.${var.domain_name}"]
    }
  }

  condition {
    path_pattern {
      values = ["/apps/inventory/*", "/apps/inventory"]
    }
  }
}

# POS app routing: apps.{domain}/apps/pos/*
# Path must match the app's BASE_PATH=/apps/pos set at Docker build time
resource "aws_lb_listener_rule" "pos_app" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 230

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.pos_app.arn
  }

  condition {
    host_header {
      values = ["apps.${var.domain_name}"]
    }
  }

  condition {
    path_pattern {
      values = ["/apps/pos/*", "/apps/pos"]
    }
  }
}

# Storefront is default (www.{domain} or {domain})
resource "aws_lb_listener_rule" "storefront" {
  count = var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.https[0].arn
  priority     = 300

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.storefront.arn
  }

  condition {
    host_header {
      values = ["www.${var.domain_name}", var.domain_name]
    }
  }
}

# =============================================================================
# HTTP Listener Rules (for staging without certificate)
# Uses path-based routing since no custom domains
# =============================================================================

# API routing on HTTP: /graphql/* and /health/*
resource "aws_lb_listener_rule" "api_http" {
  count = !var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      # Includes /.well-known/* for JWKS endpoint (required for Saleor app auth)
      # Includes /thumbnail/* for Saleor image thumbnails
      values = ["/graphql/*", "/health/*", "/media/*", "/thumbnail/*", "/.well-known/*"]
    }
  }
}

# Dashboard routing on HTTP: /dashboard/*
resource "aws_lb_listener_rule" "dashboard_http" {
  count = !var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 110

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.dashboard.arn
  }

  condition {
    path_pattern {
      values = ["/dashboard/*"]
    }
  }
}

# =============================================================================
# App HTTP Listener Rules (for staging without certificate)
# Path-based routing: /apps/{app-name}/*
# =============================================================================

# Stripe app routing on HTTP: /apps/stripe/*
resource "aws_lb_listener_rule" "stripe_app_http" {
  count = !var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 200

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.stripe_app.arn
  }

  condition {
    path_pattern {
      values = ["/apps/stripe/*", "/apps/stripe"]
    }
  }
}

# Inventory ops app routing on HTTP: /apps/inventory/*
resource "aws_lb_listener_rule" "inventory_ops_app_http" {
  count = !var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 210

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.inventory_ops_app.arn
  }

  condition {
    path_pattern {
      values = ["/apps/inventory/*", "/apps/inventory"]
    }
  }
}

# POS app routing on HTTP: /apps/pos/*
resource "aws_lb_listener_rule" "pos_app_http" {
  count = !var.enable_https ? 1 : 0

  listener_arn = aws_lb_listener.http.arn
  priority     = 230

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.pos_app.arn
  }

  condition {
    path_pattern {
      values = ["/apps/pos/*", "/apps/pos"]
    }
  }
}

