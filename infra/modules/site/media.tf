# Mídia do site (seção 3.1 do 05): variantes com nome imutável, servidas em media.<domínio>
# atrás do cache da Cloudflare. O nome segue mediaBucket() do Backoffice. O Cache-Control dos
# objetos é gravado no upload.
locals {
  media_bucket = "media-${var.site_id}"
  media_host   = "media.${var.domain}"
}

# Para remover um site: esvazie o bucket e retire o prevent_destroy (runbook da seção 4.1 do 05).
resource "cloudflare_r2_bucket" "media" {
  account_id = var.account_id
  name       = local.media_bucket

  lifecycle {
    prevent_destroy = true
  }
}

resource "cloudflare_r2_custom_domain" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  zone_id     = cloudflare_zone.site.id
  domain      = local.media_host
  enabled     = true
  min_tls     = "1.2"
}

# Sem o endpoint público r2.dev: a mídia só sai pelo domínio, atrás do cache.
resource "cloudflare_r2_managed_domain" "media" {
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  enabled     = false
}

resource "cloudflare_ruleset" "cache" {
  zone_id = cloudflare_zone.site.id
  name    = "Cache da mídia"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  rules = [{
    description = "Cache longo na borda para media.<domínio>"
    expression  = "(http.host eq \"${local.media_host}\")"
    action      = "set_cache_settings"
    action_parameters = {
      cache = true
      edge_ttl = {
        mode    = "override_origin"
        default = 31536000
      }
      browser_ttl = {
        mode = "respect_origin"
      }
    }
  }]
}
