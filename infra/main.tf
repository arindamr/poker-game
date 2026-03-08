locals {
  api_fqdn = var.domain_name != "" ? "${var.api_subdomain}.${var.domain_name}" : ""
}

data "external" "static_ip_lookup" {
  program = ["bash", "${path.module}/scripts/lightsail-static-ip-lookup.sh"]

  query = {
    region         = var.aws_region
    aws_profile    = var.aws_profile
    static_ip_name = var.static_ip_name
  }
}

locals {
  static_ip_exists      = try(data.external.static_ip_lookup.result.exists, "false") == "true"
  static_ip_attached_to = try(data.external.static_ip_lookup.result.attached_to, "")
  static_ip_address     = local.static_ip_exists ? data.external.static_ip_lookup.result.ip_address : aws_lightsail_static_ip.app[0].ip_address
  should_attach_ip      = !local.static_ip_exists || local.static_ip_attached_to != var.instance_name
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false
}

resource "aws_lightsail_instance" "app" {
  name              = var.instance_name
  availability_zone = var.availability_zone
  blueprint_id      = var.blueprint_id
  bundle_id         = var.bundle_id
  key_pair_name     = var.key_pair_name

  user_data = templatefile("${path.module}/user_data.sh.tmpl", {
    app_dir            = var.app_dir
    repo_clone_url     = var.repo_clone_url
    repo_branch        = var.repo_branch
    node_env           = var.node_env
    log_level          = var.log_level
    db_name            = var.db_name
    db_user            = var.db_user
    db_password        = var.db_password
    jwt_secret         = random_password.jwt_secret.result
    jwt_refresh_secret = random_password.jwt_refresh_secret.result
    cors_origin        = var.cors_origin
    admin_emails       = var.admin_emails
    seed_demo_user     = var.seed_demo_user ? "true" : "false"
    install_nginx      = var.install_nginx_service ? "true" : "false"
  })

  lifecycle {
    precondition {
      condition     = length(trimspace(var.repo_clone_url)) > 0 && length(trimspace(var.repo_branch)) > 0 && length(trimspace(var.app_dir)) > 0
      error_message = "Bootstrap inputs are incomplete. Set repo_clone_url, repo_branch, and app_dir."
    }

    precondition {
      condition     = length(trimspace(var.cors_origin)) > 0 && length(trimspace(var.db_password)) > 0
      error_message = "Bootstrap env values are incomplete. Set cors_origin and db_password."
    }
  }

  tags = {
    Project     = var.project_name
    Environment = var.node_env
    ManagedBy   = "terraform"
  }
}

resource "aws_lightsail_static_ip" "app" {
  count = local.static_ip_exists ? 0 : 1
  name  = var.static_ip_name
}

resource "aws_lightsail_static_ip_attachment" "app" {
  count = local.should_attach_ip ? 1 : 0

  static_ip_name = var.static_ip_name
  instance_name  = aws_lightsail_instance.app.name

  # Ensure the IP resource is fully created before attaching
  depends_on = [aws_lightsail_static_ip.app]
}

resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  dynamic "port_info" {
    for_each = toset(var.allowed_tcp_ports)
    content {
      protocol  = "tcp"
      from_port = port_info.value
      to_port   = port_info.value
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-cpu-high"
  alarm_description   = "CPU usage is high on Lightsail instance."
  namespace           = "AWS/Lightsail"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 75
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceName = aws_lightsail_instance.app.name
  }
}

resource "aws_cloudwatch_metric_alarm" "status_failed" {
  count = var.enable_alarms ? 1 : 0

  alarm_name          = "${var.project_name}-status-check-failed"
  alarm_description   = "Instance status checks are failing."
  namespace           = "AWS/Lightsail"
  metric_name         = "StatusCheckFailed"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    InstanceName = aws_lightsail_instance.app.name
  }
}

resource "aws_lightsail_domain" "main" {
  count       = var.create_lightsail_dns_zone && var.domain_name != "" ? 1 : 0
  domain_name = var.domain_name
}

resource "aws_lightsail_domain_entry" "root_a" {
  count       = var.create_lightsail_dns_zone && var.domain_name != "" ? 1 : 0
  domain_name = aws_lightsail_domain.main[0].domain_name
  name        = "@"
  type        = "A"
  target      = local.static_ip_address
}

resource "aws_lightsail_domain_entry" "api_a" {
  count       = var.create_lightsail_dns_zone && var.domain_name != "" ? 1 : 0
  domain_name = aws_lightsail_domain.main[0].domain_name
  name        = var.api_subdomain
  type        = "A"
  target      = local.static_ip_address
}
