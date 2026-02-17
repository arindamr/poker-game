variable "aws_region" {
  description = "AWS region for Lightsail resources."
  type        = string
  default     = "eu-west-2"
}

variable "aws_profile" {
  description = "Optional AWS CLI profile name. Set to force Terraform provider and lookup script to use the same profile."
  type        = string
  default     = ""
}

variable "availability_zone" {
  description = "Lightsail availability zone."
  type        = string
  default     = "eu-west-2a"
}

variable "project_name" {
  description = "Project prefix for resource names."
  type        = string
  default     = "poker-game"
}

variable "instance_name" {
  description = "Lightsail instance name."
  type        = string
  default     = "poker-game-server"
}

variable "static_ip_name" {
  description = "Lightsail static IP name."
  type        = string
  default     = "poker-game-static-ip"
}

variable "bundle_id" {
  description = "Lightsail bundle ID (2 GB / 2 vCPU is medium_2_0)."
  type        = string
  default     = "medium_2_0"
}

variable "blueprint_id" {
  description = "Lightsail OS blueprint."
  type        = string
  default     = "amazon_linux_2023"
}

variable "key_pair_name" {
  description = "Existing Lightsail key pair for SSH."
  type        = string
  default     = "LightsailDefaultKeyPair"
}

variable "domain_name" {
  description = "Primary DNS domain (optional)."
  type        = string
  default     = ""
}

variable "create_lightsail_dns_zone" {
  description = "Create Lightsail DNS zone and records."
  type        = bool
  default     = false
}

variable "api_subdomain" {
  description = "Subdomain for API record."
  type        = string
  default     = "api"
}

variable "allowed_tcp_ports" {
  description = "Public TCP ports exposed by Lightsail firewall."
  type        = list(number)
  default     = [22, 80, 443]
}

variable "enable_alarms" {
  description = "Create Lightsail alarms."
  type        = bool
  default     = true
}

variable "repo_clone_url" {
  description = "Git clone URL used by bootstrap script."
  type        = string
  default     = "https://github.com/arindamr/poker-game.git"
  validation {
    condition     = length(trimspace(var.repo_clone_url)) > 0 && can(regex("^(https://|git@).+", var.repo_clone_url))
    error_message = "repo_clone_url must be a non-empty Git URL (https://... or git@...)."
  }
}

variable "repo_branch" {
  description = "Git branch deployed on server."
  type        = string
  default     = "main"
  validation {
    condition     = length(trimspace(var.repo_branch)) > 0
    error_message = "repo_branch must be a non-empty branch name."
  }
}

variable "app_dir" {
  description = "Deployment directory on server."
  type        = string
  default     = "/opt/poker-game"
  validation {
    condition     = startswith(var.app_dir, "/") && length(trimspace(var.app_dir)) > 1
    error_message = "app_dir must be an absolute Linux path (for example: /opt/poker-game)."
  }
}

variable "node_env" {
  description = "NODE_ENV written into deployment env."
  type        = string
  default     = "production"
}

variable "cors_origin" {
  description = "Comma separated origins for backend CORS."
  type        = string
  default     = "https://localhost,http://localhost:3000,http://localhost:3002"
  validation {
    condition     = length(trimspace(var.cors_origin)) > 0
    error_message = "cors_origin must not be empty."
  }
}

variable "admin_emails" {
  description = "Comma separated admin emails for backend."
  type        = string
  default     = ""
}

variable "db_name" {
  description = "Postgres DB name."
  type        = string
  default     = "poker_game"
}

variable "db_user" {
  description = "Postgres user."
  type        = string
  default     = "postgres"
}

variable "db_password" {
  description = "Postgres password."
  type        = string
  sensitive   = true
  validation {
    condition     = length(var.db_password) >= 12 && var.db_password != "replace-with-strong-password"
    error_message = "db_password must be at least 12 characters and must not use the example placeholder value."
  }
}

variable "seed_demo_user" {
  description = "Seed demo user in backend startup."
  type        = bool
  default     = false
}

variable "log_level" {
  description = "Backend log level."
  type        = string
  default     = "info"
}

variable "install_nginx_service" {
  description = "Start nginx container on first bootstrap."
  type        = bool
  default     = true
}
