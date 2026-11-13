output "name_servers" {
  description = "Nameservers da zona, para configurar no registrador."
  value       = module.site.name_servers
}
