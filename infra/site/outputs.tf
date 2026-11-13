output "name_servers" {
  description = "Nameservers da zona, para configurar no registrador."
  value       = module.site.name_servers
}

output "zone_id" {
  description = "ID da zona do site; o infra-runner liga o Crawler Hints por ele (ADR 0027)."
  value       = module.site.zone_id
}
