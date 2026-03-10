output "instance_name" {
  description = "Lightsail instance name."
  value       = aws_lightsail_instance.app.name
}

output "instance_public_ip" {
  description = "Static public IPv4."
  value       = local.static_ip_address
}

output "static_ip_lookup_exists" {
  description = "Whether the named static IP lookup found an existing IP."
  value       = local.static_ip_exists
}

output "static_ip_lookup_attached_to" {
  description = "Instance currently attached to the named static IP (empty when unattached or not found)."
  value       = local.static_ip_attached_to
}

output "static_ip_lookup_account_id" {
  description = "AWS account ID used by static IP lookup script."
  value       = try(data.external.static_ip_lookup.result.account_id, "")
}

output "instance_private_ip" {
  description = "Instance private IPv4."
  value       = aws_lightsail_instance.app.private_ip_address
}

output "api_url" {
  description = "Suggested API URL."
  value       = local.api_fqdn != "" ? "https://${local.api_fqdn}" : "http://${local.static_ip_address}:3000"
}

output "ssh_command" {
  description = "SSH command template (replace key path)."
  value       = "ssh -i /path/to/${var.key_pair_name}-${var.aws_region}.pem ec2-user@${local.static_ip_address}"
}

output "bootstrap_status_path" {
  description = "Path of bootstrap status marker on the instance."
  value       = "/var/lib/poker-bootstrap/status"
}

output "bootstrap_status_json_path" {
  description = "Path of detailed bootstrap status JSON on the instance."
  value       = "/var/lib/poker-bootstrap/status.json"
}

output "bootstrap_check_command" {
  description = "Command to check bootstrap status and recent bootstrap logs."
  value       = "ssh -i /path/to/${var.key_pair_name}-${var.aws_region}.pem ec2-user@${local.static_ip_address} 'sudo cat /var/lib/poker-bootstrap/status; echo; sudo cat /var/lib/poker-bootstrap/status.json; echo; sudo tail -n 120 /var/log/poker-bootstrap.log'"
}

output "generated_jwt_secret" {
  description = "Generated JWT secret stored in bootstrap .env."
  value       = random_password.jwt_secret.result
  sensitive   = true
}

output "generated_jwt_refresh_secret" {
  description = "Generated refresh secret stored in bootstrap .env."
  value       = random_password.jwt_refresh_secret.result
  sensitive   = true
}
