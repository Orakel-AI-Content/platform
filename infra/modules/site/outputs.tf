output "zone_id" {
  description = "ID da zona do site."
  value       = cloudflare_zone.site.id
}

output "name_servers" {
  description = "Nameservers que a Cloudflare atribuiu à zona; vão para o registrador."
  value       = cloudflare_zone.site.name_servers
}
