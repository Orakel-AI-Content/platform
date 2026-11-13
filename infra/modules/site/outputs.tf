output "zone_id" {
  description = "ID da zona do site."
  value       = cloudflare_zone.site.id
}

output "name_servers" {
  description = "Nameservers que a Cloudflare atribuiu à zona; vão para o registrador."
  value       = cloudflare_zone.site.name_servers
}

output "media_bucket" {
  description = "Bucket R2 das variantes de mídia do site."
  value       = cloudflare_r2_bucket.media.name
}

output "media_host" {
  description = "Host público da mídia, atrás do cache da Cloudflare."
  value       = cloudflare_r2_custom_domain.media.domain
}
